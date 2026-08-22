use tauri::State;
use crate::db::AppState;
use rusqlite::{params, OptionalExtension};

#[tauri::command]
pub fn get_month_isolation_rule(
    state: State<'_, AppState>,
    branch_id: i32,
    dispense_month: String,
) -> Result<Option<String>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.query_row(
        "SELECT isolation_level FROM dispensing_month_isolation WHERE branch_id = ?1 AND dispense_month = ?2",
        params![branch_id, dispense_month],
        |row| row.get(0)
    ).optional().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn check_month_data_exists(
    state: State<'_, AppState>,
    branch_id: Option<i32>,
    dispense_month: String,
) -> Result<bool, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    check_month_data_exists_internal(conn, branch_id, &dispense_month)
}

fn check_month_data_exists_internal(
    conn: &rusqlite::Connection,
    branch_id: Option<i32>,
    dispense_month: &str,
) -> Result<bool, String> {
    let tables = vec![
        "monthly_drugs_dispensed",
        "detailed_drug_dispensed",
        "insulin_dispensed",
        "judicial_dispensed",
        "drug_groups",
        "medical_tickets",
        "monthly_supplies_dispensed",
    ];

    for table in tables {
        let count: i32 = match branch_id {
            Some(bid) => conn.query_row(
                &format!("SELECT COUNT(*) FROM {} WHERE branch_id = ?1 AND dispense_month = ?2", table),
                params![bid, dispense_month],
                |row| row.get(0)
            ).unwrap_or(0),
            None => conn.query_row(
                &format!("SELECT COUNT(*) FROM {} WHERE dispense_month = ?1", table),
                params![dispense_month],
                |row| row.get(0)
            ).unwrap_or(0),
        };

        if count > 0 {
            return Ok(true);
        }
    }

    Ok(false)
}

#[tauri::command]
pub fn set_month_isolation_rule(
    state: State<'_, AppState>,
    branch_id: i32,
    dispense_month: String,
    isolation_level: String,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // Validate level
    if !["branch", "area", "clinic"].contains(&isolation_level.as_str()) {
        return Err("Invalid isolation level".into());
    }

    // Check if a rule already exists
    let existing: Option<String> = conn.query_row(
        "SELECT isolation_level FROM dispensing_month_isolation WHERE branch_id = ?1 AND dispense_month = ?2",
        params![branch_id, dispense_month],
        |row| row.get(0)
    ).optional().map_err(|e| e.to_string())?;

    if let Some(lvl) = existing {
        if lvl != isolation_level {
            // BUT: Before rejecting, check if there is ANY data.
            // If there's no data, we can allow the user to change the isolation level.
            let has_data = check_month_data_exists_internal(conn, Some(branch_id), &dispense_month)?;
            if has_data {
                return Err(format!("الشهر مقفل بالفعل على مستوى '{}' ويحتوي على سجلات. لا يمكن التغيير.", 
                    if lvl == "branch" { "الفرع" } else if lvl == "area" { "المنطقة" } else { "العيادة" }));
            } else {
                // No data? Update the rule instead of rejecting
                conn.execute(
                    "UPDATE dispensing_month_isolation SET isolation_level = ?1 WHERE branch_id = ?2 AND dispense_month = ?3",
                    params![isolation_level, branch_id, dispense_month]
                ).map_err(|e| e.to_string())?;
                return Ok(());
            }
        }
        return Ok(());
    }

    conn.execute(
        "INSERT INTO dispensing_month_isolation (branch_id, dispense_month, isolation_level) VALUES (?1, ?2, ?3)",
        params![branch_id, dispense_month, isolation_level]
    ).map_err(|e| e.to_string())?;

    Ok(())
}

// Shared helper (NOT a command)
pub fn enforce_isolation_lock(
    conn: &rusqlite::Connection,
    branch_id: i32,
    dispense_month: &str,
    current_level: &str,
    is_flexible: bool, // New parameter
) -> Result<(), String> {
    let existing: Option<String> = conn.query_row(
        "SELECT isolation_level FROM dispensing_month_isolation WHERE branch_id = ?1 AND dispense_month = ?2",
        params![branch_id, dispense_month],
        |row| row.get(0)
    ).optional().map_err(|e| e.to_string())?;

    if let Some(lvl) = existing {
        if lvl != current_level {
            // Exception: If flexible is requested and we are at clinic level while lock is higher
            if is_flexible && current_level == "clinic" && (lvl == "branch" || lvl == "area") {
                return Ok(());
            }
            
            return Err(format!("خطأ في العزل الثلاثي: هذا الشهر مقفل على مستوى إدخال '{}'. حاول تغيير اختيار الهيكل التنظيمي.", 
                if lvl == "branch" { "الفرع" } else if lvl == "area" { "المنطقة" } else { "العيادة" }));
        }
    } else {
        // Auto-lock on first save
        // If it's flexible and clinic level, DON'T create a global lock yet, let other modules decide.
        if is_flexible && current_level == "clinic" {
            return Ok(());
        }

        conn.execute(
            "INSERT INTO dispensing_month_isolation (branch_id, dispense_month, isolation_level) VALUES (?1, ?2, ?3)",
            params![branch_id, dispense_month, current_level]
        ).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

// Check-only variant: rejects writes at a level that contradicts an existing
// isolation lock, but NEVER creates a lock. Used by update/delete commands so
// deleting the last record of a month does not leave a stale lock behind.
pub fn enforce_isolation_lock_guard(
    conn: &rusqlite::Connection,
    branch_id: i32,
    dispense_month: &str,
    current_level: &str,
) -> Result<(), String> {
    let existing: Option<String> = conn.query_row(
        "SELECT isolation_level FROM dispensing_month_isolation WHERE branch_id = ?1 AND dispense_month = ?2",
        params![branch_id, dispense_month],
        |row| row.get(0)
    ).optional().map_err(|e| e.to_string())?;

    if let Some(lvl) = existing {
        if lvl != current_level {
            // Flexible-mode exception: clinic-level rows may legitimately exist
            // under a branch/area lock (SuppliesTotalsPage exception + grid).
            if current_level == "clinic" && (lvl == "branch" || lvl == "area") {
                return Ok(());
            }
            return Err(format!("خطأ في العزل الثلاثي: هذا الشهر مقفل على مستوى إدخال '{}'. حاول تغيير اختيار الهيكل التنظيمي.", 
                if lvl == "branch" { "الفرع" } else if lvl == "area" { "المنطقة" } else { "العيادة" }));
        }
    }
    Ok(())
}

// Remove the isolation lock only when NO data remains for the branch+month.
// Never touches locks when other data depends on them.
pub fn cleanup_isolation_lock_if_empty(
    conn: &rusqlite::Connection,
    branch_id: i32,
    dispense_month: &str,
) -> Result<(), String> {
    let has_data = check_month_data_exists_internal(conn, Some(branch_id), dispense_month)?;
    if !has_data {
        conn.execute(
            "DELETE FROM dispensing_month_isolation WHERE branch_id = ?1 AND dispense_month = ?2",
            params![branch_id, dispense_month],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn get_branch_id_from_clinic(conn: &rusqlite::Connection, clinic_id: i32) -> Result<i32, String> {
    conn.query_row(
        "SELECT a.branch_id FROM clinics c JOIN areas a ON c.area_id = a.id WHERE c.id = ?1",
        [clinic_id],
        |row| row.get(0)
    ).map_err(|e| e.to_string())
}

// Shared numeric validation used by all transaction input commands.
pub fn validate_non_negative_f64(label: &str, value: f64) -> Result<(), String> {
    if value < 0.0 {
        return Err(format!("{} لا يمكن أن تكون قيمة سالبة", label));
    }
    Ok(())
}

// Real dispensing records must have a strictly positive unit price and a
// strictly positive cases count (zero/negative values are not valid input).
pub fn validate_strictly_positive_f64(label: &str, value: f64) -> Result<(), String> {
    if value <= 0.0 {
        return Err(format!("{} يجب أن تكون أكبر من صفر", label));
    }
    Ok(())
}

pub fn validate_strictly_positive_i32(label: &str, value: i32) -> Result<(), String> {
    if value <= 0 {
        return Err(format!("{} يجب أن يكون أكبر من صفر", label));
    }
    Ok(())
}

#[tauri::command]
pub fn clear_month_isolation_rule(
    state: State<'_, AppState>,
    branch_id: i32,
    dispense_month: String,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "DELETE FROM dispensing_month_isolation WHERE branch_id = ?1 AND dispense_month = ?2",
        params![branch_id, dispense_month],
    ).map_err(|e| e.to_string())?;

    Ok(())
}
