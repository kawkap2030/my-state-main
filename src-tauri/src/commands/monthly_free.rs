use crate::db::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::OptionalExtension;
use crate::commands::month_isolation::{
    enforce_isolation_lock, enforce_isolation_lock_guard, cleanup_isolation_lock_if_empty,
    validate_non_negative_f64,
};
use crate::commands::monthly_shared::{
    enforce_coexistence, level_from, resolve_id_by_logical_key,
};
use crate::commands::audit::log_action;
use crate::commands::reports::MonthlyDrugsDispensedRangeRow;

const TABLE: &str = "monthly_free_drugs_dispensed";

#[derive(Serialize, Deserialize, Debug)]
pub struct MonthlyFreeDrugsDispensed {
    pub id: Option<i32>,
    pub clinic_id: Option<i32>,
    pub area_id: Option<i32>,
    pub branch_id: i32,
    pub dispense_month: String, // YYYY-MM
    pub drugs_free_authority: f64,
    pub drugs_free_students: f64,
    pub drugs_free_infants: f64,
    pub drugs_free_breadwinner_women: f64,
    pub notes: Option<String>,
}

/// True when a Create must be rejected because a record already exists for the
/// exact logical key (branch + area/clinic + month).
const ERR_ALREADY_EXISTS: &str = "توجد بيانات مسجلة بالفعل، يمكنك الذهاب إلى التعديل.";

/// Core save that works on a plain `&Connection` so it can be unit-tested.
/// Free records live ONLY in `monthly_free_drugs_dispensed`.
///
/// PHASE 6: `is_create` is explicit. A Create (is_create = true) may only INSERT
/// and is rejected when the logical key already exists. An Update (is_create =
/// false) requires `data.id` and only UPDATEs that row. This removes the old
/// implicit upsert-by-key behaviour that silently overwrote existing records.
pub fn save_free_monthly_drugs_dispensed_core(
    conn: &rusqlite::Connection,
    data: &MonthlyFreeDrugsDispensed,
    is_create: bool,
) -> Result<i32, String> {
    // --- Negative value validation ---
    for (label, value) in [
        ("منصرف الهيئة", data.drugs_free_authority),
        ("منصرف الطلاب", data.drugs_free_students),
        ("منصرف الرضع", data.drugs_free_infants),
        ("منصرف المرأة المعيلة", data.drugs_free_breadwinner_women),
    ] {
        validate_non_negative_f64(label, value)?;
    }

    // --- Global Month Isolation Lock (same cross-cutting month lock as legacy) ---
    let level = level_from(data.area_id, data.clinic_id);
    enforce_isolation_lock(conn, data.branch_id, &data.dispense_month, level, true)?;

    // --- Coexistence guard, scoped to the Free table only ---
    // On Create there is no own row to exclude; on Update we exclude the edited row.
    let exclude_id = if is_create { -1 } else { data.id.unwrap_or(-1) };
    enforce_coexistence(
        conn,
        TABLE,
        data.branch_id,
        &data.dispense_month,
        data.clinic_id,
        data.area_id,
        exclude_id,
    )?;

    if is_create {
        // A Create must never carry an existing record id.
        if data.id.is_some() {
            return Err("لا يمكن إنشاء سجل جديد مع إرسال معرّف سجل موجود.".to_string());
        }
        // A Create must never silently overwrite an existing record for the key.
        if let Some(_existing) = resolve_id_by_logical_key(
            conn,
            TABLE,
            data.branch_id,
            &data.dispense_month,
            data.area_id,
            data.clinic_id,
        )? {
            return Err(ERR_ALREADY_EXISTS.to_string());
        }
        conn.execute(
            &format!(
                "INSERT INTO {} (
                    clinic_id, area_id, branch_id, dispense_month,
                    drugs_free_authority, drugs_free_students, drugs_free_infants,
                    drugs_free_breadwinner_women, notes
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                TABLE
            ),
            rusqlite::params![
                data.clinic_id, data.area_id, data.branch_id, data.dispense_month,
                data.drugs_free_authority, data.drugs_free_students,
                data.drugs_free_infants, data.drugs_free_breadwinner_women,
                data.notes
            ],
        )
        .map_err(|e| e.to_string())?;
        let new_id = conn.last_insert_rowid() as i32;
        let _ = log_action(
            conn,
            None,
            "INSERT",
            TABLE,
            Some(&new_id.to_string()),
            Some(&format!(
                "إضافة منصرف مجاني شهري للفرع {} لشهر {}",
                data.branch_id, data.dispense_month
            )),
        );
        Ok(new_id)
    } else {
        // An Update requires the explicit identity of the row being edited.
        let id = data.id.ok_or("تحديث السجل يتطلب معرّف السجل.")?;
        let target_exists: Option<i32> = conn
            .query_row(
                &format!("SELECT id FROM {} WHERE id = ?1", TABLE),
                [id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if target_exists.is_none() {
            return Err("السجل المطلوب تعديله غير موجود.".to_string());
        }
        conn.execute(
            &format!(
                "UPDATE {} SET
                    clinic_id = ?1, area_id = ?2, branch_id = ?3, dispense_month = ?4,
                    drugs_free_authority = ?5, drugs_free_students = ?6,
                    drugs_free_infants = ?7, drugs_free_breadwinner_women = ?8, notes = ?9
                 WHERE id = ?10",
                TABLE
            ),
            rusqlite::params![
                data.clinic_id, data.area_id, data.branch_id, data.dispense_month,
                data.drugs_free_authority, data.drugs_free_students,
                data.drugs_free_infants, data.drugs_free_breadwinner_women,
                data.notes, id
            ],
        )
        .map_err(|e| e.to_string())?;
        let _ = log_action(
            conn,
            None,
            "UPDATE",
            TABLE,
            Some(&id.to_string()),
            Some(&format!(
                "تحديث المنصرف المجاني الشهري للفرع {} لشهر {}",
                data.branch_id, data.dispense_month
            )),
        );
        Ok(id)
    }
}

#[tauri::command]
pub fn save_free_monthly_drugs_dispensed(
    state: State<'_, AppState>,
    data: MonthlyFreeDrugsDispensed,
    is_create: Option<bool>,
) -> Result<i32, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    // Default: no id = Create (strict, rejects existing), id present = Update.
    let is_create = is_create.unwrap_or(data.id.is_none());
    save_free_monthly_drugs_dispensed_core(conn, &data, is_create)
}

/// Core read by logical key (branch + area + clinic + month) from the Free table only.
pub fn get_free_monthly_drugs_dispensed_core(
    conn: &rusqlite::Connection,
    branch_id: i32,
    area_id: Option<i32>,
    clinic_id: Option<i32>,
    dispense_month: &str,
) -> Result<Option<MonthlyFreeDrugsDispensed>, String> {
    let mut sql = format!(
        "SELECT id, clinic_id, area_id, branch_id, dispense_month,
                drugs_free_authority, drugs_free_students, drugs_free_infants,
                drugs_free_breadwinner_women, notes
         FROM {} WHERE branch_id = ?1 AND dispense_month = ?2",
        TABLE
    );

    if clinic_id.is_some() {
        sql.push_str(" AND clinic_id = ?3");
    } else if area_id.is_some() {
        sql.push_str(" AND area_id = ?3 AND clinic_id IS NULL");
    } else {
        sql.push_str(" AND area_id IS NULL AND clinic_id IS NULL");
    }
    sql.push_str(" ORDER BY id DESC LIMIT 1");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(branch_id), Box::new(dispense_month.to_string())];
    if let Some(cid) = clinic_id {
        params.push(Box::new(cid));
    } else if let Some(aid) = area_id {
        params.push(Box::new(aid));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut rows = stmt
        .query_map(params_ref.as_slice(), |row| {
            Ok(MonthlyFreeDrugsDispensed {
                id: Some(row.get(0)?),
                clinic_id: row.get(1)?,
                area_id: row.get(2)?,
                branch_id: row.get(3)?,
                dispense_month: row.get(4)?,
                drugs_free_authority: row.get(5)?,
                drugs_free_students: row.get(6)?,
                drugs_free_infants: row.get(7)?,
                drugs_free_breadwinner_women: row.get(8)?,
                notes: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next() {
        Ok(Some(row.map_err(|e| e.to_string())?))
    } else {
        Ok(None)
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_free_monthly_drugs_dispensed(
    state: State<'_, AppState>,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: String,
) -> Result<Option<MonthlyFreeDrugsDispensed>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    get_free_monthly_drugs_dispensed_core(conn, branchId, areaId, clinicId, &dispenseMonth)
}

/// Core list with optional filters from the Free table only.
pub fn get_all_free_monthly_drugs_dispensed_core(
    conn: &rusqlite::Connection,
    branch_id: Option<i32>,
    area_id: Option<i32>,
    clinic_id: Option<i32>,
    dispense_month: Option<String>,
) -> Result<Vec<MonthlyFreeDrugsDispensed>, String> {
    let mut sql = format!(
        "SELECT id, clinic_id, area_id, branch_id, dispense_month,
                drugs_free_authority, drugs_free_students, drugs_free_infants,
                drugs_free_breadwinner_women, notes
         FROM {} WHERE 1=1",
        TABLE
    );

    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut param_idx = 1;
    if let Some(bid) = branch_id {
        sql.push_str(&format!(" AND branch_id = ?{}", param_idx));
        params.push(Box::new(bid));
        param_idx += 1;
    }
    if let Some(aid) = area_id {
        sql.push_str(&format!(" AND area_id = ?{}", param_idx));
        params.push(Box::new(aid));
        param_idx += 1;
    }
    if let Some(cid) = clinic_id {
        sql.push_str(&format!(" AND clinic_id = ?{}", param_idx));
        params.push(Box::new(cid));
        param_idx += 1;
    }
    if let Some(month) = dispense_month {
        sql.push_str(&format!(" AND dispense_month = ?{}", param_idx));
        params.push(Box::new(month));
    }
    sql.push_str(" ORDER BY dispense_month DESC, id DESC LIMIT 50");

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_ref.as_slice(), |row| {
            Ok(MonthlyFreeDrugsDispensed {
                id: Some(row.get(0)?),
                clinic_id: row.get(1)?,
                area_id: row.get(2)?,
                branch_id: row.get(3)?,
                dispense_month: row.get(4)?,
                drugs_free_authority: row.get(5)?,
                drugs_free_students: row.get(6)?,
                drugs_free_infants: row.get(7)?,
                drugs_free_breadwinner_women: row.get(8)?,
                notes: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_all_free_monthly_drugs_dispensed(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: Option<String>,
) -> Result<Vec<MonthlyFreeDrugsDispensed>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    get_all_free_monthly_drugs_dispensed_core(conn, branchId, areaId, clinicId, dispenseMonth)
}

/// Report-style read: same as list but no LIMIT, used by report pages.
pub fn get_report_free_monthly_drugs_dispensed_core(
    conn: &rusqlite::Connection,
    branch_id: Option<i32>,
    area_id: Option<i32>,
    clinic_id: Option<i32>,
    dispense_month: Option<String>,
) -> Result<Vec<MonthlyFreeDrugsDispensed>, String> {
    let mut sql = format!(
        "SELECT id, clinic_id, area_id, branch_id, dispense_month,
                drugs_free_authority, drugs_free_students, drugs_free_infants,
                drugs_free_breadwinner_women, notes
         FROM {} WHERE 1=1",
        TABLE
    );

    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut param_idx = 1;
    if let Some(bid) = branch_id {
        sql.push_str(&format!(" AND branch_id = ?{}", param_idx));
        params.push(Box::new(bid));
        param_idx += 1;
    }
    if let Some(aid) = area_id {
        sql.push_str(&format!(" AND area_id = ?{}", param_idx));
        params.push(Box::new(aid));
        param_idx += 1;
    }
    if let Some(cid) = clinic_id {
        sql.push_str(&format!(" AND clinic_id = ?{}", param_idx));
        params.push(Box::new(cid));
        param_idx += 1;
    }
    if let Some(month) = dispense_month {
        sql.push_str(&format!(" AND dispense_month = ?{}", param_idx));
        params.push(Box::new(month));
    }
    sql.push_str(" ORDER BY dispense_month DESC, id DESC");

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_ref.as_slice(), |row| {
            Ok(MonthlyFreeDrugsDispensed {
                id: Some(row.get(0)?),
                clinic_id: row.get(1)?,
                area_id: row.get(2)?,
                branch_id: row.get(3)?,
                dispense_month: row.get(4)?,
                drugs_free_authority: row.get(5)?,
                drugs_free_students: row.get(6)?,
                drugs_free_infants: row.get(7)?,
                drugs_free_breadwinner_women: row.get(8)?,
                notes: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_report_free_monthly_drugs_dispensed(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: Option<String>,
) -> Result<Vec<MonthlyFreeDrugsDispensed>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    get_report_free_monthly_drugs_dispensed_core(conn, branchId, areaId, clinicId, dispenseMonth)
}

/// PHASE 4: Range read for the temporal hub, Free table only. Returns the
/// legacy-compatible `MonthlyDrugsDispensedRangeRow` shape so the frontend
/// `free_drugs` case is a pure command-name swap; the supported columns are
/// zeroed out to keep the aggregated sum masks equivalent.
pub fn get_free_monthly_drugs_dispensed_range_core(
    conn: &rusqlite::Connection,
    branch_id: i32,
    area_id: Option<i32>,
    clinic_id: Option<i32>,
    start_month: &str,
    end_month: &str,
) -> Result<Vec<MonthlyDrugsDispensedRangeRow>, String> {
    let mut sql = format!(
        "SELECT m.branch_id, m.area_id, m.clinic_id, m.dispense_month,
                m.drugs_free_authority, m.drugs_free_students, m.drugs_free_infants,
                m.drugs_free_breadwinner_women,
                c.name as clinic_name
         FROM {} m
         LEFT JOIN clinics c ON m.clinic_id = c.id
         WHERE m.dispense_month >= ?1 AND m.dispense_month <= ?2",
        TABLE
    );

    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
        Box::new(start_month.to_string()),
        Box::new(end_month.to_string()),
    ];

    if let Some(cid) = clinic_id {
        sql.push_str(" AND m.clinic_id = ?3");
        params.push(Box::new(cid));
    } else if let Some(aid) = area_id {
        sql.push_str(" AND m.area_id = ?3");
        params.push(Box::new(aid));
    } else {
        sql.push_str(" AND m.branch_id = ?3");
        params.push(Box::new(branch_id));
    }
    sql.push_str(" ORDER BY m.dispense_month");

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(MonthlyDrugsDispensedRangeRow {
            branch_id: row.get(0)?,
            area_id: row.get(1)?,
            clinic_id: row.get(2)?,
            dispense_month: row.get(3)?,
            free_authority: row.get(4)?,
            free_students: row.get(5)?,
            free_infants: row.get(6)?,
            free_women: row.get(7)?,
            sup_authority: 0.0,
            sup_students: 0.0,
            sup_infants: 0.0,
            sup_patient_share: 0.0,
            clinic_name: row.get(8)?,
        })
    })
    .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_free_monthly_drugs_dispensed_range(
    state: State<'_, AppState>,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    startMonth: String,
    endMonth: String,
) -> Result<Vec<MonthlyDrugsDispensedRangeRow>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    get_free_monthly_drugs_dispensed_range_core(conn, branchId, areaId, clinicId, &startMonth, &endMonth)
}

/// Core delete from the Free table only. Requires the row to exist.
pub fn delete_free_monthly_drugs_dispensed_core(
    conn: &rusqlite::Connection,
    id: i32,
) -> Result<(), String> {
    let rec: Option<(i32, Option<i32>, Option<i32>, String)> = conn
        .query_row(
            &format!("SELECT branch_id, area_id, clinic_id, dispense_month FROM {} WHERE id = ?1", TABLE),
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let (branch_id, area_id, clinic_id, dispense_month) = match rec {
        Some(r) => r,
        None => return Err("السجل غير موجود".to_string()),
    };

    let current_level = level_from(area_id, clinic_id);
    enforce_isolation_lock_guard(conn, branch_id, &dispense_month, current_level)?;

    conn.execute(
        &format!("DELETE FROM {} WHERE id = ?1", TABLE),
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;

    cleanup_isolation_lock_if_empty(conn, branch_id, &dispense_month)?;

    let _ = log_action(
        conn,
        None,
        "DELETE",
        TABLE,
        Some(&id.to_string()),
        Some(&format!("حذف المنصرف المجاني الشهري رقم {}", id)),
    );

    Ok(())
}

#[tauri::command]
pub fn delete_free_monthly_drugs_dispensed(
    state: State<'_, AppState>,
    id: i32,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    delete_free_monthly_drugs_dispensed_core(conn, id)
}

// ─── PHASE 2 tests: Independent Free / Supported CRUD (scenarios 1–14) ─────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::monthly_supported::{
        save_supported_monthly_drugs_dispensed_core,
        get_supported_monthly_drugs_dispensed_core,
        get_supported_monthly_drugs_dispensed_range_core,
        delete_supported_monthly_drugs_dispensed_core,
        MonthlySupportedDrugsDispensed,
    };
    use rusqlite::Connection;

    /// In-memory DB mirroring the PHASE 1 schema for the two split tables plus
    /// the shared month-isolation and audit tables.
    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS dispensing_month_isolation (
                branch_id INTEGER NOT NULL,
                dispense_month TEXT NOT NULL,
                isolation_level TEXT NOT NULL,
                PRIMARY KEY (branch_id, dispense_month)
            );
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                action TEXT,
                table_name TEXT,
                record_id TEXT,
                details TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS clinics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                area_id INTEGER,
                branch_id INTEGER
            );
            CREATE TABLE IF NOT EXISTS monthly_free_drugs_dispensed (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                branch_id INTEGER NOT NULL,
                area_id INTEGER NULL,
                clinic_id INTEGER NULL,
                dispense_month TEXT NOT NULL,
                drugs_free_authority REAL NOT NULL DEFAULT 0,
                drugs_free_students REAL NOT NULL DEFAULT 0,
                drugs_free_infants REAL NOT NULL DEFAULT 0,
                drugs_free_breadwinner_women REAL NOT NULL DEFAULT 0,
                notes TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_free_location_month
            ON monthly_free_drugs_dispensed (branch_id, COALESCE(area_id, -1), COALESCE(clinic_id, -1), dispense_month);
            CREATE TABLE IF NOT EXISTS monthly_supported_drugs_dispensed (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                branch_id INTEGER NOT NULL,
                area_id INTEGER NULL,
                clinic_id INTEGER NULL,
                dispense_month TEXT NOT NULL,
                drugs_supported_authority_value REAL NOT NULL DEFAULT 0,
                drugs_supported_authority_patient_share REAL NOT NULL DEFAULT 0,
                drugs_supported_students_value REAL NOT NULL DEFAULT 0,
                drugs_supported_students_patient_share REAL NOT NULL DEFAULT 0,
                drugs_supported_infants_value REAL NOT NULL DEFAULT 0,
                drugs_supported_infants_patient_share REAL NOT NULL DEFAULT 0,
                notes TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_supported_location_month
            ON monthly_supported_drugs_dispensed (branch_id, COALESCE(area_id, -1), COALESCE(clinic_id, -1), dispense_month);
            ",
        )
        .unwrap();
        conn
    }

    fn free(
        id: Option<i32>,
        branch_id: i32,
        area_id: Option<i32>,
        clinic_id: Option<i32>,
        month: &str,
        v: f64,
    ) -> MonthlyFreeDrugsDispensed {
        MonthlyFreeDrugsDispensed {
            id,
            clinic_id,
            area_id,
            branch_id,
            dispense_month: month.to_string(),
            drugs_free_authority: v,
            drugs_free_students: 0.0,
            drugs_free_infants: 0.0,
            drugs_free_breadwinner_women: 0.0,
            notes: None,
        }
    }

    fn supported(
        id: Option<i32>,
        branch_id: i32,
        area_id: Option<i32>,
        clinic_id: Option<i32>,
        month: &str,
        a_value: f64,
        a_share: f64,
        s_value: f64,
        s_share: f64,
    ) -> MonthlySupportedDrugsDispensed {
        MonthlySupportedDrugsDispensed {
            id,
            clinic_id,
            area_id,
            branch_id,
            dispense_month: month.to_string(),
            drugs_supported_authority_value: a_value,
            drugs_supported_authority_patient_share: a_share,
            drugs_supported_students_value: s_value,
            drugs_supported_students_patient_share: s_share,
            drugs_supported_infants_value: 0.0,
            drugs_supported_infants_patient_share: 0.0,
            notes: None,
        }
    }

    fn free_rows(conn: &Connection) -> i32 {
        conn.query_row("SELECT COUNT(*) FROM monthly_free_drugs_dispensed", [], |r| r.get(0)).unwrap()
    }
    fn sup_rows(conn: &Connection) -> i32 {
        conn.query_row("SELECT COUNT(*) FROM monthly_supported_drugs_dispensed", [], |r| r.get(0)).unwrap()
    }
    fn legacy_table_exists(conn: &Connection) -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'monthly_drugs_dispensed'",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap()
            > 0
    }

    // Test 1: Free Branch + Month: Create then explicit Update => 1 row.
    #[test]
    fn test_1_free_branch_upsert_single_row() {
        let conn = test_db();
        let id1 = save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, None, None, "2026-08", 100.0), true).unwrap();
        let id2 = save_free_monthly_drugs_dispensed_core(&conn, &free(Some(id1), 1, None, None, "2026-08", 250.0), false).unwrap();
        assert_eq!(id1, id2, "explicit Update of the same logical key must not create a new row");
        assert_eq!(free_rows(&conn), 1);
        let got = get_free_monthly_drugs_dispensed_core(&conn, 1, None, None, "2026-08").unwrap().unwrap();
        assert_eq!(got.drugs_free_authority, 250.0, "Update must change the value");
    }

    // Test 2: Supported Branch + Month: Create then explicit Update => 1 row.
    #[test]
    fn test_2_supported_branch_upsert_single_row() {
        let conn = test_db();
        let id1 = save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, None, None, "2026-08", 100.0, 30.0, 50.0, 10.0), true).unwrap();
        let id2 = save_supported_monthly_drugs_dispensed_core(&conn, &supported(Some(id1), 1, None, None, "2026-08", 200.0, 30.0, 50.0, 10.0), false).unwrap();
        assert_eq!(id1, id2);
        assert_eq!(sup_rows(&conn), 1);
        let got = get_supported_monthly_drugs_dispensed_core(&conn, 1, None, None, "2026-08").unwrap().unwrap();
        assert_eq!(got.drugs_supported_authority_value, 200.0);
    }

    // Test 3: Free Clinic 1 + Free Clinic 2 in the same month => 2 rows.
    #[test]
    fn test_3_free_two_clinics_two_rows() {
        let conn = test_db();
        save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, Some(10), Some(1001), "2026-08", 10.0), true).unwrap();
        save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, Some(10), Some(1002), "2026-08", 20.0), true).unwrap();
        assert_eq!(free_rows(&conn), 2);
    }

    // Test 4: Supported Clinic 1 + Supported Clinic 2 in the same month => 2 rows.
    #[test]
    fn test_4_supported_two_clinics_two_rows() {
        let conn = test_db();
        save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, Some(10), Some(1001), "2026-08", 10.0, 2.0, 0.0, 0.0), true).unwrap();
        save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, Some(10), Some(1002), "2026-08", 20.0, 4.0, 0.0, 0.0), true).unwrap();
        assert_eq!(sup_rows(&conn), 2);
    }

    // Test 5: Free Clinic 1 + Supported Clinic 1, same month => BOTH exist, no conflict.
    #[test]
    fn test_5_free_and_supported_independent() {
        let conn = test_db();
        save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, Some(10), Some(1001), "2026-08", 15.0), true).unwrap();
        save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, Some(10), Some(1001), "2026-08", 30.0, 5.0, 0.0, 0.0), true).unwrap();
        assert_eq!(free_rows(&conn), 1);
        assert_eq!(sup_rows(&conn), 1);
        let f = get_free_monthly_drugs_dispensed_core(&conn, 1, Some(10), Some(1001), "2026-08").unwrap().unwrap();
        let s = get_supported_monthly_drugs_dispensed_core(&conn, 1, Some(10), Some(1001), "2026-08").unwrap().unwrap();
        assert_eq!(f.drugs_free_authority, 15.0);
        assert_eq!(s.drugs_supported_authority_value, 30.0);
    }

    // Test 6: Edit Free; Supported unchanged.
    #[test]
    fn test_6_edit_free_does_not_touch_supported() {
        let conn = test_db();
        let fid = save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, Some(10), Some(1001), "2026-08", 15.0), true).unwrap();
        save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, Some(10), Some(1001), "2026-08", 30.0, 5.0, 0.0, 0.0), true).unwrap();
        save_free_monthly_drugs_dispensed_core(&conn, &free(Some(fid), 1, Some(10), Some(1001), "2026-08", 99.0), false).unwrap();
        let s = get_supported_monthly_drugs_dispensed_core(&conn, 1, Some(10), Some(1001), "2026-08").unwrap().unwrap();
        assert_eq!(s.drugs_supported_authority_value, 30.0, "Supported must not change when Free is edited");
    }

    // Test 7: Edit Supported; Free unchanged.
    #[test]
    fn test_7_edit_supported_does_not_touch_free() {
        let conn = test_db();
        let _fid = save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, Some(10), Some(1001), "2026-08", 15.0), true).unwrap();
        let sid = save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, Some(10), Some(1001), "2026-08", 30.0, 5.0, 0.0, 0.0), true).unwrap();
        save_supported_monthly_drugs_dispensed_core(&conn, &supported(Some(sid), 1, Some(10), Some(1001), "2026-08", 88.0, 5.0, 0.0, 0.0), false).unwrap();
        let f = get_free_monthly_drugs_dispensed_core(&conn, 1, Some(10), Some(1001), "2026-08").unwrap().unwrap();
        assert_eq!(f.drugs_free_authority, 15.0, "Free must not change when Supported is edited");
    }

    // Test 8: Delete Free; Supported still exists.
    #[test]
    fn test_8_delete_free_keeps_supported() {
        let conn = test_db();
        let fid = save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, Some(10), Some(1001), "2026-08", 15.0), true).unwrap();
        save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, Some(10), Some(1001), "2026-08", 30.0, 5.0, 0.0, 0.0), true).unwrap();
        delete_free_monthly_drugs_dispensed_core(&conn, fid).unwrap();
        assert_eq!(free_rows(&conn), 0);
        assert_eq!(sup_rows(&conn), 1, "Supported must survive a Free delete");
    }

    // Test 9: Delete Supported; Free still exists.
    #[test]
    fn test_9_delete_supported_keeps_free() {
        let conn = test_db();
        save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, Some(10), Some(1001), "2026-08", 15.0), true).unwrap();
        let sid = save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, Some(10), Some(1001), "2026-08", 30.0, 5.0, 0.0, 0.0), true).unwrap();
        delete_supported_monthly_drugs_dispensed_core(&conn, sid).unwrap();
        assert_eq!(sup_rows(&conn), 0);
        assert_eq!(free_rows(&conn), 1, "Free must survive a Supported delete");
    }

    // Test 10: Negative values rejected (both Free and Supported).
    #[test]
    fn test_10_negative_values_rejected() {
        let conn = test_db();
        assert!(save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, None, None, "2026-08", -1.0), true).is_err());
        assert!(save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, None, None, "2026-08", -99.0, 0.0, 0.0, 0.0), true).is_err());
        assert_eq!(free_rows(&conn), 0);
        assert_eq!(sup_rows(&conn), 0);
    }

    // Test 11: patient_share > value rejected (Supported only; one per category).
    #[test]
    fn test_11_patient_share_exceeds_value_rejected() {
        let conn = test_db();
        // authority share > authority value
        assert!(save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, None, None, "2026-08", 100.0, 150.0, 0.0, 0.0), true).is_err());
        // students share > students value
        assert!(save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, None, None, "2026-09", 0.0, 0.0, 100.0, 130.0), true).is_err());
        assert_eq!(sup_rows(&conn), 0);
        // equal is allowed (patient_share <= value)
        assert!(save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, None, None, "2026-10", 100.0, 100.0, 0.0, 0.0), true).is_ok());
    }

    // Test 12: Branch/Area/Clinic isolation is enforced WITHIN the Free table,
    // while a Supported record at any level is unaffected.
    #[test]
    fn test_12_branch_clinic_isolation_within_each_table() {
        let conn = test_db();
        // Free Branch total for branch 1 / 2026-08
        save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, None, None, "2026-08", 50.0), true).unwrap();
        // Free clinic for the SAME branch+month must be REJECTED (isolation within Free).
        let clinic_err = save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, Some(10), Some(1001), "2026-08", 5.0), true);
        assert!(clinic_err.is_err(), "Free clinic under an existing Free branch total must be rejected");
        // Free area for the SAME branch+month must be REJECTED too.
        let area_err = save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, Some(10), None, "2026-08", 5.0), true);
        assert!(area_err.is_err(), "Free area under an existing Free branch total must be rejected");
        // Supported clinic for the SAME branch+month is INDEPENDENT -> allowed.
        save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, Some(10), Some(1001), "2026-08", 30.0, 5.0, 0.0, 0.0), true).unwrap();
        assert_eq!(sup_rows(&conn), 1, "Supported clinic must coexist with a Free branch total");
    }

    // Test 12b: Branch/Area/Clinic isolation WITHIN the Supported table.
    #[test]
    fn test_12b_supported_branch_clinic_isolation() {
        let conn = test_db();
        save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, None, None, "2026-08", 50.0, 5.0, 0.0, 0.0), true).unwrap();
        assert!(save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, Some(10), Some(1001), "2026-08", 5.0, 1.0, 0.0, 0.0), true).is_err());
        assert_eq!(sup_rows(&conn), 1);
    }

    // Test 14 (PHASE 5): The final schema has NO legacy monthly_drugs_dispensed table.
    // The new commands run against the split tables, and the legacy table simply does
    // not exist in the schema at all.
    #[test]
    fn test_14_legacy_table_is_absent() {
        let conn = test_db();
        save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, None, None, "2026-08", 50.0), true).unwrap();
        save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, None, None, "2026-08", 30.0, 5.0, 0.0, 0.0), true).unwrap();
        let fid = save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, Some(10), Some(1001), "2026-09", 9.0), true).unwrap();
        delete_free_monthly_drugs_dispensed_core(&conn, fid).unwrap();
        assert!(!legacy_table_exists(&conn), "monthly_drugs_dispensed must not exist in the final schema");
        // Confirm the split tables are the ones actually holding the data.
        assert_eq!(free_rows(&conn), 1);
        assert_eq!(sup_rows(&conn), 1);
    }

    // The UNIQUE index is the final safety layer: a raw duplicate insert is rejected.
    #[test]
    fn test_unique_index_blocks_duplicate_by_key() {
        let conn = test_db();
        let done = conn.execute(
            "INSERT INTO monthly_supported_drugs_dispensed (branch_id, area_id, clinic_id, dispense_month, drugs_supported_authority_value, drugs_supported_authority_patient_share, drugs_supported_students_value, drugs_supported_students_patient_share, drugs_supported_infants_value, drugs_supported_infants_patient_share)
             VALUES (1, NULL, NULL, '2026-08', 10, 0, 0, 0, 0, 0)",
            [],
        );
        assert!(done.is_ok());
        let dup = conn.execute(
            "INSERT INTO monthly_supported_drugs_dispensed (branch_id, area_id, clinic_id, dispense_month, drugs_supported_authority_value, drugs_supported_authority_patient_share, drugs_supported_students_value, drugs_supported_students_patient_share, drugs_supported_infants_value, drugs_supported_infants_patient_share)
             VALUES (1, NULL, NULL, '2026-08', 99, 0, 0, 0, 0, 0)",
            [],
        );
        assert!(dup.is_err(), "UNIQUE index must reject a second row for the same branch+month key");
    }

    // PHASE 4 range tests: each split range command returns the legacy-compatible
    // row shape with the OTHER side zeroed, so the temporal hub sums stay correct.

    #[test]
    fn free_range_returns_free_rows_with_zeroed_supported() {
        let conn = test_db();
        save_free_monthly_drugs_dispensed_core(
            &conn,
            &MonthlyFreeDrugsDispensed {
                id: None,
                clinic_id: None,
                area_id: None,
                branch_id: 1,
                dispense_month: "2026-07".to_string(),
                drugs_free_authority: 100.0,
                drugs_free_students: 20.0,
                drugs_free_infants: 5.0,
                drugs_free_breadwinner_women: 3.0,
                notes: None,
            },
            true,
        )
        .unwrap();
        save_supported_monthly_drugs_dispensed_core(
            &conn,
            &MonthlySupportedDrugsDispensed {
                id: None,
                clinic_id: None,
                area_id: None,
                branch_id: 1,
                dispense_month: "2026-07".to_string(),
                drugs_supported_authority_value: 999.0,
                drugs_supported_authority_patient_share: 99.0,
                drugs_supported_students_value: 0.0,
                drugs_supported_students_patient_share: 0.0,
                drugs_supported_infants_value: 0.0,
                drugs_supported_infants_patient_share: 0.0,
                notes: None,
            },
            true,
        )
        .unwrap();

        let rows = get_free_monthly_drugs_dispensed_range_core(&conn, 1, None, None, "2026-06", "2026-08").unwrap();
        assert_eq!(rows.len(), 1, "free range must see only the free row");
        assert_eq!(rows[0].dispense_month, "2026-07");
        assert_eq!(rows[0].free_authority, 100.0);
        assert_eq!(rows[0].free_students, 20.0);
        assert_eq!(rows[0].free_infants, 5.0);
        assert_eq!(rows[0].free_women, 3.0);
        assert_eq!(rows[0].sup_authority, 0.0, "supported side must be zeroed in free range");
        assert_eq!(rows[0].sup_patient_share, 0.0);
    }

    #[test]
    fn supported_range_returns_derived_columns_with_zeroed_free() {
        let conn = test_db();
        save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, None, None, "2026-07", 50.0), true)
        .unwrap();
        save_supported_monthly_drugs_dispensed_core(&conn, &MonthlySupportedDrugsDispensed {
                id: None,
                clinic_id: None,
                area_id: None,
                branch_id: 1,
                dispense_month: "2026-07".to_string(),
                drugs_supported_authority_value: 1000.0,
                drugs_supported_authority_patient_share: 100.0,
                drugs_supported_students_value: 400.0,
                drugs_supported_students_patient_share: 40.0,
                drugs_supported_infants_value: 200.0,
                drugs_supported_infants_patient_share: 60.0,
                notes: None,
            },
            true,
        )
        .unwrap();

        let rows = get_supported_monthly_drugs_dispensed_range_core(&conn, 1, None, None, "2026-06", "2026-08").unwrap();
        assert_eq!(rows.len(), 1, "supported range must see only the supported row");
        assert_eq!(rows[0].sup_authority, 900.0, "authority = value - patient share");
        assert_eq!(rows[0].sup_students, 360.0);
        assert_eq!(rows[0].sup_infants, 140.0);
        assert_eq!(rows[0].sup_patient_share, 200.0, "sum of all patient shares");
        assert_eq!(rows[0].free_authority, 0.0, "free side must be zeroed in supported range");
    }

    // ─── PHASE 6: strict Create / Update separation ──────────────────────────

    #[test]
    fn create_rejects_existing_key_with_arabic_message() {
        let conn = test_db();
        save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, None, None, "2026-08", 100.0), true).unwrap();
        let err = save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, None, None, "2026-08", 999.0), true).unwrap_err();
        assert!(
            err.contains(ERR_ALREADY_EXISTS),
            "expected Arabic duplicate message, got: {}",
            err
        );
        let got = get_free_monthly_drugs_dispensed_core(&conn, 1, None, None, "2026-08").unwrap().unwrap();
        assert_eq!(got.drugs_free_authority, 100.0, "Create must never overwrite existing data");
        assert_eq!(free_rows(&conn), 1);
    }

    #[test]
    fn create_rejects_existing_supported_key_too() {
        let conn = test_db();
        save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, None, None, "2026-08", 50.0, 5.0, 0.0, 0.0), true).unwrap();
        let err = save_supported_monthly_drugs_dispensed_core(&conn, &supported(None, 1, None, None, "2026-08", 99.0, 9.0, 0.0, 0.0), true).unwrap_err();
        assert!(err.contains(ERR_ALREADY_EXISTS), "got: {}", err);
        assert_eq!(sup_rows(&conn), 1);
    }

    #[test]
    fn create_with_existing_id_rejected() {
        let conn = test_db();
        let id = save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, None, None, "2026-08", 10.0), true).unwrap();
        assert!(id > 0);
        let err = save_free_monthly_drugs_dispensed_core(&conn, &free(Some(id), 1, None, None, "2026-08", 11.0), true).unwrap_err();
        assert!(err.contains("معرّف سجل موجود"), "got: {}", err);
        assert_eq!(free_rows(&conn), 1);
    }

    #[test]
    fn update_requires_id_and_existing_row() {
        let conn = test_db();
        let no_id = save_free_monthly_drugs_dispensed_core(&conn, &free(None, 1, None, None, "2026-08", 10.0), false).unwrap_err();
        assert!(no_id.contains("معرّف السجل"), "expected id-required error, got: {}", no_id);
        let missing = save_free_monthly_drugs_dispensed_core(&conn, &free(Some(99999), 1, None, None, "2026-08", 10.0), false).unwrap_err();
        assert!(missing.contains("غير موجود"), "expected not-found error, got: {}", missing);
        assert_eq!(free_rows(&conn), 0);
    }
}
