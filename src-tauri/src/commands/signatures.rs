use tauri::State;
use crate::db::AppState;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ReportSignature {
    pub id: Option<i64>,
    pub preparer_name: String,
    pub manager_name: String,
    pub approval_number: String,
    pub updated_at: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ExportPreset {
    pub id: i64,
    pub name: String,
    pub user_id: Option<i64>,
    pub user_name: Option<String>,
    pub scope: String, // 'private' or 'public'
    pub orientation: String,
    pub margin_preset: String,
    pub show_page_numbers: bool,
    pub show_signatures: bool,
    pub preparer_name: String,
    pub manager_name: String,
    pub approval_number: String,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

// ═════════════════════════════════════════════════════════════════════
// REPORT SIGNATURES (single row — app-wide defaults)
// ═════════════════════════════════════════════════════════════════════

#[tauri::command]
pub async fn get_report_signatures(
    state: State<'_, AppState>,
) -> Result<ReportSignature, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let result = conn.query_row(
        "SELECT id, preparer_name, manager_name, approval_number, updated_at
         FROM report_signatures
         ORDER BY id DESC
         LIMIT 1",
        [],
        |row| {
            Ok(ReportSignature {
                id: Some(row.get(0)?),
                preparer_name: row.get(1)?,
                manager_name: row.get(2)?,
                approval_number: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    );

    match result {
        Ok(sig) => Ok(sig),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(ReportSignature {
            id: None,
            preparer_name: String::new(),
            manager_name: String::new(),
            approval_number: String::new(),
            updated_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn save_report_signatures(
    state: State<'_, AppState>,
    preparer_name: String,
    manager_name: String,
    approval_number: String,
) -> Result<ReportSignature, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM report_signatures",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if exists {
        conn.execute(
            "UPDATE report_signatures SET preparer_name = ?1, manager_name = ?2, approval_number = ?3, updated_at = ?4 WHERE id = (SELECT id FROM report_signatures LIMIT 1)",
            rusqlite::params![preparer_name, manager_name, approval_number, now],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO report_signatures (preparer_name, manager_name, approval_number, updated_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![preparer_name, manager_name, approval_number, now],
        )
        .map_err(|e| e.to_string())?;
    }

    // Get the ID of the saved row
    let sig_id: i64 = if exists {
        conn.query_row(
            "SELECT id FROM report_signatures LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?
    } else {
        conn.last_insert_rowid()
    };

    // Return result directly (avoids crossing await with non-Send MutexGuard)
    Ok(ReportSignature {
        id: Some(sig_id),
        preparer_name,
        manager_name,
        approval_number,
        updated_at: now,
    })
}

// ═════════════════════════════════════════════════════════════════════
// EXPORT PRESETS (named settings bundles)
// ═════════════════════════════════════════════════════════════════════

fn row_to_preset(row: &rusqlite::Row) -> Result<ExportPreset, rusqlite::Error> {
    Ok(ExportPreset {
        id: row.get(0)?,
        name: row.get(1)?,
        user_id: row.get(2)?,
        user_name: row.get(3)?,
        scope: row.get(4)?,
        orientation: row.get(5)?,
        margin_preset: row.get(6)?,
        show_page_numbers: row.get(7)?,
        show_signatures: row.get(8)?,
        preparer_name: row.get(9)?,
        manager_name: row.get(10)?,
        approval_number: row.get(11)?,
        is_default: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

#[tauri::command]
pub async fn get_export_presets(
    state: State<'_, AppState>,
    user_id: Option<i64>,
    is_admin: bool,
) -> Result<Vec<ExportPreset>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // Admins see all presets (public + their own private). Regular users see public + their own private.
    let query = if is_admin {
        "SELECT e.id, e.name, e.user_id, COALESCE(u.username, ''), e.scope,
                e.orientation, e.margin_preset, e.show_page_numbers,
                e.show_signatures, e.preparer_name, e.manager_name, e.approval_number,
                e.is_default, e.created_at, e.updated_at
         FROM export_presets e
         LEFT JOIN users u ON e.user_id = u.id
         WHERE e.scope = 'public' OR e.user_id = ?1
         ORDER BY e.scope ASC, e.is_default DESC, e.updated_at DESC"
    } else if user_id.is_some() {
        "SELECT e.id, e.name, e.user_id, COALESCE(u.username, ''), e.scope,
                e.orientation, e.margin_preset, e.show_page_numbers,
                e.show_signatures, e.preparer_name, e.manager_name, e.approval_number,
                e.is_default, e.created_at, e.updated_at
         FROM export_presets e
         LEFT JOIN users u ON e.user_id = u.id
         WHERE e.scope = 'public' OR e.user_id = ?1
         ORDER BY e.scope ASC, e.is_default DESC, e.updated_at DESC"
    } else {
        "SELECT e.id, e.name, e.user_id, COALESCE(u.username, ''), e.scope,
                e.orientation, e.margin_preset, e.show_page_numbers,
                e.show_signatures, e.preparer_name, e.manager_name, e.approval_number,
                e.is_default, e.created_at, e.updated_at
         FROM export_presets e
         LEFT JOIN users u ON e.user_id = u.id
         WHERE e.scope = 'public'
         ORDER BY e.scope ASC, e.is_default DESC, e.updated_at DESC"
    };

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;

    let presets = if is_admin || user_id.is_some() {
        stmt.query_map([user_id.unwrap_or(0)], row_to_preset)
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect()
    } else {
        stmt.query_map([], row_to_preset)
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect()
    };

    Ok(presets)
}

#[tauri::command]
pub async fn save_export_preset(
    state: State<'_, AppState>,
    name: String,
    user_id: Option<i64>,
    scope: String,
    orientation: String,
    margin_preset: String,
    show_page_numbers: bool,
    show_signatures: bool,
    preparer_name: String,
    manager_name: String,
    approval_number: String,
    is_default: bool,
) -> Result<ExportPreset, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let effective_scope = if scope == "public" { "public" } else { "private" };

    // If this preset is set as default, unset all other defaults first
    if is_default {
        conn.execute(
            "UPDATE export_presets SET is_default = 0",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    // Check for existing by name AND user_id (same user can't have duplicate names)
    let existing_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM export_presets WHERE name = ?1 AND (user_id = ?2 OR user_id IS NULL)",
            rusqlite::params![name, user_id],
            |row| row.get(0),
        )
        .ok();

    let id = if let Some(existing) = existing_id {
        conn.execute(
            "UPDATE export_presets SET
                orientation = ?1, margin_preset = ?2,
                show_page_numbers = ?3, show_signatures = ?4,
                preparer_name = ?5, manager_name = ?6,
                approval_number = ?7, is_default = ?8, updated_at = ?9,
                scope = ?10, user_id = ?11
             WHERE id = ?12",
            rusqlite::params![
                orientation, margin_preset, show_page_numbers,
                show_signatures, preparer_name, manager_name,
                approval_number, is_default, now,
                effective_scope, user_id, existing
            ],
        )
        .map_err(|e| e.to_string())?;
        existing
    } else {
        conn.execute(
            "INSERT INTO export_presets (name, user_id, scope, orientation, margin_preset,
             show_page_numbers, show_signatures, preparer_name, manager_name,
             approval_number, is_default, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
            rusqlite::params![
                name, user_id, effective_scope, orientation, margin_preset,
                show_page_numbers, show_signatures, preparer_name, manager_name,
                approval_number, is_default, now
            ],
        )
        .map_err(|e| e.to_string())?;
        conn.last_insert_rowid()
    };

    // Fetch and return with JOIN to get user_name
    let preset = conn
        .query_row(
            "SELECT e.id, e.name, e.user_id, COALESCE(u.username, ''), e.scope,
                    e.orientation, e.margin_preset, e.show_page_numbers,
                    e.show_signatures, e.preparer_name, e.manager_name, e.approval_number,
                    e.is_default, e.created_at, e.updated_at
             FROM export_presets e
             LEFT JOIN users u ON e.user_id = u.id
             WHERE e.id = ?1",
            [id],
            row_to_preset,
        )
        .map_err(|e| e.to_string())?;

    Ok(preset)
}

#[tauri::command]
pub async fn delete_export_preset(
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute("DELETE FROM export_presets WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn set_default_export_preset(
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute("UPDATE export_presets SET is_default = 0", [])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE export_presets SET is_default = 1 WHERE id = ?1",
        [id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
