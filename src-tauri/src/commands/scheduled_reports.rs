use tauri::State;
use crate::db::AppState;
use chrono::{Local, Datelike};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ScheduledReport {
    pub id: i64,
    pub name: String,
    pub report_type: String,       // 'analytical', 'financial', 'executive', 'drugs'
    pub schedule_type: String,     // 'monthly', 'quarterly', 'yearly'
    pub day_from: i32,             // first day of the period (1-28)
    pub day_to: i32,               // last day of the period (1-28, or 0 = last day)
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
        day_from: row.get(4)?,
        day_to: row.get(5)?,
        output_folder: row.get(6)?,
        branch_id: row.get(7)?,
        area_id: row.get(8)?,
        clinic_id: row.get(9)?,
        is_active: row.get(10)?,
        last_generated: row.get(11)?,
        next_run: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
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
fn calc_next_run(schedule_type: &str, day_to: i32) -> String {
    let today = Local::now().naive_local().date();
    let current_day = today.day() as i32;
    let current_month = today.month();
    let current_year = today.year();

    // Determine target day (use the LAST day of the configured range)
    let target_day = if day_to <= 0 {
        // Last day of month
        let next_month = if current_month == 12 { 1 } else { current_month + 1 };
        let next_year = if current_month == 12 { current_year + 1 } else { current_year };
        let last_day = num_days_in_month(next_year, next_month);
        last_day
    } else {
        day_to.min(31)
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
            "SELECT id, name, report_type, schedule_type, day_from, day_to,
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
    day_from: i32,
    day_to: i32,
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
        calc_next_run(&schedule_type, day_to)
    } else {
        String::new()
    };

    if let Some(existing_id) = id {
        // UPDATE existing
        conn.execute(
            "UPDATE scheduled_reports SET
                name = ?1, report_type = ?2, schedule_type = ?3,
                day_from = ?4, day_to = ?5, output_folder = ?6,
                branch_id = ?7, area_id = ?8, clinic_id = ?9,
                is_active = ?10, next_run = ?11, updated_at = ?12
             WHERE id = ?13",
            rusqlite::params![
                name, report_type, schedule_type,
                day_from, day_to, output_folder,
                branch_id, area_id, clinic_id,
                is_active, next_run, now, existing_id
            ],
        )
        .map_err(|e| e.to_string())?;

        // Fetch updated
        let report = conn
            .query_row(
                "SELECT id, name, report_type, schedule_type, day_from, day_to,
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
                (name, report_type, schedule_type, day_from, day_to, output_folder,
                 branch_id, area_id, clinic_id, is_active, next_run, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
            rusqlite::params![
                name, report_type, schedule_type, day_from, day_to, output_folder,
                branch_id, area_id, clinic_id, is_active, next_run, now
            ],
        )
        .map_err(|e| e.to_string())?;

        let new_id = conn.last_insert_rowid();
        let report = conn
            .query_row(
                "SELECT id, name, report_type, schedule_type, day_from, day_to,
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
                "SELECT id, name, report_type, schedule_type, day_from, day_to,
                        output_folder, branch_id, area_id, clinic_id,
                        is_active, last_generated, next_run, created_at, updated_at
                 FROM scheduled_reports WHERE id = ?1",
                [id],
                row_to_schedule,
            )
            .map_err(|e| e.to_string())?;
        calc_next_run(&report.schedule_type, report.day_to)
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
            "SELECT id, name, report_type, schedule_type, day_from, day_to,
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

/// One comparison row: the same metric in the current period vs the
/// previous period (month / quarter / year) plus the change percentage.
#[derive(serde::Serialize, Clone, Debug)]
pub struct ComparisonRow {
    pub label: String,
    pub current: String,
    pub previous: String,
    pub change_pct: String,
}

/// Data returned to the frontend so it can generate the PDF with the app's
/// Arabic-aware PDF engine (embedded Amiri font) and write it to disk.
#[derive(serde::Serialize)]
pub struct ScheduledReportRunData {
    pub history_id: i64,
    pub schedule: ScheduledReport,
    pub title: String,
    pub month: String,
    pub timestamp: String,
    pub branch_name: String,
    pub area_name: String,
    pub clinic_name: String,
    pub rows: Vec<(String, String)>,
    /// Current vs previous period comparison (may be empty for static reports).
    pub comparison: Vec<ComparisonRow>,
    pub filename_base: String,
    /// Resolved output folder — falls back to Documents/DrugStats/Reports
    /// when the schedule has no folder configured.
    pub output_folder: String,
}

/// Default output folder for scheduled reports when none is configured:
/// <USERPROFILE>\Documents\DrugStats\Reports
fn default_output_folder() -> String {
    if let Ok(profile) = std::env::var("USERPROFILE") {
        format!("{}\\Documents\\DrugStats\\Reports", profile)
    } else {
        "DrugStats_Reports".to_string()
    }
}

/// Build a WHERE-clause suffix that filters by the schedule's hierarchy
/// (branch / area / clinic) when configured. Returns "" when unfiltered.
fn hierarchy_filter(report: &ScheduledReport) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(b) = report.branch_id { parts.push(format!("branch_id = {}", b)); }
    if let Some(a) = report.area_id { parts.push(format!("area_id = {}", a)); }
    if let Some(c) = report.clinic_id { parts.push(format!("clinic_id = {}", c)); }
    if parts.is_empty() { String::new() } else { format!(" AND {}", parts.join(" AND ")) }
}

/// Compute the (start_month, end_month) of the period immediately BEFORE
/// the given range, for comparison purposes. Mirrors report_period logic:
/// - monthly   → previous calendar month
/// - quarterly → the quarter before the one containing `start`
/// - yearly    → the previous year
fn previous_period(schedule_type: &str, start: &str) -> (String, String) {
    let parts: Vec<&str> = start.split('-').collect();
    let y: i32 = parts
        .first()
        .and_then(|p| p.parse().ok())
        .unwrap_or_else(|| Local::now().year());
    let m: u32 = parts
        .get(1)
        .and_then(|p| p.parse().ok())
        .unwrap_or(1)
        .max(1)
        .min(12);

    match schedule_type {
        "quarterly" => {
            let q_start = ((m - 1) / 3) * 3 + 1;
            if q_start == 1 {
                (format!("{:04}-10", y - 1), format!("{:04}-12", y - 1))
            } else {
                (format!("{:04}-{:02}", y, q_start - 3), format!("{:04}-{:02}", y, q_start - 1))
            }
        }
        "yearly" => (format!("{:04}-01", y - 1), format!("{:04}-12", y - 1)),
        _ => {
            if m == 1 {
                (format!("{:04}-12", y - 1), format!("{:04}-12", y - 1))
            } else {
                (format!("{:04}-{:02}", y, m - 1), format!("{:04}-{:02}", y, m - 1))
            }
        }
    }
}

/// Run a SUM/COUNT aggregation over a period range with the hierarchy filter.
/// Returns the numeric total (0 when no rows or the query fails).
fn period_total(
    conn: &rusqlite::Connection,
    select_expr: &str,
    table: &str,
    filter: &str,
    start: &str,
    end: &str,
) -> f64 {
    let sql = format!(
        "SELECT {} FROM {} WHERE dispense_month BETWEEN ?1 AND ?2{}",
        select_expr, table, filter
    );
    conn.query_row(&sql, rusqlite::params![start, end], |row| row.get(0))
        .unwrap_or(0.0)
}

/// Format a change percentage: "+12.3%" / "-5.0%" / "—" (both zero) / "جديد" (was zero).
fn format_change(current: f64, previous: f64) -> String {
    if previous.abs() < f64::EPSILON {
        if current.abs() < f64::EPSILON {
            "—".to_string()
        } else {
            "جديد".to_string()
        }
    } else {
        format!("{:+.1}%", ((current - previous) / previous) * 100.0)
    }
}

/// Build a comparison row from current/previous numeric totals.
fn make_comparison(
    label: &str,
    current: f64,
    previous: f64,
    fmt: impl Fn(f64) -> String,
) -> ComparisonRow {
    ComparisonRow {
        label: label.to_string(),
        current: fmt(current),
        previous: fmt(previous),
        change_pct: format_change(current, previous),
    }
}

/// Compute the (start_month, end_month, label) covered by a run based on
/// the schedule's periodicity. `month` is an optional "YYYY-MM" reference
/// month (defaults to the current month):
/// - monthly  → that single month
/// - quarterly → the 3-month quarter containing it
/// - yearly   → all 12 months of its year
fn report_period(schedule_type: &str, month: Option<String>) -> (String, String, String) {
    let today = Local::now();
    let year = today.year();
    let mon = today.month();

    let (y, m) = if let Some(m) = month {
        let mut parts = m.split('-');
        let py = parts.next().and_then(|p| p.parse::<i32>().ok()).unwrap_or(year);
        let pm = parts.next().and_then(|p| p.parse::<u32>().ok()).unwrap_or(mon);
        (py, pm.max(1).min(12))
    } else {
        (year, mon)
    };

    match schedule_type {
        "quarterly" => {
            let q_start = ((m - 1) / 3) * 3 + 1;
            let q_end = q_start + 2;
            let q_num = (m - 1) / 3 + 1;
            (
                format!("{:04}-{:02}", y, q_start),
                format!("{:04}-{:02}", y, q_end),
                format!("الربع {} من {}", q_num, y),
            )
        }
        "yearly" => (
            format!("{:04}-01", y),
            format!("{:04}-12", y),
            format!("سنة {}", y),
        ),
        _ => (format!("{:04}-{:02}", y, m), format!("{:04}-{:02}", y, m), format!("{:04}-{:02}", y, m)),
    }
}

/// Start a scheduled report run. Creates a 'running' history entry and
/// returns the aggregated summary data so the frontend can render the PDF
/// with proper Arabic fonts and write it to the configured output folder.
#[tauri::command]
pub async fn run_scheduled_report_now(
    state: State<'_, AppState>,
    schedule_id: i64,
    month: Option<String>,
) -> Result<ScheduledReportRunData, String> {
    let (report, history_id) = {
        let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

        let report: ScheduledReport = conn
            .query_row(
                "SELECT id, name, report_type, schedule_type, day_from, day_to,
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
        (report, h_id)
    };

    // Generate report filename base (timestamped, sanitized)
    let now = Local::now();
    let date_str = now.format("%Y-%m-%d_%H%M%S").to_string();
    let safe_name = report.name.replace([' ', '/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    let filename_base = format!("{}_{}", safe_name, date_str);

    // Determine the period covered (monthly / quarter / year) using the
    // schedule's periodicity and the optional reference month.
    let (period_start, period_end, mut period_label) =
        report_period(&report.schedule_type, month);
    // Append the configured day range so the preview/paper confirms the
    // exact period the report covers (e.g. "من يوم 1 إلى 7").
    let day_to_label = if report.day_to <= 0 {
        "آخر الشهر".to_string()
    } else {
        report.day_to.to_string()
    };
    period_label = format!(
        "{} (من يوم {} إلى {})",
        period_label,
        report.day_from.max(1),
        day_to_label
    );

    // Collect summary data (hierarchy-filtered). On any failure, mark the
    // history entry as failed so it doesn't stay 'running' forever.
    let collect_result = (|| -> Result<_, String> {
        let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
        let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
        let (title, rows, comparison) = collect_report_data(conn, &report, &period_start, &period_end, &period_label)
            .map_err(|e| e.to_string())?;
        let (branch_name, area_name, clinic_name) = get_hierarchy_names(conn, &report)?;
        Ok((title, rows, comparison, branch_name, area_name, clinic_name))
    })();

    let (title, rows, comparison, branch_name, area_name, clinic_name) = match collect_result {
        Ok(v) => v,
        Err(e) => {
            let conn_guard = state.db.lock().map_err(|e2| e2.to_string())?;
            if let Some(conn) = conn_guard.as_ref() {
                let _ = conn.execute(
                    "UPDATE scheduled_report_history SET status = ?1, error_message = ?2 WHERE id = ?3",
                    rusqlite::params!["failed", e.clone(), history_id],
                );
            }
            return Err(e);
        }
    };

    let output_folder = if report.output_folder.trim().is_empty() {
        default_output_folder()
    } else {
        report.output_folder.clone()
    };

    Ok(ScheduledReportRunData {
        history_id,
        schedule: report,
        title,
        month: period_label.clone(),
        timestamp: now.format("%Y-%m-%d %H:%M").to_string(),
        branch_name,
        area_name,
        clinic_name,
        rows,
        comparison,
        filename_base,
        output_folder,
    })
}

/// Mark a scheduled run as successful and advance last_generated / next_run.
#[tauri::command]
pub async fn complete_scheduled_report(
    state: State<'_, AppState>,
    schedule_id: i64,
    history_id: i64,
    file_path: String,
    file_size_kb: f64,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE scheduled_report_history SET status = ?1, file_path = ?2, file_size = ?3 WHERE id = ?4",
        rusqlite::params!["success", file_path, file_size_kb, history_id],
    )
    .map_err(|e| e.to_string())?;

    let next_run = {
        let report: ScheduledReport = conn
            .query_row(
                "SELECT id, name, report_type, schedule_type, day_from, day_to,
                        output_folder, branch_id, area_id, clinic_id,
                        is_active, last_generated, next_run, created_at, updated_at
                 FROM scheduled_reports WHERE id = ?1",
                [schedule_id],
                row_to_schedule,
            )
            .map_err(|e| e.to_string())?;
        // Only advance next_run for active schedules (matches save/toggle)
        if report.is_active {
            calc_next_run(&report.schedule_type, report.day_to)
        } else {
            String::new()
        }
    };

    conn.execute(
        "UPDATE scheduled_reports SET last_generated = ?1, next_run = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![now, next_run, now, schedule_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Mark a scheduled run as failed.
#[tauri::command]
pub async fn fail_scheduled_report(
    state: State<'_, AppState>,
    history_id: i64,
    error_message: String,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "UPDATE scheduled_report_history SET status = ?1, error_message = ?2 WHERE id = ?3",
        rusqlite::params!["failed", error_message, history_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Mark a scheduled run as cancelled by the user (previewed but not saved).
/// Keeps the history row so the user can see the run happened but was
/// deliberately abandoned — no file was produced.
#[tauri::command]
pub async fn cancel_scheduled_report(
    state: State<'_, AppState>,
    history_id: i64,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "UPDATE scheduled_report_history SET status = ?1, error_message = ?2 WHERE id = ?3",
        rusqlite::params!["cancelled", "أُلغي بواسطة المستخدم قبل الحفظ", history_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Collect summary data for a report type. Returns
/// (title, [(label, value)], [ComparisonRow]).
/// Every aggregation query honors the schedule's branch/area/clinic filters
/// AND restricts data to [period_start, period_end] (both "YYYY-MM").
/// Comparison rows compare the current period vs the previous one.
fn collect_report_data(
    conn: &rusqlite::Connection,
    report: &ScheduledReport,
    period_start: &str,
    period_end: &str,
    period_label: &str,
) -> Result<(String, Vec<(String, String)>, Vec<ComparisonRow>), String> {
    let filter = hierarchy_filter(report);
    let (prev_start, prev_end) = previous_period(&report.schedule_type, period_start);

    let money = |v: f64| format!("{:.2} جنيه", v);
    let count = |v: f64| format!("{}", v as i64);

    let (rows, comparison): (Vec<(String, String)>, Vec<ComparisonRow>) =
        match report.report_type.as_str() {
            "analytical" => {
                let cur_drugs = period_total(conn, "COALESCE(SUM(total_cost), 0)", "detailed_drug_dispensed", &filter, period_start, period_end);
                let prev_drugs = period_total(conn, "COALESCE(SUM(total_cost), 0)", "detailed_drug_dispensed", &filter, &prev_start, &prev_end);
                let cur_insulin = period_total(conn, "COALESCE(SUM(cost), 0)", "insulin_dispensed", &filter, period_start, period_end);
                let prev_insulin = period_total(conn, "COALESCE(SUM(cost), 0)", "insulin_dispensed", &filter, &prev_start, &prev_end);
                let cur_tickets = period_total(conn, "COALESCE(SUM(tickets_56c + tickets_56b), 0)", "medical_tickets", &filter, period_start, period_end);
                let prev_tickets = period_total(conn, "COALESCE(SUM(tickets_56c + tickets_56b), 0)", "medical_tickets", &filter, &prev_start, &prev_end);

                let rows = vec![
                    ("إجمالي صرف الأدوية".to_string(), money(cur_drugs)),
                    ("إجمالي صرف الأنسولين".to_string(), money(cur_insulin)),
                    ("إجمالي التذاكر الطبية".to_string(), count(cur_tickets)),
                    ("إجمالي التكلفة".to_string(), money(cur_drugs + cur_insulin)),
                ];
                let comparison = vec![
                    make_comparison("إجمالي صرف الأدوية", cur_drugs, prev_drugs, &money),
                    make_comparison("إجمالي صرف الأنسولين", cur_insulin, prev_insulin, &money),
                    make_comparison("إجمالي التذاكر الطبية", cur_tickets, prev_tickets, &count),
                    make_comparison("إجمالي التكلفة", cur_drugs + cur_insulin, prev_drugs + prev_insulin, &money),
                ];
                (rows, comparison)
            }
            "financial" => {
                let cur_free = period_total(
                    conn,
                    "COALESCE(SUM(drugs_free_authority + drugs_free_students + drugs_free_infants + drugs_free_breadwinner_women), 0)",
                    "monthly_drugs_dispensed",
                    &filter,
                    period_start,
                    period_end,
                );
                let prev_free = period_total(
                    conn,
                    "COALESCE(SUM(drugs_free_authority + drugs_free_students + drugs_free_infants + drugs_free_breadwinner_women), 0)",
                    "monthly_drugs_dispensed",
                    &filter,
                    &prev_start,
                    &prev_end,
                );
                let cur_supported = period_total(
                    conn,
                    "COALESCE(SUM(drugs_supported_authority_value + drugs_supported_students_value + drugs_supported_infants_value), 0)",
                    "monthly_drugs_dispensed",
                    &filter,
                    period_start,
                    period_end,
                );
                let prev_supported = period_total(
                    conn,
                    "COALESCE(SUM(drugs_supported_authority_value + drugs_supported_students_value + drugs_supported_infants_value), 0)",
                    "monthly_drugs_dispensed",
                    &filter,
                    &prev_start,
                    &prev_end,
                );

                let rows = vec![
                    ("الأدوية المجانية".to_string(), money(cur_free)),
                    ("الأدوية المدعمة".to_string(), money(cur_supported)),
                    ("الإجمالي".to_string(), money(cur_free + cur_supported)),
                ];
                let comparison = vec![
                    make_comparison("الأدوية المجانية", cur_free, prev_free, &money),
                    make_comparison("الأدوية المدعمة", cur_supported, prev_supported, &money),
                    make_comparison("الإجمالي", cur_free + cur_supported, prev_free + prev_supported, &money),
                ];
                (rows, comparison)
            }
            "executive" => {
                let drugs_count: i64 = conn
                    .query_row("SELECT COUNT(*) FROM drugs", [], |row| row.get(0))
                    .map_err(|e| e.to_string())?;
                let clinics_count: i64 = conn
                    .query_row("SELECT COUNT(*) FROM clinics", [], |row| row.get(0))
                    .map_err(|e| e.to_string())?;
                let users_count: i64 = conn
                    .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
                    .map_err(|e| e.to_string())?;

                let rows = vec![
                    ("عدد الأدوية المسجلة".to_string(), format!("{}", drugs_count)),
                    ("عدد العيادات".to_string(), format!("{}", clinics_count)),
                    ("عدد المستخدمين".to_string(), format!("{}", users_count)),
                ];
                // Static counts — no period comparison available.
                (rows, Vec::new())
            }
            "drugs" => {
                let cur_count = period_total(conn, "COUNT(*)", "detailed_drug_dispensed", &filter, period_start, period_end);
                let prev_count = period_total(conn, "COUNT(*)", "detailed_drug_dispensed", &filter, &prev_start, &prev_end);
                let cur_qty = period_total(conn, "COALESCE(SUM(quantity), 0)", "detailed_drug_dispensed", &filter, period_start, period_end);
                let prev_qty = period_total(conn, "COALESCE(SUM(quantity), 0)", "detailed_drug_dispensed", &filter, &prev_start, &prev_end);

                let rows = vec![
                    ("عدد عمليات الصرف".to_string(), count(cur_count)),
                    ("إجمالي الكميات".to_string(), format!("{:.2}", cur_qty)),
                ];
                let comparison = vec![
                    make_comparison("عدد عمليات الصرف", cur_count, prev_count, &count),
                    make_comparison("إجمالي الكميات", cur_qty, prev_qty, &|v| format!("{:.2}", v)),
                ];
                (rows, comparison)
            }
            _ => (vec![("بيانات غير متوفرة".to_string(), String::new())], Vec::new()),
        };

    // Title always leads with the report's OWN name so the preview/paper
    // reflects the actual configured report — not a generic default label.
    let title = format!("{} - {}", report.name, period_label);

    Ok((title, rows, comparison))
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
) -> Result<Vec<ScheduledReport>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let today = Local::now().format("%Y-%m-%d").to_string();

    // Find active reports where next_run <= today
    let mut stmt = conn
        .prepare(
            "SELECT id, name, report_type, schedule_type, day_from, day_to,
                    output_folder, branch_id, area_id, clinic_id,
                    is_active, last_generated, next_run, created_at, updated_at
             FROM scheduled_reports
             WHERE is_active = 1 AND next_run != '' AND next_run <= ?1
             ORDER BY next_run ASC",
        )
        .map_err(|e| e.to_string())?;

    let due_reports: Vec<ScheduledReport> = stmt
        .query_map([&today], row_to_schedule)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Return full due reports so the frontend can run each one automatically
    Ok(due_reports)
}
