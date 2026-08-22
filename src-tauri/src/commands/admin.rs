use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;
use tauri::State;
use crate::db::AppState;

/// Portable database path logic (mirrors init_db from db.rs)
fn get_portable_db_path() -> std::result::Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let project_root = manifest_dir.parent().unwrap_or(manifest_dir);
        Ok(project_root.join("medicine_dispenser.db"))
    } else {
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("Failed to get executable path: {}", e))?;
        let exe_dir = exe_path
            .parent()
            .ok_or("Cannot determine executable directory")?;
        Ok(exe_dir.join("medicine_dispenser.db"))
    }
}

#[derive(serde::Serialize)]
pub struct BackupFileInfo {
    name: String,
    size: f64, // KB
    date: String,
}

#[derive(serde::Serialize)]
pub struct CategoryCount {
    id: i32,
    name: String,
    drugs_count: i64,
    dispensed_count: i64,
}

#[derive(serde::Serialize)]
pub struct ClinicCount {
    id: i32,
    name: String,
    area_name: String,
    total_count: i64,
}

#[derive(serde::Serialize)]
pub struct InsulinTypeCount {
    name: String,
    insulin_count: i64,
}

#[derive(serde::Serialize)]
pub struct DataManagementSummary {
    table_counts: std::collections::HashMap<String, i64>,
    categories: Vec<CategoryCount>,
    clinics: Vec<ClinicCount>,
    insulin_types: Vec<InsulinTypeCount>,
}

fn get_db_and_backups_paths() -> std::result::Result<(PathBuf, PathBuf), String> {
    // ✅ Portable: use the same path logic as init_db
    // (project root in debug, exe directory in production)
    let db_path = get_portable_db_path()?;
    let backups_dir = db_path
        .parent()
        .ok_or("Cannot determine database directory")?
        .join("backups");
    if !backups_dir.exists() {
        std::fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;
    }
    Ok((db_path, backups_dir))
}

fn zip_db(db_path: &Path, zip_path: &Path, filename: &str) -> std::result::Result<(), String> {
    let file = File::create(zip_path).map_err(|e| format!("Failed to create backup zip: {}", e))?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    zip.start_file(filename, options).map_err(|e| format!("Failed to write file to zip: {}", e))?;
    
    let mut db_file = File::open(db_path).map_err(|e| format!("Failed to open database file: {}", e))?;
    let mut buffer = Vec::new();
    db_file.read_to_end(&mut buffer).map_err(|e| format!("Failed to read database file: {}", e))?;
    
    zip.write_all(&buffer).map_err(|e| format!("Failed to write data to zip: {}", e))?;
    zip.finish().map_err(|e| format!("Failed to finish zip file: {}", e))?;
    Ok(())
}

fn unzip_db(zip_path: &Path, temp_restore_dir: &Path) -> std::result::Result<PathBuf, String> {
    let file = File::open(zip_path).map_err(|e| format!("Failed to open zip file: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip archive: {}", e))?;
    
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("Failed to read file from archive index: {}", e))?;
        let outpath = match file.enclosed_name() {
            Some(path) => temp_restore_dir.join(path),
            None => continue,
        };
        
        if (*file.name()).ends_with('/') {
            std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = File::create(&outpath).map_err(|e| format!("Failed to create extracted file: {}", e))?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| format!("Failed to copy extracted data: {}", e))?;
            return Ok(outpath);
        }
    }
    Err("No database file found in the zip backup".to_string())
}

/// Validate database integrity and schema tables
fn validate_database_schema(target_db_path: &Path) -> std::result::Result<(), String> {
    if !target_db_path.exists() {
        return Err("ملف قاعدة البيانات المستخرج غير موجود".to_string());
    }

    let conn = rusqlite::Connection::open(target_db_path)
        .map_err(|e| format!("فشل في فتح ملف قاعدة البيانات: {}", e))?;

    // 1. Integrity check
    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|e| format!("فشل في فحص سلامة ملف قاعدة البيانات: {}", e))?;

    if integrity != "ok" {
        return Err(format!("قاعدة البيانات غير سليمة أو تالفة (نتيجة الفحص: {})", integrity));
    }

    // 2. Schema tables check
    let required_tables = vec![
        "users",
        "branches",
        "areas",
        "clinics",
        "drug_categories",
        "drugs",
        "drug_groups",
        "detailed_drug_dispensed",
        "insulin_dispensed",
        "monthly_drugs_dispensed",
    ];

    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .map_err(|e| format!("فشل في قراءة ملامح قاعدة البيانات: {}", e))?;

    let existing_tables: std::collections::HashSet<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    let missing_tables: Vec<&str> = required_tables
        .into_iter()
        .filter(|t| !existing_tables.contains(*t))
        .collect();

    if !missing_tables.is_empty() {
        return Err(format!(
            "ملف قاعدة البيانات غير متوافق مع المخطط (Schema). الجداول المفقودة: {:?}",
            missing_tables
        ));
    }

    Ok(())
}

#[tauri::command]
pub async fn get_backup_files() -> std::result::Result<Vec<BackupFileInfo>, String> {
    let (_, backups_dir) = get_db_and_backups_paths()?;
    let mut files_list = Vec::new();
    
    if backups_dir.exists() {
        let entries = std::fs::read_dir(backups_dir).map_err(|e| e.to_string())?;
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("zip") {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    let metadata = entry.metadata().map_err(|e| e.to_string())?;
                    let size = (metadata.len() as f64) / 1024.0; // KB
                    
                    let modified = metadata.modified().map_err(|e| e.to_string())?;
                    let dt: chrono::DateTime<chrono::Local> = modified.into();
                    let date = dt.format("%Y-%m-%d %H:%M:%S").to_string();
                    
                    files_list.push(BackupFileInfo { name, size, date });
                }
            }
        }
    }
    
    files_list.sort_by(|a, b| b.date.cmp(&a.date));
    Ok(files_list)
}

#[tauri::command]
pub async fn create_backup() -> std::result::Result<String, String> {
    let (db_path, backups_dir) = get_db_and_backups_paths()?;
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("medicine_dispenser_backup_{}.zip", timestamp);
    let zip_path = backups_dir.join(&filename);
    
    zip_db(&db_path, &zip_path, "medicine_dispenser.db")?;
    Ok(filename)
}

#[tauri::command]
pub async fn delete_backup(filename: String) -> std::result::Result<(), String> {
    let (_, backups_dir) = get_db_and_backups_paths()?;
    let file_path = backups_dir.join(&filename);
    if file_path.exists() {
        std::fs::remove_file(file_path).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("الملف غير موجود".to_string())
    }
}

#[tauri::command]
pub async fn delete_multiple_backups(filenames: Vec<String>) -> std::result::Result<u32, String> {
    let (_, backups_dir) = get_db_and_backups_paths()?;
    let mut deleted_count = 0;
    for filename in filenames {
        let file_path = backups_dir.join(&filename);
        if file_path.exists() {
            if std::fs::remove_file(file_path).is_ok() {
                deleted_count += 1;
            }
        }
    }
    Ok(deleted_count)
}

#[tauri::command]
pub async fn restore_backup(state: State<'_, AppState>, filename: String) -> std::result::Result<(), String> {
    let (db_path, backups_dir) = get_db_and_backups_paths()?;
    let zip_path = backups_dir.join(&filename);
    if !zip_path.exists() {
        return Err("الملف غير موجود".to_string());
    }

    // 1. Extract to temp directory
    let temp_restore_dir = backups_dir.join("temp_restore");
    if temp_restore_dir.exists() {
        std::fs::remove_dir_all(&temp_restore_dir).ok();
    }
    std::fs::create_dir_all(&temp_restore_dir).map_err(|e| e.to_string())?;

    let extracted_db_path = match unzip_db(&zip_path, &temp_restore_dir) {
        Ok(p) => p,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&temp_restore_dir);
            return Err(e);
        }
    };

    // 2. Validate schema & integrity BEFORE overwriting current DB
    if let Err(e) = validate_database_schema(&extracted_db_path) {
        let _ = std::fs::remove_dir_all(&temp_restore_dir);
        return Err(format!("فشل في استعادة النسخة: {}", e));
    }

    // 3. Precautionary backup BEFORE overwriting
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let current_backup_zip_filename = format!("medicine_dispenser_backup_pre_restore_{}.zip", timestamp);
    let current_backup_zip_path = backups_dir.join(&current_backup_zip_filename);
    zip_db(&db_path, &current_backup_zip_path, "medicine_dispenser.db")?;

    // 4. Lock db and set connection to None
    let mut conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    *conn_guard = None;

    // 5. Overwrite main DB
    std::fs::copy(&extracted_db_path, &db_path).map_err(|e| format!("Failed to copy database file: {}", e))?;

    // 6. Clean up temp
    std::fs::remove_dir_all(&temp_restore_dir).ok();

    // 7. Re-open connection and HEALTH-GATE the restored DB BEFORE any
    // write touches it — a corrupted backup must never be silently accepted
    // nor cleared the warning banner.
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| format!("Failed to re-open database connection: {}", e))?;
    let restored_check: String = conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .unwrap_or_else(|_| "check-failed".to_string());

    if restored_check == "ok" {
        // Healthy restore: apply idempotent schema (IF NOT EXISTS) + FK, then
        // clear the startup health-gate warning so the banner disappears.
        let schema = include_str!("../../../schema.sql");
        let _ = conn.execute_batch(schema);
        conn.execute("PRAGMA foreign_keys = ON", []).map_err(|e| e.to_string())?;
        if let Ok(mut err_lock) = state.db_error.lock() {
            *err_lock = None;
        }
        *conn_guard = Some(conn);
        Ok(())
    } else {
        // Corrupt restored file: fail the restore with an ACCURATE message.
        // The main DB file was already overwritten by the restore attempt, so
        // the previous data now lives ONLY in the pre-restore backup created
        // above — point the user at it explicitly. The failed copy is never
        // placed into the connection slot (app stops operating on it), and the
        // warning banner stays visible until a healthy DB is restored.
        let msg = format!(
            "فشل الاستعادة: قاعدة البيانات المستعادة غير سليمة (نتيجة الفحص: {}). تم إنشاء نسخة احتياطية من بياناتك السابقة باسم {} — يمكنك استعادتها من شاشة النسخ الاحتياطي، أو المحاولة بنسخة أخرى.",
            restored_check, current_backup_zip_filename
        );
        eprintln!("[admin] restored DB quick_check failed: {} — pre-restore backup: {}", restored_check, current_backup_zip_filename);
        // Keep the (read-only) failed copy out of the connection slot so the
        // app never operates on it; the pre-restore backup remains on disk.
        let _ = conn.execute("PRAGMA query_only = ON", []);
        *conn_guard = None;
        if let Ok(mut err_lock) = state.db_error.lock() {
            *err_lock = Some("تعذر التحقق من سلامة قاعدة البيانات المستعادة. تم إيقاف العمليات التي قد تؤثر على البيانات حفاظًا عليها. استعد النسخة الاحتياطية السابقة من شاشة النسخ الاحتياطي.".to_string());
        }
        Err(msg)
    }
}

#[tauri::command]
pub async fn get_data_management_summary(state: State<'_, AppState>) -> std::result::Result<DataManagementSummary, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    
    let tables = vec![
        "branches", "areas", "clinics", "drug_categories", "drugs",
        "detailed_drug_dispensed", "insulin_dispensed",
        "drug_groups", "insulin_codes", "insulin_types", "insulin_categories",
        "drug_group_codes", "insulin_units", "drug_units",
        "judicial_patients", "patient_pdfs", "judicial_medicines",
        "judicial_patient_medicines", "judicial_dispensed",
        "monthly_drugs_dispensed", "supply_categories", "supplies",
        "monthly_supplies_dispensed", "medical_tickets",
        "users", "audit_log", "dispensing_month_isolation", "manual_locked_months",
        "scheduled_reports", "scheduled_report_history", "export_presets"
    ];
    
    let mut table_counts = std::collections::HashMap::new();
    for table in tables {
        let query = format!("SELECT COUNT(*) FROM {}", table);
        let count: i64 = conn.query_row(&query, [], |row| row.get(0)).unwrap_or(0);
        table_counts.insert(table.to_string(), count);
    }
    
    let mut stmt = conn.prepare("SELECT id, name FROM drug_categories ORDER BY name").map_err(|e| e.to_string())?;
    let cat_iter = stmt.query_map([], |row| {
        let id: i32 = row.get(0)?;
        let name: String = row.get(1)?;
        
        let drugs_count: i64 = conn.query_row("SELECT COUNT(*) FROM drugs WHERE category_id = ?1", [id], |r| r.get(0)).unwrap_or(0);
        
        let dispensed_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM detailed_drug_dispensed WHERE drug_id IN (SELECT id FROM drugs WHERE category_id = ?1)",
            [id],
            |r| r.get(0)
        ).unwrap_or(0);
        
        Ok(CategoryCount { id, name, drugs_count, dispensed_count })
    }).map_err(|e| e.to_string())?;
    
    let mut categories = Vec::new();
    for cat in cat_iter {
        if let Ok(c) = cat {
            categories.push(c);
        }
    }
    
    let mut stmt = conn.prepare(
        "SELECT c.id, c.name, a.name FROM clinics c LEFT JOIN areas a ON c.area_id = a.id ORDER BY a.name, c.name"
    ).map_err(|e| e.to_string())?;
    
    let clinic_iter = stmt.query_map([], |row| {
        let id: i32 = row.get(0)?;
        let name: String = row.get(1)?;
        let area_name: String = row.get(2).unwrap_or_else(|_| "غير محدد".to_string());
        
        let detailed_count: i64 = conn.query_row("SELECT COUNT(*) FROM detailed_drug_dispensed WHERE clinic_id = ?1", [id], |r| r.get(0)).unwrap_or(0);
        let insulin_count: i64 = conn.query_row("SELECT COUNT(*) FROM insulin_dispensed WHERE clinic_id = ?1", [id], |r| r.get(0)).unwrap_or(0);
        let judicial_count: i64 = conn.query_row("SELECT COUNT(*) FROM judicial_dispensed WHERE clinic_id = ?1", [id], |r| r.get(0)).unwrap_or(0);
        let groups_count: i64 = conn.query_row("SELECT COUNT(*) FROM drug_groups WHERE clinic_id = ?1", [id], |r| r.get(0)).unwrap_or(0);
        let tickets_count: i64 = conn.query_row("SELECT COUNT(*) FROM medical_tickets WHERE clinic_id = ?1", [id], |r| r.get(0)).unwrap_or(0);
        let monthly_drugs_count: i64 = conn.query_row("SELECT COUNT(*) FROM monthly_drugs_dispensed WHERE clinic_id = ?1", [id], |r| r.get(0)).unwrap_or(0);
        let monthly_supplies_count: i64 = conn.query_row("SELECT COUNT(*) FROM monthly_supplies_dispensed WHERE clinic_id = ?1", [id], |r| r.get(0)).unwrap_or(0);
        
        let total_count = detailed_count + insulin_count + judicial_count + groups_count + tickets_count + monthly_drugs_count + monthly_supplies_count;
        
        Ok(ClinicCount { id, name, area_name, total_count })
    }).map_err(|e| e.to_string())?;
    
    let mut clinics = Vec::new();
    for cl in clinic_iter {
        if let Ok(c) = cl {
            clinics.push(c);
        }
    }
    
    let mut stmt = conn.prepare("SELECT name FROM insulin_types ORDER BY name").map_err(|e| e.to_string())?;
    let ins_iter = stmt.query_map([], |row| {
        let name: String = row.get(0)?;
        let insulin_count: i64 = conn.query_row("SELECT COUNT(*) FROM insulin_dispensed WHERE type = ?1", [&name], |r| r.get(0)).unwrap_or(0);
        
        Ok(InsulinTypeCount { name, insulin_count })
    }).map_err(|e| e.to_string())?;
    
    let mut insulin_types = Vec::new();
    for ins in ins_iter {
        if let Ok(i) = ins {
            insulin_types.push(i);
        }
    }
    
    Ok(DataManagementSummary {
        table_counts,
        categories,
        clinics,
        insulin_types,
    })
}

#[tauri::command]
pub async fn open_backups_folder() -> std::result::Result<(), String> {
    let (_, backups_dir) = get_db_and_backups_paths()?;
    std::process::Command::new("explorer")
        .arg(backups_dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn clear_data(
    state: State<'_, AppState>,
    clear_type: String,
    confirm_text: String,
    selected_tables: Option<Vec<String>>,
    advanced_type: Option<String>,
    selected_categories: Option<Vec<i32>>,
    clear_scope: Option<String>,
    selected_clinics: Option<Vec<i32>>,
    selected_insulin_types: Option<Vec<String>>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> std::result::Result<String, String> {
    if confirm_text != "تأكيد الحذف" {
        return Err("يجب كتابة \"تأكيد الحذف\" للمتابعة".to_string());
    }

    let (db_path, backups_dir) = get_db_and_backups_paths()?;
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let auto_backup_filename = format!("medicine_dispenser_backup_pre_clear_{}.zip", timestamp);
    let auto_backup_path = backups_dir.join(&auto_backup_filename);
    zip_db(&db_path, &auto_backup_path, "medicine_dispenser.db")?;

    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    match clear_type.as_str() {
        "dispensing_only" => {
            conn.execute("DELETE FROM detailed_drug_dispensed", []).map_err(|e| e.to_string())?;
            conn.execute("DELETE FROM drug_groups", []).map_err(|e| e.to_string())?;
            conn.execute("DELETE FROM insulin_dispensed", []).map_err(|e| e.to_string())?;
            conn.execute("DELETE FROM judicial_dispensed", []).map_err(|e| e.to_string())?;
            conn.execute("DELETE FROM monthly_drugs_dispensed", []).map_err(|e| e.to_string())?;
            conn.execute("DELETE FROM monthly_supplies_dispensed", []).map_err(|e| e.to_string())?;
            conn.execute("DELETE FROM medical_tickets", []).map_err(|e| e.to_string())?;
            Ok(format!("تم تفريغ بيانات الصرف بنجاح (تم الاحتفاظ بالبيانات الأساسية). تم إنشاء نسخة احتياطية تلقائية: {}", auto_backup_filename))
        }
        "all_data" => {
            let tables = vec![
                "detailed_drug_dispensed",
                "drug_groups",
                "insulin_dispensed",
                "judicial_dispensed",
                "medical_tickets",
                "monthly_drugs_dispensed",
                "monthly_supplies_dispensed",
                "patient_pdfs",
                "judicial_patient_medicines",
                "judicial_patients",
                "judicial_medicines",
                "drugs",
                "supplies",
                "insulin_codes",
                "drug_categories",
                "drug_units",
                "drug_group_codes",
                "insulin_categories",
                "insulin_types",
                "insulin_units",
                "supply_categories",
                "clinics",
                "areas",
                "branches",
                "dispensing_month_isolation",
                "manual_locked_months",
                "audit_log",
                "users",
                "scheduled_reports",
                "scheduled_report_history"
            ];
            
            for table in tables {
                let query = format!("DELETE FROM {}", table);
                conn.execute(&query, []).map_err(|e| format!("Failed to clear table {}: {}", table, e))?;
                let seq_query = "DELETE FROM sqlite_sequence WHERE name = ?";
                conn.execute(seq_query, [table]).ok();
            }

            // 🔐 NO default admin is re-created here. After a full reset the
            // users table is empty, so the First-Run Setup screen appears on
            // the next login and the administrator creates a NEW account with
            // their own password — no hard-coded admin/admin credential ever.
            // A default branch is re-seeded because dispensing rows require a
            // branch_id. Drug categories are NOT auto-seeded: they are
            // reference data the administrator recreates via the UI.
            conn.execute("INSERT INTO branches (name) VALUES ('الفرع الرئيسي')", []).map_err(|e| e.to_string())?;

            Ok(format!("تم تفريغ جميع البيانات بنجاح وإعادة ضبط المصنع. سيظهر إعداد أول تشغيل لإنشاء حساب المدير عند تسجيل الدخول التالي. تم إنشاء نسخة احتياطية تلقائية: {}", auto_backup_filename))
        }
        "custom" => {
            let tables = selected_tables.ok_or("لم يتم تحديد أي جداول للتفريغ")?;
            if tables.is_empty() {
                return Err("لم يتم اختيار أي جداول".to_string());
            }
            
            for table in &tables {
                let allowed_tables = vec![
                    "detailed_drug_dispensed", "drug_groups", "insulin_dispensed",
                    "judicial_dispensed", "medical_tickets", "monthly_drugs_dispensed",
                    "monthly_supplies_dispensed", "patient_pdfs", "judicial_patient_medicines",
                    "judicial_patients", "judicial_medicines", "drugs", "supplies",
                    "insulin_codes", "drug_categories", "drug_units", "drug_group_codes",
                    "insulin_categories", "insulin_types", "insulin_units", "supply_categories",
                    "clinics", "areas", "branches", "dispensing_month_isolation",                "manual_locked_months",
                "audit_log",
                "scheduled_reports",
                "scheduled_report_history"
            ];
            // حماية: لا يُسمح بمسح المستخدمين لأن ذلك يمنع الدخول للنظام
            if table == "users" {
                return Err("لا يمكن مسح جدول المستخدمين يدوياً — حساب المدير محمي".to_string());
            }
            if !allowed_tables.contains(&table.as_str()) {
                return Err(format!("اسم الجدول غير مصرح به: {}", table));
                }

                let query = format!("DELETE FROM {}", table);
                conn.execute(&query, []).map_err(|e| format!("Failed to clear table {}: {}", table, e))?;
                let seq_query = "DELETE FROM sqlite_sequence WHERE name = ?";
                conn.execute(seq_query, [table]).ok();
            }
            
            Ok(format!("تم تفريغ الجداول المحددة بنجاح ({} جداول). تم إنشاء نسخة احتياطية تلقائية: {}", tables.len(), auto_backup_filename))
        }
        "advanced" => {
            let adv_type = advanced_type.ok_or("لم يتم تحديد نوع التفريغ المتقدم")?;
            match adv_type.as_str() {
                "categories" => {
                    let cat_ids = selected_categories.ok_or("لم يتم تحديد تصنيفات")?;
                    let scope = clear_scope.unwrap_or_else(|| "both".to_string());
                    if cat_ids.is_empty() {
                        return Err("لم يتم اختيار أي تصنيفات".to_string());
                    }
                    
                    let ids_str: Vec<String> = cat_ids.iter().map(|id| id.to_string()).collect();
                    let placeholders = ids_str.join(",");
                    
                    if scope == "records_only" || scope == "both" {
                        let query = format!(
                            "DELETE FROM detailed_drug_dispensed WHERE drug_id IN (SELECT id FROM drugs WHERE category_id IN ({}))",
                            placeholders
                        );
                        conn.execute(&query, []).map_err(|e| e.to_string())?;
                    }
                    
                    if scope == "drugs_only" || scope == "both" {
                        let query = format!(
                            "DELETE FROM drugs WHERE category_id IN ({})",
                            placeholders
                        );
                        conn.execute(&query, []).map_err(|e| e.to_string())?;
                    }
                    
                    Ok(format!("تم تفريغ حركات الأدوية للتصنيفات المحددة بنجاح. تم إنشاء نسخة احتياطية تلقائية: {}", auto_backup_filename))
                }
                "clinics" => {
                    let clinic_ids = selected_clinics.ok_or("لم يتم تحديد عيادات")?;
                    if clinic_ids.is_empty() {
                        return Err("لم يتم اختيار أي عيادات".to_string());
                    }
                    
                    let ids_str: Vec<String> = clinic_ids.iter().map(|id| id.to_string()).collect();
                    let placeholders = ids_str.join(",");
                    
                    let queries = vec![
                        format!("DELETE FROM detailed_drug_dispensed WHERE clinic_id IN ({})", placeholders),
                        format!("DELETE FROM insulin_dispensed WHERE clinic_id IN ({})", placeholders),
                        format!("DELETE FROM judicial_dispensed WHERE clinic_id IN ({})", placeholders),
                        format!("DELETE FROM drug_groups WHERE clinic_id IN ({})", placeholders),
                        format!("DELETE FROM medical_tickets WHERE clinic_id IN ({})", placeholders),
                        format!("DELETE FROM monthly_drugs_dispensed WHERE clinic_id IN ({})", placeholders),
                        format!("DELETE FROM monthly_supplies_dispensed WHERE clinic_id IN ({})", placeholders),
                        format!("DELETE FROM judicial_patients WHERE clinic_id IN ({})", placeholders),
                    ];
                    
                    for q in queries {
                        conn.execute(&q, []).map_err(|e| e.to_string())?;
                    }
                    
                    Ok(format!("تم تفريغ البيانات للعيادات المحددة بنجاح. تم إنشاء نسخة احتياطية تلقائية: {}", auto_backup_filename))
                }
                "insulin_types" => {
                    let types = selected_insulin_types.ok_or("لم يتم تحديد أنواع أنسولين")?;
                    if types.is_empty() {
                        return Err("لم يتم اختيار أي أنواع أنسولين".to_string());
                    }
                    
                    let formatted_types: Vec<String> = types.iter().map(|t| format!("'{}'", t.replace('\'', "''"))).collect();
                    let placeholders = formatted_types.join(",");
                    
                    let query = format!(
                        "DELETE FROM insulin_dispensed WHERE type IN ({})",
                        placeholders
                    );
                    conn.execute(&query, []).map_err(|e| e.to_string())?;
                    
                    Ok(format!("تم تفريغ حركات الأنسولين للأنواع المحددة بنجاح. تم إنشاء نسخة احتياطية تلقائية: {}", auto_backup_filename))
                }
                "date_range" => {
                    let start = start_date.ok_or("يجب تحديد تاريخ البداية")?;
                    let end = end_date.ok_or("يجب تحديد تاريخ النهاية")?;
                    if start.is_empty() || end.is_empty() {
                        return Err("تاريخ البداية أو النهاية فارغ".to_string());
                    }
                    
                    let tables_with_dates = vec![
                        "detailed_drug_dispensed",
                        "insulin_dispensed",
                        "judicial_dispensed",
                        "drug_groups",
                        "medical_tickets",
                        "monthly_drugs_dispensed",
                        "monthly_supplies_dispensed",
                    ];
                    
                    for table in tables_with_dates {
                        let query = format!(
                            "DELETE FROM {} WHERE dispense_month BETWEEN ?1 AND ?2",
                            table
                        );
                        conn.execute(&query, [&start, &end]).map_err(|e| format!("Error clearing table {}: {}", table, e))?;
                    }
                    
                    Ok(format!("تم تفريغ البيانات للفترة من {} إلى {} بنجاح. تم إنشاء نسخة احتياطية تلقائية: {}", start, end, auto_backup_filename))
                }
                _ => Err("نوع تفريغ متقدم غير معروف".to_string())
            }
        }
        _ => Err("نوع تفريغ غير معروف".to_string())
    }
}

// ===================== NEW ENHANCEMENT COMMANDS =====================

#[derive(serde::Serialize, serde::Deserialize)]
pub struct BackupNotes {
    notes: std::collections::HashMap<String, String>,
}

fn get_notes_path() -> std::result::Result<PathBuf, String> {
    let (_, backups_dir) = get_db_and_backups_paths()?;
    Ok(backups_dir.join("backup_notes.json"))
}

fn load_notes() -> std::result::Result<std::collections::HashMap<String, String>, String> {
    let path = get_notes_path()?;
    if !path.exists() {
        return Ok(std::collections::HashMap::new());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let notes: BackupNotes = serde_json::from_str(&content).unwrap_or(BackupNotes { notes: std::collections::HashMap::new() });
    Ok(notes.notes)
}

fn save_notes(notes: &std::collections::HashMap<String, String>) -> std::result::Result<(), String> {
    let path = get_notes_path()?;
    let data = BackupNotes { notes: notes.clone() };
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// 1. Get database file size in MB
#[tauri::command]
pub async fn get_db_size() -> std::result::Result<f64, String> {
    let (db_path, _) = get_db_and_backups_paths()?;
    let metadata = std::fs::metadata(&db_path).map_err(|e| e.to_string())?;
    let size_mb = (metadata.len() as f64) / (1024.0 * 1024.0);
    Ok(size_mb)
}

/// 2. Run PRAGMA integrity_check on the database
#[tauri::command]
pub async fn check_db_integrity(state: State<'_, AppState>) -> std::result::Result<String, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    let result: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    Ok(result)
}

/// Backend DB health — lets the frontend show a PERSISTENT, user-visible
/// warning when the database failed its startup health gate (open failure or
/// integrity check). The connection may still be present (read-only) so the
/// app stays usable while the message is displayed.
#[derive(serde::Serialize)]
pub struct DbStatus {
    pub healthy: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub fn get_db_status(state: State<'_, AppState>) -> std::result::Result<DbStatus, String> {
    let err_lock = state.db_error.lock().map_err(|e| e.to_string())?;
    Ok(DbStatus {
        healthy: err_lock.is_none(),
        error: err_lock.clone(),
    })
}

/// 3. Import a backup from an external path (or pick file via native dialog if path is empty)
#[tauri::command]
pub async fn import_backup(source_path: Option<String>) -> std::result::Result<String, String> {
    let chosen_path = match source_path.filter(|s| !s.trim().is_empty()) {
        Some(p) => PathBuf::from(p),
        None => {
            let path = rfd::FileDialog::new()
                .add_filter("ملف مضغوط (*.zip)", &["zip"])
                .pick_file()
                .ok_or("تم إلغاء اختيار الملف".to_string())?;
            path
        }
    };

    if !chosen_path.exists() {
        return Err("الملف المحدد غير موجود".to_string());
    }
    if chosen_path.extension().and_then(|s| s.to_str()) != Some("zip") {
        return Err("يجب اختيار ملف بصيغة ZIP فقط".to_string());
    }

    let (_, backups_dir) = get_db_and_backups_paths()?;

    // Extract to temp directory to validate DB integrity and schema
    let temp_import_dir = backups_dir.join("temp_import_validation");
    if temp_import_dir.exists() {
        let _ = std::fs::remove_dir_all(&temp_import_dir);
    }
    std::fs::create_dir_all(&temp_import_dir).map_err(|e| e.to_string())?;

    let extracted_db_path = match unzip_db(&chosen_path, &temp_import_dir) {
        Ok(p) => p,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&temp_import_dir);
            return Err(format!("فشل في قراءة ملف الـ ZIP: {}", e));
        }
    };

    if let Err(e) = validate_database_schema(&extracted_db_path) {
        let _ = std::fs::remove_dir_all(&temp_import_dir);
        return Err(format!("الملف غير صالح للاستيراد: {}", e));
    }

    let _ = std::fs::remove_dir_all(&temp_import_dir);

    // Generate non-conflicting destination filename
    let filename = chosen_path
        .file_name()
        .ok_or("اسم الملف غير صالح".to_string())?
        .to_string_lossy()
        .into_owned();

    let dest_filename = if backups_dir.join(&filename).exists() {
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let stem = chosen_path.file_stem().unwrap_or_default().to_string_lossy();
        format!("{}_{}.zip", stem, timestamp)
    } else {
        filename
    };

    let dest = backups_dir.join(&dest_filename);
    std::fs::copy(&chosen_path, &dest).map_err(|e| format!("فشل في نسخ الملف إلى مجلد النسخ: {}", e))?;
    Ok(dest_filename)
}

/// 4. Create backup with rotation (keeps max N backups, deletes oldest auto-backups)
#[tauri::command]
pub async fn auto_backup_with_rotation(max_backups: Option<u32>) -> std::result::Result<String, String> {
    let max = max_backups.unwrap_or(10);
    let (db_path, backups_dir) = get_db_and_backups_paths()?;
    
    // Create the backup
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("medicine_dispenser_auto_{}.zip", timestamp);
    let zip_path = backups_dir.join(&filename);
    zip_db(&db_path, &zip_path, "medicine_dispenser.db")?;
    
    // Rotation: collect all auto backup files and sort by date
    let mut auto_backups: Vec<(String, std::time::SystemTime)> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&backups_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with("medicine_dispenser_auto_") && name.ends_with(".zip") {
                if let Ok(meta) = entry.metadata() {
                    if let Ok(modified) = meta.modified() {
                        auto_backups.push((name, modified));
                    }
                }
            }
        }
    }
    
    // Sort oldest first
    auto_backups.sort_by(|a, b| a.1.cmp(&b.1));
    
    // Delete oldest if exceeding max
    while auto_backups.len() > max as usize {
        if let Some((old_name, _)) = auto_backups.first() {
            let old_path = backups_dir.join(old_name);
            std::fs::remove_file(&old_path).ok();
        }
        auto_backups.remove(0);
    }
    
    Ok(filename)
}

/// 5. Save/Get/Delete backup notes
#[tauri::command]
pub async fn save_backup_note(filename: String, note: String) -> std::result::Result<(), String> {
    let mut notes = load_notes()?;
    if note.is_empty() {
        notes.remove(&filename);
    } else {
        notes.insert(filename, note);
    }
    save_notes(&notes)?;
    Ok(())
}

#[tauri::command]
pub async fn get_backup_notes() -> std::result::Result<std::collections::HashMap<String, String>, String> {
    load_notes()
}

/// 6. Export table data to CSV file and return its path
#[tauri::command]
pub async fn export_table_to_csv(
    state: State<'_, AppState>,
    table_name: String,
    custom_save_path: Option<String>,
) -> std::result::Result<String, String> {
    let allowed_tables = vec![
        "detailed_drug_dispensed", "drug_groups", "insulin_dispensed",
        "judicial_dispensed", "medical_tickets", "monthly_drugs_dispensed",
        "monthly_supplies_dispensed", "drugs", "supplies",
        "branches", "areas", "clinics", "drug_categories",
        "insulin_codes", "insulin_types", "insulin_categories",
        "drug_units", "drug_group_codes", "insulin_units",
        "supply_categories", "judicial_patients", "judicial_medicines",
        "judicial_patient_medicines", "patient_pdfs",
        "users", "audit_log", "dispensing_month_isolation", "manual_locked_months",
        "scheduled_reports", "scheduled_report_history",
    ];
    if !allowed_tables.contains(&table_name.as_str()) {
        return Err(format!("الجدول غير مسموح بتصديره: {}", table_name));
    }
    
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    
    let query = format!("SELECT * FROM {}", table_name);
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let col_count = stmt.column_count();
    let col_names: Vec<String> = (0..col_count).map(|i| stmt.column_name(i).unwrap_or("unknown").to_string()).collect();
    
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let default_filename = format!("{}_{}.csv", table_name, timestamp);

    let csv_path = if let Some(p) = custom_save_path.filter(|s| !s.trim().is_empty()) {
        PathBuf::from(p)
    } else {
        match rfd::FileDialog::new()
            .set_file_name(&default_filename)
            .add_filter("ملف CSV (*.csv)", &["csv"])
            .save_file()
        {
            Some(p) => p,
            None => return Err("CANCELLED".to_string()),
        }
    };

    if let Some(parent) = csv_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    // Write BOM for Excel Arabic support
    let mut file = File::create(&csv_path).map_err(|e| e.to_string())?;
    file.write_all(b"\xEF\xBB\xBF").map_err(|e| e.to_string())?;
    
    // Header (using semicolon for Arabic Excel compatibility)
    let header = col_names.join(";");
    file.write_all(header.as_bytes()).map_err(|e| e.to_string())?;
    file.write_all(b"\n").map_err(|e| e.to_string())?;
    
    // Rows
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut values: Vec<String> = Vec::new();
        for i in 0..col_count {
            let val: String = row.get::<_, rusqlite::types::Value>(i)
                .map(|v| match v {
                    rusqlite::types::Value::Null => String::new(),
                    rusqlite::types::Value::Integer(n) => n.to_string(),
                    rusqlite::types::Value::Real(f) => f.to_string(),
                    rusqlite::types::Value::Text(s) => format!("\"{}\"" , s.replace('"', "\"\"")),
                    rusqlite::types::Value::Blob(_) => "[BLOB]".to_string(),
                })
                .unwrap_or_default();
            values.push(val);
        }
        let line = values.join(";");
        file.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
        file.write_all(b"\n").map_err(|e| e.to_string())?;
    }
    
    // Open folder
    std::process::Command::new("explorer")
        .arg("/select,")
        .arg(&csv_path)
        .spawn()
        .ok();
    
    Ok(csv_path.to_string_lossy().into_owned())
}

/// 7. Export multiple tables to a single Excel file (one sheet per table)
#[tauri::command]
pub async fn export_to_excel(
    state: State<'_, AppState>,
    table_names: Vec<String>,
    custom_save_path: Option<String>,
) -> std::result::Result<String, String> {
    use rust_xlsxwriter::Workbook;
    
    let allowed_tables = vec![
        "detailed_drug_dispensed", "drug_groups", "insulin_dispensed",
        "judicial_dispensed", "medical_tickets", "monthly_drugs_dispensed",
        "monthly_supplies_dispensed", "drugs", "supplies",
        "branches", "areas", "clinics", "drug_categories",
        "insulin_codes", "insulin_types", "insulin_categories",
        "drug_units", "drug_group_codes", "insulin_units",
        "supply_categories", "judicial_patients", "judicial_medicines",
        "judicial_patient_medicines", "patient_pdfs",
        "users", "audit_log", "dispensing_month_isolation", "manual_locked_months",
        "scheduled_reports", "scheduled_report_history",
    ];
    
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let default_filename = format!("Export_{}.xlsx", timestamp);

    let excel_path = if let Some(p) = custom_save_path.filter(|s| !s.trim().is_empty()) {
        PathBuf::from(p)
    } else {
        match rfd::FileDialog::new()
            .set_file_name(&default_filename)
            .add_filter("ملف Excel (*.xlsx)", &["xlsx"])
            .save_file()
        {
            Some(p) => p,
            None => return Err("CANCELLED".to_string()),
        }
    };

    if let Some(parent) = excel_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    let mut workbook = Workbook::new();
    let mut exported_count = 0;
    
    for table_name in table_names {
        if !allowed_tables.contains(&table_name.as_str()) {
            continue;
        }
        
        let worksheet = workbook.add_worksheet();
        worksheet.set_name(&table_name).map_err(|e| e.to_string())?;
        
        let query = format!("SELECT * FROM {}", table_name);
        let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
        let col_count = stmt.column_count();
        let col_names: Vec<String> = (0..col_count).map(|i| stmt.column_name(i).unwrap_or("unknown").to_string()).collect();
        
        // Write header
        for (col_idx, name) in col_names.iter().enumerate() {
            worksheet.write_string(0, col_idx as u16, name).map_err(|e| e.to_string())?;
        }
        
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        let mut row_idx: u32 = 1;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            for col_idx in 0..col_count {
                let val: rusqlite::types::Value = row.get(col_idx).unwrap_or(rusqlite::types::Value::Null);
                match val {
                    rusqlite::types::Value::Null => {},
                    rusqlite::types::Value::Integer(n) => { worksheet.write_number(row_idx, col_idx as u16, n as f64).map_err(|e| e.to_string())?; },
                    rusqlite::types::Value::Real(f) => { worksheet.write_number(row_idx, col_idx as u16, f).map_err(|e| e.to_string())?; },
                    rusqlite::types::Value::Text(s) => { worksheet.write_string(row_idx, col_idx as u16, &s).map_err(|e| e.to_string())?; },
                    rusqlite::types::Value::Blob(_) => { worksheet.write_string(row_idx, col_idx as u16, "[BLOB]").map_err(|e| e.to_string())?; },
                }
            }
            row_idx += 1;
        }
        exported_count += 1;
    }
    
    if exported_count == 0 {
        return Err("لم يتم العثور على جداول صالحة للتصدير".to_string());
    }
    
    workbook.save(&excel_path).map_err(|e| e.to_string())?;
    
    // Open folder
    std::process::Command::new("explorer")
        .arg("/select,")
        .arg(&excel_path)
        .spawn()
        .ok();
    Ok(excel_path.to_string_lossy().into_owned())
}

/// Auto-backup: create a timestamped backup next to the database
/// with rotation (keeps last N auto-backups, default 20).
/// Call this before any critical data-modifying operation.
#[tauri::command]
pub async fn auto_backup(
    max_backups: Option<u32>,
) -> std::result::Result<String, String> {
    let max = max_backups.unwrap_or(20);
    let db_path = get_portable_db_path()?;

    // Backup directory = next to the DB file
    let backups_dir = db_path
        .parent()
        .ok_or("Cannot determine database directory")?
        .join("backups");
    std::fs::create_dir_all(&backups_dir)
        .map_err(|e| format!("Failed to create backups directory: {}", e))?;

    // Create timestamped backup
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("medicine_dispenser_auto_{}.zip", timestamp);
    let zip_path = backups_dir.join(&filename);

    zip_db(&db_path, &zip_path, "medicine_dispenser.db")?;

    // Rotation: collect auto-backups, sort oldest-first, delete excess
    let mut auto_backups: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&backups_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with("medicine_dispenser_auto_") && name.ends_with(".zip") {
                if let Ok(meta) = entry.metadata() {
                    if let Ok(modified) = meta.modified() {
                        auto_backups.push((entry.path(), modified));
                    }
                }
            }
        }
    }

    auto_backups.sort_by(|a, b| a.1.cmp(&b.1)); // oldest first
    while auto_backups.len() > max as usize {
        if let Some((old_path, _)) = auto_backups.first() {
            std::fs::remove_file(old_path).ok();
        }
        auto_backups.remove(0);
    }

    println!("[auto_backup] created: {} ({} backups kept)", filename, auto_backups.len().min(max as usize));
    Ok(filename)
}

/// Show native Save File Dialog and return chosen file path
#[tauri::command]
pub async fn show_save_dialog(
    default_name: String,
    extension_name: String,
    extension: String,
) -> std::result::Result<Option<String>, String> {
    let path = rfd::FileDialog::new()
        .set_file_name(&default_name)
        .add_filter(&extension_name, &[&extension])
        .save_file();
    Ok(path.map(|p| p.to_string_lossy().into_owned()))
}

/// Write binary contents to a file path and open Explorer highlighting it
#[tauri::command]
pub async fn write_binary_file(path: String, contents: Vec<u8>) -> std::result::Result<(), String> {
    let file_path = Path::new(&path);
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(file_path, contents).map_err(|e| format!("فشل في حفظ الملف: {}", e))?;

    std::process::Command::new("explorer")
        .arg("/select,")
        .arg(file_path)
        .spawn()
        .ok();

    Ok(())
}

/// Delete a file from disk (used when a scheduled report is cancelled after
/// the PDF was already written, or to clean up stray outputs).
#[tauri::command]
pub async fn delete_file(path: String) -> std::result::Result<(), String> {
    let file_path = Path::new(&path);
    if file_path.exists() {
        std::fs::remove_file(file_path).map_err(|e| format!("فشل في حذف الملف: {}", e))?;
    }
    Ok(())
}

/// Open a native folder picker and return the chosen folder path.
/// Returns None when the user cancels.
#[tauri::command]
pub async fn pick_folder() -> std::result::Result<Option<String>, String> {
    let path = rfd::FileDialog::new()
        .set_title("اختر مجلد الإخراج")
        .pick_folder();
    Ok(path.map(|p| p.to_string_lossy().into_owned()))
}

