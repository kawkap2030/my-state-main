use tauri::State;
use crate::db::AppState;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ExportPreset {
    pub id: i64,
    pub name: String,
    pub user_id: Option<i64>,
    pub user_name: Option<String>,
    pub scope: String,
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

/// Helper: run a fallible closure inside catch_unwind so any Rust panic
/// (chrono::Local::now(), unwrap, overflow, poisoned mutex, etc.) is
/// converted into a String error INSTEAD of crashing the webview.
fn safe_db_op<T>(f: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)) {
        Ok(result) => result,
        Err(e) => Err(format!("[panic] {:?}", e)),
    }
}

// ═════════════════════════════════════════════════════════════════════
// EXPORT PRESETS (named settings bundles) — also stores signature data
// ═════════════════════════════════════════════════════════════════════

// NOTE: save_report_signatures was REMOVED. All signature saves use
// save_export_preset. The useReportSignatures hook is now read-only
// (reads from get_export_presets via the default preset).

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
    let result = safe_db_op(|| {
        let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

        let query = if is_admin || user_id.is_some() {
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

        let presets: Vec<ExportPreset> = if is_admin || user_id.is_some() {
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
    });
    result
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
    preset_id: Option<i64>,
) -> Result<ExportPreset, String> {
    let result = safe_db_op(|| {
        let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

        let now = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
        })) {
            Ok(t) => t,
            Err(_) => "2026-01-01 00:00:00".to_string(),
        };
        
        let effective_scope = if scope == "public" { "public" } else { "private" };

        if is_default {
            conn.execute("UPDATE export_presets SET is_default = 0", [])
                .map_err(|e| e.to_string())?;
        }

        let id = if let Some(pid) = preset_id {
            conn.execute(
                "UPDATE export_presets SET name = ?1, orientation = ?2, margin_preset = ?3,
                 show_page_numbers = ?4, show_signatures = ?5, preparer_name = ?6,
                 manager_name = ?7, approval_number = ?8, is_default = ?9,
                 updated_at = ?10, scope = ?11, user_id = ?12
                 WHERE id = ?13",
                rusqlite::params![
                    name, orientation, margin_preset, show_page_numbers,
                    show_signatures, preparer_name, manager_name,
                    approval_number, is_default, now,
                    effective_scope, user_id, pid
                ],
            )
            .map_err(|e| e.to_string())?;
            pid
        } else {
            let existing_id: Option<i64> = conn
                .query_row(
                    "SELECT id FROM export_presets WHERE name = ?1 AND (user_id = ?2 OR user_id IS NULL)",
                    rusqlite::params![name, user_id],
                    |row| row.get(0),
                )
                .ok();

            if let Some(existing) = existing_id {
                conn.execute(
                    "UPDATE export_presets SET orientation = ?1, margin_preset = ?2,
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
            }
        };

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
    });
    result
}

#[tauri::command]
pub async fn delete_export_preset(
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), String> {
    safe_db_op(|| {
        let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
        conn.execute("DELETE FROM export_presets WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub async fn set_default_export_preset(
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), String> {
    safe_db_op(|| {
        let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
        conn.execute("UPDATE export_presets SET is_default = 0", [])
            .map_err(|e| e.to_string())?;
        conn.execute("UPDATE export_presets SET is_default = 1 WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// Reorder export presets by updating their updated_at timestamps.
#[tauri::command]
pub async fn reorder_export_presets(
    state: State<'_, AppState>,
    ordered_ids: Vec<i64>,
) -> Result<(), String> {
    safe_db_op(|| {
        let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
        let now = chrono::Local::now();
        for (index, preset_id) in ordered_ids.iter().enumerate() {
            let ts = now - chrono::Duration::seconds(index as i64);
            let ts_str = ts.format("%Y-%m-%d %H:%M:%S").to_string();
            conn.execute(
                "UPDATE export_presets SET updated_at = ?1 WHERE id = ?2",
                rusqlite::params![ts_str, preset_id],
            )
            .map_err(|e| format!("Failed to update preset {}: {}", preset_id, e))?;
        }
        Ok(())
    })
}
