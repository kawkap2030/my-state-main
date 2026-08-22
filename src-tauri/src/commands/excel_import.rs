use crate::db::AppState;
use tauri::State;
use serde::{Deserialize, Serialize};
use calamine::{Reader, open_workbook_auto, Data};
use rusqlite::OptionalExtension;
use std::path::PathBuf;
use crate::commands::month_isolation::{
    enforce_isolation_lock, validate_non_negative_f64,
};

// ─── Data Structures ──────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
#[allow(dead_code)]
pub struct ExcelRowPreview {
    pub row_index: usize,
    pub columns: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ExcelSheetInfo {
    pub name: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ExcelPreviewResult {
    pub sheets: Vec<ExcelSheetInfo>,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub total_rows: usize,
}

#[derive(Serialize, Deserialize, Debug)]
#[allow(dead_code)]
pub struct MonthlyDrugsImportRow {
    pub clinic_name: String,
    pub area_name: String,
    pub branch_name: String,
    pub dispense_month: String,
    pub drugs_free_authority: f64,
    pub drugs_free_students: f64,
    pub drugs_free_infants: f64,
    pub drugs_free_breadwinner_women: f64,
    pub drugs_supported_authority_value: f64,
    pub drugs_supported_authority_patient_share: f64,
    pub drugs_supported_students_value: f64,
    pub drugs_supported_students_patient_share: f64,
    pub drugs_supported_infants_value: f64,
    pub drugs_supported_infants_patient_share: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ImportResult {
    pub success_count: usize,
    pub error_count: usize,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

// ─── Helper: Convert calamine cell to String ─────────────────────────────────

fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::String(s) => s.trim().to_string(),
        Data::Float(f) => {
            // Display integers without decimal point
            if f.fract() == 0.0 { format!("{}", *f as i64) } else { format!("{}", f) }
        }
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => if *b { "1".to_string() } else { "0".to_string() },
        Data::Empty => String::new(),
        Data::Error(e) => format!("[خطأ: {:?}]", e),
        Data::DateTime(dt) => format!("{:.0}", dt), // as serial number
        Data::DateTimeIso(s) => s.clone(),
        Data::DurationIso(s) => s.clone(),
    }
}

fn cell_to_f64(cell: &Data) -> f64 {
    match cell {
        Data::Float(f) => *f,
        Data::Int(i) => *i as f64,
        Data::String(s) => s.trim().replace(",", "").parse::<f64>().unwrap_or(0.0),
        _ => 0.0,
    }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/// Read Excel file and return sheet names + preview of first sheet
#[tauri::command]
pub async fn preview_excel_file(file_path: String) -> Result<ExcelPreviewResult, String> {
    let mut workbook = open_workbook_auto(&file_path)
        .map_err(|e| format!("فشل فتح الملف: {}. تأكد أن الملف بصيغة .xlsx أو .xls", e))?;

    let sheets: Vec<ExcelSheetInfo> = workbook
        .sheet_names()
        .iter()
        .map(|n| ExcelSheetInfo { name: n.clone() })
        .collect();

    if sheets.is_empty() {
        return Err("الملف لا يحتوي على أوراق عمل".to_string());
    }

    let sheet_name = sheets[0].name.clone();
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| format!("فشل قراءة الورقة: {}", e))?;

    let all_rows: Vec<Vec<Data>> = range.rows().map(|r| r.to_vec()).collect();

    if all_rows.is_empty() {
        return Ok(ExcelPreviewResult {
            sheets,
            headers: vec![],
            rows: vec![],
            total_rows: 0,
        });
    }

    let headers: Vec<String> = all_rows[0].iter().map(cell_to_string).collect();
    let data_rows: Vec<Vec<String>> = all_rows[1..]
        .iter()
        .take(20) // Preview first 20 rows
        .map(|row| row.iter().map(cell_to_string).collect())
        .collect();

    let total_rows = if all_rows.len() > 0 { all_rows.len() - 1 } else { 0 };

    Ok(ExcelPreviewResult {
        sheets,
        headers,
        rows: data_rows,
        total_rows,
    })
}

/// Get all sheets in an Excel file
#[tauri::command]
pub async fn get_excel_sheets(file_path: String) -> Result<Vec<ExcelSheetInfo>, String> {
    let workbook = open_workbook_auto(&file_path)
        .map_err(|e| format!("فشل فتح الملف: {}", e))?;

    Ok(workbook
        .sheet_names()
        .iter()
        .map(|n| ExcelSheetInfo { name: n.clone() })
        .collect())
}

/// Import Monthly Drugs Dispensed from Excel
/// Expected columns (in order or by header matching):
/// اسم العيادة | اسم المنطقة | اسم الفرع | الشهر | مجاني سلطة | مجاني طلاب | مجاني رضع | مجاني معيل | مدعم سلطة قيمة | مدعم سلطة حصة | مدعم طلاب قيمة | مدعم طلاب حصة | مدعم رضع قيمة | مدعم رضع حصة
#[tauri::command]
pub async fn import_monthly_drugs_from_excel(
    state: State<'_, AppState>,
    file_path: String,
    sheet_name: Option<String>,
    dispense_month: String,       // override month from UI (YYYY-MM)
    branch_id: i32,
    area_id: Option<i32>,
    clinic_id: Option<i32>,
    header_row: Option<usize>,    // 0-indexed row for headers, default 0
    col_mapping: Option<std::collections::HashMap<String, usize>>, // field -> column index
) -> Result<ImportResult, String> {
    let mut workbook = open_workbook_auto(&file_path)
        .map_err(|e| format!("فشل فتح الملف: {}", e))?;

    let target_sheet = sheet_name.unwrap_or_else(|| {
        workbook.sheet_names().first().cloned().unwrap_or_default()
    });

    let range = workbook
        .worksheet_range(&target_sheet)
        .map_err(|e| format!("فشل قراءة الورقة '{}': {}", target_sheet, e))?;

    let header_idx = header_row.unwrap_or(0);
    let all_rows: Vec<Vec<Data>> = range.rows().map(|r| r.to_vec()).collect();

    if all_rows.len() <= header_idx {
        return Err("الملف لا يحتوي على بيانات كافية".to_string());
    }

    // Default column mapping (0-indexed): clinic, area, branch, month, then numerics
    let mapping = col_mapping.unwrap_or_else(|| {
        let mut m = std::collections::HashMap::new();
        m.insert("drugs_free_authority".to_string(), 0usize);
        m.insert("drugs_free_students".to_string(), 1);
        m.insert("drugs_free_infants".to_string(), 2);
        m.insert("drugs_free_breadwinner_women".to_string(), 3);
        m.insert("drugs_supported_authority_value".to_string(), 4);
        m.insert("drugs_supported_authority_patient_share".to_string(), 5);
        m.insert("drugs_supported_students_value".to_string(), 6);
        m.insert("drugs_supported_students_patient_share".to_string(), 7);
        m.insert("drugs_supported_infants_value".to_string(), 8);
        m.insert("drugs_supported_infants_patient_share".to_string(), 9);
        m
    });

    let mut result = ImportResult {
        success_count: 0,
        error_count: 0,
        errors: vec![],
        warnings: vec![],
    };

    let mut conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // Validate IDs exist
    let branch_exists: i32 = conn.query_row(
        "SELECT COUNT(*) FROM branches WHERE id = ?1", [branch_id], |r| r.get(0)
    ).unwrap_or(0);
    if branch_exists == 0 {
        return Err(format!("الفرع رقم {} غير موجود", branch_id));
    }

    let data_rows = &all_rows[(header_idx + 1)..];

    if data_rows.is_empty() {
        return Ok(result);
    }

    // Open a transaction: any row error rolls back the whole import
    // (including the isolation lock created below), leaving the DB unchanged.
    let conn_mut = conn_guard.as_mut().ok_or("Database not initialized")?;
    let tx = conn_mut.transaction().map_err(|e| e.to_string())?;

    let level = if clinic_id.is_some() { "clinic" }
                else if area_id.is_some() { "area" }
                else { "branch" };
    enforce_isolation_lock(&tx, branch_id, &dispense_month, level, true)?;

    // Coexistence guard: totals must not mix branch level with area/clinic level
    // for the same branch + month.
    if level == "branch" {
        let exists_lower: i32 = tx.query_row(
            "SELECT COUNT(*) FROM monthly_drugs_dispensed 
             WHERE branch_id = ?1 AND dispense_month = ?2 
             AND (area_id IS NOT NULL OR clinic_id IS NOT NULL)",
            rusqlite::params![branch_id, dispense_month],
            |r| r.get(0)
        ).unwrap_or(0);
        if exists_lower > 0 {
            return Err("عذراً، توجد سجلات تفصيلية (مناطق أو عيادات) لهذا الفرع والشهر. لا يمكن استيراد إجمالي على مستوى الفرع منعاً لتضارب البيانات.".to_string());
        }
    } else {
        let exists_branch: i32 = tx.query_row(
            "SELECT COUNT(*) FROM monthly_drugs_dispensed 
             WHERE branch_id = ?1 AND dispense_month = ?2 
             AND area_id IS NULL AND clinic_id IS NULL",
            rusqlite::params![branch_id, dispense_month],
            |r| r.get(0)
        ).unwrap_or(0);
        if exists_branch > 0 {
            return Err("عذراً، توجد بيانات مجمعة على مستوى الفرع لهذا الشهر. لا يمكن استيراد سجلات مناطق أو عيادات منعاً للتكرار.".to_string());
        }
    }

    for (row_num, row) in data_rows.iter().enumerate() {
        let display_row = row_num + header_idx + 2; // 1-indexed for display

        // Skip empty rows
        let all_empty = row.iter().all(|c| matches!(c, Data::Empty));
        if all_empty {
            continue;
        }

        let get_val = |field: &str| -> f64 {
            mapping.get(field)
                .and_then(|&idx| row.get(idx))
                .map(|c| cell_to_f64(c))
                .unwrap_or(0.0)
        };

        let free_authority = get_val("drugs_free_authority");
        let free_students = get_val("drugs_free_students");
        let free_infants = get_val("drugs_free_infants");
        let free_breadwinner = get_val("drugs_free_breadwinner_women");
        let supp_auth_val = get_val("drugs_supported_authority_value");
        let supp_auth_share = get_val("drugs_supported_authority_patient_share");
        let supp_std_val = get_val("drugs_supported_students_value");
        let supp_std_share = get_val("drugs_supported_students_patient_share");
        let supp_inf_val = get_val("drugs_supported_infants_value");
        let supp_inf_share = get_val("drugs_supported_infants_patient_share");

        // Negative value validation — any negative value cancels the import.
        for (label, value) in [
            ("منصرف الهيئة", free_authority),
            ("منصرف الطلاب", free_students),
            ("منصرف الرضع", free_infants),
            ("منصرف المرأة المعيلة", free_breadwinner),
            ("قيمة الهيئة المدعمة", supp_auth_val),
            ("حصة المريض - هيئة", supp_auth_share),
            ("قيمة الطلبة المدعمة", supp_std_val),
            ("حصة المريض - طلبة", supp_std_share),
            ("قيمة الرضع المدعمة", supp_inf_val),
            ("حصة المريض - رضع", supp_inf_share),
        ] {
            if let Err(e) = validate_non_negative_f64(label, value) {
                return Err(format!("الصف {}: {} - تم إلغاء الاستيراد", display_row, e));
            }
        }

        // Check if record already exists
        let existing: i32 = tx.query_row(
            "SELECT COUNT(*) FROM monthly_drugs_dispensed WHERE branch_id=?1 AND area_id IS ?2 AND clinic_id IS ?3 AND dispense_month=?4",
            rusqlite::params![branch_id, area_id, clinic_id, dispense_month],
            |r| r.get(0)
        ).unwrap_or(0);

        if existing > 0 {
            // Re-import over the same hierarchy: update in place and report it.
            tx.execute(
                "UPDATE monthly_drugs_dispensed SET 
                    drugs_free_authority=?1, drugs_free_students=?2, drugs_free_infants=?3,
                    drugs_free_breadwinner_women=?4,
                    drugs_supported_authority_value=?5, drugs_supported_authority_patient_share=?6,
                    drugs_supported_students_value=?7, drugs_supported_students_patient_share=?8,
                    drugs_supported_infants_value=?9, drugs_supported_infants_patient_share=?10
                WHERE branch_id=?11 AND area_id IS ?12 AND clinic_id IS ?13 AND dispense_month=?14",
                rusqlite::params![
                    free_authority, free_students, free_infants, free_breadwinner,
                    supp_auth_val, supp_auth_share,
                    supp_std_val, supp_std_share,
                    supp_inf_val, supp_inf_share,
                    branch_id, area_id, clinic_id, dispense_month
                ]
            ).map_err(|e| format!("الصف {}: فشل التحديث - {}", display_row, e))?;
            result.success_count += 1;
            result.warnings.push(format!("الصف {}: تم تحديث سجل موجود", display_row));
        } else {
            // Insert
            tx.execute(
                "INSERT INTO monthly_drugs_dispensed (
                    branch_id, area_id, clinic_id, dispense_month,
                    drugs_free_authority, drugs_free_students, drugs_free_infants,
                    drugs_free_breadwinner_women,
                    drugs_supported_authority_value, drugs_supported_authority_patient_share,
                    drugs_supported_students_value, drugs_supported_students_patient_share,
                    drugs_supported_infants_value, drugs_supported_infants_patient_share
                ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
                rusqlite::params![
                    branch_id, area_id, clinic_id, dispense_month,
                    free_authority, free_students, free_infants, free_breadwinner,
                    supp_auth_val, supp_auth_share,
                    supp_std_val, supp_std_share,
                    supp_inf_val, supp_inf_share
                ]
            ).map_err(|e| format!("الصف {}: {}", display_row, e))?;
            result.success_count += 1;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(result)
}

/// Import Detailed Drug Dispensed from Excel
/// Expected columns per row: drug_id OR drug_name | quantity | cases_count | unit_price
#[tauri::command]
pub async fn import_detailed_drugs_from_excel(
    state: State<'_, AppState>,
    file_path: String,
    sheet_name: Option<String>,
    dispense_month: String,
    branch_id: i32,
    area_id: Option<i32>,
    clinic_id: Option<i32>,
    header_row: Option<usize>,
) -> Result<ImportResult, String> {
    let mut workbook = open_workbook_auto(&file_path)
        .map_err(|e| format!("فشل فتح الملف: {}", e))?;

    let target_sheet = sheet_name.unwrap_or_else(|| {
        workbook.sheet_names().first().cloned().unwrap_or_default()
    });

    let range = workbook
        .worksheet_range(&target_sheet)
        .map_err(|e| format!("فشل قراءة الورقة '{}': {}", target_sheet, e))?;

    let header_idx = header_row.unwrap_or(0);
    let all_rows: Vec<Vec<Data>> = range.rows().map(|r| r.to_vec()).collect();

    if all_rows.len() <= header_idx {
        return Err("الملف لا يحتوي على بيانات كافية".to_string());
    }

    // Detect header columns
    let headers: Vec<String> = all_rows[header_idx].iter().map(cell_to_string).collect();
    
    // Try to find columns by name (Arabic headers)
    let find_col = |names: &[&str]| -> Option<usize> {
        for name in names {
            if let Some(idx) = headers.iter().position(|h| h.contains(name)) {
                return Some(idx);
            }
        }
        None
    };

    let drug_name_col = find_col(&["اسم الدواء", "الدواء", "drug_name", "drug"]).or(Some(0));
    let quantity_col = find_col(&["الكمية", "كمية", "quantity"]).or(Some(1));
    let cases_col = find_col(&["الحالات", "عدد الحالات", "cases"]).or(Some(2));
    let price_col = find_col(&["السعر", "سعر الوحدة", "unit_price"]).or(Some(3));

    let mut result = ImportResult {
        success_count: 0,
        error_count: 0,
        errors: vec![],
        warnings: vec![],
    };

    let mut conn_guard = state.db.lock().map_err(|e| e.to_string())?;

    let data_rows = &all_rows[(header_idx + 1)..];

    if data_rows.is_empty() {
        return Ok(result);
    }

    // Open a transaction: any row error rolls back the whole import
    // (including the isolation lock created below), leaving the DB unchanged.
    let conn_mut = conn_guard.as_mut().ok_or("Database not initialized")?;
    let tx = conn_mut.transaction().map_err(|e| e.to_string())?;

    let level = if clinic_id.is_some() { "clinic" }
                else if area_id.is_some() { "area" }
                else { "branch" };
    enforce_isolation_lock(&tx, branch_id, &dispense_month, level, true)?;

    for (row_num, row) in data_rows.iter().enumerate() {
        let display_row = row_num + header_idx + 2;

        let all_empty = row.iter().all(|c| matches!(c, Data::Empty));
        if all_empty {
            continue;
        }

        // Get drug name
        let drug_name = drug_name_col
            .and_then(|idx| row.get(idx))
            .map(cell_to_string)
            .unwrap_or_default();

        if drug_name.is_empty() {
            return Err(format!("الصف {}: اسم الدواء فارغ - تم إلغاء الاستيراد", display_row));
        }

        // Deterministic drug lookup: exact match first. A LIKE fallback is only
        // used when it resolves to exactly one drug — anything else cancels the
        // import rather than guessing.
        let drug_id: Option<i32> = tx.query_row(
            "SELECT id FROM drugs WHERE name = ?1",
            rusqlite::params![drug_name],
            |r| r.get(0)
        ).optional().map_err(|e| e.to_string())?;

        let drug_id = match drug_id {
            Some(id) => id,
            None => {
                let mut stmt = tx.prepare("SELECT id FROM drugs WHERE name LIKE ?1")
                    .map_err(|e| e.to_string())?;
                let matches = stmt
                    .query_map(rusqlite::params![format!("%{}%", drug_name)], |r| r.get(0))
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<i32>, _>>()
                    .map_err(|e| e.to_string())?;
                match matches.as_slice() {
                    [single] => *single,
                    [] => return Err(format!("الصف {}: الدواء '{}' غير موجود في قاعدة البيانات - تم إلغاء الاستيراد", display_row, drug_name)),
                    _ => return Err(format!("الصف {}: اسم الدواء '{}' غير محدد (يوجد أكثر من نتيجة مطابقة) - تم إلغاء الاستيراد", display_row, drug_name)),
                }
            }
        };

        let quantity = quantity_col
            .and_then(|idx| row.get(idx))
            .map(cell_to_f64)
            .unwrap_or(0.0);
        let cases_count = cases_col
            .and_then(|idx| row.get(idx))
            .map(|c| cell_to_f64(c) as i32)
            .unwrap_or(0);
        let unit_price = price_col
            .and_then(|idx| row.get(idx))
            .map(cell_to_f64)
            .unwrap_or(0.0);

        // Zero/negative value validation — any invalid row cancels the whole
        // import (existing transactional rollback behaviour is preserved).
        if quantity < 0.0 {
            return Err(format!("الصف {}: الكمية سالبة - تم إلغاء الاستيراد", display_row));
        }
        if unit_price <= 0.0 {
            return Err(format!("الصف {}: سعر الوحدة يجب أن يكون أكبر من صفر - تم إلغاء الاستيراد", display_row));
        }
        if cases_count <= 0 {
            return Err(format!("الصف {}: عدد الحالات يجب أن يكون أكبر من صفر - تم إلغاء الاستيراد", display_row));
        }

        let total_cost = quantity * unit_price;

        // Price-in-identity duplicate check: a record with the SAME drug +
        // location + month + price is a duplicate (reject). A different price is
        // a distinct legitimate record (insert), never a silent overwrite.
        let same_price_exists: i32 = tx.query_row(
            "SELECT COUNT(*) FROM detailed_drug_dispensed 
             WHERE drug_id=?1 AND branch_id=?2 AND area_id IS ?3 AND clinic_id IS ?4 
               AND dispense_month=?5 AND ABS(unit_price - ?6) < 0.0001",
            rusqlite::params![drug_id, branch_id, area_id, clinic_id, dispense_month, unit_price],
            |r| r.get(0)
        ).unwrap_or(0);
        if same_price_exists > 0 {
            return Err(format!("الصف {}: يوجد ادخال سابق للصنف '{}' بنفس السعر ({}) لهذا الشهر - تم إلغاء الاستيراد", display_row, drug_name, unit_price));
        }

        tx.execute(
            "INSERT INTO detailed_drug_dispensed (branch_id, area_id, clinic_id, dispense_month, drug_id, quantity, cases_count, unit_price, total_cost) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            rusqlite::params![branch_id, area_id, clinic_id, dispense_month, drug_id, quantity, cases_count, unit_price, total_cost]
        ).map_err(|e| format!("الصف {}: '{}' - {}", display_row, drug_name, e))?;

        result.success_count += 1;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(result)
}

/// Export a template Excel file for data entry
#[tauri::command]
pub async fn export_import_template(template_type: String) -> Result<String, String> {
    use rust_xlsxwriter::Workbook;

    // Use app data directory to avoid file-watcher rebuilds in Tauri dev mode
    let app_dir = std::env::var("APPDATA")
        .map(PathBuf::from)
        .or_else(|_| std::env::var("HOME").map(PathBuf::from))
        .unwrap_or_else(|_| {
            std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .unwrap_or_else(|| PathBuf::from("."))
        });

    let app_dir = app_dir.join("drug-stats-app");
    let exports_dir = app_dir.join("exports");
    if !exports_dir.exists() {
        std::fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;
    }

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("template_{}_{}.xlsx", template_type, timestamp);
    let file_path = exports_dir.join(&filename);

    let mut workbook = Workbook::new();
    let ws = workbook.add_worksheet();

    match template_type.as_str() {
        "monthly_drugs" => {
            ws.set_name("إجمالي المنصرف الشهري").map_err(|e| e.to_string())?;
            let headers = [
                "أدوية مجانية - سلطة",
                "أدوية مجانية - طلاب",
                "أدوية مجانية - رضع",
                "أدوية مجانية - معيل أسرة",
                "مدعم سلطة - القيمة",
                "مدعم سلطة - حصة المريض",
                "مدعم طلاب - القيمة",
                "مدعم طلاب - حصة المريض",
                "مدعم رضع - القيمة",
                "مدعم رضع - حصة المريض",
            ];
            for (i, h) in headers.iter().enumerate() {
                ws.write_string(0, i as u16, *h).map_err(|e| e.to_string())?;
            }
            // Sample row
            ws.write_number(1, 0, 0.0).map_err(|e| e.to_string())?;
        }
        "detailed_drugs" => {
            ws.set_name("صرف الأدوية التفصيلي").map_err(|e| e.to_string())?;
            let headers = ["اسم الدواء", "الكمية", "عدد الحالات", "سعر الوحدة"];
            for (i, h) in headers.iter().enumerate() {
                ws.write_string(0, i as u16, *h).map_err(|e| e.to_string())?;
            }
            // Sample row
            ws.write_string(1, 0, "اسم الدواء هنا").map_err(|e| e.to_string())?;
            ws.write_number(1, 1, 10.0).map_err(|e| e.to_string())?;
            ws.write_number(1, 2, 5.0).map_err(|e| e.to_string())?;
            ws.write_number(1, 3, 25.5).map_err(|e| e.to_string())?;
        }
        _ => {
            return Err(format!("نوع القالب غير معروف: {}", template_type));
        }
    }

    workbook.save(&file_path).map_err(|e| e.to_string())?;

    // Open in explorer
    std::process::Command::new("explorer")
        .arg("/select,")
        .arg(&file_path)
        .spawn()
        .ok();

    Ok(file_path.to_string_lossy().into_owned())
}
