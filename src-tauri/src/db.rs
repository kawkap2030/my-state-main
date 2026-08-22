use rusqlite::{Connection, Result};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct AppState {
    pub db: Mutex<Option<Connection>>,
    /// Non-None when the database failed its integrity/health gate.
    /// Set at startup (and cleared on successful restore) so the frontend
    /// can surface a visible, persistent message instead of console-only logs.
    pub db_error: Mutex<Option<String>>,
    pub current_user_id: Mutex<Option<i32>>,
}

pub fn init_db(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // ═══ Portable database storage ═══
    let db_path = if cfg!(debug_assertions) {
        let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let project_root = manifest_dir.parent().unwrap_or(manifest_dir);
        project_root.join("medicine_dispenser.db")
    } else {
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("Failed to get executable path: {}", e))?;
        let exe_dir = exe_path
            .parent()
            .ok_or("Cannot determine executable directory")?;
        exe_dir.join("medicine_dispenser.db")
    };

    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // ── Migrate from old app_data_dir location if it exists ──
    if let Ok(old_app_data) = app.path().app_data_dir() {
        let old_db = old_app_data.join("medicine_dispenser.db");
        if old_db.exists() && !db_path.exists() {
            println!("[db] migrating database from old location: {:?} → {:?}", old_db, db_path);
            if let Err(e) = std::fs::copy(&old_db, &db_path) {
                eprintln!("[db] warning: failed to migrate old database: {}", e);
            }
        }
    }

    // Open connection — NEVER silently create a replacement database.
    // If opening the existing file fails, record the error (frontend shows it)
    // and let the caller decide; no new empty DB is created as a fallback.
    let conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => {
            let msg = format!(
                "تعذر فتح قاعدة البيانات الحالية. لم يتم إنشاء قاعدة بيانات جديدة حفاظًا على بياناتك."
            );
            eprintln!("[db] {}", msg);
            eprintln!("[db] open error: {}", e);
            let state = app.state::<AppState>();
            match state.db_error.lock() {
                Ok(mut err_lock) => { *err_lock = Some(msg); }
                Err(poisoned) => { *poisoned.into_inner() = Some(msg); }
            };
            return Err(Box::new(e));
        }
    };

    // Enable WAL mode and busy timeout for concurrent access and stability
    let _ = conn.execute("PRAGMA journal_mode = WAL", []);
    let _ = conn.execute("PRAGMA busy_timeout = 5000", []);
    let _ = conn.execute("PRAGMA synchronous = NORMAL", []);
    let _ = conn.execute("PRAGMA foreign_keys = ON", []);

    // ── Health gate — runs on EVERY launch (not only pre-migration) ────
    // quick_check is fast (~ms) and catches structural corruption. On
    // failure we enter READ-ONLY mode so no write can damage data further,
    // surface the error in the UI, and skip all migrations.
    let quick_check: String = conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .unwrap_or_else(|_| "check-failed".to_string());
    if quick_check != "ok" {
        let msg = "تعذر التحقق من سلامة قاعدة البيانات. تم إيقاف العمليات التي قد تؤثر على البيانات حفاظًا عليها. لم يتم إنشاء قاعدة بيانات جديدة أو حذف البيانات الحالية.".to_string();
        eprintln!("[db] QUICK_CHECK FAILED ({}) — enabling read-only mode to preserve data.", quick_check);
        let _ = conn.execute("PRAGMA query_only = ON", []);
        {
            let state = app.state::<AppState>();
            match state.db_error.lock() {
                Ok(mut err_lock) => { *err_lock = Some(msg); }
                Err(poisoned) => { *poisoned.into_inner() = Some(msg); }
            };
        }
        // Store the (read-only) connection so reads still work
        {
            let state = app.state::<AppState>();
            match state.db.lock() {
                Ok(mut db_lock) => { *db_lock = Some(conn); }
                Err(poisoned) => { *poisoned.into_inner() = Some(conn); }
            };
        }
        return Ok(());
    }

    // ── Schema Versioning Optimization ──────────────────────────────
    // Check if database schema and migrations have already been applied.
    // Skip heavy table info checks, table recreations, and foreign_key_check
    // on subsequent launches to achieve near-instant (< 2ms) startup.
    let current_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0)).unwrap_or(0);
    const TARGET_SCHEMA_VERSION: i32 = 2;

    if current_version < TARGET_SCHEMA_VERSION {
        println!("[db] applying schema & migrations (user_version {} -> {})...", current_version, TARGET_SCHEMA_VERSION);

        // ── Pre-migration safety (audit §17/§19) ──────────────────────
        // 1. Verify integrity BEFORE touching anything; on failure STOP
        //    migrations — never alter a possibly-corrupt database.
        let integrity: String = conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .unwrap_or_else(|_| "check-failed".to_string());
        if integrity != "ok" {
            // Same behavior as the every-launch quick_check gate: enter
            // read-only mode, surface the error in the UI, skip migrations.
            let msg = "تعذر التحقق من سلامة قاعدة البيانات. تم إيقاف العمليات التي قد تؤثر على البيانات حفاظًا عليها. لم يتم إنشاء قاعدة بيانات جديدة أو حذف البيانات الحالية.".to_string();
            eprintln!("[db] INTEGRITY CHECK FAILED ({}) — SKIPPING migrations to preserve data.", integrity);
            eprintln!("[db] Database left untouched. Please restore from a backup.");
            let _ = conn.execute("PRAGMA query_only = ON", []);
            {
                let state = app.state::<AppState>();
                match state.db_error.lock() {
                    Ok(mut err_lock) => { *err_lock = Some(msg); }
                    Err(poisoned) => { *poisoned.into_inner() = Some(msg); }
                };
            }
            {
                let state = app.state::<AppState>();
                match state.db.lock() {
                    Ok(mut db_lock) => { *db_lock = Some(conn); }
                    Err(poisoned) => { *poisoned.into_inner() = Some(conn); }
                };
            }
            return Ok(());
        }

        // 2. Create a timestamped backup copy before any migration.
        // Uses SQLite's online backup API so the snapshot is CONSISTENT even
        // in WAL mode (a plain fs::copy can miss un-checkpointed WAL data).
        if let Some(backups_dir) = db_path.parent().map(|p| p.join("backups")) {
            if !backups_dir.exists() {
                let _ = std::fs::create_dir_all(&backups_dir);
            }
            let ts = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
            let backup_file = backups_dir.join(format!("medicine_dispenser_pre_migration_{}.db", ts));
            // NON-FATAL: a backup failure must never block opening the DB.
            match Connection::open(&backup_file) {
                Ok(mut backup_conn) => {
                    match rusqlite::backup::Backup::new(&conn, &mut backup_conn)
                        .and_then(|b| b.run_to_completion(32, std::time::Duration::from_millis(0), None))
                    {
                        Ok(_) => println!("[db] pre-migration backup created: {:?}", backup_file),
                        Err(e) => eprintln!("[db] warning: pre-migration backup failed: {}", e),
                    }
                }
                Err(e) => eprintln!("[db] warning: pre-migration backup failed: {}", e),
            }
        }

        let _ = conn.execute("PRAGMA foreign_keys = OFF", []);

        // Execute Schema
        let schema = include_str!("../../schema.sql");
        conn.execute_batch(schema)?;

    // ── Seed Default Data (non-fatal) ────────────────────────────────
    // A default branch is seeded because dispensing rows require a
    // branch_id. Drug categories are NOT auto-seeded: they are reference
    // data created by the user via the Drugs Management screen, and no
    // system functionality depends on pre-existing category names.
    let branches_count: i32 = conn.query_row("SELECT COUNT(*) FROM branches", [], |row| row.get(0)).unwrap_or(0);
    if branches_count == 0 {
        let _ = conn.execute("INSERT INTO branches (name) VALUES ('الفرع الرئيسي')", []);
    }

    // First run: NO default admin is seeded here. The users table starts
    // EMPTY so the frontend shows the First-Run Setup screen and the
    // administrator creates their own username + password (hashed via
    // Argon2id). There is no hard-coded default credential anywhere.

    // ═══ MIGRATIONS (all non-fatal — log errors, never abort) ═════════

    // Insulin ADD COLUMN migrations
    let _ = conn.execute("ALTER TABLE insulin_codes ADD COLUMN type_id INTEGER NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE insulin_codes ADD COLUMN unit_id INTEGER NOT NULL DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE insulin_dispensed ADD COLUMN insulin_code_id INTEGER", []);

    // insulin_codes: remove problematic 'code' column
    {
        let table_info: Result<Vec<String>, _> = conn
            .prepare("PRAGMA table_info(insulin_codes)")
            .and_then(|mut stmt| stmt.query_map([], |row| row.get(1))?.collect());
        if let Ok(columns) = table_info {
            if columns.contains(&"code".to_string()) {
                println!("[db] Migrating insulin_codes to remove 'code' column...");
                if let Err(e) = conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE insulin_codes_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        type_id INTEGER NOT NULL DEFAULT 0,
                        unit_id INTEGER NOT NULL DEFAULT 0,
                        description TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                    INSERT INTO insulin_codes_new (id, name, type_id, unit_id, description, created_at)
                    SELECT id, name, type_id, unit_id, description, created_at FROM insulin_codes;
                    DROP TABLE insulin_codes;
                    ALTER TABLE insulin_codes_new RENAME TO insulin_codes;
                    COMMIT;
                ") {
                    let _ = conn.execute("ROLLBACK", []);
                    eprintln!("[db] migration insulin_codes failed (non-fatal): {}", e);
                }
            }
        }
    }

    // judicial_patients: make clinic_id/area_id nullable
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(judicial_patients)")
            .and_then(|mut stmt| stmt.query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?))
            })?.collect());
        if let Ok(columns) = table_info {
            let clinic_notnull = columns.iter().any(|(n, nn)| n == "clinic_id" && *nn);
            let area_notnull = columns.iter().any(|(n, nn)| n == "area_id" && *nn);
            if clinic_notnull || area_notnull {
                println!("[db] Migrating judicial_patients nullable...");
                if let Err(e) = conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE judicial_patients_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, diagnosis TEXT,
                        court_ruling_date DATE NOT NULL, treatment_start_date DATE NOT NULL,
                        clinic_id INTEGER, area_id INTEGER, pdf_path TEXT, pdf_data TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE,
                        FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE
                    );
                    INSERT INTO judicial_patients_new (id, name, diagnosis, court_ruling_date, treatment_start_date, clinic_id, area_id, pdf_path, pdf_data, created_at)
                    SELECT id, name, diagnosis, court_ruling_date, treatment_start_date, clinic_id, area_id, pdf_path, pdf_data, created_at FROM judicial_patients;
                    DROP TABLE judicial_patients;
                    ALTER TABLE judicial_patients_new RENAME TO judicial_patients;
                    COMMIT;
                ") {
                    let _ = conn.execute("ROLLBACK", []);
                    eprintln!("[db] migration judicial_patients failed (non-fatal): {}", e);
                }
            }
        }
    }

    // detailed_drug_dispensed: make area_id/clinic_id nullable
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(detailed_drug_dispensed)")
            .and_then(|mut stmt| stmt.query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?))
            })?.collect());
        if let Ok(columns) = table_info {
            let area_notnull = columns.iter().any(|(n, nn)| n == "area_id" && *nn);
            let clinic_notnull = columns.iter().any(|(n, nn)| n == "clinic_id" && *nn);
            if area_notnull || clinic_notnull {
                println!("[db] Migrating detailed_drug_dispensed nullable...");
                if let Err(e) = conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE detailed_drug_dispensed_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, branch_id INTEGER NOT NULL,
                        area_id INTEGER, clinic_id INTEGER, dispense_month TEXT NOT NULL,
                        drug_id INTEGER NOT NULL, quantity REAL NOT NULL,
                        cases_count INTEGER NOT NULL DEFAULT 0, unit_price REAL NOT NULL DEFAULT 0,
                        total_cost REAL NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE,
                        FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE,
                        FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE,
                        FOREIGN KEY (drug_id) REFERENCES drugs (id) ON DELETE CASCADE
                    );
                    INSERT INTO detailed_drug_dispensed_new (id, branch_id, area_id, clinic_id, dispense_month, drug_id, quantity, cases_count, unit_price, total_cost, created_at)
                    SELECT id, branch_id, area_id, clinic_id, dispense_month, drug_id, quantity, cases_count, unit_price, total_cost, created_at FROM detailed_drug_dispensed;
                    DROP TABLE detailed_drug_dispensed;
                    ALTER TABLE detailed_drug_dispensed_new RENAME TO detailed_drug_dispensed;
                    COMMIT;
                ") {
                    let _ = conn.execute("ROLLBACK", []);
                    eprintln!("[db] migration detailed_drug_dispensed failed (non-fatal): {}", e);
                }
            }
        }
    }

    // insulin_dispensed: support hierarchy
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(insulin_dispensed)")
            .and_then(|mut stmt| stmt.query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?))
            })?.collect());
        if let Ok(columns) = table_info {
            let has_branch = columns.iter().any(|(n, _)| n == "branch_id");
            let area_notnull = columns.iter().any(|(n, nn)| n == "area_id" && *nn);
            let clinic_notnull = columns.iter().any(|(n, nn)| n == "clinic_id" && *nn);
            if !has_branch || area_notnull || clinic_notnull {
                println!("[db] Migrating insulin_dispensed hierarchy...");
                if let Err(e) = conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE insulin_dispensed_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
                        unit TEXT NOT NULL, cases_count INTEGER NOT NULL, quantity REAL NOT NULL,
                        price REAL NOT NULL, cost REAL NOT NULL, rate REAL NOT NULL, balance REAL NOT NULL,
                        category TEXT NOT NULL, branch_id INTEGER NOT NULL DEFAULT 1,
                        area_id INTEGER, clinic_id INTEGER, dispense_month DATE NOT NULL,
                        insulin_code_id INTEGER,
                        FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE,
                        FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE,
                        FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE,
                        FOREIGN KEY (insulin_code_id) REFERENCES insulin_codes (id) ON DELETE SET NULL
                    );
                    INSERT INTO insulin_dispensed_new (id, name, type, unit, cases_count, quantity, price, cost, rate, balance, category, branch_id, area_id, clinic_id, dispense_month, insulin_code_id)
                    SELECT id, name, type, unit, cases_count, quantity, price, cost, rate, balance, category, COALESCE(branch_id, 1), area_id, clinic_id, dispense_month, insulin_code_id FROM insulin_dispensed;
                    DROP TABLE insulin_dispensed;
                    ALTER TABLE insulin_dispensed_new RENAME TO insulin_dispensed;
                    COMMIT;
                ") {
                    let _ = conn.execute("ROLLBACK", []);
                    eprintln!("[db] migration insulin_dispensed failed (non-fatal): {}", e);
                }
            }
        }
    }

    // patient_pdfs
    if let Err(e) = conn.execute_batch("
        CREATE TABLE IF NOT EXISTS patient_pdfs (
            id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER NOT NULL,
            file_name TEXT NOT NULL, pdf_data TEXT NOT NULL,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES judicial_patients (id) ON DELETE CASCADE
        );
        INSERT INTO patient_pdfs (patient_id, file_name, pdf_data)
        SELECT id, pdf_path, pdf_data FROM judicial_patients
        WHERE pdf_path IS NOT NULL AND pdf_data IS NOT NULL AND id NOT IN (SELECT patient_id FROM patient_pdfs);
    ") {
        eprintln!("[db] migration patient_pdfs failed (non-fatal): {}", e);
    }

    // monthly_supplies_dispensed: category-level & nullable IDs
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(monthly_supplies_dispensed)")
            .and_then(|mut stmt| stmt.query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?))
            })?.collect());
        if let Ok(columns) = table_info {
            let has_category = columns.iter().any(|(n, _)| n == "category_id");
            let supply_notnull = columns.iter().any(|(n, nn)| n == "supply_id" && *nn);
            let clinic_notnull = columns.iter().any(|(n, nn)| n == "clinic_id" && *nn);
            let area_notnull = columns.iter().any(|(n, nn)| n == "area_id" && *nn);
            if !has_category || supply_notnull || clinic_notnull || area_notnull {
                println!("[db] Migrating monthly_supplies_dispensed...");
                if let Err(e) = conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE monthly_supplies_dispensed_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, clinic_id INTEGER, area_id INTEGER,
                        branch_id INTEGER NOT NULL, supply_id INTEGER, category_id INTEGER,
                        consumer_value REAL DEFAULT 0, collective_entities_value REAL DEFAULT 0,
                        dispense_month TEXT NOT NULL, notes TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE,
                        FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE,
                        FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE,
                        FOREIGN KEY (supply_id) REFERENCES supplies (id) ON DELETE CASCADE,
                        FOREIGN KEY (category_id) REFERENCES supply_categories (id) ON DELETE CASCADE
                    );
                    INSERT INTO monthly_supplies_dispensed_new (id, clinic_id, area_id, branch_id, supply_id, consumer_value, collective_entities_value, dispense_month, notes, created_at)
                    SELECT id, clinic_id, area_id, branch_id, supply_id, consumer_value, collective_entities_value, dispense_month, notes, created_at FROM monthly_supplies_dispensed;
                    DROP TABLE monthly_supplies_dispensed;
                    ALTER TABLE monthly_supplies_dispensed_new RENAME TO monthly_supplies_dispensed;
                    COMMIT;
                ") {
                    let _ = conn.execute("ROLLBACK", []);
                    eprintln!("[db] migration monthly_supplies_dispensed failed (non-fatal): {}", e);
                }
            }
        }
    }

    // dispensing_month_isolation
    let _ = conn.execute("CREATE TABLE IF NOT EXISTS dispensing_month_isolation (
        branch_id INTEGER NOT NULL, dispense_month TEXT NOT NULL,
        isolation_level TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (branch_id, dispense_month),
        FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE
    )", []);

    // manual_locked_months
    let _ = conn.execute("CREATE TABLE IF NOT EXISTS manual_locked_months (
        dispense_month TEXT PRIMARY KEY, is_locked BOOLEAN DEFAULT 1,
        locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )", []);

    // export_presets
    let _ = conn.execute("CREATE TABLE IF NOT EXISTS export_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, user_id INTEGER,
        scope TEXT NOT NULL DEFAULT 'private', orientation TEXT NOT NULL DEFAULT 'landscape',
        margin_preset TEXT NOT NULL DEFAULT 'standard', show_page_numbers INTEGER NOT NULL DEFAULT 1,
        show_signatures INTEGER NOT NULL DEFAULT 1, preparer_name TEXT NOT NULL DEFAULT '',
        manager_name TEXT NOT NULL DEFAULT '', approval_number TEXT NOT NULL DEFAULT '',
        is_default INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
    )", []);
    let _ = conn.execute("ALTER TABLE export_presets ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL", []);
    let _ = conn.execute("ALTER TABLE export_presets ADD COLUMN scope TEXT NOT NULL DEFAULT 'private'", []);
    let _ = conn.execute("UPDATE export_presets SET scope = 'public' WHERE user_id IS NULL AND scope = 'private'", []);
    let preset_count: i32 = conn.query_row("SELECT COUNT(*) FROM export_presets", [], |row| row.get(0)).unwrap_or(0);
    if preset_count == 0 {
        let _ = conn.execute("INSERT INTO export_presets (name, scope, orientation, margin_preset, show_page_numbers, show_signatures, is_default) VALUES ('الإعداد الافتراضي', 'public', 'landscape', 'standard', 1, 1, 1)", []);
    }

    // medical_tickets hierarchy
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(medical_tickets)")
            .and_then(|mut stmt| stmt.query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?))
            })?.collect());
        if let Ok(columns) = table_info {
            let clinic_notnull = columns.iter().any(|(n, nn)| n == "clinic_id" && *nn);
            let has_branch = columns.iter().any(|(n, _)| n == "branch_id");
            if clinic_notnull || !has_branch {
                println!("[db] Migrating medical_tickets hierarchy...");
                if let Err(e) = conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE medical_tickets_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, branch_id INTEGER, area_id INTEGER,
                        clinic_id INTEGER, category TEXT NOT NULL, period TEXT NOT NULL,
                        tickets_56c INTEGER DEFAULT 0, tickets_56b INTEGER DEFAULT 0,
                        is_supported_clinic BOOLEAN DEFAULT 0, week_number INTEGER,
                        dispense_month TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE,
                        FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE,
                        FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE
                    );
                    INSERT INTO medical_tickets_new (id, clinic_id, category, period, tickets_56c, tickets_56b, is_supported_clinic, dispense_month, created_at)
                    SELECT id, clinic_id, category, period, tickets_56c, tickets_56b, is_supported_clinic, dispense_month, created_at FROM medical_tickets;
                    DROP TABLE medical_tickets;
                    ALTER TABLE medical_tickets_new RENAME TO medical_tickets;
                    COMMIT;
                ") {
                    let _ = conn.execute("ROLLBACK", []);
                    eprintln!("[db] migration medical_tickets failed (non-fatal): {}", e);
                }
            }
        }
    }

    // drug_groups hierarchy
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(drug_groups)")
            .and_then(|mut stmt| stmt.query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?))
            })?.collect());
        if let Ok(columns) = table_info {
            let has_branch = columns.iter().any(|(n, _)| n == "branch_id");
            let clinic_notnull = columns.iter().any(|(n, nn)| n == "clinic_id" && *nn);
            if !has_branch || clinic_notnull {
                println!("[db] Migrating drug_groups hierarchy...");
                if let Err(e) = conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE drug_groups_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, cost REAL NOT NULL,
                        clinic_id INTEGER, area_id INTEGER, branch_id INTEGER,
                        dispense_month DATE NOT NULL, group_code_id INTEGER,
                        FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE,
                        FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE,
                        FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE,
                        FOREIGN KEY (group_code_id) REFERENCES drug_group_codes (id) ON DELETE SET NULL
                    );
                    INSERT INTO drug_groups_new (id, name, cost, clinic_id, area_id, dispense_month, group_code_id)
                    SELECT id, name, cost, clinic_id, area_id, dispense_month, group_code_id FROM drug_groups;
                    DROP TABLE drug_groups;
                    ALTER TABLE drug_groups_new RENAME TO drug_groups;
                    UPDATE drug_groups SET branch_id = (SELECT branch_id FROM areas WHERE areas.id = drug_groups.area_id) WHERE area_id IS NOT NULL AND branch_id IS NULL;
                    COMMIT;
                ") {
                    let _ = conn.execute("ROLLBACK", []);
                    eprintln!("[db] migration drug_groups failed (non-fatal): {}", e);
                }
            }
        }
    }

    // drug_group_codes: make 'code' nullable
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(drug_group_codes)")
            .and_then(|mut stmt| stmt.query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?))
            })?.collect());
        if let Ok(columns) = table_info {
            let code_notnull = columns.iter().any(|(n, nn)| n == "code" && *nn);
            if code_notnull {
                println!("[db] Migrating drug_group_codes nullable...");
                if let Err(e) = conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE drug_group_codes_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, code INTEGER,
                        name TEXT NOT NULL, description TEXT
                    );
                    INSERT INTO drug_group_codes_new (id, code, name, description)
                    SELECT id, code, name, description FROM drug_group_codes;
                    DROP TABLE drug_group_codes;
                    ALTER TABLE drug_group_codes_new RENAME TO drug_group_codes;
                    COMMIT;
                ") {
                    let _ = conn.execute("ROLLBACK", []);
                    eprintln!("[db] migration drug_group_codes failed (non-fatal): {}", e);
                }
            }
        }
    }
    let _ = conn.execute_batch("UPDATE drug_group_codes SET code = id WHERE code IS NULL; UPDATE drug_group_codes SET description = name WHERE description IS NULL OR trim(description) = '';");

    // monthly_drugs_dispensed nullable
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(monthly_drugs_dispensed)")
            .and_then(|mut stmt| stmt.query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?))
            })?.collect());
        if let Ok(columns) = table_info {
            let clinic_notnull = columns.iter().any(|(n, nn)| n == "clinic_id" && *nn);
            let area_notnull = columns.iter().any(|(n, nn)| n == "area_id" && *nn);
            if clinic_notnull || area_notnull {
                println!("[db] Migrating monthly_drugs_dispensed nullable...");
                if let Err(e) = conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE monthly_drugs_dispensed_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, clinic_id INTEGER, area_id INTEGER,
                        branch_id INTEGER NOT NULL, dispense_month TEXT NOT NULL,
                        drugs_free_authority REAL DEFAULT 0, drugs_free_students REAL DEFAULT 0,
                        drugs_free_infants REAL DEFAULT 0, drugs_free_breadwinner_women REAL DEFAULT 0,
                        drugs_supported_authority_value REAL DEFAULT 0, drugs_supported_authority_patient_share REAL DEFAULT 0,
                        drugs_supported_students_value REAL DEFAULT 0, drugs_supported_students_patient_share REAL DEFAULT 0,
                        drugs_supported_infants_value REAL DEFAULT 0, drugs_supported_infants_patient_share REAL DEFAULT 0,
                        notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE,
                        FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE,
                        FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE
                    );
                    INSERT INTO monthly_drugs_dispensed_new (
                        id, clinic_id, area_id, branch_id, dispense_month,
                        drugs_free_authority, drugs_free_students, drugs_free_infants, drugs_free_breadwinner_women,
                        drugs_supported_authority_value, drugs_supported_authority_patient_share,
                        drugs_supported_students_value, drugs_supported_students_patient_share,
                        drugs_supported_infants_value, drugs_supported_infants_patient_share, notes, created_at
                    )
                    SELECT id, clinic_id, area_id, branch_id, dispense_month,
                        drugs_free_authority, drugs_free_students, drugs_free_infants, drugs_free_breadwinner_women,
                        drugs_supported_authority_value, drugs_supported_authority_patient_share,
                        drugs_supported_students_value, drugs_supported_students_patient_share,
                        drugs_supported_infants_value, drugs_supported_infants_patient_share, notes, created_at
                    FROM monthly_drugs_dispensed;
                    DROP TABLE monthly_drugs_dispensed;
                    ALTER TABLE monthly_drugs_dispensed_new RENAME TO monthly_drugs_dispensed;
                    COMMIT;
                ") {
                    let _ = conn.execute("ROLLBACK", []);
                    eprintln!("[db] migration monthly_drugs_dispensed failed (non-fatal): {}", e);
                }
            }
        }
    }

    // judicial_dispensed hierarchy
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(judicial_dispensed)")
            .and_then(|mut stmt| stmt.query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?))
            })?.collect());
        if let Ok(columns) = table_info {
            let has_branch = columns.iter().any(|(n, _)| n == "branch_id");
            let clinic_notnull = columns.iter().any(|(n, nn)| n == "clinic_id" && *nn);
            let area_notnull = columns.iter().any(|(n, nn)| n == "area_id" && *nn);
            if !has_branch || clinic_notnull || area_notnull {
                println!("[db] Migrating judicial_dispensed hierarchy...");
                if let Err(e) = conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE judicial_dispensed_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id INTEGER NOT NULL,
                        diagnosis TEXT NOT NULL, medicine_name TEXT NOT NULL, unit TEXT NOT NULL,
                        unit_price REAL NOT NULL, monthly_dose REAL NOT NULL, monthly_cost REAL NOT NULL,
                        dispense_month TEXT NOT NULL, branch_id INTEGER, area_id INTEGER, clinic_id INTEGER,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (patient_id) REFERENCES judicial_patients (id) ON DELETE CASCADE,
                        FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE,
                        FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE,
                        FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE
                    );
                    INSERT INTO judicial_dispensed_new (id, patient_id, diagnosis, medicine_name, unit, unit_price, monthly_dose, monthly_cost, dispense_month, area_id, clinic_id, created_at)
                    SELECT id, patient_id, diagnosis, medicine_name, unit, unit_price, monthly_dose, monthly_cost, dispense_month, area_id, clinic_id, created_at FROM judicial_dispensed;
                    UPDATE judicial_dispensed_new SET branch_id = (SELECT branch_id FROM areas WHERE areas.id = judicial_dispensed_new.area_id) WHERE area_id IS NOT NULL;
                    UPDATE judicial_dispensed_new SET branch_id = (SELECT branch_id FROM areas a JOIN clinics c ON c.area_id = a.id WHERE c.id = judicial_dispensed_new.clinic_id) WHERE clinic_id IS NOT NULL AND branch_id IS NULL;
                    DROP TABLE judicial_dispensed;
                    ALTER TABLE judicial_dispensed_new RENAME TO judicial_dispensed;
                    COMMIT;
                ") {
                    let _ = conn.execute("ROLLBACK", []);
                    eprintln!("[db] migration judicial_dispensed failed (non-fatal): {}", e);
                }
            }
        }
    }

    // entry_date for medical_tickets
    let _ = conn.execute("ALTER TABLE medical_tickets ADD COLUMN entry_date TEXT", []);

    // Re-enable foreign keys and update version
    let _ = conn.execute("PRAGMA foreign_keys = ON", []);
    let _ = conn.execute("PRAGMA foreign_key_check", []);
    let _ = conn.execute(&format!("PRAGMA user_version = {}", TARGET_SCHEMA_VERSION), []);
    println!("[db] All migrations completed. Set PRAGMA user_version = {}", TARGET_SCHEMA_VERSION);
    } else {
        println!("[db] Schema up to date (user_version {}), skipping migrations", current_version);
    }

    // Runs on EVERY launch (outside the version-gated block):
    // ── scheduled_reports tables + day-range columns ────────────────────
    // Moved OUT of the version-gated migration block so databases already at
    // user_version >= 1 (created before the day-range feature) still get the
    // CREATE TABLE and ALTER applied on startup. Every statement below is
    // idempotent: CREATE TABLE IF NOT EXISTS, and ALTERs whose errors are
    // ignored when the column already exists.
    if let Err(e) = conn.execute_batch("
        CREATE TABLE IF NOT EXISTS scheduled_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
            report_type TEXT NOT NULL DEFAULT 'analytical', schedule_type TEXT NOT NULL DEFAULT 'monthly',
            day_from INTEGER NOT NULL DEFAULT 1, day_to INTEGER NOT NULL DEFAULT 28,
            output_folder TEXT NOT NULL DEFAULT '',
            branch_id INTEGER, area_id INTEGER, clinic_id INTEGER,
            is_active INTEGER NOT NULL DEFAULT 1, last_generated TEXT, next_run TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
            FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE SET NULL,
            FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS scheduled_report_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER NOT NULL,
            report_name TEXT NOT NULL, file_path TEXT NOT NULL DEFAULT '',
            file_size REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'running',
            error_message TEXT, generated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (schedule_id) REFERENCES scheduled_reports(id) ON DELETE CASCADE
        );
    ") {
        eprintln!("[db] migration scheduled_reports failed (non-fatal): {}", e);
    }
    // Add the day-range columns (idempotent — duplicate-column errors ignored).
    let _ = conn.execute("ALTER TABLE scheduled_reports ADD COLUMN day_from INTEGER NOT NULL DEFAULT 1", []);
    let _ = conn.execute("ALTER TABLE scheduled_reports ADD COLUMN day_to INTEGER NOT NULL DEFAULT 28", []);
    let sched_count: i32 = conn.query_row("SELECT COUNT(*) FROM scheduled_reports", [], |row| row.get(0)).unwrap_or(0);
    if sched_count == 0 {
        // output_folder intentionally EMPTY → resolved at runtime to the
        // user's Documents\DrugStats\Reports (never a hard-coded drive).
        let _ = conn.execute("INSERT INTO scheduled_reports (name, report_type, schedule_type, day_from, day_to, output_folder, is_active, next_run) VALUES ('التقرير التحليلي الشهري', 'analytical', 'monthly', 1, 28, '', 1, '2026-09-01')", []);
    }
    // Audit §11: normalize ONLY the known legacy hard-coded default
    // ('C:\Reports') — a user-selected folder on C: is never touched.
    let _ = conn.execute(
        "UPDATE scheduled_reports SET output_folder = '' WHERE output_folder = 'C:\\Reports' OR output_folder = 'C:/Reports' OR output_folder = 'c:\\reports'",
        [],
    );

    // ── users.recovery_hash (password recovery) ───────────────────────
    // Idempotent, data-preserving: adds the column only when missing so
    // EXISTING databases (already at user_version = 2) receive it too.
    // The column stores ONLY the Argon2id hash of the one-time recovery
    // code — never the plain text code.
    {
        let has_recovery: Result<Vec<String>, _> = conn
            .prepare("PRAGMA table_info(users)")
            .and_then(|mut stmt| stmt.query_map([], |row| row.get(1))?.collect());
        if let Ok(cols) = has_recovery {
            if !cols.iter().any(|c| c == "recovery_hash") {
                if let Err(e) = conn.execute("ALTER TABLE users ADD COLUMN recovery_hash TEXT", []) {
                    eprintln!("[db] warning: failed to add users.recovery_hash (non-fatal): {}", e);
                } else {
                    println!("[db] added users.recovery_hash column");
                }
            }
        }
    }

    // ── Stale 'running' history cleanup ─────────────────────────────────
    // Rows left behind when the app was closed while a preview/save was in
    // flight are marked cancelled so they never linger forever.
    let _ = conn.execute(
        "UPDATE scheduled_report_history SET status = 'cancelled', error_message = 'أُلغي تلقائياً (إغلاق التطبيق أثناء المعاينة)' WHERE status = 'running'",
        [],
    );

    if let Ok(path) = std::fs::canonicalize(&db_path) {
        println!("[db] Database initialized at: {:?}", path);
    } else {
        println!("[db] Database initialized at: {:?}", db_path);
    }
    println!("[db] all migrations finished");

    // Final update of the stored connection (same conn, just ensures it's the latest)
    {
        let state = app.state::<AppState>();
        match state.db.lock() {
            Ok(mut db_lock) => { *db_lock = Some(conn); }
            Err(poisoned) => { *poisoned.into_inner() = Some(conn); }
        };
    }
    println!("[db] connection stored successfully");

    Ok(())
}
