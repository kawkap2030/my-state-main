use crate::db::AppState;
use tauri::State;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub role: String,
}

#[tauri::command]
pub fn login(
    state: State<'_, AppState>,
    username: String,
    password_hash: String,
) -> Result<User, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let sql = "SELECT id, username, role FROM users WHERE username = ?1 AND password_hash = ?2";
    let user = conn.query_row(sql, &[&username, &password_hash], |row| {
        Ok(User {
            id: row.get(0)?,
            username: row.get(1)?,
            role: row.get(2)?,
        })
    }).map_err(|_| "Invalid username or password".to_string())?;

    Ok(user)
}
