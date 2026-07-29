use rusqlite::{Connection, Result};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct AppState {
    pub db: Mutex<Option<Connection>>,
}

pub fn init_db(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // ═══ Portable database storage ═══
    // The DB must live OUTSIDE src-tauri/ to avoid Tauri's file watcher
    // triggering infinite reloads when SQLite creates WAL/SHM files.
    //
    // Strategy (portable across devices):
    //   - Development (debug): store at the PROJECT ROOT (parent of
    //     CARGO_MANIFEST_DIR aka src-tauri/).  This keeps data alongside
    //     the source and avoids the watcher loop.
    //   - Production  (release): store NEXT TO THE EXECUTABLE so the
    //     whole app folder can be copied to another machine — data
    //     travels with the program.
    let db_path = if cfg!(debug_assertions) {
        // CARGO_MANIFEST_DIR = <project>/src-tauri/  →  parent = project root
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

    // Ensure the directory for the DB file exists
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // ── Migrate from old app_data_dir location if it exists ──
    if let Ok(old_app_data) = app.path().app_data_dir() {
        let old_db = old_app_data.join("medicine_dispenser.db");
        if old_db.exists() && !db_path.exists() {
            println!(
                "[db] migrating database from old location: {:?} → {:?}",
                old_db, db_path
            );
            if let Err(e) = std::fs::copy(&old_db, &db_path) {
                eprintln!("[db] warning: failed to migrate old database: {}", e);
            }
        }
    }

    // Open connection
    let conn = Connection::open(&db_path)?;

    // Enable WAL mode and busy timeout for concurrent access and stability
    let _ = conn.execute("PRAGMA journal_mode = WAL", []);
    let _ = conn.execute("PRAGMA busy_timeout = 5000", []);
    let _ = conn.execute("PRAGMA synchronous = NORMAL", []);

    // Disable foreign keys temporarily during schema setup and table migrations
    let _ = conn.execute("PRAGMA foreign_keys = OFF", []);

    // Execute Schema - Hardcoded approach or reading from relative file
    // For reliability in Portable mode, we use the schema defined in our project
    let schema = include_str!("../../schema.sql");
    conn.execute_batch(schema)?;

    // --- Seed Default Data only if tables are empty ---
    let branches_count: i32 = conn.query_row("SELECT COUNT(*) FROM branches", [], |row| row.get(0))?;
    if branches_count == 0 {
        let _ = conn.execute("INSERT INTO branches (name) VALUES ('الفرع الرئيسي')", []);
    }

    let drug_cats_count: i32 = conn.query_row("SELECT COUNT(*) FROM drug_categories", [], |row| row.get(0))?;
    if drug_cats_count == 0 {
        let _ = conn.execute("INSERT INTO drug_categories (name) VALUES 
            ('مضادات حيوية'), ('مسكنات'), ('أدوية القلب'), ('أدوية السكري'), ('أدوية الضغط')", []);
    }

    let users_count: i32 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0)).unwrap_or(0);
    if users_count == 0 {
        // Default admin: username 'admin', password '123456' (hashed or plaintext for now, let's use a dummy hash or plain for simplicity since it's a local app, but better to use a simple string for now if no crypto is available, or just 'admin' as password)
        let _ = conn.execute("INSERT INTO users (username, password_hash, role) VALUES ('admin', 'admin', 'admin')", []);
    }

    // --- MIGRATIONS: Ensure new columns exist for Insulin Overhaul ---
    // 1. Try simple ADD COLUMN for new installations or partial updates
    let _ = conn.execute(
        "ALTER TABLE insulin_codes ADD COLUMN type_id INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE insulin_codes ADD COLUMN unit_id INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE insulin_dispensed ADD COLUMN insulin_code_id INTEGER",
        [],
    );

    // 2. Fix the "NOT NULL constraint failed: insulin_codes.code" issue
    // This happens because old DBs have 'code' as NOT NULL, and we don't send it anymore.
    // Check if 'code' column exists and is causing trouble.
    let table_info: Result<Vec<String>, _> = conn
        .prepare("PRAGMA table_info(insulin_codes)")?
        .query_map([], |row| row.get(1))?
        .collect();
    if let Ok(columns) = table_info {
        if columns.contains(&"code".to_string()) {
            println!("Migrating insulin_codes table to remove problematic 'code' column...");
            // We use a transaction to ensure data safety
            conn.execute_batch(
                "
                BEGIN TRANSACTION;
                -- 1. Create temporary table with new schema
                CREATE TABLE insulin_codes_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    type_id INTEGER NOT NULL DEFAULT 0,
                    unit_id INTEGER NOT NULL DEFAULT 0,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                -- 2. Copy data from old table (ignoring code)
                -- We try to preserve type_id and unit_id if they already existed
                INSERT INTO insulin_codes_new (id, name, type_id, unit_id, description, created_at)
                SELECT id, name, type_id, unit_id, description, created_at FROM insulin_codes;
                -- 3. Drop old table and rename new one
                DROP TABLE insulin_codes;
                ALTER TABLE insulin_codes_new RENAME TO insulin_codes;
                COMMIT;
            ",
            )
            .map_err(|e| {
                let _ = conn.execute("ROLLBACK", []);
                e.to_string()
            })?;
        }
    }
    // -----------------------------------------------------------------

    // --- MIGRATION: Add pdf_path column to judicial_patients ---
    let _ = conn.execute("ALTER TABLE judicial_patients ADD COLUMN pdf_path TEXT", []);
    // --- MIGRATION: Add pdf_data column to judicial_patients ---
    let _ = conn.execute("ALTER TABLE judicial_patients ADD COLUMN pdf_data TEXT", []);

    // --- MIGRATION: Make clinic_id and area_id nullable in judicial_patients ---
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(judicial_patients)")?
            .query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?)) // (name, notnull)
            })?
            .collect();
        if let Ok(columns) = table_info {
            let clinic_notnull = columns
                .iter()
                .any(|(name, notnull)| name == "clinic_id" && *notnull);
            let area_notnull = columns
                .iter()
                .any(|(name, notnull)| name == "area_id" && *notnull);
            if clinic_notnull || area_notnull {
                println!("Migrating judicial_patients to make clinic_id/area_id nullable...");
                conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE judicial_patients_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        diagnosis TEXT,
                        court_ruling_date DATE NOT NULL,
                        treatment_start_date DATE NOT NULL,
                        clinic_id INTEGER,
                        area_id INTEGER,
                        pdf_path TEXT,
                        pdf_data TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE,
                        FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE
                    );
                    INSERT INTO judicial_patients_new (id, name, diagnosis, court_ruling_date, treatment_start_date, clinic_id, area_id, pdf_path, pdf_data, created_at)
                    SELECT id, name, diagnosis, court_ruling_date, treatment_start_date, clinic_id, area_id, pdf_path, pdf_data, created_at FROM judicial_patients;
                    DROP TABLE judicial_patients;
                    ALTER TABLE judicial_patients_new RENAME TO judicial_patients;
                    COMMIT;
                ").map_err(|e| {
                    let _ = conn.execute("ROLLBACK", []);
                    e.to_string()
                })?;
            }
        }
    }

    // --- MIGRATION: Make area_id and clinic_id nullable in detailed_drug_dispensed ---
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(detailed_drug_dispensed)")?
            .query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?)) // (name, notnull)
            })?
            .collect();
        if let Ok(columns) = table_info {
            let area_notnull = columns
                .iter()
                .any(|(name, notnull)| name == "area_id" && *notnull);
            let clinic_notnull = columns
                .iter()
                .any(|(name, notnull)| name == "clinic_id" && *notnull);

            if area_notnull || clinic_notnull {
                println!("Migrating detailed_drug_dispensed to make area_id/clinic_id nullable...");
                conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE detailed_drug_dispensed_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        branch_id INTEGER NOT NULL,
                        area_id INTEGER,
                        clinic_id INTEGER,
                        dispense_month TEXT NOT NULL,
                        drug_id INTEGER NOT NULL,
                        quantity REAL NOT NULL,
                        cases_count INTEGER NOT NULL DEFAULT 0,
                        unit_price REAL NOT NULL DEFAULT 0,
                        total_cost REAL NOT NULL DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
                ").map_err(|e| {
                    let _ = conn.execute("ROLLBACK", []);
                    e.to_string()
                })?;
            }
        }
    }

    // --- MIGRATION: Support Hierarchy for insulin_dispensed ---
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(insulin_dispensed)")?
            .query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?)) // (name, notnull)
            })?
            .collect();
        if let Ok(columns) = table_info {
            let has_branch = columns.iter().any(|(name, _)| name == "branch_id");
            let area_notnull = columns
                .iter()
                .any(|(name, notnull)| name == "area_id" && *notnull);
            let clinic_notnull = columns
                .iter()
                .any(|(name, notnull)| name == "clinic_id" && *notnull);

            if !has_branch || area_notnull || clinic_notnull {
                println!("Migrating insulin_dispensed to support hierarchy and nullable IDs...");
                conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE insulin_dispensed_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        type TEXT NOT NULL,
                        unit TEXT NOT NULL,
                        cases_count INTEGER NOT NULL,
                        quantity REAL NOT NULL,
                        price REAL NOT NULL,
                        cost REAL NOT NULL,
                        rate REAL NOT NULL,
                        balance REAL NOT NULL,
                        category TEXT NOT NULL,
                        branch_id INTEGER NOT NULL DEFAULT 1,
                        area_id INTEGER,
                        clinic_id INTEGER,
                        dispense_month DATE NOT NULL,
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
                ").map_err(|e| {
                    let _ = conn.execute("ROLLBACK", []);
                    e.to_string()
                })?;
            }
        }
    }

    // --- MIGRATION: Create patient_pdfs and copy existing data ---
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS patient_pdfs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL,
            file_name TEXT NOT NULL,
            pdf_data TEXT NOT NULL,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES judicial_patients (id) ON DELETE CASCADE
        );
        -- Migrate any existing single PDFs from judicial_patients
        INSERT INTO patient_pdfs (patient_id, file_name, pdf_data)
        SELECT id, pdf_path, pdf_data 
        FROM judicial_patients 
        WHERE pdf_path IS NOT NULL AND pdf_data IS NOT NULL AND id NOT IN (SELECT patient_id FROM patient_pdfs);
    ")?;

    // --- MIGRATION: Overhaul monthly_supplies_dispensed to support category-level entries & nullable IDs ---
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(monthly_supplies_dispensed)")?
            .query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?)) // (name, notnull)
            })?
            .collect();
        if let Ok(columns) = table_info {
            let has_category = columns.iter().any(|(name, _)| name == "category_id");
            let supply_notnull = columns.iter().any(|(name, notnull)| name == "supply_id" && *notnull);
            let clinic_notnull = columns.iter().any(|(name, notnull)| name == "clinic_id" && *notnull);
            let area_notnull = columns.iter().any(|(name, notnull)| name == "area_id" && *notnull);

            if !has_category || supply_notnull || clinic_notnull || area_notnull {
                println!("Migrating monthly_supplies_dispensed to support category-level records and nullable IDs...");
                conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE monthly_supplies_dispensed_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        clinic_id INTEGER,
                        area_id INTEGER,
                        branch_id INTEGER NOT NULL,
                        supply_id INTEGER, -- Nullable now
                        category_id INTEGER, -- New column
                        consumer_value REAL DEFAULT 0,
                        collective_entities_value REAL DEFAULT 0,
                        dispense_month TEXT NOT NULL,
                        notes TEXT,
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
                ").map_err(|e| {
                    let _ = conn.execute("ROLLBACK", []);
                    e.to_string()
                })?;
            }
        }
    }

    if let Ok(path) = std::fs::canonicalize(&db_path) {
        println!("Database initialized at: {:?}", path);
    } else {
        println!("Database initialized at: {:?}", db_path);
    }
    println!("[db] post-init migrations starting...");

    let state = app.state::<AppState>();
    // --- MIGRATION: Add dispensing_month_isolation table for global level locking ---
    let _ = conn.execute("
        CREATE TABLE IF NOT EXISTS dispensing_month_isolation (
            branch_id INTEGER NOT NULL,
            dispense_month TEXT NOT NULL,
            isolation_level TEXT NOT NULL, -- 'branch', 'area', 'clinic'
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (branch_id, dispense_month),
            FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE
        )
    ", []);
    
    // --- MIGRATION: Add manual_locked_months table ---
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS manual_locked_months (
            dispense_month TEXT PRIMARY KEY,
            is_locked BOOLEAN DEFAULT 1,
            locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ", []);

    // --- MIGRATION: Add report_signatures table for digital signatures ---
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS report_signatures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            preparer_name TEXT NOT NULL DEFAULT '',
            manager_name TEXT NOT NULL DEFAULT '',
            approval_number TEXT NOT NULL DEFAULT '',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ", []);
    // Seed default empty row if table is empty
    let sig_count: i32 = conn.query_row("SELECT COUNT(*) FROM report_signatures", [], |row| row.get(0)).unwrap_or(0);
    if sig_count == 0 {
        let _ = conn.execute(
            "INSERT INTO report_signatures (preparer_name, manager_name, approval_number) VALUES ('', '', '')",
            [],
        );
    }
    println!("[db] report_signatures table ready");

    // --- MIGRATION: Add export_presets table for named preset bundles ---
    // --- MIGRATION: Add export_presets table for named preset bundles ---
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS export_presets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            user_id INTEGER,
            scope TEXT NOT NULL DEFAULT 'private',
            orientation TEXT NOT NULL DEFAULT 'landscape',
            margin_preset TEXT NOT NULL DEFAULT 'standard',
            show_page_numbers INTEGER NOT NULL DEFAULT 1,
            show_signatures INTEGER NOT NULL DEFAULT 1,
            preparer_name TEXT NOT NULL DEFAULT '',
            manager_name TEXT NOT NULL DEFAULT '',
            approval_number TEXT NOT NULL DEFAULT '',
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
        )
    ", []);
    // Add new columns if they don't exist (for DBs created before this migration)
    let _ = conn.execute("ALTER TABLE export_presets ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL", []);
    let _ = conn.execute("ALTER TABLE export_presets ADD COLUMN scope TEXT NOT NULL DEFAULT 'private'", []);
    // Fix orphaned presets from before migration (user_id=NULL → make them public so they remain visible)
    let _ = conn.execute("UPDATE export_presets SET scope = 'public' WHERE user_id IS NULL AND scope = 'private'", []);
    // Seed a default preset if table is empty
    let preset_count: i32 = conn.query_row("SELECT COUNT(*) FROM export_presets", [], |row| row.get(0)).unwrap_or(0);
    if preset_count == 0 {
        let _ = conn.execute(
            "INSERT INTO export_presets (name, scope, orientation, margin_preset, show_page_numbers, show_signatures, is_default)
             VALUES ('الإعداد الافتراضي', 'public', 'landscape', 'standard', 1, 1, 1)",
            [],
        );
    }
    println!("[db] export_presets table ready");

    // --- MIGRATION: Add scheduled_reports and scheduled_report_history tables ---
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS scheduled_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            report_type TEXT NOT NULL DEFAULT 'analytical',
            schedule_type TEXT NOT NULL DEFAULT 'monthly',
            day_of_month INTEGER NOT NULL DEFAULT 1,
            output_folder TEXT NOT NULL DEFAULT '',
            branch_id INTEGER,
            area_id INTEGER,
            clinic_id INTEGER,
            is_active INTEGER NOT NULL DEFAULT 1,
            last_generated TEXT,
            next_run TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
            FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE SET NULL,
            FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS scheduled_report_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schedule_id INTEGER NOT NULL,
            report_name TEXT NOT NULL,
            file_path TEXT NOT NULL DEFAULT '',
            file_size REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'running',
            error_message TEXT,
            generated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (schedule_id) REFERENCES scheduled_reports(id) ON DELETE CASCADE
        );
    ").map_err(|e| format!("Failed to create scheduled_reports tables: {}", e))?;
    println!("[db] scheduled_reports tables ready");

    // Seed a sample scheduled report if table is empty
    let sched_count: i32 = conn.query_row("SELECT COUNT(*) FROM scheduled_reports", [], |row| row.get(0)).unwrap_or(0);
    if sched_count == 0 {
        let _ = conn.execute(
            "INSERT INTO scheduled_reports (name, report_type, schedule_type, day_of_month, output_folder, is_active, next_run)
             VALUES ('التقرير التحليلي الشهري', 'analytical', 'monthly', 1, 'C:\\Reports', 0, '2026-08-01')",
            [],
        );
        println!("[db] seeded sample scheduled report");
    }

    // --- MIGRATIONS: medical_tickets overhaul (Stage 2) ---
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(medical_tickets)")?
            .query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?)) // (name, notnull)
            })?
            .collect();
        if let Ok(columns) = table_info {
            let clinic_notnull = columns
                .iter()
                .any(|(name, notnull)| name == "clinic_id" && *notnull);
            let has_branch = columns.iter().any(|(name, _)| name == "branch_id");

            if clinic_notnull || !has_branch {
                println!("Migrating medical_tickets to support hierarchy and nullable clinic_id...");
                conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE medical_tickets_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        branch_id INTEGER,
                        area_id INTEGER,
                        clinic_id INTEGER,
                        category TEXT NOT NULL,
                        period TEXT NOT NULL,
                        tickets_56c INTEGER DEFAULT 0,
                        tickets_56b INTEGER DEFAULT 0,
                        is_supported_clinic BOOLEAN DEFAULT 0,
                        week_number INTEGER,
                        dispense_month TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE,
                        FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE,
                        FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE
                    );
                    -- Copy existing data, mapping old clinic_id
                    INSERT INTO medical_tickets_new (id, clinic_id, category, period, tickets_56c, tickets_56b, is_supported_clinic, dispense_month, created_at)
                    SELECT id, clinic_id, category, period, tickets_56c, tickets_56b, is_supported_clinic, dispense_month, created_at FROM medical_tickets;
                    
                    DROP TABLE medical_tickets;
                    ALTER TABLE medical_tickets_new RENAME TO medical_tickets;
                    COMMIT;
                ").map_err(|e| {
                    let _ = conn.execute("ROLLBACK", []);
                    e.to_string()
                })?;
            }
        }
    }

    // --- MIGRATION: drug_groups - add branch_id, make clinic_id/area_id nullable ---
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(drug_groups)")?
            .query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?)) // (name, notnull)
            })?
            .collect();
        if let Ok(columns) = table_info {
            let has_branch = columns.iter().any(|(name, _)| name == "branch_id");
            let clinic_notnull = columns
                .iter()
                .any(|(name, notnull)| name == "clinic_id" && *notnull);

            if !has_branch || clinic_notnull {
                println!("Migrating drug_groups to support hierarchy (branch_id, nullable clinic/area)...");
                conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE drug_groups_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        cost REAL NOT NULL,
                        clinic_id INTEGER,
                        area_id INTEGER,
                        branch_id INTEGER,
                        dispense_month DATE NOT NULL,
                        group_code_id INTEGER,
                        FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE,
                        FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE,
                        FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE,
                        FOREIGN KEY (group_code_id) REFERENCES drug_group_codes (id) ON DELETE SET NULL
                    );
                    INSERT INTO drug_groups_new (id, name, cost, clinic_id, area_id, dispense_month, group_code_id)
                    SELECT id, name, cost, clinic_id, area_id, dispense_month, group_code_id FROM drug_groups;
                    DROP TABLE drug_groups;
                    ALTER TABLE drug_groups_new RENAME TO drug_groups;
                    -- Backfill branch_id from area_id for existing records
                    UPDATE drug_groups SET branch_id = (SELECT branch_id FROM areas WHERE areas.id = drug_groups.area_id) WHERE area_id IS NOT NULL AND branch_id IS NULL;
                    COMMIT;
                ").map_err(|e| {
                    let _ = conn.execute("ROLLBACK", []);
                    e.to_string()
                })?;
            }
        }
    }

    // --- MIGRATION: drug_group_codes - make 'code' column nullable ---
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(drug_group_codes)")?
            .query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?)) // (name, notnull)
            })?
            .collect();
        if let Ok(columns) = table_info {
            let code_notnull = columns
                .iter()
                .any(|(name, notnull)| name == "code" && *notnull);
            if code_notnull {
                println!("Migrating drug_group_codes to make 'code' nullable...");
                conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE drug_group_codes_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        code INTEGER,
                        name TEXT NOT NULL,
                        description TEXT
                    );
                    INSERT INTO drug_group_codes_new (id, code, name, description)
                    SELECT id, code, name, description FROM drug_group_codes;
                    DROP TABLE drug_group_codes;
                    ALTER TABLE drug_group_codes_new RENAME TO drug_group_codes;
                    COMMIT;
                ").map_err(|e| {
                    let _ = conn.execute("ROLLBACK", []);
                    e.to_string()
                })?;
            }
        }
    }

    // --- MIGRATION: Backfill drug_group_codes empty fields ---
    let _ = conn.execute_batch("
        UPDATE drug_group_codes SET code = id WHERE code IS NULL;
        UPDATE drug_group_codes SET description = name WHERE description IS NULL OR trim(description) = '';
    ");


    // --- MIGRATION: Make clinic_id and area_id nullable in monthly_drugs_dispensed ---
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(monthly_drugs_dispensed)")?
            .query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?)) // (name, notnull)
            })?
            .collect();
        if let Ok(columns) = table_info {
            let clinic_notnull = columns
                .iter()
                .any(|(name, notnull)| name == "clinic_id" && *notnull);
            let area_notnull = columns
                .iter()
                .any(|(name, notnull)| name == "area_id" && *notnull);
            
            if clinic_notnull || area_notnull {
                println!("Migrating monthly_drugs_dispensed to make clinic_id/area_id nullable...");
                conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE monthly_drugs_dispensed_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        clinic_id INTEGER,
                        area_id INTEGER,
                        branch_id INTEGER NOT NULL,
                        dispense_month TEXT NOT NULL,
                        drugs_free_authority REAL DEFAULT 0,
                        drugs_free_students REAL DEFAULT 0,
                        drugs_free_infants REAL DEFAULT 0,
                        drugs_free_breadwinner_women REAL DEFAULT 0,
                        drugs_supported_authority_value REAL DEFAULT 0,
                        drugs_supported_authority_patient_share REAL DEFAULT 0,
                        drugs_supported_students_value REAL DEFAULT 0,
                        drugs_supported_students_patient_share REAL DEFAULT 0,
                        drugs_supported_infants_value REAL DEFAULT 0,
                        drugs_supported_infants_patient_share REAL DEFAULT 0,
                        notes TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
                    SELECT 
                        id, clinic_id, area_id, branch_id, dispense_month,
                        drugs_free_authority, drugs_free_students, drugs_free_infants, drugs_free_breadwinner_women,
                        drugs_supported_authority_value, drugs_supported_authority_patient_share,
                        drugs_supported_students_value, drugs_supported_students_patient_share,
                        drugs_supported_infants_value, drugs_supported_infants_patient_share, notes, created_at 
                    FROM monthly_drugs_dispensed;
                    
                    DROP TABLE monthly_drugs_dispensed;
                    ALTER TABLE monthly_drugs_dispensed_new RENAME TO monthly_drugs_dispensed;
                    COMMIT;
                ").map_err(|e| {
                    let _ = conn.execute("ROLLBACK", []);
                    e.to_string()
                })?;
            }
        }
    }

    // --- MIGRATION: Make clinic_id and area_id nullable in judicial_dispensed ---
    {
        let table_info: Result<Vec<(String, bool)>, _> = conn
            .prepare("PRAGMA table_info(judicial_dispensed)")?
            .query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, bool>(3)?)) // (name, notnull)
            })?
            .collect();
        if let Ok(columns) = table_info {
            let has_branch = columns.iter().any(|(name, _)| name == "branch_id");
            let clinic_notnull = columns
                .iter()
                .any(|(name, notnull)| name == "clinic_id" && *notnull);
            let area_notnull = columns
                .iter()
                .any(|(name, notnull)| name == "area_id" && *notnull);
            
            if !has_branch || clinic_notnull || area_notnull {
                println!("Migrating judicial_dispensed to support hierarchy and nullable columns...");
                conn.execute_batch("
                    BEGIN TRANSACTION;
                    CREATE TABLE judicial_dispensed_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        patient_id INTEGER NOT NULL,
                        diagnosis TEXT NOT NULL,
                        medicine_name TEXT NOT NULL,
                        unit TEXT NOT NULL,
                        unit_price REAL NOT NULL,
                        monthly_dose REAL NOT NULL,
                        monthly_cost REAL NOT NULL,
                        dispense_month TEXT NOT NULL,
                        branch_id INTEGER,
                        area_id INTEGER,
                        clinic_id INTEGER,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (patient_id) REFERENCES judicial_patients (id) ON DELETE CASCADE,
                        FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE,
                        FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE,
                        FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE
                    );
                    INSERT INTO judicial_dispensed_new (id, patient_id, diagnosis, medicine_name, unit, unit_price, monthly_dose, monthly_cost, dispense_month, area_id, clinic_id, created_at)
                    SELECT id, patient_id, diagnosis, medicine_name, unit, unit_price, monthly_dose, monthly_cost, dispense_month, area_id, clinic_id, created_at FROM judicial_dispensed;
                    
                    -- Backfill branch_id
                    UPDATE judicial_dispensed_new SET branch_id = (SELECT branch_id FROM areas WHERE areas.id = judicial_dispensed_new.area_id) WHERE area_id IS NOT NULL;
                    UPDATE judicial_dispensed_new SET branch_id = (SELECT branch_id FROM areas a JOIN clinics c ON c.area_id = a.id WHERE c.id = judicial_dispensed_new.clinic_id) WHERE clinic_id IS NOT NULL AND branch_id IS NULL;

                    DROP TABLE judicial_dispensed;
                    ALTER TABLE judicial_dispensed_new RENAME TO judicial_dispensed;
                    COMMIT;
                ").map_err(|e| {
                    let _ = conn.execute("ROLLBACK", []);
                    e.to_string()
                })?;
            }
        }
    }

    // --- MIGRATION: Add entry_date to medical_tickets ---
    let _ = conn.execute("ALTER TABLE medical_tickets ADD COLUMN entry_date TEXT", []);

    // Re-enable foreign keys after all migrations finish
    let _ = conn.execute("PRAGMA foreign_keys = ON", []);
    let _ = conn.execute("PRAGMA foreign_key_check", []);

    println!("[db] all migrations finished, storing connection...");

    match state.db.lock() {
        Ok(mut db_lock) => {
            *db_lock = Some(conn);
        }
        Err(poisoned) => {
            let mut db_lock = poisoned.into_inner();
            *db_lock = Some(conn);
        }
    }
    println!("[db] connection stored successfully");

    Ok(())
}
