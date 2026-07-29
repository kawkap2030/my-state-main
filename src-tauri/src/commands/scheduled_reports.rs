use tauri::State;
use crate::db::AppState;
use chrono::{Local, Datelike};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ScheduledReport {
    pub id: i64,
    pub name: String,
    pub report_type: String,       // 'analytical', 'financial', 'executive', 'drugs'
    pub schedule_type: String,     // 'monthly', 'quarterly', 'yearly'
    pub day_of_month: i32,         // 1-28, or 0 for last day
    pub output_folder: String,     // saved folder path
    pub branch_id: Option<i64>,
    pub area_id: Option<i64>,
    pub clinic_id: Option<i64>,
    pub is_active: bool,
    pub last_generated: Option<String>,
    pub next_run: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ReportHistory {
    pub id: i64,
    pub schedule_id: i64,
    pub report_name: String,
    pub file_path: String,
    pub file_size: f64,           // KB
    pub status: String,           // 'success', 'failed'
    pub error_message: Option<String>,
    pub generated_at: String,
}

// ═════════════════════════════════════════════════════════════════════
// SCHEDULED REPORTS CRUD
// ═════════════════════════════════════════════════════════════════════

fn row_to_schedule(row: &rusqlite::Row) -> Result<ScheduledReport, rusqlite::Error> {
    Ok(ScheduledReport {
        id: row.get(0)?,
        name: row.get(1)?,
        report_type: row.get(2)?,
        schedule_type: row.get(3)?,
        day_of_month: row.get(4)?,
        output_folder: row.get(5)?,
        branch_id: row.get(6)?,
        area_id: row.get(7)?,
        clinic_id: row.get(8)?,
        is_active: row.get(9)?,
        last_generated: row.get(10)?,
        next_run: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn row_to_history(row: &rusqlite::Row) -> Result<ReportHistory, rusqlite::Error> {
    Ok(ReportHistory {
        id: row.get(0)?,
        schedule_id: row.get(1)?,
        report_name: row.get(2)?,
        file_path: row.get(3)?,
        file_size: row.get(4)?,
        status: row.get(5)?,
        error_message: row.get(6)?,
        generated_at: row.get(7)?,
    })
}

/// Calculate next run date based on schedule config
fn calc_next_run(schedule_type: &str, day_of_month: i32) -> String {
    let today = Local::now().naive_local().date();
    let current_day = today.day() as i32;
    let current_month = today.month();
    let current_year = today.year();

    // Determine target day
    let target_day = if day_of_month <= 0 {
        // Last day of month
        let next_month = if current_month == 12 { 1 } else { current_month + 1 };
        let next_year = if current_month == 12 { current_year + 1 } else { current_year };
        let last_day = num_days_in_month(next_year, next_month);
        last_day
    } else {
        day_of_month.min(28)
    };

    // If target day already passed this month, schedule for next cycle
    let (next_month, next_year) = if current_day >= target_day {
        match schedule_type {
            "monthly" => {
                if current_month == 12 { (1, current_year + 1) } else { (current_month + 1, current_year) }
            }
            "quarterly" => {
                // Next quarter start
                let next_q_month = ((current_month - 1) / 3 + 1) * 3 + 1;
                if next_q_month > 12 { (next_q_month - 12, current_year + 1) } else { (next_q_month, current_year) }
            }
            "yearly" => {
                (1, current_year + 1)
            }
            _ => {
                if current_month == 12 { (1, current_year + 1) } else { (current_month + 1, current_year) }
            }
        }
    } else {
        (current_month, current_year)
    };

    let last_day = num_days_in_month(next_year, next_month);
    let actual_day = target_day.min(last_day);

    format!("{:04}-{:02}-{:02}", next_year, next_month, actual_day)
}

fn num_days_in_month(year: i32, month: u32) -> i32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

#[tauri::command]
pub async fn get_scheduled_reports(
    state: State<'_, AppState>,
) -> Result<Vec<ScheduledReport>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, report_type, schedule_type, day_of_month,
                    output_folder, branch_id, area_id, clinic_id,
                    is_active, last_generated, next_run, created_at, updated_at
             FROM scheduled_reports
             ORDER BY next_run ASC, name ASC",
        )
        .map_err(|e| e.to_string())?;

    let reports = stmt
        .query_map([], row_to_schedule)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(reports)
}

#[tauri::command]
pub async fn save_scheduled_report(
    state: State<'_, AppState>,
    id: Option<i64>,
    name: String,
    report_type: String,
    schedule_type: String,
    day_of_month: i32,
    output_folder: String,
    branch_id: Option<i64>,
    area_id: Option<i64>,
    clinic_id: Option<i64>,
    is_active: bool,
) -> Result<ScheduledReport, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let next_run = if is_active {
        calc_next_run(&schedule_type, day_of_month)
    } else {
        String::new()
    };

    if let Some(existing_id) = id {
        // UPDATE existing
        conn.execute(
            "UPDATE scheduled_reports SET
                name = ?1, report_type = ?2, schedule_type = ?3,
                day_of_month = ?4, output_folder = ?5,
                branch_id = ?6, area_id = ?7, clinic_id = ?8,
                is_active = ?9, next_run = ?10, updated_at = ?11
             WHERE id = ?12",
            rusqlite::params![
                name, report_type, schedule_type,
                day_of_month, output_folder,
                branch_id, area_id, clinic_id,
                is_active, next_run, now, existing_id
            ],
        )
        .map_err(|e| e.to_string())?;

        // Fetch updated
        let report = conn
            .query_row(
                "SELECT id, name, report_type, schedule_type, day_of_month,
                        output_folder, branch_id, area_id, clinic_id,
                        is_active, last_generated, next_run, created_at, updated_at
                 FROM scheduled_reports WHERE id = ?1",
                [existing_id],
                row_to_schedule,
            )
            .map_err(|e| e.to_string())?;
        Ok(report)
    } else {
        // INSERT new
        conn.execute(
            "INSERT INTO scheduled_reports
                (name, report_type, schedule_type, day_of_month, output_folder,
                 branch_id, area_id, clinic_id, is_active, next_run, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
            rusqlite::params![
                name, report_type, schedule_type, day_of_month, output_folder,
                branch_id, area_id, clinic_id, is_active, next_run, now
            ],
        )
        .map_err(|e| e.to_string())?;

        let new_id = conn.last_insert_rowid();
        let report = conn
            .query_row(
                "SELECT id, name, report_type, schedule_type, day_of_month,
                        output_folder, branch_id, area_id, clinic_id,
                        is_active, last_generated, next_run, created_at, updated_at
                 FROM scheduled_reports WHERE id = ?1",
                [new_id],
                row_to_schedule,
            )
            .map_err(|e| e.to_string())?;
        Ok(report)
    }
}

#[tauri::command]
pub async fn delete_scheduled_report(
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute("DELETE FROM scheduled_report_history WHERE schedule_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM scheduled_reports WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn toggle_scheduled_report(
    state: State<'_, AppState>,
    id: i64,
    is_active: bool,
) -> Result<ScheduledReport, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let next_run = if is_active {
        // Recalculate next run
        let report: ScheduledReport = conn
            .query_row(
                "SELECT id, name, report_type, schedule_type, day_of_month,
                        output_folder, branch_id, area_id, clinic_id,
                        is_active, last_generated, next_run, created_at, updated_at
                 FROM scheduled_reports WHERE id = ?1",
                [id],
                row_to_schedule,
            )
            .map_err(|e| e.to_string())?;
        calc_next_run(&report.schedule_type, report.day_of_month)
    } else {
        String::new()
    };

    conn.execute(
        "UPDATE scheduled_reports SET is_active = ?1, next_run = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![is_active, next_run, now, id],
    )
    .map_err(|e| e.to_string())?;

    let report = conn
        .query_row(
            "SELECT id, name, report_type, schedule_type, day_of_month,
                    output_folder, branch_id, area_id, clinic_id,
                    is_active, last_generated, next_run, created_at, updated_at
             FROM scheduled_reports WHERE id = ?1",
            [id],
            row_to_schedule,
        )
        .map_err(|e| e.to_string())?;
    Ok(report)
}

// ═════════════════════════════════════════════════════════════════════
// REPORT EXECUTION
// ═════════════════════════════════════════════════════════════════════

#[derive(serde::Serialize)]
pub struct GenerateResult {
    pub file_path: String,
    pub file_size: f64,
    pub success: bool,
    pub message: String,
}

#[tauri::command]
pub async fn run_scheduled_report_now(
    state: State<'_, AppState>,
    schedule_id: i64,
) -> Result<GenerateResult, String> {
    let (report, history_id) = {
        let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

        let report: ScheduledReport = conn
            .query_row(
                "SELECT id, name, report_type, schedule_type, day_of_month,
                        output_folder, branch_id, area_id, clinic_id,
                        is_active, last_generated, next_run, created_at, updated_at
                 FROM scheduled_reports WHERE id = ?1",
                [schedule_id],
                row_to_schedule,
            )
            .map_err(|e| e.to_string())?;

        // Create a history entry with 'running' status
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        conn.execute(
            "INSERT INTO scheduled_report_history
                (schedule_id, report_name, file_path, file_size, status, generated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![schedule_id, report.name, "", 0.0, "running", now],
        )
        .map_err(|e| e.to_string())?;

        let h_id = conn.last_insert_rowid();
        drop(conn_guard);
        (report, h_id)
    };

    // Generate report filename
    let now = Local::now();
    let date_str = now.format("%Y-%m-%d_%H%M%S").to_string();
    let safe_name = report.name.replace([' ', '/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    let filename = format!("{}_{}.pdf", safe_name, date_str);
    let file_path = std::path::Path::new(&report.output_folder).join(&filename);

    // Ensure output directory exists
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("فشل إنشاء مجلد الإخراج: {}", e))?;
    }

    // Attempt generation
    let result = generate_report_data(&state, &report).await;

    match result {
        Ok(pdf_bytes) => {
            // Write PDF file
            let file_size_kb = (pdf_bytes.len() as f64) / 1024.0;
            std::fs::write(&file_path, &pdf_bytes)
                .map_err(|e| format!("فشل كتابة ملف PDF: {}", e))?;

            let file_path_str = file_path.to_string_lossy().to_string();
            let now_str = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let next_run = calc_next_run(&report.schedule_type, report.day_of_month);

            // Update history and schedule
            let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
            let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

            conn.execute(
                "UPDATE scheduled_report_history SET status = ?1, file_path = ?2, file_size = ?3 WHERE id = ?4",
                rusqlite::params!["success", file_path_str, file_size_kb, history_id],
            )
            .map_err(|e| e.to_string())?;

            conn.execute(
                "UPDATE scheduled_reports SET last_generated = ?1, next_run = ?2, updated_at = ?3 WHERE id = ?4",
                rusqlite::params![now_str, next_run, now_str, schedule_id],
            )
            .map_err(|e| e.to_string())?;

            Ok(GenerateResult {
                file_path: file_path_str,
                file_size: file_size_kb,
                success: true,
                message: format!("✅ تم إنشاء التقرير بنجاح: {}", filename),
            })
        }
        Err(e) => {
            // Update history with failure
            let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
            let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

            conn.execute(
                "UPDATE scheduled_report_history SET status = ?1, error_message = ?2 WHERE id = ?3",
                rusqlite::params!["failed", e.to_string(), history_id],
            )
            .map_err(|e| e.to_string())?;

            Ok(GenerateResult {
                file_path: String::new(),
                file_size: 0.0,
                success: false,
                message: format!("❌ فشل إنشاء التقرير: {}", e),
            })
        }
    }
}

/// Generate report data and return PDF bytes.
/// This is a placeholder — actual data aggregation and PDF generation
/// happens on the frontend. On the backend, we generate a summary PDF
/// using the available report data from the database.
async fn generate_report_data(
    state: &State<'_, AppState>,
    report: &ScheduledReport,
) -> Result<Vec<u8>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let (branch_name, area_name, clinic_name) = get_hierarchy_names(conn, report)?;

    // Build a simple text-based PDF summary using print-friendly content
    // For full-blown PDF generation, the frontend should be used.
    let now = Local::now().format("%Y-%m-%d %H:%M").to_string();
    let month = Local::now().format("%Y-%m").to_string();
    let year = Local::now().year();

    // Collect summary data based on report type
    let (title, table_rows) = match report.report_type.as_str() {
        "analytical" => {
            let drugs_total: f64 = conn
                .query_row(
                    "SELECT COALESCE(SUM(total_cost), 0) FROM detailed_drug_dispensed WHERE dispense_month = ?1",
                    [&month],
                    |row| row.get(0),
                )
                .unwrap_or(0.0);

            let insulin_total: f64 = conn
                .query_row(
                    "SELECT COALESCE(SUM(cost), 0) FROM insulin_dispensed WHERE dispense_month = ?1",
                    [&month],
                    |row| row.get(0),
                )
                .unwrap_or(0.0);

            let tickets_count: i64 = conn
                .query_row(
                    "SELECT COALESCE(SUM(tickets_56c + tickets_56b), 0) FROM medical_tickets WHERE dispense_month = ?1",
                    [&month],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            (
                format!("تقرير تحليلي - {}", month),
                vec![
                    format!("إجمالي صرف الأدوية: {:.2} جنيه", drugs_total),
                    format!("إجمالي صرف الأنسولين: {:.2} جنيه", insulin_total),
                    format!("إجمالي التذاكر الطبية: {}", tickets_count),
                    format!("إجمالي التكلفة: {:.2} جنيه", drugs_total + insulin_total),
                ],
            )
        }
        "financial" => {
            let free_total: f64 = conn
                .query_row(
                    "SELECT COALESCE(SUM(drugs_free_authority + drugs_free_students + drugs_free_infants + drugs_free_breadwinner_women), 0)
                     FROM monthly_drugs_dispensed WHERE dispense_month = ?1",
                    [&month],
                    |row| row.get(0),
                )
                .unwrap_or(0.0);

            let supported_total: f64 = conn
                .query_row(
                    "SELECT COALESCE(SUM(drugs_supported_authority_value + drugs_supported_students_value + drugs_supported_infants_value), 0)
                     FROM monthly_drugs_dispensed WHERE dispense_month = ?1",
                    [&month],
                    |row| row.get(0),
                )
                .unwrap_or(0.0);

            (
                format!("تقرير مالي - {}", month),
                vec![
                    format!("الأدوية المجانية: {:.2} جنيه", free_total),
                    format!("الأدوية المدعمة: {:.2} جنيه", supported_total),
                    format!("الإجمالي: {:.2} جنيه", free_total + supported_total),
                ],
            )
        }
        "executive" => {
            let drugs_count: i64 = conn
                .query_row("SELECT COUNT(*) FROM drugs", [], |row| row.get(0))
                .unwrap_or(0);
            let clinics_count: i64 = conn
                .query_row("SELECT COUNT(*) FROM clinics", [], |row| row.get(0))
                .unwrap_or(0);
            let users_count: i64 = conn
                .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
                .unwrap_or(0);

            (
                format!("تقرير تنفيذي - {}", year),
                vec![
                    format!("عدد الأدوية المسجلة: {}", drugs_count),
                    format!("عدد العيادات: {}", clinics_count),
                    format!("عدد المستخدمين: {}", users_count),
                ],
            )
        }
        "drugs" => {
            let dispensed_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM detailed_drug_dispensed WHERE dispense_month = ?1",
                    [&month],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            let total_quantity: f64 = conn
                .query_row(
                    "SELECT COALESCE(SUM(quantity), 0) FROM detailed_drug_dispensed WHERE dispense_month = ?1",
                    [&month],
                    |row| row.get(0),
                )
                .unwrap_or(0.0);

            (
                format!("تقرير الأدوية - {}", month),
                vec![
                    format!("عدد عمليات الصرف: {}", dispensed_count),
                    format!("إجمالي الكميات: {:.2}", total_quantity),
                ],
            )
        }
        _ => (
            format!("تقرير {}", report.name),
            vec!["بيانات غير متوفرة".to_string()],
        ),
    };

    // Generate simple PDF using embedded text
    generate_simple_pdf(&title, &report.name, &branch_name, &area_name, &clinic_name, &month, &now, &table_rows)
}

fn get_hierarchy_names(conn: &rusqlite::Connection, report: &ScheduledReport) -> Result<(String, String, String), String> {
    let branch_name = if let Some(bid) = report.branch_id {
        conn.query_row("SELECT name FROM branches WHERE id = ?1", [bid], |row| row.get::<_, String>(0))
            .unwrap_or_else(|_| "الكل".to_string())
    } else {
        "جميع الفروع".to_string()
    };

    let area_name = if let Some(aid) = report.area_id {
        conn.query_row("SELECT name FROM areas WHERE id = ?1", [aid], |row| row.get::<_, String>(0))
            .unwrap_or_else(|_| "الكل".to_string())
    } else {
        String::new()
    };

    let clinic_name = if let Some(cid) = report.clinic_id {
        conn.query_row("SELECT name FROM clinics WHERE id = ?1", [cid], |row| row.get::<_, String>(0))
            .unwrap_or_else(|_| "الكل".to_string())
    } else {
        String::new()
    };

    Ok((branch_name, area_name, clinic_name))
}

/// Generate a simple text-based PDF for scheduled reports.
/// Tracks byte offsets correctly so the xref table is valid.
fn generate_simple_pdf(
    title: &str,
    report_name: &str,
    branch: &str,
    area: &str,
    clinic: &str,
    month: &str,
    timestamp: &str,
    rows: &[String],
) -> Result<Vec<u8>, String> {
    let mut content = Vec::new();

    // ── Helper: append bytes, return end offset ─────────────────────
    fn write_obj(buf: &mut Vec<u8>, data: &[u8]) -> usize {
        let start = buf.len();
        buf.extend_from_slice(data);
        start
    }

    // ── Object 0: dummy entry ───────────────────────────────────────
    let _obj0: usize = 0; // always 0000000000

    // ── Header ───────────────────────────────────────────────────────
    let _hdr_end = write_obj(&mut content, b"%PDF-1.4\n"); // 9 bytes → offset 9

    // ── Object 1: Catalog ────────────────────────────────────────────
    // offset is the current end of content (= content.len() before writing)
    let obj1_off = write_obj(&mut content, b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    // obj1_off = 9, correct.

    // ── Object 2: Pages ──────────────────────────────────────────────
    let obj2_off = write_obj(&mut content, b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

    // ── Object 3: Page ───────────────────────────────────────────────
    let obj3_off = write_obj(&mut content, b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n");

    // ── Build PDF text content ───────────────────────────────────────
    let mut pdf_text = String::new();
    pdf_text.push_str("الهيئة العامة للتأمين الصحي\n");
    pdf_text.push_str("نظام إحصائيات الأدوية والمستلزمات الطبية\n");
    pdf_text.push_str("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n");
    pdf_text.push_str(&format!("تقرير مجدول تلقائياً\n\n"));
    pdf_text.push_str(&format!("العنوان: {}\n", title));
    pdf_text.push_str(&format!("التقرير: {}\n", report_name));
    pdf_text.push_str(&format!("الشهر: {}\n", month));
    pdf_text.push_str(&format!("تاريخ الإنشاء: {}\n\n", timestamp));
    if !branch.is_empty() { pdf_text.push_str(&format!("الفرع: {}\n", branch)); }
    if !area.is_empty() { pdf_text.push_str(&format!("المنطقة: {}\n", area)); }
    if !clinic.is_empty() { pdf_text.push_str(&format!("العيادة: {}\n", clinic)); }
    pdf_text.push_str("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n");
    for (i, row) in rows.iter().enumerate() {
        pdf_text.push_str(&format!("{}. {}\n", i + 1, row));
    }
    pdf_text.push_str("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    pdf_text.push_str(&format!("جميع الحقوق محفوظة © {}\n", Local::now().year()));
    pdf_text.push_str("تصميم وإعداد وتطوير: ك/ أحمد علي أحمد كوكب\n\n");
    pdf_text.push_str("── نهاية التقرير ──\n");

    // ── Build stream operator content ────────────────────────────────
    let mut stream_content = String::from("BT\n/F2 20 Tf\n50 560 Td\n(");
    stream_content.push_str(&escape_pdf_string(title));
    stream_content.push_str(") Tj\n/F1 10 Tf\n0 -25 Td\n");

    for line in pdf_text.lines() {
        stream_content.push_str(&format!(
            "0 -14 Td\n({}) Tj\n",
            escape_pdf_string(line)
        ));
    }
    stream_content.push_str("ET\n");

    let stream_bytes = stream_content.as_bytes();
    let stream_len = stream_bytes.len();

    // ── Object 4: Stream ─────────────────────────────────────────────
    let obj4_off = content.len();
    let header = format!("4 0 obj\n<< /Length {} >>\nstream\n", stream_len);
    content.extend_from_slice(header.as_bytes());
    content.extend_from_slice(stream_bytes);
    content.extend_from_slice(b"\nendstream\nendobj\n");

    // ── Object 5: Font Helvetica ─────────────────────────────────────
    let obj5_off = content.len();
    content.extend_from_slice(
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    );

    // ── Object 6: Font Helvetica-Bold ────────────────────────────────
    let obj6_off = content.len();
    content.extend_from_slice(
        b"6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n"
    );

    // ── XREF table with DYNAMIC offsets ──────────────────────────────
    let xref_offset = content.len();
    let xref = format!(
        "xref\n0 7\n\
         0000000000 65535 f \n\
         {:010} 00000 n \n\
         {:010} 00000 n \n\
         {:010} 00000 n \n\
         {:010} 00000 n \n\
         {:010} 00000 n \n\
         {:010} 00000 n \n\
         trailer\n<< /Size 7 /Root 1 0 R >>\n\
         startxref\n{}\n%%EOF\n",
        obj1_off, obj2_off, obj3_off, obj4_off, obj5_off, obj6_off,
        xref_offset
    );

    content.extend_from_slice(xref.as_bytes());
    Ok(content)
}

fn escape_pdf_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
}

// ═════════════════════════════════════════════════════════════════════
// HISTORY
// ═════════════════════════════════════════════════════════════════════

#[tauri::command]
pub async fn get_report_history(
    state: State<'_, AppState>,
    schedule_id: Option<i64>,
) -> Result<Vec<ReportHistory>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let (query, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(sid) = schedule_id {
        (
            "SELECT id, schedule_id, report_name, file_path, file_size, status, error_message, generated_at
             FROM scheduled_report_history
             WHERE schedule_id = ?1
             ORDER BY generated_at DESC
             LIMIT 50".to_string(),
            vec![Box::new(sid)],
        )
    } else {
        (
            "SELECT id, schedule_id, report_name, file_path, file_size, status, error_message, generated_at
             FROM scheduled_report_history
             ORDER BY generated_at DESC
             LIMIT 100".to_string(),
            vec![],
        )
    };

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let history = stmt
        .query_map(rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())), row_to_history)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(history)
}

// ═════════════════════════════════════════════════════════════════════
// CHECK AND RUN DUE REPORTS (called on app startup)
// ═════════════════════════════════════════════════════════════════════

#[tauri::command]
pub async fn check_due_reports(
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let today = Local::now().format("%Y-%m-%d").to_string();

    // Find active reports where next_run <= today
    let mut stmt = conn
        .prepare(
            "SELECT id, name, report_type, schedule_type, day_of_month,
                    output_folder, branch_id, area_id, clinic_id,
                    is_active, last_generated, next_run, created_at, updated_at
             FROM scheduled_reports
             WHERE is_active = 1 AND next_run <= ?1
             ORDER BY next_run ASC",
        )
        .map_err(|e| e.to_string())?;

    let due_reports: Vec<ScheduledReport> = stmt
        .query_map([&today], row_to_schedule)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Return names of due reports (actual execution happens on frontend)
    let names: Vec<String> = due_reports.iter().map(|r| r.name.clone()).collect();
    Ok(names)
}
