use crate::db::AppState;
use tauri::State;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct AuditLogEntry {
    pub id: i32,
    pub user_id: Option<i32>,
    pub username: Option<String>,
    pub action: String,
    pub table_name: String,
    pub record_id: Option<String>,
    pub details: Option<String>,
    pub timestamp: String,
}

pub fn log_action(
    conn: &rusqlite::Connection,
    user_id: Option<i32>,
    action: &str,
    table_name: &str,
    record_id: Option<&str>,
    details: Option<&str>,
) -> Result<(), String> {
    let valid_user_id = match user_id {
        Some(uid) => {
            let exists: bool = conn
                .query_row("SELECT 1 FROM users WHERE id = ?1", [uid], |_| Ok(true))
                .unwrap_or(false);
            if exists { Some(uid) } else { None }
        }
        None => None,
    };

    let sql = "INSERT INTO audit_log (user_id, action, table_name, record_id, details) VALUES (?1, ?2, ?3, ?4, ?5)";
    if let Err(e) = conn.execute(
        sql,
        rusqlite::params![
            valid_user_id,
            action,
            table_name,
            record_id,
            details,
        ],
    ) {
        eprintln!("[audit_log] Warning: Failed to write audit log entry: {}", e);
    }
    Ok(())
}

#[tauri::command]
pub fn get_audit_logs(
    state: State<'_, AppState>,
    limit: Option<i32>,
) -> Result<Vec<AuditLogEntry>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let limit_val = limit.unwrap_or(100);
    let sql = "
        SELECT a.id, a.user_id, u.username, a.action, a.table_name, a.record_id, a.details, a.timestamp 
        FROM audit_log a
        LEFT JOIN users u ON a.user_id = u.id
        ORDER BY a.timestamp DESC
        LIMIT ?1
    ";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![limit_val], |row| {
        Ok(AuditLogEntry {
            id: row.get(0)?,
            user_id: row.get(1)?,
            username: row.get(2)?,
            action: row.get(3)?,
            table_name: row.get(4)?,
            record_id: row.get(5)?,
            details: row.get(6)?,
            timestamp: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut logs = Vec::new();
    for row in rows {
        logs.push(row.map_err(|e| e.to_string())?);
    }

    Ok(logs)
}

#[tauri::command]
pub fn log_frontend_action(
    state: State<'_, AppState>,
    user_id: Option<i32>,
    action: String,
    table_name: String,
    record_id: Option<String>,
    details: Option<String>,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    log_action(&conn, user_id, &action, &table_name, record_id.as_deref(), details.as_deref())
}
