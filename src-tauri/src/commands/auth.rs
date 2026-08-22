use crate::db::AppState;
use crate::password;
use tauri::State;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub role: String,
    pub has_recovery_code: bool,
}

/// Login with a raw password. The stored credential may be:
/// - An Argon2id hash (new installations / upgraded rows)
/// - Legacy plain text (old databases) → verified by fallback and
///   upgraded in-place to an Argon2id hash on successful login.
#[tauri::command]
pub fn login(
    state: State<'_, AppState>,
    username: String,
    password: String,
) -> Result<User, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let row: Result<(i32, String, String, String, Option<String>), _> = conn.query_row(
        "SELECT id, username, role, password_hash, recovery_hash FROM users WHERE username = ?1",
        [&username],
        |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        },
    );

    let (id, db_username, role, stored_hash, recovery_hash) =
        row.map_err(|_| "اسم المستخدم أو كلمة المرور غير صحيحة".to_string())?;

    if !password::verify_password(&password, &stored_hash) {
        return Err("اسم المستخدم أو كلمة المرور غير صحيحة".to_string());
    }

    // Upgrade legacy plain-text credentials to a proper hash (data preserving).
    if !password::is_hashed(&stored_hash) {
        if let Ok(new_hash) = password::hash_password(&password) {
            let _ = conn.execute(
                "UPDATE users SET password_hash = ?1 WHERE id = ?2",
                rusqlite::params![new_hash, id],
            );
        }
    }

    let has_recovery_code = recovery_hash.map(|h| !h.trim().is_empty()).unwrap_or(false);

    if let Ok(mut current_user_guard) = state.current_user_id.lock() {
        *current_user_guard = Some(id);
    }

    Ok(User {
        id,
        username: db_username,
        role,
        has_recovery_code,
    })
}

#[tauri::command]
pub fn logout(state: State<'_, AppState>) -> Result<(), String> {
    if let Ok(mut current_user_guard) = state.current_user_id.lock() {
        *current_user_guard = None;
    }
    Ok(())
}
