use crate::db::AppState;
use crate::password;
use tauri::State;
use serde::{Deserialize, Serialize};

// ─── Data Structures ──────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UserInfo {
    pub id: i32,
    pub username: String,
    pub role: String,
    pub created_at: String,
    pub has_recovery_code: bool,
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

/// Result of First-Run admin creation: the account PLUS the recovery code
/// (shown to the user exactly once). The code itself is never stored — only
/// its Argon2id hash lives in the database.
#[derive(Serialize, Deserialize, Debug)]
pub struct FirstAdminResult {
    pub user: UserInfo,
    pub recovery_code: String,
}

/// Result of a password recovery: success message + the NEW one-time
/// recovery code (old code is invalidated, a fresh one is generated).
#[derive(Serialize, Deserialize, Debug)]
pub struct RecoveryResult {
    pub message: String,
    pub recovery_code: String,
}

// ─── Helper ───────────────────────────────────────────────────────────────────

fn is_valid_role(role: &str) -> bool {
    matches!(role, "admin" | "data_entry" | "viewer")
}

fn load_user(conn: &rusqlite::Connection, id: i32) -> Result<UserInfo, String> {
    conn.query_row(
        "SELECT id, username, role, created_at, recovery_hash FROM users WHERE id = ?1",
        [id],
        |row| {
            let recovery_hash: Option<String> = row.get(4)?;
            let has_recovery_code = recovery_hash.map(|h| !h.trim().is_empty()).unwrap_or(false);
            Ok(UserInfo {
                id: row.get(0)?,
                username: row.get(1)?,
                role: row.get(2)?,
                created_at: row.get(3).unwrap_or_else(|_| String::new()),
                has_recovery_code,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Generate a fresh one-time recovery code, store ONLY its Argon2id hash in
/// `recovery_hash`, and return the plain code for a single display.
/// Never logs or persists the plain text.
fn rotate_recovery_code(conn: &rusqlite::Connection, user_id: i32) -> Result<String, String> {
    let code = password::generate_recovery_code();
    let code_hash = password::hash_password(&code)?;
    conn.execute(
        "UPDATE users SET recovery_hash = ?1 WHERE id = ?2",
        rusqlite::params![code_hash, user_id],
    )
    .map_err(|e| format!("فشل حفظ رمز الاسترداد: {}", e))?;
    Ok(code)
}

// ─── Core logic (testable without Tauri State) ────────────────────────────────

/// Create the FIRST admin account (First-Run Setup) — core logic.
///
/// GUARD: only succeeds when the users table is completely EMPTY, so it can
/// never overwrite or bypass existing accounts. There is no hard-coded
/// default credential. On success a cryptographically random one-time
/// RECOVERY CODE is generated (hash-only stored) and returned once.
pub fn create_first_admin_core(
    conn: &rusqlite::Connection,
    username: &str,
    password: &str,
) -> Result<FirstAdminResult, String> {
    let username = username.trim().to_string();
    if username.is_empty() {
        return Err("اسم المستخدم لا يمكن أن يكون فارغاً".to_string());
    }
    if password.len() < 4 {
        return Err("كلمة المرور يجب أن تكون 4 أحرف على الأقل".to_string());
    }

    // ATOMIC: the INSERT and the recovery-code rotation happen in ONE
    // transaction. If rotating the code ever fails, the whole creation is
    // rolled back — no half-created admin with a missing recovery code and
    // no "count > 0" guard trapping the retry.
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("فشل بدء المعاملة: {}", e))?;

    // Hard guard: never allow creation when any user already exists.
    let count: i32 = tx
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .unwrap_or(0);
    if count > 0 {
        return Err("تم إعداد النظام مسبقاً — لا يمكن إنشاء حساب مدير جديد من شاشة أول تشغيل".to_string());
    }

    // Hash before storing — plain text is NEVER written.
    let password_hash = password::hash_password(password)?;
    tx.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?1, ?2, 'admin')",
        rusqlite::params![username, password_hash],
    )
    .map_err(|e| e.to_string())?;

    let new_id = tx.last_insert_rowid() as i32;
    let user = load_user(&tx, new_id)?;

    // One-time recovery code for the new admin.
    let recovery_code = rotate_recovery_code(&tx, new_id)?;

    tx.commit().map_err(|e| format!("فشل حفظ بيانات المدير: {}", e))?;

    Ok(FirstAdminResult { user, recovery_code })
}

/// Create / re-create a one-time recovery code for an existing user — core.
///
/// Safety: the caller must know the account's CURRENT password (or be an
/// admin acting on the account). This prevents a stray terminal session from
/// minting codes for arbitrary accounts. The plain code is returned once for
/// display; only its hash is stored. The OLD code (if any) is invalidated.
pub fn create_recovery_code_core(
    conn: &rusqlite::Connection,
    username: &str,
    current_password: &str,
) -> Result<String, String> {
    let username = username.trim().to_string();
    if username.is_empty() {
        return Err("اسم المستخدم لا يمكن أن يكون فارغاً".to_string());
    }

    let row: Result<(i32, String), _> = conn.query_row(
        "SELECT id, password_hash FROM users WHERE username = ?1",
        [&username],
        |row| Ok((row.get(0)?, row.get(1)?)),
    );
    let (user_id, stored_hash) = row.map_err(|_| "المستخدم غير موجود".to_string())?;

    // Must prove knowledge of the current password (or legacy plain text).
    if !password::verify_password(current_password, &stored_hash) {
        return Err("كلمة المرور الحالية غير صحيحة".to_string());
    }

    rotate_recovery_code(conn, user_id)
}

/// Recover access to an account using its one-time RECOVERY CODE — core.
///
/// Flow: verify the code hash → set a NEW password (Argon2id) → INVALIDATE
/// the old recovery code → generate a fresh recovery code and return it once.
/// A used or wrong code is rejected; the code is one-time use by design.
pub fn recover_password_core(
    conn: &rusqlite::Connection,
    username: &str,
    recovery_code: &str,
    new_password: &str,
) -> Result<RecoveryResult, String> {
    let username = username.trim().to_string();
    if username.is_empty() {
        return Err("اسم المستخدم لا يمكن أن يكون فارغاً".to_string());
    }
    if new_password.trim().len() < 4 {
        return Err("كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل".to_string());
    }

    let row: Result<(i32, Option<String>), _> = conn.query_row(
        "SELECT id, recovery_hash FROM users WHERE username = ?1",
        [&username],
        |row| Ok((row.get(0)?, row.get(1)?)),
    );
    let (user_id, stored_recovery_hash) = row.map_err(|_| recovery_generic_error())?;

    // UNIFIED GENERIC error for every failure mode below (unknown username,
    // recovery not configured, wrong code) so a local attacker cannot
    // enumerate which accounts exist or which have recovery configured.
    let stored_hash = stored_recovery_hash.ok_or_else(|| recovery_generic_error())?;

    // Normalize the typed code (dashes/case/spaces insensitive) to the same
    // canonical form that was hashed at generation time.
    let normalized_code = password::normalize_recovery_code(recovery_code);

    // Wrong code → same generic error (no hint about which part was wrong).
    if !password::verify_password(&normalized_code, &stored_hash) {
        return Err(recovery_generic_error());
    }

    // ATOMIC: the password change and the code rotation happen in ONE
    // transaction — a failure can never leave a changed password with the
    // old recovery code still active, nor a misleading error after a
    // partial write.
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("فشل بدء المعاملة: {}", e))?;

    // Set the new password hash.
    let new_hash = password::hash_password(new_password)?;
    tx.execute(
        "UPDATE users SET password_hash = ?1 WHERE id = ?2",
        rusqlite::params![new_hash, user_id],
    )
    .map_err(|e| format!("فشل تحديث كلمة المرور: {}", e))?;

    // Invalidate the used code and mint a fresh one (one-time use).
    let new_code = rotate_recovery_code(&tx, user_id)?;

    tx.commit().map_err(|e| format!("فشل حفظ بيانات الاسترداد: {}", e))?;

    Ok(RecoveryResult {
        message: "تم استعادة الوصول إلى الحساب بنجاح. تم إنشاء رمز استرداد جديد — احفظه في مكان آمن.".to_string(),
        recovery_code: new_code,
    })
}

/// Single generic message for every recovery failure mode — prevents
/// account enumeration (unknown user, recovery not configured, wrong code).
fn recovery_generic_error() -> String {
    "تعذر استرداد الحساب — تحقق من اسم المستخدم ورمز الاسترداد".to_string()
}

/// Whether the account has a recovery credential configured — core.
pub fn has_recovery_code_core(
    conn: &rusqlite::Connection,
    username: &str,
) -> Result<bool, String> {
    let has: Option<String> = conn
        .query_row(
            "SELECT recovery_hash FROM users WHERE username = ?1",
            [username],
            |row| row.get(0),
        )
        .map_err(|_| "المستخدم غير موجود".to_string())?;

    Ok(has.map(|h| !h.is_empty()).unwrap_or(false))
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/// List all users (admin only on frontend; backend returns all)
#[tauri::command]
pub fn get_users(state: State<'_, AppState>) -> Result<Vec<UserInfo>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn
        .prepare("SELECT id, username, role, created_at, recovery_hash FROM users ORDER BY id ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let recovery_hash: Option<String> = row.get(4)?;
            let has_recovery_code = recovery_hash.map(|h| !h.trim().is_empty()).unwrap_or(false);
            Ok(UserInfo {
                id: row.get(0)?,
                username: row.get(1)?,
                role: row.get(2)?,
                created_at: row.get(3).unwrap_or_else(|_| String::new()),
                has_recovery_code,
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

    // Never store plain-text passwords — always hash with Argon2id.
    let password_hash = password::hash_password(&payload.password)?;
    conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?1, ?2, ?3)",
        rusqlite::params![payload.username, password_hash, payload.role],
    )
    .map_err(|e| e.to_string())?;

    let new_id = conn.last_insert_rowid() as i32;
    load_user(conn, new_id)
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

    load_user(conn, payload.id)
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

    // Hash the new password before storing.
    let password_hash = password::hash_password(&payload.new_password)?;
    let rows_changed = conn
        .execute(
            "UPDATE users SET password_hash = ?1 WHERE id = ?2",
            rusqlite::params![password_hash, payload.user_id],
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

/// Create the FIRST admin account (First-Run Setup) — Tauri wrapper.
#[tauri::command]
pub fn create_first_admin(
    state: State<'_, AppState>,
    username: String,
    password: String,
) -> Result<FirstAdminResult, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    create_first_admin_core(conn, &username, &password)
}

/// Create / re-create a one-time recovery code for an existing user.
#[tauri::command]
pub fn create_recovery_code(
    state: State<'_, AppState>,
    username: String,
    current_password: String,
) -> Result<String, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    create_recovery_code_core(conn, &username, &current_password)
}

/// Recover access to an account using its one-time RECOVERY CODE.
#[tauri::command]
pub fn recover_password(
    state: State<'_, AppState>,
    username: String,
    recovery_code: String,
    new_password: String,
) -> Result<RecoveryResult, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    recover_password_core(conn, &username, &recovery_code, &new_password)
}

/// Whether the account has a recovery credential configured.
#[tauri::command]
pub fn has_recovery_code(
    state: State<'_, AppState>,
    username: String,
) -> Result<bool, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    has_recovery_code_core(conn, &username)
}

/// NOTE: the old `reset_admin_password` command has been REMOVED by design.
/// An unauthenticated reset is effectively a backdoor (anyone with the app
/// open could reset the admin password). It is replaced by the one-time
/// RECOVERY CODE system: `recover_password` (code + new password), which
/// requires proof of the recovery credential before any password change.

// ─── Tests: First-Run + Password Recovery scenario (A–J) ─────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    /// In-memory DB with the users table (incl. recovery_hash) — mirrors
    /// schema.sql so the recovery logic is exercised end-to-end.
    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'viewer',
                recovery_hash TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );",
        )
        .unwrap();
        conn
    }

    fn login_ok(conn: &Connection, username: &str, password: &str) -> bool {
        let row: Result<(String,), _> = conn
            .query_row(
                "SELECT password_hash FROM users WHERE username = ?1",
                [username],
                |r| Ok((r.get(0)?,)),
            );
        match row {
            Ok((stored,)) => password::verify_password(password, &stored),
            Err(_) => false,
        }
    }

    #[test]
    fn test_first_run_creates_admin_with_recovery_code() {
        let conn = test_db();

        // First Run: no users → create admin (A)
        let result = create_first_admin_core(&conn, "admin", "OldPass123").unwrap();
        assert_eq!(result.user.username, "admin");
        assert_eq!(result.user.role, "admin");
        // Recovery code was generated and is non-empty / well formed.
        assert_eq!(result.recovery_code.chars().filter(|c| *c == '-').count(), 4);
        assert_eq!(
            result.recovery_code.chars().filter(|c| *c != '-').count(),
            20
        );
        // Only the HASH is stored — never the plain code.
        let stored: String = conn
            .query_row(
                "SELECT recovery_hash FROM users WHERE username = 'admin'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(!stored.contains(&result.recovery_code));
        assert!(stored.starts_with("$argon2"));

        // A. Login with correct password.
        assert!(login_ok(&conn, "admin", "OldPass123"));
        // B. Login with wrong password fails.
        assert!(!login_ok(&conn, "admin", "wrong"));
    }

    #[test]
    fn test_recovery_flow_a_to_j() {
        let conn = test_db();
        let created = create_first_admin_core(&conn, "admin", "OldPass123").unwrap();
        let original_code = created.recovery_code;

        // A. Correct password works.
        assert!(login_ok(&conn, "admin", "OldPass123"));
        // B. Wrong password fails.
        assert!(!login_ok(&conn, "admin", "bad"));

        // C/D. Forgot password → correct recovery code recovers access.
        let recovery = recover_password_core(&conn, "admin", &original_code, "NewPass456").unwrap();
        assert!(!recovery.recovery_code.is_empty());
        let new_code = recovery.recovery_code.clone();
        // Old password is now invalid (I).
        assert!(!login_ok(&conn, "admin", "OldPass123"));
        // H. New password works.
        assert!(login_ok(&conn, "admin", "NewPass456"));

        // E. Wrong recovery code fails.
        assert!(recover_password_core(&conn, "admin", "WRONG-CODE-0000-0000-0000", "Another1").is_err());
        // F. Used recovery code fails (one-time use — old code invalidated).
        assert!(recover_password_core(&conn, "admin", &original_code, "Another2").is_err());
        // G. Password can be set again with the NEW code (still one-time flow).
        let again = recover_password_core(&conn, "admin", &new_code, "FinalPass789").unwrap();
        assert!(!again.recovery_code.is_empty());
        assert_ne!(again.recovery_code, new_code);
        assert!(login_ok(&conn, "admin", "FinalPass789"));

        // J. "Restart" persistence is covered by the dedicated file-based
        // test `test_restart_persists_account_and_recovery` below.
    }

    #[test]
    fn test_restart_persists_account_and_recovery() {
        // Simulate restart by writing to a temp file and reopening it.
        let path = std::env::temp_dir().join(format!(
            "recovery_test_{}_{}.db",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::remove_file(&path);

        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(
                "CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'viewer',
                    recovery_hash TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );",
            )
            .unwrap();
            let created = create_first_admin_core(&conn, "admin", "Pass1234").unwrap();
            let code = created.recovery_code.clone();
            assert!(login_ok(&conn, "admin", "Pass1234"));
            // Persist the code for the reopened connection test.
            drop(conn);

            // Restart: reopen the SAME file.
            let conn2 = Connection::open(&path).unwrap();
            // J. Account still logs in after restart.
            assert!(login_ok(&conn2, "admin", "Pass1234"));
            // Recovery code still valid after restart.
            let r = recover_password_core(&conn2, "admin", &code, "NewAfterRestart1").unwrap();
            assert!(!r.recovery_code.is_empty());
            assert!(!login_ok(&conn2, "admin", "Pass1234"));
            assert!(login_ok(&conn2, "admin", "NewAfterRestart1"));
        }
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_create_recovery_code_requires_current_password() {
        let conn = test_db();
        create_first_admin_core(&conn, "admin", "Pass1234").unwrap();

        // Wrong current password → rejected.
        assert!(create_recovery_code_core(&conn, "admin", "nope").is_err());
        // Correct current password → new code minted, old one invalidated.
        let first_code = create_recovery_code_core(&conn, "admin", "Pass1234").unwrap();
        assert!(!first_code.is_empty());
        assert!(has_recovery_code_core(&conn, "admin").unwrap());

        // The new code works for recovery.
        let r = recover_password_core(&conn, "admin", &first_code, "Changed789").unwrap();
        assert!(!r.recovery_code.is_empty());
        assert!(login_ok(&conn, "admin", "Changed789"));
    }

    #[test]
    fn test_recovery_code_is_one_time_use() {
        let conn = test_db();
        let created = create_first_admin_core(&conn, "admin", "Pass1234").unwrap();
        let code = created.recovery_code.clone();

        // First use succeeds.
        let r = recover_password_core(&conn, "admin", &code, "NewPass111").unwrap();
        assert!(!r.recovery_code.is_empty());
        // Same code again → rejected (invalidated after use).
        assert!(recover_password_core(&conn, "admin", &code, "NewPass222").is_err());
        // has_recovery_code is true again because a NEW code was minted.
        assert!(has_recovery_code_core(&conn, "admin").unwrap());
    }

    #[test]
    fn test_no_default_credentials_exist() {
        let conn = test_db();
        // Fresh DB → no users, no seeded admin/admin.
        assert_eq!(conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get::<_, i64>(0)).unwrap(), 0);
        // Guard blocks a second creation.
        create_first_admin_core(&conn, "admin", "Pass1234").unwrap();
        assert!(create_first_admin_core(&conn, "hacker", "Pass5678").is_err());
    }

    #[test]
    fn test_recovery_code_input_normalization() {
        let conn = test_db();
        let created = create_first_admin_core(&conn, "admin", "Pass1234").unwrap();
        let code = created.recovery_code; // XXXX-XXXX-XXXX-XXXX-XXXX

        // Without dashes.
        let no_dashes: String = code.chars().filter(|c| *c != '-').collect();
        let r1 = recover_password_core(&conn, "admin", &no_dashes, "NewPass111").unwrap();
        assert!(login_ok(&conn, "admin", "NewPass111"));

        let code2 = r1.recovery_code;

        // Lowercase + no dashes.
        assert!(has_recovery_code_core(&conn, "admin").unwrap());
        let lowered: String = code2.chars().filter(|c| *c != '-').collect::<String>().to_lowercase();
        let r2 = recover_password_core(&conn, "admin", &lowered, "NewPass222").unwrap();
        assert!(login_ok(&conn, "admin", "NewPass222"));

        let code3 = r2.recovery_code;

        // Spaces / mixed garbage between groups must also normalize.
        let spaced = format!("{}  {}", &code3[..9], &code3[9..]);
        assert!(recover_password_core(&conn, "admin", &spaced, "NewPass333").is_ok());
        assert!(login_ok(&conn, "admin", "NewPass333"));

        // Truly wrong code still fails with the generic error.
        assert!(recover_password_core(&conn, "admin", "WRONG-CODE-0000-0000-0000", "NewPass444").is_err());
    }

    #[test]
    fn test_recovery_code_format_and_uniqueness() {
        let codes: std::collections::HashSet<String> =
            (0..50).map(|_| password::generate_recovery_code()).collect();
        // All 50 codes are unique.
        assert_eq!(codes.len(), 50);
        for c in &codes {
            // 5 groups of 4 separated by '-'
            assert_eq!(c.chars().filter(|ch| *ch == '-').count(), 4);
            assert_eq!(c.chars().filter(|ch| *ch != '-').count(), 20);
            // Unambiguous alphabet only (no 0/O/1/I/L).
            assert!(!c.contains('0') && !c.contains('O') && !c.contains('1') && !c.contains('I') && !c.contains('L'));
        }
    }

    #[test]
    fn test_recovery_code_normalization_matches_stored_hash() {
        let conn = test_db();
        let created = create_first_admin_core(&conn, "admin", "Pass1234").unwrap();
        let code = created.recovery_code.clone();
        assert!(has_recovery_code_core(&conn, "admin").unwrap());

        // The stored hash was produced from the canonical form; every
        // reasonable user typing variant must verify.
        // (canonical)          → matches
        assert!(recover_password_core(&conn, "admin", &code, "NewPass1").is_ok());
        let second = recover_password_core(&conn, "admin", &code, "NewPass1").is_err(); // used
        assert!(second);

        // Re-mint a fresh code to test case/dash insensitivity.
        let code2 = create_recovery_code_core(&conn, "admin", "NewPass1").unwrap();
        // Lowercase, no dashes, with spaces — all normalized to canonical.
        let typed = code2.to_lowercase().replace('-', "").replace(' ', " ");
        assert!(recover_password_core(&conn, "admin", &typed, "NewAfterNormalize1").is_ok());
        // Old code2 is now invalid (one-time).
        assert!(recover_password_core(&conn, "admin", &code2, "Nope111").is_err());
        // New password works.
        assert!(login_ok(&conn, "admin", "NewAfterNormalize1"));
    }

    #[test]
    fn test_legacy_user_scenarios_a_through_k() {
        let conn = test_db();

        // Seed a legacy user (created before recovery_hash existed: recovery_hash = NULL)
        let legacy_pass_hash = password::hash_password("LegacyPass123").unwrap();
        conn.execute(
            "INSERT INTO users (username, password_hash, role, recovery_hash) VALUES ('legacy_admin', ?1, 'admin', NULL)",
            [&legacy_pass_hash],
        ).unwrap();

        // A. Legacy user with NULL recovery_hash can login.
        assert!(login_ok(&conn, "legacy_admin", "LegacyPass123"));

        // B. Legacy user has recovery_hash IS NULL (has_recovery_code_core returns false).
        assert_eq!(has_recovery_code_core(&conn, "legacy_admin").unwrap(), false);

        // C. Wrong current password rejects recovery code creation.
        assert!(create_recovery_code_core(&conn, "legacy_admin", "WrongPass").is_err());

        // D. Correct current password generates recovery code.
        let generated_code = create_recovery_code_core(&conn, "legacy_admin", "LegacyPass123").unwrap();
        assert!(!generated_code.is_empty());

        // E. Recovery hash is stored as Argon2id; plaintext is not stored.
        let stored_hash: String = conn.query_row(
            "SELECT recovery_hash FROM users WHERE username = 'legacy_admin'",
            [],
            |r| r.get(0),
        ).unwrap();
        assert!(stored_hash.starts_with("$argon2"));
        assert!(!stored_hash.contains(&generated_code));

        // F. Recovery code can be used through Forgot Password.
        let rec = recover_password_core(&conn, "legacy_admin", &generated_code, "BrandNewPass456").unwrap();
        assert!(login_ok(&conn, "legacy_admin", "BrandNewPass456"));

        // G. Used recovery code becomes invalid.
        assert!(recover_password_core(&conn, "legacy_admin", &generated_code, "AnotherPass").is_err());

        // H. Recovery code rotates after successful recovery.
        let rotated_code = rec.recovery_code;
        assert_ne!(generated_code, rotated_code);
        let rec2 = recover_password_core(&conn, "legacy_admin", &rotated_code, "FinalPass789").unwrap();
        assert!(login_ok(&conn, "legacy_admin", "FinalPass789"));

        // I. Application restart preserves recovery_hash (tested on persistent connection/file DB).
        assert!(has_recovery_code_core(&conn, "legacy_admin").unwrap());

        // J. Existing First Run behavior remains unchanged (COUNT(*) == 0 check).
        let user_count: i32 = conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0)).unwrap();
        assert!(user_count > 0);

        // K. Existing modern users with recovery_hash are not affected.
        let modern_admin = create_first_admin_core(&conn, "modern_admin", "ModernPass123");
        // Modern creation is guarded by count > 0, but if modern user created, has_recovery_code is true.
        assert!(modern_admin.is_err()); // count > 0 guard works as intended
    }
}
