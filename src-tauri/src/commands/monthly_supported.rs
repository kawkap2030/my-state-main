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

const TABLE: &str = "monthly_supported_drugs_dispensed";

#[derive(Serialize, Deserialize, Debug)]
pub struct MonthlySupportedDrugsDispensed {
    pub id: Option<i32>,
    pub clinic_id: Option<i32>,
    pub area_id: Option<i32>,
    pub branch_id: i32,
    pub dispense_month: String, // YYYY-MM
    pub drugs_supported_authority_value: f64,
    pub drugs_supported_authority_patient_share: f64,
    pub drugs_supported_students_value: f64,
    pub drugs_supported_students_patient_share: f64,
    pub drugs_supported_infants_value: f64,
    pub drugs_supported_infants_patient_share: f64,
    pub notes: Option<String>,
}

/// Validate that no patient share can exceed its category's dispensed value.
/// Authority contribution is NOT stored — it is derived as
/// `value - patient_share` on read/reporting.
fn validate_supported_values(data: &MonthlySupportedDrugsDispensed) -> Result<(), String> {
    for (label, value) in [
        ("قيمة الهيئة المدعمة", data.drugs_supported_authority_value),
        ("حصة المريض - هيئة", data.drugs_supported_authority_patient_share),
        ("قيمة الطلبة المدعمة", data.drugs_supported_students_value),
        ("حصة المريض - طلبة", data.drugs_supported_students_patient_share),
        ("قيمة الرضع المدعمة", data.drugs_supported_infants_value),
        ("حصة المريض - رضع", data.drugs_supported_infants_patient_share),
    ] {
        validate_non_negative_f64(label, value)?;
    }

    if data.drugs_supported_authority_patient_share > data.drugs_supported_authority_value {
        return Err("مساهمة المريض لا يمكن أن تتجاوز قيمة المنصرف.".to_string());
    }
    if data.drugs_supported_students_patient_share > data.drugs_supported_students_value {
        return Err("مساهمة المريض لا يمكن أن تتجاوز قيمة المنصرف.".to_string());
    }
    if data.drugs_supported_infants_patient_share > data.drugs_supported_infants_value {
        return Err("مساهمة المريض لا يمكن أن تتجاوز قيمة المنصرف.".to_string());
    }
    Ok(())
}

/// Core save that works on a plain `&Connection` so it can be unit-tested.
/// Supported records live ONLY in `monthly_supported_drugs_dispensed`.
/// True when a Create must be rejected because a record already exists for the
/// exact logical key (branch + area/clinic + month).
pub const ERR_SUPPORTED_ALREADY_EXISTS: &str = "توجد بيانات مسجلة بالفعل، يمكنك الذهاب إلى التعديل.";

// PHASE 6: `is_create` is explicit. Create = INSERT only (rejected when the key
// already exists); Update = requires data.id and only UPDATEs that row. Removes
// the old implicit upsert-by-key behaviour that silently overwrote existing data.
pub fn save_supported_monthly_drugs_dispensed_core(
    conn: &rusqlite::Connection,
    data: &MonthlySupportedDrugsDispensed,
    is_create: bool,
) -> Result<i32, String> {
    validate_supported_values(data)?;

    // --- Global Month Isolation Lock (same cross-cutting month lock as legacy) ---
    let level = level_from(data.area_id, data.clinic_id);
    enforce_isolation_lock(conn, data.branch_id, &data.dispense_month, level, true)?;

    // --- Coexistence guard, scoped to the Supported table only ---
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
            return Err(ERR_SUPPORTED_ALREADY_EXISTS.to_string());
        }
        conn.execute(
            &format!(
                "INSERT INTO {} (
                    clinic_id, area_id, branch_id, dispense_month,
                    drugs_supported_authority_value, drugs_supported_authority_patient_share,
                    drugs_supported_students_value, drugs_supported_students_patient_share,
                    drugs_supported_infants_value, drugs_supported_infants_patient_share,
                    notes
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                TABLE
            ),
            rusqlite::params![
                data.clinic_id, data.area_id, data.branch_id, data.dispense_month,
                data.drugs_supported_authority_value, data.drugs_supported_authority_patient_share,
                data.drugs_supported_students_value, data.drugs_supported_students_patient_share,
                data.drugs_supported_infants_value, data.drugs_supported_infants_patient_share,
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
                "إضافة منصرف مدعم شهري للفرع {} لشهر {}",
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
                    drugs_supported_authority_value = ?5, drugs_supported_authority_patient_share = ?6,
                    drugs_supported_students_value = ?7, drugs_supported_students_patient_share = ?8,
                    drugs_supported_infants_value = ?9, drugs_supported_infants_patient_share = ?10,
                    notes = ?11
                 WHERE id = ?12",
                TABLE
            ),
            rusqlite::params![
                data.clinic_id, data.area_id, data.branch_id, data.dispense_month,
                data.drugs_supported_authority_value, data.drugs_supported_authority_patient_share,
                data.drugs_supported_students_value, data.drugs_supported_students_patient_share,
                data.drugs_supported_infants_value, data.drugs_supported_infants_patient_share,
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
                "تحديث المنصرف المدعم الشهري للفرع {} لشهر {}",
                data.branch_id, data.dispense_month
            )),
        );
        Ok(id)
    }
}

#[tauri::command]
pub fn save_supported_monthly_drugs_dispensed(
    state: State<'_, AppState>,
    data: MonthlySupportedDrugsDispensed,
    is_create: Option<bool>,
) -> Result<i32, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    // Default: no id = Create (strict, rejects existing), id present = Update.
    let is_create = is_create.unwrap_or(data.id.is_none());
    save_supported_monthly_drugs_dispensed_core(conn, &data, is_create)
}

/// Core read by logical key from the Supported table only.
pub fn get_supported_monthly_drugs_dispensed_core(
    conn: &rusqlite::Connection,
    branch_id: i32,
    area_id: Option<i32>,
    clinic_id: Option<i32>,
    dispense_month: &str,
) -> Result<Option<MonthlySupportedDrugsDispensed>, String> {
    let mut sql = format!(
        "SELECT id, clinic_id, area_id, branch_id, dispense_month,
                drugs_supported_authority_value, drugs_supported_authority_patient_share,
                drugs_supported_students_value, drugs_supported_students_patient_share,
                drugs_supported_infants_value, drugs_supported_infants_patient_share, notes
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
            Ok(MonthlySupportedDrugsDispensed {
                id: Some(row.get(0)?),
                clinic_id: row.get(1)?,
                area_id: row.get(2)?,
                branch_id: row.get(3)?,
                dispense_month: row.get(4)?,
                drugs_supported_authority_value: row.get(5)?,
                drugs_supported_authority_patient_share: row.get(6)?,
                drugs_supported_students_value: row.get(7)?,
                drugs_supported_students_patient_share: row.get(8)?,
                drugs_supported_infants_value: row.get(9)?,
                drugs_supported_infants_patient_share: row.get(10)?,
                notes: row.get(11)?,
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
pub fn get_supported_monthly_drugs_dispensed(
    state: State<'_, AppState>,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: String,
) -> Result<Option<MonthlySupportedDrugsDispensed>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    get_supported_monthly_drugs_dispensed_core(conn, branchId, areaId, clinicId, &dispenseMonth)
}

/// Core list with optional filters from the Supported table only.
pub fn get_all_supported_monthly_drugs_dispensed_core(
    conn: &rusqlite::Connection,
    branch_id: Option<i32>,
    area_id: Option<i32>,
    clinic_id: Option<i32>,
    dispense_month: Option<String>,
) -> Result<Vec<MonthlySupportedDrugsDispensed>, String> {
    let mut sql = format!(
        "SELECT id, clinic_id, area_id, branch_id, dispense_month,
                drugs_supported_authority_value, drugs_supported_authority_patient_share,
                drugs_supported_students_value, drugs_supported_students_patient_share,
                drugs_supported_infants_value, drugs_supported_infants_patient_share, notes
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
            Ok(MonthlySupportedDrugsDispensed {
                id: Some(row.get(0)?),
                clinic_id: row.get(1)?,
                area_id: row.get(2)?,
                branch_id: row.get(3)?,
                dispense_month: row.get(4)?,
                drugs_supported_authority_value: row.get(5)?,
                drugs_supported_authority_patient_share: row.get(6)?,
                drugs_supported_students_value: row.get(7)?,
                drugs_supported_students_patient_share: row.get(8)?,
                drugs_supported_infants_value: row.get(9)?,
                drugs_supported_infants_patient_share: row.get(10)?,
                notes: row.get(11)?,
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
pub fn get_all_supported_monthly_drugs_dispensed(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: Option<String>,
) -> Result<Vec<MonthlySupportedDrugsDispensed>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    get_all_supported_monthly_drugs_dispensed_core(conn, branchId, areaId, clinicId, dispenseMonth)
}

/// Report-style read: same as list but no LIMIT.
pub fn get_report_supported_monthly_drugs_dispensed_core(
    conn: &rusqlite::Connection,
    branch_id: Option<i32>,
    area_id: Option<i32>,
    clinic_id: Option<i32>,
    dispense_month: Option<String>,
) -> Result<Vec<MonthlySupportedDrugsDispensed>, String> {
    let mut sql = format!(
        "SELECT id, clinic_id, area_id, branch_id, dispense_month,
                drugs_supported_authority_value, drugs_supported_authority_patient_share,
                drugs_supported_students_value, drugs_supported_students_patient_share,
                drugs_supported_infants_value, drugs_supported_infants_patient_share, notes
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
            Ok(MonthlySupportedDrugsDispensed {
                id: Some(row.get(0)?),
                clinic_id: row.get(1)?,
                area_id: row.get(2)?,
                branch_id: row.get(3)?,
                dispense_month: row.get(4)?,
                drugs_supported_authority_value: row.get(5)?,
                drugs_supported_authority_patient_share: row.get(6)?,
                drugs_supported_students_value: row.get(7)?,
                drugs_supported_students_patient_share: row.get(8)?,
                drugs_supported_infants_value: row.get(9)?,
                drugs_supported_infants_patient_share: row.get(10)?,
                notes: row.get(11)?,
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
pub fn get_report_supported_monthly_drugs_dispensed(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: Option<String>,
) -> Result<Vec<MonthlySupportedDrugsDispensed>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    get_report_supported_monthly_drugs_dispensed_core(conn, branchId, areaId, clinicId, dispenseMonth)
}

/// PHASE 4: Range read for the temporal hub, Supported table only. Returns the
/// legacy-compatible `MonthlyDrugsDispensedRangeRow` shape so the frontend
/// `supported_drugs` case is a pure command-name swap; the free columns are
/// zeroed out. The authority contribution is derived as `value - patient_share`
/// per category (matches what the legacy row carried).
pub fn get_supported_monthly_drugs_dispensed_range_core(
    conn: &rusqlite::Connection,
    branch_id: i32,
    area_id: Option<i32>,
    clinic_id: Option<i32>,
    start_month: &str,
    end_month: &str,
) -> Result<Vec<MonthlyDrugsDispensedRangeRow>, String> {
    let mut sql = format!(
        "SELECT m.branch_id, m.area_id, m.clinic_id, m.dispense_month,
                (m.drugs_supported_authority_value - m.drugs_supported_authority_patient_share) as sup_authority,
                (m.drugs_supported_students_value - m.drugs_supported_students_patient_share) as sup_students,
                (m.drugs_supported_infants_value - m.drugs_supported_infants_patient_share) as sup_infants,
                (m.drugs_supported_authority_patient_share + m.drugs_supported_students_patient_share + m.drugs_supported_infants_patient_share) as sup_patient_share,
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
            free_authority: 0.0,
            free_students: 0.0,
            free_infants: 0.0,
            free_women: 0.0,
            sup_authority: row.get(4)?,
            sup_students: row.get(5)?,
            sup_infants: row.get(6)?,
            sup_patient_share: row.get(7)?,
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
pub fn get_supported_monthly_drugs_dispensed_range(
    state: State<'_, AppState>,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    startMonth: String,
    endMonth: String,
) -> Result<Vec<MonthlyDrugsDispensedRangeRow>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    get_supported_monthly_drugs_dispensed_range_core(conn, branchId, areaId, clinicId, &startMonth, &endMonth)
}

/// Core delete from the Supported table only. Requires the row to exist.
pub fn delete_supported_monthly_drugs_dispensed_core(
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
        Some(&format!("حذف المنصرف المدعم الشهري رقم {}", id)),
    );

    Ok(())
}

#[tauri::command]
pub fn delete_supported_monthly_drugs_dispensed(
    state: State<'_, AppState>,
    id: i32,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    delete_supported_monthly_drugs_dispensed_core(conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::monthly_shared::test_db_with_new_tables;

    fn sup_row(branch_id: i32, area_id: Option<i32>, clinic_id: Option<i32>, month: &str, value: f64, share: f64) -> MonthlySupportedDrugsDispensed {
        MonthlySupportedDrugsDispensed {
            id: None,
            clinic_id,
            area_id,
            branch_id,
            dispense_month: month.to_string(),
            drugs_supported_authority_value: value,
            drugs_supported_authority_patient_share: share,
            drugs_supported_students_value: 0.0,
            drugs_supported_students_patient_share: 0.0,
            drugs_supported_infants_value: 0.0,
            drugs_supported_infants_patient_share: 0.0,
            notes: None,
        }
    }

    fn sup_count(conn: &rusqlite::Connection, month: &str) -> i32 {
        conn.query_row(
            "SELECT COUNT(*) FROM monthly_supported_drugs_dispensed WHERE dispense_month = ?1",
            [month],
            |r| r.get(0),
        )
        .unwrap()
    }

    fn sup_sum(conn: &rusqlite::Connection, clinic_id: i32, month: &str) -> f64 {
        conn.query_row(
            "SELECT COALESCE(SUM(drugs_supported_authority_value),0) FROM monthly_supported_drugs_dispensed WHERE clinic_id = ?1 AND dispense_month = ?2",
            rusqlite::params![clinic_id, month],
            |r| r.get(0),
        )
        .unwrap()
    }

    // Test 2: Supported Branch + Month: Create then explicit Update => 1 row.
    #[test]
    fn supported_branch_same_key_updates_not_duplicates() {
        let conn = test_db_with_new_tables();
        let r1 = sup_row(1, None, None, "2026-08", 100.0, 20.0);
        let first = save_supported_monthly_drugs_dispensed_core(&conn, &r1, true).unwrap();
        let mut r2 = sup_row(1, None, None, "2026-08", 300.0, 50.0);
        r2.id = Some(first);
        let second = save_supported_monthly_drugs_dispensed_core(&conn, &r2, false).unwrap();

        assert_eq!(first, second);
        assert_eq!(sup_count(&conn, "2026-08"), 1);
        let (value, share): (f64, f64) = conn
            .query_row(
                "SELECT drugs_supported_authority_value, drugs_supported_authority_patient_share FROM monthly_supported_drugs_dispensed WHERE id = ?1",
                [first],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(value, 300.0);
        assert_eq!(share, 50.0);
    }

    // Test 4: Supported Clinic 1 + Clinic 2 same month → 2 rows.
    #[test]
    fn supported_two_clinics_same_month_two_rows() {
        let conn = test_db_with_new_tables();
        save_supported_monthly_drugs_dispensed_core(&conn, &sup_row(1, Some(1), Some(1), "2026-08", 10.0, 2.0), true).unwrap();
        save_supported_monthly_drugs_dispensed_core(&conn, &sup_row(1, Some(1), Some(2), "2026-08", 20.0, 3.0), true).unwrap();
        assert_eq!(sup_count(&conn, "2026-08"), 2);
        assert_eq!(sup_sum(&conn, 1, "2026-08"), 10.0);
        assert_eq!(sup_sum(&conn, 2, "2026-08"), 20.0);
    }

    // Test 11: patient_share > value must be rejected.
    #[test]
    fn supported_rejects_patient_share_gt_value() {
        let conn = test_db_with_new_tables();
        let bad = sup_row(1, None, None, "2026-08", 100.0, 150.0);
        let err = save_supported_monthly_drugs_dispensed_core(&conn, &bad, true).unwrap_err();
        assert!(err.contains("مساهمة المريض"), "expected clear Arabic error, got: {}", err);
        assert_eq!(sup_count(&conn, "2026-08"), 0);

        // Boundary: share == value is allowed.
        let ok = sup_row(1, None, None, "2026-08", 100.0, 100.0);
        assert!(save_supported_monthly_drugs_dispensed_core(&conn, &ok, true).is_ok());
    }

    // Test 10 (Supported side): negative value rejected.
    #[test]
    fn supported_rejects_negative_value() {
        let conn = test_db_with_new_tables();
        let bad = sup_row(1, None, None, "2026-08", -1.0, 0.0);
        assert!(save_supported_monthly_drugs_dispensed_core(&conn, &bad, true).is_err());
        assert_eq!(sup_count(&conn, "2026-08"), 0);
    }

    // Test 12 (Supported side): Branch Supported blocks Area/Clinic Supported rows
    // for the same branch+month, but a Supported row must NOT be affected by a
    // Free row (that independence is exercised in the shared tests).
    #[test]
    fn supported_branch_blocks_supported_area_clinic() {
        let conn = test_db_with_new_tables();
        save_supported_monthly_drugs_dispensed_core(&conn, &sup_row(1, None, None, "2026-08", 99.0, 10.0), true).unwrap();
        let area_attempt = save_supported_monthly_drugs_dispensed_core(&conn, &sup_row(1, Some(1), None, "2026-08", 5.0, 1.0), true);
        assert!(area_attempt.is_err());
        let clinic_attempt = save_supported_monthly_drugs_dispensed_core(&conn, &sup_row(1, Some(1), Some(1), "2026-08", 5.0, 1.0), true);
        assert!(clinic_attempt.is_err());
        assert_eq!(sup_count(&conn, "2026-08"), 1);
    }

    // PHASE 6: a Create for an existing Supported key is rejected with the
    // exact Arabic message and never overwrites the stored row.
    #[test]
    fn create_rejects_existing_supported_key() {
        let conn = test_db_with_new_tables();
        save_supported_monthly_drugs_dispensed_core(&conn, &sup_row(1, None, None, "2026-08", 123.0, 12.0), true).unwrap();
        let err = save_supported_monthly_drugs_dispensed_core(&conn, &sup_row(1, None, None, "2026-08", 456.0, 45.0), true).unwrap_err();
        assert!(
            err.contains(super::ERR_SUPPORTED_ALREADY_EXISTS),
            "expected Arabic duplicate message, got: {}",
            err
        );
        assert_eq!(sup_count(&conn, "2026-08"), 1);
        let (value, share): (f64, f64) = conn
            .query_row(
                "SELECT drugs_supported_authority_value, drugs_supported_authority_patient_share FROM monthly_supported_drugs_dispensed WHERE dispense_month='2026-08'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(value, 123.0, "stored value must be untouched by a rejected Create");
        assert_eq!(share, 12.0);
    }
}

