use crate::db::AppState;
use crate::commands::audit::log_action;
use crate::commands::master_data::BulkResult;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize, Debug)]
pub struct Branch {
    pub id: i32,
    pub name: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Area {
    pub id: i32,
    pub name: String,
    pub branch_id: i32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Clinic {
    pub id: i32,
    pub name: String,
    pub area_id: i32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct BulkDeleteResult {
    pub deleted: i32,
    pub skipped: i32,
    pub skipped_names: Vec<String>,
}

fn is_id_in_use(conn: &rusqlite::Connection, tables: &[(&str, &str)], id: i32) -> bool {
    for (table, col) in tables {
        let query = format!("SELECT 1 FROM {} WHERE {} = ?1 LIMIT 1", table, col);
        let exists: bool = conn.query_row(&query, [id], |_| Ok(true)).unwrap_or(false);
        if exists {
            return true;
        }
    }
    false
}

#[tauri::command]
pub fn get_branches(state: State<'_, AppState>) -> Result<Vec<Branch>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn
        .prepare("SELECT id, name FROM branches")
        .map_err(|e| e.to_string())?;
    let branches = stmt
        .query_map([], |row| {
            Ok(Branch {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for branch in branches {
        result.push(branch.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn get_areas(state: State<'_, AppState>, branch_id: i32) -> Result<Vec<Area>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn
        .prepare("SELECT id, name, branch_id FROM areas WHERE branch_id = ?1")
        .map_err(|e| e.to_string())?;
    let areas = stmt
        .query_map([branch_id], |row| {
            Ok(Area {
                id: row.get(0)?,
                name: row.get(1)?,
                branch_id: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for area in areas {
        result.push(area.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn add_branch(state: State<'_, AppState>, name: String) -> Result<i32, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    conn.execute("INSERT INTO branches (name) VALUES (?1)", [&name])
        .map_err(|e| e.to_string())?;
    let new_id = conn.last_insert_rowid() as i32;
    let _ = log_action(conn, None, "INSERT", "branches", Some(&new_id.to_string()), Some(&format!("إضافة فرع: {}", name)));
    Ok(new_id)
}

#[tauri::command]
pub fn update_branch(state: State<'_, AppState>, id: i32, name: String) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    conn.execute(
        "UPDATE branches SET name = ?1 WHERE id = ?2",
        rusqlite::params![&name, id],
    )
    .map_err(|e| e.to_string())?;
    let _ = log_action(conn, None, "UPDATE", "branches", Some(&id.to_string()), Some(&format!("تعديل فرع: {}", name)));
    Ok(())
}

#[tauri::command]
pub fn delete_branch(state: State<'_, AppState>, id: i32) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let usage_tables = [
        ("areas", "branch_id"),
        ("detailed_drug_dispensed", "branch_id"),
        ("insulin_dispensed", "branch_id"),
        ("drug_groups", "branch_id"),
        ("medical_tickets", "branch_id"),
        ("monthly_supplies_dispensed", "branch_id"),
    ];

    if is_id_in_use(conn, &usage_tables, id) {
        return Err("لا يمكن حذف الفرع لوجود مناطق أو سجلات مرتبطة به".into());
    }

    conn.execute("DELETE FROM branches WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn bulk_delete_branches(state: State<'_, AppState>, ids: Vec<i32>) -> Result<BulkDeleteResult, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    let mut deleted = 0;
    let mut skipped = 0;
    let mut skipped_names = Vec::new();

    let usage_tables = [
        ("areas", "branch_id"),
        ("detailed_drug_dispensed", "branch_id"),
        ("insulin_dispensed", "branch_id"),
        ("drug_groups", "branch_id"),
        ("medical_tickets", "branch_id"),
        ("monthly_supplies_dispensed", "branch_id"),
    ];

    for id in ids {
        let name: String = conn.query_row("SELECT name FROM branches WHERE id = ?1", [id], |row| row.get(0)).unwrap_or_else(|_| "Unknown".into());
        if is_id_in_use(conn, &usage_tables, id) {
            skipped += 1;
            skipped_names.push(name);
        } else {
            conn.execute("DELETE FROM branches WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
            deleted += 1;
        }
    }
    Ok(BulkDeleteResult { deleted, skipped, skipped_names })
}

#[tauri::command]
pub fn add_area(state: State<'_, AppState>, name: String, branch_id: i32) -> Result<i32, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    conn.execute(
        "INSERT INTO areas (name, branch_id) VALUES (?1, ?2)",
        rusqlite::params![name, branch_id],
    )
    .map_err(|e| e.to_string())?;
    let new_id = conn.last_insert_rowid() as i32;
    let _ = log_action(conn, None, "INSERT", "areas", Some(&new_id.to_string()), Some(&format!("إضافة منطقة: {} (الفرع {})", name, branch_id)));
    Ok(new_id)
}

#[tauri::command]
pub fn update_area(
    state: State<'_, AppState>,
    id: i32,
    name: String,
    branch_id: i32,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    conn.execute(
        "UPDATE areas SET name = ?1, branch_id = ?2 WHERE id = ?3",
        rusqlite::params![name, branch_id, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_area(state: State<'_, AppState>, id: i32) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let usage_tables = [
        ("clinics", "area_id"),
        ("judicial_patients", "area_id"),
        ("detailed_drug_dispensed", "area_id"),
        ("insulin_dispensed", "area_id"),
        ("drug_groups", "area_id"),
        ("medical_tickets", "area_id"),
        ("monthly_supplies_dispensed", "area_id"),
    ];

    if is_id_in_use(conn, &usage_tables, id) {
        return Err("لا يمكن حذف المنطقة لوجود عيادات أو سجلات مرتبطة بها".into());
    }

    conn.execute("DELETE FROM areas WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn bulk_delete_areas(state: State<'_, AppState>, ids: Vec<i32>) -> Result<BulkDeleteResult, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    let mut deleted = 0;
    let mut skipped = 0;
    let mut skipped_names = Vec::new();

    let usage_tables = [
        ("clinics", "area_id"),
        ("judicial_patients", "area_id"),
        ("detailed_drug_dispensed", "area_id"),
        ("insulin_dispensed", "area_id"),
        ("drug_groups", "area_id"),
        ("medical_tickets", "area_id"),
        ("monthly_supplies_dispensed", "area_id"),
    ];

    for id in ids {
        let name: String = conn.query_row("SELECT name FROM areas WHERE id = ?1", [id], |row| row.get(0)).unwrap_or_else(|_| "Unknown".into());
        if is_id_in_use(conn, &usage_tables, id) {
            skipped += 1;
            skipped_names.push(name);
        } else {
            conn.execute("DELETE FROM areas WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
            deleted += 1;
        }
    }
    Ok(BulkDeleteResult { deleted, skipped, skipped_names })
}

#[tauri::command]
pub fn get_clinics(state: State<'_, AppState>, area_id: i32) -> Result<Vec<Clinic>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn
        .prepare("SELECT id, name, area_id FROM clinics WHERE area_id = ?1")
        .map_err(|e| e.to_string())?;
    let clinics = stmt
        .query_map([area_id], |row| {
            Ok(Clinic {
                id: row.get(0)?,
                name: row.get(1)?,
                area_id: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for clinic in clinics {
        result.push(clinic.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn add_clinic(state: State<'_, AppState>, name: String, area_id: i32) -> Result<i32, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    conn.execute(
        "INSERT INTO clinics (name, area_id) VALUES (?1, ?2)",
        rusqlite::params![name, area_id],
    )
    .map_err(|e| e.to_string())?;
    let new_id = conn.last_insert_rowid() as i32;
    let _ = log_action(conn, None, "INSERT", "clinics", Some(&new_id.to_string()), Some(&format!("إضافة عيادة: {} (المنطقة {})", name, area_id)));
    Ok(new_id)
}

#[tauri::command]
pub fn update_clinic(
    state: State<'_, AppState>,
    id: i32,
    name: String,
    area_id: i32,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    conn.execute(
        "UPDATE clinics SET name = ?1, area_id = ?2 WHERE id = ?3",
        rusqlite::params![name, area_id, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_clinic(state: State<'_, AppState>, id: i32) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let usage_tables = [
        ("monthly_drugs_dispensed", "clinic_id"),
        ("detailed_drug_dispensed", "clinic_id"),
        ("insulin_dispensed", "clinic_id"),
        ("judicial_patients", "clinic_id"),
        ("drug_groups", "clinic_id"),
        ("medical_tickets", "clinic_id"),
        ("monthly_supplies_dispensed", "clinic_id"),
    ];

    if is_id_in_use(conn, &usage_tables, id) {
        return Err("لا يمكن حذف العيادة لوجود سجلات مرتبطة بها".into());
    }

    conn.execute("DELETE FROM clinics WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn bulk_delete_clinics(state: State<'_, AppState>, ids: Vec<i32>) -> Result<BulkDeleteResult, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    let mut deleted = 0;
    let mut skipped = 0;
    let mut skipped_names = Vec::new();

    let usage_tables = [
        ("monthly_drugs_dispensed", "clinic_id"),
        ("detailed_drug_dispensed", "clinic_id"),
        ("insulin_dispensed", "clinic_id"),
        ("judicial_patients", "clinic_id"),
        ("drug_groups", "clinic_id"),
        ("medical_tickets", "clinic_id"),
        ("monthly_supplies_dispensed", "clinic_id"),
    ];

    for id in ids {
        let name: String = conn.query_row("SELECT name FROM clinics WHERE id = ?1", [id], |row| row.get(0)).unwrap_or_else(|_| "Unknown".into());
        if is_id_in_use(conn, &usage_tables, id) {
            skipped += 1;
            skipped_names.push(name);
        } else {
            conn.execute("DELETE FROM clinics WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
            deleted += 1;
        }
    }
    Ok(BulkDeleteResult { deleted, skipped, skipped_names })
}

#[tauri::command]
pub fn get_areas_all(state: State<'_, AppState>) -> Result<Vec<Area>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    let mut stmt = conn.prepare("SELECT id, name, branch_id FROM areas").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Area { id: row.get(0)?, name: row.get(1)?, branch_id: row.get(2)? })
    }).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for r in rows { result.push(r.map_err(|e| e.to_string())?); }
    Ok(result)
}

#[tauri::command]
pub fn get_clinics_all(state: State<'_, AppState>) -> Result<Vec<Clinic>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    let mut stmt = conn.prepare("SELECT id, name, area_id FROM clinics").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Clinic { id: row.get(0)?, name: row.get(1)?, area_id: row.get(2)? })
    }).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for r in rows { result.push(r.map_err(|e| e.to_string())?); }
    Ok(result)
}

#[tauri::command]
pub fn bulk_add_branches(state: State<'_, AppState>, names: Vec<String>) -> Result<BulkResult, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    let mut added = 0;
    let mut skipped = 0;
    for name in names {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() { continue; }
        let mut stmt = conn.prepare("SELECT COUNT(*) FROM branches WHERE name = ?1").map_err(|e| e.to_string())?;
        let count: i32 = stmt.query_row([&trimmed], |row| row.get(0)).unwrap_or(0);
        if count > 0 {
            skipped += 1;
        } else {
            conn.execute("INSERT INTO branches (name) VALUES (?1)", [&trimmed]).map_err(|e| e.to_string())?;
            added += 1;
        }
    }
    let _ = log_action(conn, None, "BULK_UPDATE", "branches", None, Some(&format!("إضافة مجمعة للفروع: {} مضاف، {} متخطى", added, skipped)));
    Ok(BulkResult { added, skipped })
}

#[tauri::command]
pub fn bulk_add_areas(state: State<'_, AppState>, names: Vec<String>, branch_id: i32) -> Result<BulkResult, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    let mut added = 0;
    let mut skipped = 0;
    for name in names {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() { continue; }
        let mut stmt = conn.prepare("SELECT COUNT(*) FROM areas WHERE name = ?1 AND branch_id = ?2").map_err(|e| e.to_string())?;
        let count: i32 = stmt.query_row(rusqlite::params![&trimmed, branch_id], |row| row.get(0)).unwrap_or(0);
        if count > 0 {
            skipped += 1;
        } else {
            conn.execute("INSERT INTO areas (name, branch_id) VALUES (?1, ?2)", rusqlite::params![&trimmed, branch_id]).map_err(|e| e.to_string())?;
            added += 1;
        }
    }
    let _ = log_action(conn, None, "BULK_UPDATE", "areas", None, Some(&format!("إضافة مجمعة للمناطق (فرع {}): {} مضاف، {} متخطى", branch_id, added, skipped)));
    Ok(BulkResult { added, skipped })
}

#[tauri::command]
pub fn bulk_add_clinics(state: State<'_, AppState>, names: Vec<String>, area_id: i32) -> Result<BulkResult, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    let mut added = 0;
    let mut skipped = 0;
    for name in names {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() { continue; }
        let mut stmt = conn.prepare("SELECT COUNT(*) FROM clinics WHERE name = ?1 AND area_id = ?2").map_err(|e| e.to_string())?;
        let count: i32 = stmt.query_row(rusqlite::params![&trimmed, area_id], |row| row.get(0)).unwrap_or(0);
        if count > 0 {
            skipped += 1;
        } else {
            conn.execute("INSERT INTO clinics (name, area_id) VALUES (?1, ?2)", rusqlite::params![&trimmed, area_id]).map_err(|e| e.to_string())?;
            added += 1;
        }
    }
    let _ = log_action(conn, None, "BULK_UPDATE", "clinics", None, Some(&format!("إضافة مجمعة للعيادات (منطقة {}): {} مضاف، {} متخطى", area_id, added, skipped)));
    Ok(BulkResult { added, skipped })
}
