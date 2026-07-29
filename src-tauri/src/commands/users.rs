use crate::db::AppState;
use tauri::State;
use serde::{Deserialize, Serialize};

// ─── Data Structures ──────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UserInfo {
    pub id: i32,
    pub username: String,
    pub role: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CreateUserPayload {
    pub username: String,
    pub password: String,
    pub role: String, // 'admin' | 'data_entry' | 'viewer'
}

#[derive(Serialize, Deserialize, Debug)]
pub struct UpdateUserPayload {
    pub id: i32,
    pub username: String,
    pub role: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ChangePasswordPayload {
    pub user_id: i32,
    pub new_password: String,
}

// ─── Helper ───────────────────────────────────────────────────────────────────

fn is_valid_role(role: &str) -> bool {
    matches!(role, "admin" | "data_entry" | "viewer")
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/// List all users (admin only on frontend; backend returns all)
#[tauri::command]
pub fn get_users(state: State<'_, AppState>) -> Result<Vec<UserInfo>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn
        .prepare("SELECT id, username, role, created_at FROM users ORDER BY id ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(UserInfo {
                id: row.get(0)?,
                username: row.get(1)?,
                role: row.get(2)?,
                created_at: row.get(3).unwrap_or_else(|_| String::new()),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut users = Vec::new();
    for row in rows {
        users.push(row.map_err(|e| e.to_string())?);
    }
    Ok(users)
}

/// Add a new user
#[tauri::command]
pub fn add_user(
    state: State<'_, AppState>,
    payload: CreateUserPayload,
) -> Result<UserInfo, String> {
    if payload.username.trim().is_empty() {
        return Err("اسم المستخدم لا يمكن أن يكون فارغاً".to_string());
    }
    if payload.password.trim().len() < 4 {
        return Err("كلمة المرور يجب أن تكون 4 أحرف على الأقل".to_string());
    }
    if !is_valid_role(&payload.role) {
        return Err(format!("الدور غير صالح: {}", payload.role));
    }

    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // Check uniqueness
    let exists: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE username = ?1",
            [&payload.username],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if exists > 0 {
        return Err(format!("اسم المستخدم '{}' مستخدم بالفعل", payload.username));
    }

    conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?1, ?2, ?3)",
        rusqlite::params![payload.username, payload.password, payload.role],
    )
    .map_err(|e| e.to_string())?;

    let new_id = conn.last_insert_rowid() as i32;
    let user = conn
        .query_row(
            "SELECT id, username, role, created_at FROM users WHERE id = ?1",
            [new_id],
            |row| {
                Ok(UserInfo {
                    id: row.get(0)?,
                    username: row.get(1)?,
                    role: row.get(2)?,
                    created_at: row.get(3).unwrap_or_else(|_| String::new()),
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(user)
}

/// Update username and/or role for a user
#[tauri::command]
pub fn update_user(
    state: State<'_, AppState>,
    payload: UpdateUserPayload,
) -> Result<UserInfo, String> {
    if payload.username.trim().is_empty() {
        return Err("اسم المستخدم لا يمكن أن يكون فارغاً".to_string());
    }
    if !is_valid_role(&payload.role) {
        return Err(format!("الدور غير صالح: {}", payload.role));
    }

    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // Check uniqueness (excluding self)
    let exists: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE username = ?1 AND id != ?2",
            rusqlite::params![payload.username, payload.id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if exists > 0 {
        return Err(format!("اسم المستخدم '{}' مستخدم بالفعل", payload.username));
    }

    conn.execute(
        "UPDATE users SET username = ?1, role = ?2 WHERE id = ?3",
        rusqlite::params![payload.username, payload.role, payload.id],
    )
    .map_err(|e| e.to_string())?;

    let user = conn
        .query_row(
            "SELECT id, username, role, created_at FROM users WHERE id = ?1",
            [payload.id],
            |row| {
                Ok(UserInfo {
                    id: row.get(0)?,
                    username: row.get(1)?,
                    role: row.get(2)?,
                    created_at: row.get(3).unwrap_or_else(|_| String::new()),
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(user)
}

/// Delete a user (cannot delete the last admin)
#[tauri::command]
pub fn delete_user(state: State<'_, AppState>, user_id: i32) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // Prevent deleting last admin
    let role: String = conn
        .query_row(
            "SELECT role FROM users WHERE id = ?1",
            [user_id],
            |row| row.get(0),
        )
        .map_err(|_| "المستخدم غير موجود".to_string())?;

    if role == "admin" {
        let admin_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM users WHERE role = 'admin'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);
        if admin_count <= 1 {
            return Err("لا يمكن حذف آخر مدير للنظام. يجب أن يكون هناك مدير واحد على الأقل.".to_string());
        }
    }

    conn.execute("DELETE FROM users WHERE id = ?1", [user_id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Change password for a user
#[tauri::command]
pub fn change_user_password(
    state: State<'_, AppState>,
    payload: ChangePasswordPayload,
) -> Result<(), String> {
    if payload.new_password.trim().len() < 4 {
        return Err("كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل".to_string());
    }

    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let rows_changed = conn
        .execute(
            "UPDATE users SET password_hash = ?1 WHERE id = ?2",
            rusqlite::params![payload.new_password, payload.user_id],
        )
        .map_err(|e| e.to_string())?;

    if rows_changed == 0 {
        return Err("المستخدم غير موجود".to_string());
    }

    Ok(())
}

/// Get user count (for checking if setup is needed)
#[tauri::command]
pub fn get_user_count(state: State<'_, AppState>) -> Result<i32, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let count: i32 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .unwrap_or(0);

    Ok(count)
}

/// Reset admin password to default (admin/admin)
#[tauri::command]
pub fn reset_admin_password(state: State<'_, AppState>) -> Result<String, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // Find the admin user: prefer exact match (username=admin AND role=admin)
    // Fallback to any user with role='admin'
    let admin_id: i32 = conn
        .query_row(
            "SELECT id FROM users WHERE username = 'admin' AND role = 'admin'
             UNION ALL
             SELECT id FROM users WHERE role = 'admin'
             LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "لا يوجد مستخدم admin في النظام. يرجى الاتصال بالدعم الفني.".to_string())?;

    conn.execute(
        "UPDATE users SET password_hash = 'admin' WHERE id = ?1",
        [admin_id],
    )
    .map_err(|e| format!("فشل إعادة تعيين كلمة المرور: {}", e))?;

    Ok("تم إعادة تعيين كلمة مرور المدير إلى القيمة الافتراضية (admin/admin) بنجاح".to_string())
}
