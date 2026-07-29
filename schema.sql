-- مخطط قاعدة البيانات المتكامل لتطبيق منصرف الأدوية
-- يضمن هذا الملف إنشاء كافة الجداول المطلوبة مع العلاقات الصحيحة

PRAGMA foreign_keys = OFF;

-- 1. الأساسيات (الهيكل التنظيمي والمستخدمين)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer', -- 'admin', 'data_entry', 'viewer'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT,
    details TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    branch_id INTEGER NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS clinics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    area_id INTEGER NOT NULL,
    FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE
);

-- 2. تصنيفات ومنتجات
CREATE TABLE IF NOT EXISTS drug_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS drug_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS drugs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    scientific_name TEXT,
    category_id INTEGER NOT NULL,
    unit TEXT,
    FOREIGN KEY (category_id) REFERENCES drug_categories (id) ON DELETE CASCADE
);

-- 3. المجموعات الدوائية
CREATE TABLE IF NOT EXISTS drug_group_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code INTEGER,
    name TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS drug_groups (
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

-- 4. الإنسولين
CREATE TABLE IF NOT EXISTS insulin_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS insulin_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS insulin_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS insulin_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type_id INTEGER NOT NULL DEFAULT 0,
    unit_id INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (type_id) REFERENCES insulin_types (id) ON DELETE CASCADE,
    FOREIGN KEY (unit_id) REFERENCES insulin_units (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS insulin_dispensed (
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

-- 5. أحكام المحكمة
CREATE TABLE IF NOT EXISTS judicial_patients (
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

CREATE TABLE IF NOT EXISTS patient_pdfs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    pdf_data TEXT NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES judicial_patients (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS judicial_medicines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    unit TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS judicial_patient_medicines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    medicine_id INTEGER NOT NULL,
    monthly_dose REAL,
    unit_price REAL,
    FOREIGN KEY (patient_id) REFERENCES judicial_patients (id) ON DELETE CASCADE,
    FOREIGN KEY (medicine_id) REFERENCES judicial_medicines (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS judicial_dispensed (
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

-- 6. التذاكر الطبية
CREATE TABLE IF NOT EXISTS medical_tickets (
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
    entry_date TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE,
    FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE,
    FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE
);

-- 7a. المنصرف التفصيلي للأدوية
CREATE TABLE IF NOT EXISTS detailed_drug_dispensed (
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

-- 7b. المنصرف الشهري الإجمالي
CREATE TABLE IF NOT EXISTS monthly_drugs_dispensed (
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

-- 8. المستلزمات الطبية
CREATE TABLE IF NOT EXISTS supply_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS supplies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category_id INTEGER NOT NULL,
    unit TEXT,
    description TEXT,
    FOREIGN KEY (category_id) REFERENCES supply_categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS monthly_supplies_dispensed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clinic_id INTEGER,
    area_id INTEGER,
    branch_id INTEGER NOT NULL,
    supply_id INTEGER,
    category_id INTEGER,
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

-- 9. أقفال ودعم الإعدادات والتقارير
CREATE TABLE IF NOT EXISTS dispensing_month_isolation (
    branch_id INTEGER NOT NULL,
    dispense_month TEXT NOT NULL,
    isolation_level TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (branch_id, dispense_month),
    FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS manual_locked_months (
    dispense_month TEXT PRIMARY KEY,
    is_locked BOOLEAN DEFAULT 1,
    locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS report_signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    preparer_name TEXT NOT NULL DEFAULT '',
    manager_name TEXT NOT NULL DEFAULT '',
    approval_number TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS export_presets (
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
);

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
