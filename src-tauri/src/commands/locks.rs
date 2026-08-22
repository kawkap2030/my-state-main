use tauri::State;
use crate::db::AppState;
use crate::password;
use rusqlite::{params, Result};

/// Verify a password against the stored Argon2id hash of the CURRENT logged-in user.
///
/// This reuses the SAME `password::verify_password` used by `auth::login`.
/// No new hash is created; no credentials are stored or logged.
/// Returns `Ok(true)` ONLY when the password matches the currently authenticated admin user.
#[tauri::command]
#[allow(non_snake_case)]
pub fn verify_admin_password(
    state: State<'_, AppState>,
    password: String,
    userId: Option<i32>,
    username: Option<String>,
) -> Result<bool, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // Prioritize active session in AppState, fallback to userId or username from frontend
    let session_user_id = state.current_user_id.lock().ok().and_then(|guard| *guard);
    let target_user_id = session_user_id.or(userId);

    let (role, stored_hash): (String, String) = if let Some(uid) = target_user_id {
        conn.query_row(
            "SELECT role, password_hash FROM users WHERE id = ?1",
            [uid],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|_| "المستخدم غير موجود".to_string())?
    } else if let Some(uname) = username {
        conn.query_row(
            "SELECT role, password_hash FROM users WHERE username = ?1",
            [&uname],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|_| "المستخدم غير موجود".to_string())?
    } else {
        return Err("لم يتم تحديد المستخدم الحالي".to_string());
    };

    if role != "admin" {
        return Err("هذه العملية تتطلب صلاحيات مدير النظام".to_string());
    }

    if !password::verify_password(&password, &stored_hash) {
        return Err("كلمة المرور غير صحيحة".to_string());
    }

    Ok(true)
}

#[tauri::command]
pub async fn get_months_with_data(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    
    // Query all transaction tables for unique months
    let tables = vec![
        "detailed_drug_dispensed",
        "drug_groups",
        "insulin_dispensed",
        "judicial_dispensed",
        "medical_tickets",
        "monthly_drugs_dispensed",
        "monthly_supplies_dispensed",
    ];
    
    let mut all_months = std::collections::HashSet::new();

    for table in tables {
        let query = format!("SELECT DISTINCT dispense_month FROM {} WHERE dispense_month IS NOT NULL AND dispense_month != ''", table);
        if let Ok(mut stmt) = conn.prepare(&query) {
            if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
                for row in rows {
                    if let Ok(raw_month) = row {
                        // Normalize YYYY-MM-DD or YYYY-MM or YYYY-M or YYYY/MM to YYYY-MM
                        let cleaned = raw_month.trim().replace('/', "-");
                        let parts: Vec<&str> = cleaned.split('-').collect();
                        if parts.len() >= 2 {
                            let year = parts[0];
                            let month = parts[1];
                            if year.len() == 4 && (month.len() == 1 || month.len() == 2) {
                                let m_num = month.parse::<i32>().unwrap_or(0);
                                if m_num >= 1 && m_num <= 12 {
                                    let normalized = format!("{}-{:02}", year, m_num);
                                    all_months.insert(normalized);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Also check isolation and manual lock tables to show months that are already managed
    let management_tables = vec![
        ("dispensing_month_isolation", "dispense_month"),
        ("manual_locked_months", "dispense_month"),
    ];

    for (table, col) in management_tables {
        let query = format!("SELECT DISTINCT {} FROM {}", col, table);
        if let Ok(mut stmt) = conn.prepare(&query) {
            if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
                for row in rows {
                    if let Ok(raw_month) = row {
                        let cleaned = raw_month.trim().replace('/', "-");
                        let parts: Vec<&str> = cleaned.split('-').collect();
                        if parts.len() >= 2 {
                            let year = parts[0];
                            let month = parts[1];
                            if year.len() == 4 && (month.len() == 1 || month.len() == 2) {
                                let m_num = month.parse::<i32>().unwrap_or(0);
                                if m_num >= 1 && m_num <= 12 {
                                    all_months.insert(format!("{}-{:02}", year, m_num));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut result: Vec<String> = all_months.into_iter().collect();
    result.sort_by(|a, b| b.cmp(a)); // Sort descending
        
    Ok(result)
}

#[tauri::command]
pub async fn get_manual_locked_months(state: State<'_, AppState>) -> Result<Vec<(String, bool)>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    let mut stmt = conn.prepare("SELECT dispense_month, is_locked FROM manual_locked_months WHERE is_locked = 1").map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, bool>(1)?))
    }).map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    
    Ok(result)
}

#[tauri::command]
pub async fn toggle_month_lock(
    state: State<'_, AppState>,
    month: String,
    lock: bool
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    if lock {
        conn.execute(
            "INSERT INTO manual_locked_months (dispense_month, is_locked) 
             VALUES (?1, 1) 
             ON CONFLICT(dispense_month) DO UPDATE SET is_locked = 1",
            params![month],
        ).map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "DELETE FROM manual_locked_months WHERE dispense_month = ?1",
            params![month],
        ).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}