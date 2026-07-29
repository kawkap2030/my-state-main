use tauri::State;
use crate::db::AppState;
use rusqlite::{params, Result};

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
    let mut stmt = conn.prepare("SELECT dispense_month, is_locked FROM manual_locked_months").map_err(|e| e.to_string())?;
    
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
    conn.execute(
        "INSERT INTO manual_locked_months (dispense_month, is_locked) 
         VALUES (?1, ?2) 
         ON CONFLICT(dispense_month) DO UPDATE SET is_locked = ?2",
        params![month, lock],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}