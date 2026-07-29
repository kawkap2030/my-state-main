use crate::db::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::commands::month_isolation::enforce_isolation_lock;

#[derive(Serialize, Deserialize, Debug)]
pub struct BranchBatchItem {
    pub branch_id: i32,
    pub drugs_free_authority: f64,
    pub drugs_free_students: f64,
    pub drugs_free_infants: f64,
    pub drugs_free_breadwinner_women: f64,
    pub drugs_supported_authority_value: f64,
    pub drugs_supported_authority_patient_share: f64,
    pub drugs_supported_students_value: f64,
    pub drugs_supported_students_patient_share: f64,
    pub drugs_supported_infants_value: f64,
    pub drugs_supported_infants_patient_share: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct BranchBatchSummary {
    pub id: i32,
    pub branch_id: i32,
    pub branch_name: String,
    pub dispense_month: String,
    pub drugs_free_authority: f64,
    pub drugs_free_students: f64,
    pub drugs_free_infants: f64,
    pub drugs_free_breadwinner_women: f64,
    pub drugs_supported_authority_value: f64,
    pub drugs_supported_authority_patient_share: f64,
    pub drugs_supported_students_value: f64,
    pub drugs_supported_students_patient_share: f64,
    pub drugs_supported_infants_value: f64,
    pub drugs_supported_infants_patient_share: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SaveBranchBatchResult {
    pub saved: i32,
    pub skipped: i32,
    pub skipped_branches: Vec<String>,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn save_branch_batch_summary(
    state: State<'_, AppState>,
    items: Vec<BranchBatchItem>,
    dispenseMonth: String,
) -> Result<SaveBranchBatchResult, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut saved = 0;
    let mut skipped = 0;
    let mut skipped_branches: Vec<String> = Vec::new();

    for item in items {
        // Check if all values are 0
        let sum = item.drugs_free_authority + item.drugs_free_students 
                  + item.drugs_free_infants + item.drugs_free_breadwinner_women
                  + item.drugs_supported_authority_value + item.drugs_supported_authority_patient_share
                  + item.drugs_supported_students_value + item.drugs_supported_students_patient_share
                  + item.drugs_supported_infants_value + item.drugs_supported_infants_patient_share;

        if sum == 0.0 {
            skipped += 1;
            let branch_name: String = conn.query_row(
                "SELECT name FROM branches WHERE id = ?1", 
                [item.branch_id], 
                |row| row.get(0)
            ).unwrap_or_else(|_| "غير معروف".to_string());
            skipped_branches.push(branch_name);
            continue;
        }

        // Enforce month isolation lock
        if let Err(_e) = enforce_isolation_lock(conn, item.branch_id, &dispenseMonth, "branch", true) {
            let branch_name: String = conn.query_row(
                "SELECT name FROM branches WHERE id = ?1", 
                [item.branch_id], 
                |row| row.get(0)
            ).unwrap_or_else(|_| "غير معروف".to_string());
            skipped += 1;
            skipped_branches.push(format!("{} (مقفل)", branch_name));
            continue;
        }

        // Check if record already exists for this branch and month (at branch level, no area/clinic)
        let existing_id: Option<i32> = conn.query_row(
            "SELECT id FROM monthly_drugs_dispensed 
             WHERE branch_id = ?1 AND dispense_month = ?2 AND area_id IS NULL AND clinic_id IS NULL",
            rusqlite::params![item.branch_id, dispenseMonth],
            |row| row.get(0)
        ).ok();

        if let Some(id) = existing_id {
            // Update existing record
            conn.execute(
                "UPDATE monthly_drugs_dispensed SET 
                    drugs_free_authority = ?1, drugs_free_students = ?2, drugs_free_infants = ?3, 
                    drugs_free_breadwinner_women = ?4, drugs_supported_authority_value = ?5,
                    drugs_supported_authority_patient_share = ?6, drugs_supported_students_value = ?7,
                    drugs_supported_students_patient_share = ?8, drugs_supported_infants_value = ?9,
                    drugs_supported_infants_patient_share = ?10
                 WHERE id = ?11",
                rusqlite::params![
                    item.drugs_free_authority, item.drugs_free_students, item.drugs_free_infants,
                    item.drugs_free_breadwinner_women, item.drugs_supported_authority_value,
                    item.drugs_supported_authority_patient_share, item.drugs_supported_students_value,
                    item.drugs_supported_students_patient_share, item.drugs_supported_infants_value,
                    item.drugs_supported_infants_patient_share, id
                ],
            ).map_err(|e| e.to_string())?;
        } else {
            // Insert new record
            conn.execute(
                "INSERT INTO monthly_drugs_dispensed (
                    branch_id, dispense_month, area_id, clinic_id,
                    drugs_free_authority, drugs_free_students, drugs_free_infants, drugs_free_breadwinner_women,
                    drugs_supported_authority_value, drugs_supported_authority_patient_share,
                    drugs_supported_students_value, drugs_supported_students_patient_share,
                    drugs_supported_infants_value, drugs_supported_infants_patient_share
                ) VALUES (?1, ?2, NULL, NULL, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                rusqlite::params![
                    item.branch_id, dispenseMonth,
                    item.drugs_free_authority, item.drugs_free_students, item.drugs_free_infants,
                    item.drugs_free_breadwinner_women, item.drugs_supported_authority_value,
                    item.drugs_supported_authority_patient_share, item.drugs_supported_students_value,
                    item.drugs_supported_students_patient_share, item.drugs_supported_infants_value,
                    item.drugs_supported_infants_patient_share
                ],
            ).map_err(|e| e.to_string())?;
        }

        saved += 1;
    }

    Ok(SaveBranchBatchResult { saved, skipped, skipped_branches })
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_branch_batch_summary(
    state: State<'_, AppState>,
    dispenseMonth: String,
) -> Result<Vec<BranchBatchSummary>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn.prepare(
        "SELECT 
            COALESCE(m.id, 0) as id,
            b.id as branch_id, 
            b.name as branch_name,
            ?1 as dispense_month,
            COALESCE(m.drugs_free_authority, 0) as drugs_free_authority,
            COALESCE(m.drugs_free_students, 0) as drugs_free_students,
            COALESCE(m.drugs_free_infants, 0) as drugs_free_infants,
            COALESCE(m.drugs_free_breadwinner_women, 0) as drugs_free_breadwinner_women,
            COALESCE(m.drugs_supported_authority_value, 0) as drugs_supported_authority_value,
            COALESCE(m.drugs_supported_authority_patient_share, 0) as drugs_supported_authority_patient_share,
            COALESCE(m.drugs_supported_students_value, 0) as drugs_supported_students_value,
            COALESCE(m.drugs_supported_students_patient_share, 0) as drugs_supported_students_patient_share,
            COALESCE(m.drugs_supported_infants_value, 0) as drugs_supported_infants_value,
            COALESCE(m.drugs_supported_infants_patient_share, 0) as drugs_supported_infants_patient_share
         FROM branches b
         LEFT JOIN monthly_drugs_dispensed m ON b.id = m.branch_id 
            AND m.dispense_month = ?1 AND m.area_id IS NULL AND m.clinic_id IS NULL
         ORDER BY b.name"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([&dispenseMonth], |row| {
        Ok(BranchBatchSummary {
            id: row.get(0)?,
            branch_id: row.get(1)?,
            branch_name: row.get(2)?,
            dispense_month: row.get(3)?,
            drugs_free_authority: row.get(4)?,
            drugs_free_students: row.get(5)?,
            drugs_free_infants: row.get(6)?,
            drugs_free_breadwinner_women: row.get(7)?,
            drugs_supported_authority_value: row.get(8)?,
            drugs_supported_authority_patient_share: row.get(9)?,
            drugs_supported_students_value: row.get(10)?,
            drugs_supported_students_patient_share: row.get(11)?,
            drugs_supported_infants_value: row.get(12)?,
            drugs_supported_infants_patient_share: row.get(13)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}
