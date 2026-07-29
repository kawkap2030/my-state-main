-- Schema Dump from medicine_dispenser.db
-- Generated on: <built-in function times>

-- Table: areas
CREATE TABLE areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    branch_id INTEGER NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE
);

-- Table: branches
CREATE TABLE branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

-- Table: clinics
CREATE TABLE clinics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    area_id INTEGER NOT NULL,
    FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE
);

-- Table: dispensed
CREATE TABLE dispensed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drug_id INTEGER NOT NULL,
    clinic_id INTEGER NOT NULL,
    dispense_month DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (drug_id) REFERENCES drugs (id) ON DELETE CASCADE,
    FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE
);

-- Table: dispensed_details
CREATE TABLE dispensed_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dispensed_id INTEGER NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    cases_count INTEGER NOT NULL,
    FOREIGN KEY (dispensed_id) REFERENCES dispensed (id) ON DELETE CASCADE
);

-- Table: drug_categories
CREATE TABLE drug_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

-- Table: drug_group_codes
CREATE TABLE drug_group_codes (id INTEGER PRIMARY KEY, code INTEGER, name TEXT, description TEXT);

-- Table: drug_groups
CREATE TABLE drug_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cost REAL NOT NULL,
    clinic_id INTEGER NOT NULL,
    area_id INTEGER NOT NULL,
    dispense_month DATE NOT NULL, group_code_id INTEGER,
    FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE,
    FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE
);

-- Table: drug_units
CREATE TABLE drug_units (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT,
                    is_active BOOLEAN DEFAULT 1,
                    sort_order INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

-- Table: drugs
CREATE TABLE "drugs" (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    scientific_name TEXT,
                    category_id INTEGER NOT NULL,
                    unit TEXT,
                    FOREIGN KEY (category_id) REFERENCES drug_categories (id) ON DELETE CASCADE
                );

-- Table: insulin_categories
CREATE TABLE insulin_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: insulin_codes
CREATE TABLE insulin_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
, unit TEXT, type TEXT);

-- Table: insulin_dispensed
CREATE TABLE insulin_dispensed (
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
    clinic_id INTEGER NOT NULL,
    area_id INTEGER NOT NULL,
    dispense_month DATE NOT NULL,
    insulin_code_id INTEGER,
    FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE,
    FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE,
    FOREIGN KEY (insulin_code_id) REFERENCES insulin_codes (id) ON DELETE SET NULL
);

-- Table: insulin_types
CREATE TABLE insulin_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: insulin_units
CREATE TABLE insulin_units (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

-- Table: judicial_dispensed
CREATE TABLE judicial_dispensed (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL,
            diagnosis TEXT NOT NULL,
            medicine_name TEXT NOT NULL,
            unit TEXT NOT NULL,
            unit_price REAL NOT NULL,
            monthly_dose REAL NOT NULL,
            monthly_cost REAL NOT NULL,
            dispense_month TEXT NOT NULL,
            clinic_id INTEGER NOT NULL,
            area_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES judicial_patients (id),
            FOREIGN KEY (clinic_id) REFERENCES clinics (id),
            FOREIGN KEY (area_id) REFERENCES areas (id)
        );

-- Table: judicial_medicines
CREATE TABLE judicial_medicines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            unit TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

-- Table: judicial_patients
CREATE TABLE judicial_patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            court_ruling_date DATE NOT NULL,
            treatment_start_date DATE NOT NULL,
            clinic_id INTEGER NOT NULL,
            area_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, diagnosis TEXT,
            FOREIGN KEY (clinic_id) REFERENCES clinics (id),
            FOREIGN KEY (area_id) REFERENCES areas (id)
        );

-- Table: medical_tickets
CREATE TABLE medical_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clinic_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    period TEXT NOT NULL,  -- الأول، الثاني، الثالث، الرابع
    tickets_56c INTEGER DEFAULT 0,
    tickets_56b INTEGER DEFAULT 0,
    is_supported_clinic BOOLEAN DEFAULT 0,  -- للعيادات المدعمة
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, dispense_month TEXT,
    FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE
);

-- Table: monthly_drugs_dispensed
CREATE TABLE monthly_drugs_dispensed (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    clinic_id INTEGER NOT NULL,
                    area_id INTEGER NOT NULL,
                    branch_id INTEGER NOT NULL,
                    dispense_month TEXT NOT NULL,
                    drugs_free_authority REAL DEFAULT 0,
                    drugs_free_students REAL DEFAULT 0,
                    drugs_free_infants REAL DEFAULT 0,
                    drugs_free_breadwinner_women REAL DEFAULT 0,
                    drugs_supported_authority REAL DEFAULT 0,
                    drugs_supported_students REAL DEFAULT 0,
                    drugs_supported_infants REAL DEFAULT 0,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, drugs_supported_authority_value REAL DEFAULT 0, drugs_supported_authority_patient_share REAL DEFAULT 0, drugs_supported_students_value REAL DEFAULT 0, drugs_supported_students_patient_share REAL DEFAULT 0, drugs_supported_infants_value REAL DEFAULT 0, drugs_supported_infants_patient_share REAL DEFAULT 0,
                    FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE,
                    FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE,
                    FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE
                );

-- Table: monthly_supplies_dispensed
CREATE TABLE "monthly_supplies_dispensed" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clinic_id INTEGER NOT NULL,
    area_id INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    supply_id INTEGER,  -- Made optional to support category-based dispensing
    category_id INTEGER,  -- Added to support direct category dispensing
    consumer_value REAL DEFAULT 0,
    collective_entities_value REAL DEFAULT 0,
    dispense_month TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE,
    FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE,
    FOREIGN KEY (supply_id) REFERENCES supplies (id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES supply_categories (id) ON DELETE CASCADE,
    -- Ensure either supply_id or category_id is provided, but not both
    CHECK ((supply_id IS NOT NULL AND category_id IS NULL) OR (supply_id IS NULL AND category_id IS NOT NULL))
);

-- Table: monthly_supplies_dispensed_backup_20250902004249
CREATE TABLE monthly_supplies_dispensed_backup_20250902004249(
  id INT,
  clinic_id INT,
  area_id INT,
  branch_id INT,
  supply_id INT,
  category_id INT,
  consumer_value REAL,
  collective_entities_value REAL,
  dispense_month TEXT,
  notes TEXT,
  created_at NUM
);

-- Table: supplies
CREATE TABLE supplies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    category_id INTEGER NOT NULL,
                    unit TEXT,
                    description TEXT,
                    FOREIGN KEY (category_id) REFERENCES supply_categories(id) ON DELETE CASCADE
                );

-- Table: supply_categories
CREATE TABLE supply_categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT
                );

