use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::AppState;
use crate::commands::month_isolation::{
    enforce_isolation_lock, enforce_isolation_lock_guard, cleanup_isolation_lock_if_empty,
    get_branch_id_from_clinic,
};
use rusqlite::OptionalExtension;

#[derive(Serialize, Deserialize, Debug)]
pub struct DrugGroup {
    pub id: Option<i32>,
    pub name: String,
    pub cost: f64,
    pub clinic_id: Option<i32>,
    pub area_id: Option<i32>,
    pub branch_id: Option<i32>,
    pub dispense_month: String, // YYYY-MM
    pub group_code_id: Option<i32>,
}

#[derive(Serialize)]
pub struct BulkSaveResult {
    pub saved_count: usize,
    pub skipped_names: Vec<String>,
}

/// Derive the branch_id from whichever hierarchy level is available
fn resolve_branch_id(conn: &rusqlite::Connection, clinic_id: Option<i32>, area_id: Option<i32>, branch_id: Option<i32>) -> Result<i32, String> {
    if let Some(cid) = clinic_id {
        return get_branch_id_from_clinic(conn, cid);
    }
    if let Some(aid) = area_id {
        return conn.query_row(
            "SELECT branch_id FROM areas WHERE id = ?1",
            [aid],
            |row| row.get(0)
        ).map_err(|e| format!("فشل في تحديد الفرع من المنطقة: {}", e));
    }
    if let Some(bid) = branch_id {
        return Ok(bid);
    }
    Err("يرجى اختيار فرع أو منطقة أو عيادة".into())
}

/// Determine the isolation level based on what hierarchy IDs are provided
fn resolve_isolation_level(clinic_id: Option<i32>, area_id: Option<i32>) -> &'static str {
    if clinic_id.is_some() {
        "clinic"
    } else if area_id.is_some() {
        "area"
    } else {
        "branch"
    }
}

#[tauri::command]
pub fn save_drug_group(state: State<'_, AppState>, data: DrugGroup) -> Result<i32, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // --- Global Month Isolation Lock ---
    let branch_id = resolve_branch_id(conn, data.clinic_id, data.area_id, data.branch_id)?;
    let level = resolve_isolation_level(data.clinic_id, data.area_id);
    enforce_isolation_lock(conn, branch_id, &data.dispense_month, level, false)?;

    // Check if exists
    let existing_id: Option<i32> = conn.query_row(
        "SELECT id FROM drug_groups 
         WHERE dispense_month = ?1 AND group_code_id = ?2 
         AND IFNULL(branch_id, 0) = ?3 AND IFNULL(area_id, 0) = ?4 AND IFNULL(clinic_id, 0) = ?5",
        rusqlite::params![
            data.dispense_month,
            data.group_code_id,
            branch_id,
            data.area_id.unwrap_or(0),
            data.clinic_id.unwrap_or(0)
        ],
        |row| row.get(0)
    ).optional().unwrap_or(None);

    if data.id.is_none() && existing_id.is_some() {
        return Err("المجموعة مدخلة بالفعل، يمكنك تحديث البيانات من جدول السجلات إن كنت تريد التغيير.".into());
    }

    let target_id = data.id.or(existing_id);

    if let Some(id) = target_id {
        // Update
        conn.execute(
            "UPDATE drug_groups SET 
                name = ?1, cost = ?2, clinic_id = ?3, area_id = ?4, dispense_month = ?5, group_code_id = ?6, branch_id = ?7
             WHERE id = ?8",
            rusqlite::params![
                data.name, data.cost, data.clinic_id, data.area_id, data.dispense_month, data.group_code_id, branch_id, id
            ],
        ).map_err(|e| e.to_string())?;
        Ok(id)
    } else {
        // Insert
        conn.execute(
            "INSERT INTO drug_groups (
                name, cost, clinic_id, area_id, dispense_month, group_code_id, branch_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                data.name, data.cost, data.clinic_id, data.area_id, data.dispense_month, data.group_code_id, branch_id
            ],
        ).map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid() as i32)
    }
}
#[tauri::command]
pub fn save_drug_group_cost(state: State<'_, AppState>, data: DrugGroup) -> Result<i32, String> {
    save_drug_group(state, data)
}

#[tauri::command]
pub fn save_drug_group_costs_bulk(state: State<'_, AppState>, data: Vec<DrugGroup>) -> Result<BulkSaveResult, String> {
    let mut conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_mut().ok_or("Database not initialized")?;

    if data.is_empty() { 
        return Ok(BulkSaveResult { saved_count: 0, skipped_names: vec![] }); 
    }

    // Check isolation once (assuming all belong to same branch/month)
    let first = &data[0];
    let branch_id = resolve_branch_id(conn, first.clinic_id, first.area_id, first.branch_id)?;
    let level = resolve_isolation_level(first.clinic_id, first.area_id);
    enforce_isolation_lock(conn, branch_id, &first.dispense_month, level, false)?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut saved_count = 0;
    let mut skipped_names = Vec::new();

    for item in data {
        // Invalid costs are reported (not silently dropped) so the user sees why
        // a group was skipped.
        if item.cost <= 0.0 {
            skipped_names.push(format!("{} (قيمة غير صالحة)", item.name));
            continue;
        }

        // NOTE: Bulk entry is CREATE-only (not an edit mode). The presence of an
        // item.id / existingId is deliberately NOT used to UPDATE an existing row.
        // A record that already exists for this group + level + location + month is
        // treated as a duplicate and SKIPPED; the existing record is left untouched.
        let existing_id: Option<i32> = tx.query_row(
            "SELECT id FROM drug_groups 
             WHERE dispense_month = ?1 AND group_code_id = ?2 
             AND IFNULL(branch_id, 0) = ?3 AND IFNULL(area_id, 0) = ?4 AND IFNULL(clinic_id, 0) = ?5",
            rusqlite::params![
                item.dispense_month,
                item.group_code_id,
                branch_id,
                item.area_id.unwrap_or(0),
                item.clinic_id.unwrap_or(0)
            ],
            |row| row.get(0)
        ).optional().unwrap_or(None);

        if existing_id.is_some() {
            // Genuine duplicate in bulk mode — reported, not silently overwritten.
            skipped_names.push(format!("{} (مسجل مسبقاً)", item.name));
        } else {
            // Insert new record
            tx.execute(
                "INSERT INTO drug_groups (name, cost, clinic_id, area_id, dispense_month, group_code_id, branch_id) 
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    item.name, item.cost, item.clinic_id, item.area_id, item.dispense_month, item.group_code_id, branch_id
                ],
            ).map_err(|e| e.to_string())?;
            saved_count += 1;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(BulkSaveResult { saved_count, skipped_names })
}

#[tauri::command]
pub fn get_drug_groups_report(
    state: State<'_, AppState>,
    branch_id: i32,
    area_id: Option<i32>,
    clinic_id: Option<i32>,
    dispense_month: String,
) -> Result<Vec<DrugGroup>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "SELECT id, name, cost, clinic_id, area_id, dispense_month, group_code_id, branch_id 
                   FROM drug_groups 
                   WHERE dispense_month = ?1".to_string();
    
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(dispense_month)];

    if let Some(cid) = clinic_id {
        sql.push_str(" AND clinic_id = ?2");
        params.push(Box::new(cid));
    } else if let Some(aid) = area_id {
        sql.push_str(" AND (area_id = ?2 OR area_id IN (SELECT id FROM areas WHERE id = ?2))");
        params.push(Box::new(aid));
    } else {
        sql.push_str(" AND (branch_id = ?2 OR area_id IN (SELECT id FROM areas WHERE branch_id = ?2))");
        params.push(Box::new(branch_id));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(DrugGroup {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            cost: row.get(2)?,
            clinic_id: row.get(3)?,
            area_id: row.get(4)?,
            dispense_month: row.get(5)?,
            group_code_id: row.get(6)?,
            branch_id: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn get_drug_groups_report_range(
    state: State<'_, AppState>,
    branch_id: i32,
    area_id: Option<i32>,
    clinic_id: Option<i32>,
    start_month: String,
    end_month: String,
) -> Result<Vec<DrugGroup>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "SELECT id, name, cost, clinic_id, area_id, dispense_month, group_code_id, branch_id 
                   FROM drug_groups 
                   WHERE dispense_month >= ?1 AND dispense_month <= ?2".to_string();
    
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
        Box::new(start_month),
        Box::new(end_month),
    ];

    if let Some(cid) = clinic_id {
        sql.push_str(" AND clinic_id = ?3");
        params.push(Box::new(cid));
    } else if let Some(aid) = area_id {
        sql.push_str(" AND (area_id = ?3 OR area_id IN (SELECT id FROM areas WHERE id = ?3))");
        params.push(Box::new(aid));
    } else {
        sql.push_str(" AND (branch_id = ?3 OR area_id IN (SELECT id FROM areas WHERE branch_id = ?3))");
        params.push(Box::new(branch_id));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(DrugGroup {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            cost: row.get(2)?,
            clinic_id: row.get(3)?,
            area_id: row.get(4)?,
            dispense_month: row.get(5)?,
            group_code_id: row.get(6)?,
            branch_id: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn get_exact_drug_groups(
    state: State<'_, AppState>,
    branch_id: i32,
    area_id: Option<i32>,
    clinic_id: Option<i32>,
    dispense_month: String,
) -> Result<Vec<DrugGroup>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "SELECT id, name, cost, clinic_id, area_id, dispense_month, group_code_id, branch_id 
                   FROM drug_groups 
                   WHERE dispense_month = ?1 AND branch_id = ?2".to_string();
    
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
        Box::new(dispense_month),
        Box::new(branch_id),
    ];

    if let Some(cid) = clinic_id {
        sql.push_str(" AND clinic_id = ?3");
        params.push(Box::new(cid));
    } else {
        sql.push_str(" AND clinic_id IS NULL");
        if let Some(aid) = area_id {
            sql.push_str(" AND area_id = ?3");
            params.push(Box::new(aid));
        } else {
            sql.push_str(" AND area_id IS NULL");
        }
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(DrugGroup {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            cost: row.get(2)?,
            clinic_id: row.get(3)?,
            area_id: row.get(4)?,
            dispense_month: row.get(5)?,
            group_code_id: row.get(6)?,
            branch_id: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn delete_drug_group(state: State<'_, AppState>, id: i32) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let rec: Option<(i32, Option<i32>, Option<i32>, String)> = conn.query_row(
        "SELECT branch_id, area_id, clinic_id, dispense_month 
         FROM drug_groups WHERE id = ?1",
        [id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).optional().map_err(|e| e.to_string())?;

    let (branch_id, area_id, clinic_id, dispense_month) = match rec {
        Some(r) => r,
        None => return Err("السجل غير موجود".to_string()),
    };

    let current_level = if clinic_id.is_some() { "clinic" }
                        else if area_id.is_some() { "area" }
                        else { "branch" };
    enforce_isolation_lock_guard(conn, branch_id, &dispense_month, current_level)?;

    conn.execute("DELETE FROM drug_groups WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    cleanup_isolation_lock_if_empty(conn, branch_id, &dispense_month)?;
    Ok(())
}
