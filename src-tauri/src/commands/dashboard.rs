use crate::db::AppState;
use tauri::State;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct DashboardSummary {
    pub total_dispensed: f64,
    pub active_clinics: i32,
    /// Which hierarchy level the active-clinics figure actually counts
    /// ('clinic' | 'area' | 'branch').
    pub active_clinics_level: String,
    pub tickets_count: i32,
    pub judicial_count: i32,
    pub authority_cost: f64,
    /// True when the authority-cost source table (monthly_drugs_dispensed)
    /// holds rows for the selected scope — lets the UI show N/A vs a real 0.
    pub has_authority_data: bool,
}

/// Count active dispensing entities for the month, at the level the data was
/// actually entered at (triple-isolation rule): clinics take priority, then
/// areas, then branches. Counts DISTINCT entities across all dispensed tables
/// so the same unit entered in two tables is counted once. The legacy
/// monthly_drugs_dispensed archive is excluded (archive-only).
fn count_active_entities(
    conn: &rusqlite::Connection,
    branch_id: Option<i32>,
    dispense_month: &str,
) -> (i32, &'static str) {
    let branch_filter = if branch_id.is_some() { " AND branch_id = ?2" } else { "" };

    let base = format!(
        "SELECT clinic_id, area_id, branch_id FROM detailed_drug_dispensed WHERE dispense_month = ?1{}
         UNION SELECT clinic_id, area_id, branch_id FROM insulin_dispensed WHERE dispense_month = ?1{}
         UNION SELECT clinic_id, area_id, branch_id FROM medical_tickets WHERE dispense_month = ?1{}
         UNION SELECT clinic_id, area_id, branch_id FROM judicial_dispensed WHERE dispense_month = ?1{}
         UNION SELECT clinic_id, area_id, branch_id FROM monthly_supplies_dispensed WHERE dispense_month = ?1{}
         UNION SELECT clinic_id, area_id, branch_id FROM monthly_free_drugs_dispensed WHERE dispense_month = ?1{}
         UNION SELECT clinic_id, area_id, branch_id FROM monthly_supported_drugs_dispensed WHERE dispense_month = ?1{}
         UNION SELECT clinic_id, area_id, branch_id FROM drug_groups WHERE dispense_month = ?1{}",
        branch_filter, branch_filter, branch_filter, branch_filter, branch_filter, branch_filter, branch_filter, branch_filter,
    );

    let count_sql = |cond: &str| -> i32 {
        let sql = format!("SELECT COUNT(*) FROM ({}) WHERE {}", base, cond);
        let params: Vec<Box<dyn rusqlite::ToSql>> = match branch_id {
            Some(bid) => vec![Box::new(dispense_month.to_string()), Box::new(bid)],
            None => vec![Box::new(dispense_month.to_string())],
        };
        let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
        conn.query_row(&sql, params_ref.as_slice(), |row| row.get(0)).unwrap_or(0)
    };

    let by_clinic = count_sql("clinic_id IS NOT NULL");
    if by_clinic > 0 {
        return (by_clinic, "clinic");
    }
    let by_area = count_sql("clinic_id IS NULL AND area_id IS NOT NULL");
    if by_area > 0 {
        return (by_area, "area");
    }
    let by_branch = count_sql("clinic_id IS NULL AND area_id IS NULL");
    (by_branch, "branch")
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_dashboard_summary(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    dispenseMonth: String,
) -> Result<DashboardSummary, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut where_clause = "WHERE dispense_month = ?1".to_string();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(dispenseMonth.clone())];

    if let Some(bid) = branchId {
        where_clause.push_str(" AND branch_id = ?2");
        params.push(Box::new(bid));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();

    // 1. Total Dispensed = detailed drugs only (user-confirmed business rule).
    let drug_sql = format!("SELECT SUM(total_cost) FROM detailed_drug_dispensed {}", where_clause);
    let total_dispensed: f64 = conn.query_row(&drug_sql, params_ref.as_slice(), |row| row.get(0)).unwrap_or(0.0);

    // 2. Active entities (clinics → areas → branches) by data entry level.
    let (active_clinics, active_clinics_level) = count_active_entities(&conn, branchId, &dispenseMonth);

    // 3. Tickets (branch level filters on branch_id directly, NOT clinic
    //    membership — branch-level records legitimately have clinic_id NULL).
    let mut t_where_clause = "WHERE dispense_month = ?1".to_string();
    let mut t_params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(dispenseMonth.clone())];
    if let Some(bid) = branchId {
        t_where_clause.push_str(" AND branch_id = ?2");
        t_params.push(Box::new(bid));
    }
    let t_params_ref: Vec<&dyn rusqlite::ToSql> = t_params.iter().map(|b| b.as_ref()).collect();

    let tickets_sql = format!("SELECT SUM(tickets_56b + tickets_56c) FROM medical_tickets {}", t_where_clause);
    let tickets_count: i32 = conn.query_row(&tickets_sql, t_params_ref.as_slice(), |row| row.get(0)).unwrap_or(0);

    // 4. Judicial
    let jud_sql = format!("SELECT COUNT(*) FROM judicial_dispensed {}", where_clause);
    let judicial_count: i32 = conn.query_row(&jud_sql, params_ref.as_slice(), |row| row.get(0)).unwrap_or(0);

    // 5. Authority Cost (Free authority + Supported authority contribution),
    //    from the two authoritative split tables only. The legacy combined
    //    table is archive-only and must never contribute to totals.
    //    Supported contribution is value − patient_share (matches the report
    //    page org-share derivation). has_authority_data is true when ANY of the
    //    two sources holds rows for the scope, so the UI shows "غير متاح"
    //    only when there is genuinely no authority data.
    let auth_exists_sql = format!(
        "SELECT (
            SELECT COUNT(*) > 0 FROM monthly_free_drugs_dispensed {}
         ) OR (
            SELECT COUNT(*) > 0 FROM monthly_supported_drugs_dispensed {}
         )",
        where_clause, where_clause
    );
    let auth_rows: i32 = conn.query_row(&auth_exists_sql, params_ref.as_slice(), |row| row.get(0)).unwrap_or(0);
    let has_authority_data = auth_rows > 0;

    let auth_sql = format!(
        "SELECT COALESCE((
            SELECT SUM(COALESCE(drugs_free_authority,0)) FROM monthly_free_drugs_dispensed {}
         ), 0)
         + COALESCE((
            SELECT SUM(COALESCE(drugs_supported_authority_value,0) - COALESCE(drugs_supported_authority_patient_share,0)) FROM monthly_supported_drugs_dispensed {}
         ), 0)",
        where_clause, where_clause
    );
    let authority_cost: f64 = conn.query_row(&auth_sql, params_ref.as_slice(), |row| row.get(0)).unwrap_or(0.0);

    Ok(DashboardSummary {
        total_dispensed,
        active_clinics,
        active_clinics_level: active_clinics_level.to_string(),
        tickets_count,
        judicial_count,
        authority_cost,
        has_authority_data,
    })
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TrendData {
    pub name: String,
    pub spending: f64,
    pub cases: f64,
    pub tickets: f64,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_dashboard_trend(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    months: Vec<String>, // Last 6 months ["YYYY-MM", "YYYY-MM", ...]
) -> Result<Vec<TrendData>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    if months.is_empty() {
        return Ok(Vec::new());
    }

    let mut result = Vec::new();

    // Map month formats like "2023-01" to Arabic names like "يناير"
    let ar_months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

    for month in months {
        let mut where_clause = "WHERE dispense_month = ?1".to_string();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(month.clone())];

        if let Some(bid) = branchId {
            where_clause.push_str(" AND branch_id = ?2");
            params.push(Box::new(bid));
        }

        let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();

        // Spending = detailed drugs only (matches the total_dispensed card).
        let drug_sql = format!("SELECT SUM(total_cost) FROM detailed_drug_dispensed {}", where_clause);
        let drug_cost: f64 = conn.query_row(&drug_sql, params_ref.as_slice(), |row| row.get(0)).unwrap_or(0.0);

        // Cases = detailed dispensing cases (cases_count column).
        let cases_sql = format!("SELECT SUM(COALESCE(cases_count,0)) FROM detailed_drug_dispensed {}", where_clause);
        let cases: f64 = conn.query_row(&cases_sql, params_ref.as_slice(), |row| row.get(0)).unwrap_or(0.0);

        // Tickets = medical tickets (56ب + 56ج), filtered at the branch level
        // directly so branch-level rows (clinic_id NULL) are not dropped.
        let mut t_where_clause = "WHERE dispense_month = ?1".to_string();
        let mut t_params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(month.clone())];
        if let Some(bid) = branchId {
            t_where_clause.push_str(" AND branch_id = ?2");
            t_params.push(Box::new(bid));
        }
        let t_params_ref: Vec<&dyn rusqlite::ToSql> = t_params.iter().map(|b| b.as_ref()).collect();
        let tickets_sql = format!("SELECT SUM(COALESCE(tickets_56b,0) + COALESCE(tickets_56c,0)) FROM medical_tickets {}", t_where_clause);
        let tickets: f64 = conn.query_row(&tickets_sql, t_params_ref.as_slice(), |row| row.get(0)).unwrap_or(0.0);

        let spending = drug_cost;

        // Parse month number to get Arabic name
        let month_name = if month.len() >= 7 {
            let m_num: usize = month[5..7].parse().unwrap_or(1);
            if m_num >= 1 && m_num <= 12 {
                ar_months[m_num - 1].to_string()
            } else {
                month.clone()
            }
        } else {
            month.clone()
        };

        result.push(TrendData {
            name: month_name,
            spending,
            cases,
            tickets,
        });
    }

    Ok(result)
}

#[derive(Serialize, Debug)]
pub struct RecentActivity {
    pub action: String,
    pub table_name: String,
    pub details: String,
    pub timestamp: String,
}

#[derive(Serialize, Debug)]
pub struct YtdResult {
    pub current: f64,
    pub previous: f64,
}

fn calc_ytd_for_year(
    conn: &rusqlite::Connection,
    branch_id: Option<i32>,
    start: &str,
    end: &str,
) -> f64 {
    // YTD mirrors the "إجمالي المنصرف" definition: detailed drugs only.
    let sql = if branch_id.is_some() {
        "SELECT COALESCE((SELECT SUM(total_cost) FROM detailed_drug_dispensed WHERE dispense_month BETWEEN ?1 AND ?2 AND branch_id = ?3), 0)"
    } else {
        "SELECT COALESCE((SELECT SUM(total_cost) FROM detailed_drug_dispensed WHERE dispense_month BETWEEN ?1 AND ?2), 0)"
    };

    if let Some(bid) = branch_id {
        conn.query_row(sql, rusqlite::params![start, end, bid], |row| row.get(0)).unwrap_or(0.0)
    } else {
        conn.query_row(sql, rusqlite::params![start, end], |row| row.get(0)).unwrap_or(0.0)
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_ytd_summary(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    year: String,
) -> Result<YtdResult, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let now = chrono::Local::now();
    let current_month = now.format("%Y-%m").to_string();

    // Current year: Jan to current month (or Dec for past years)
    let end_this = if year == now.format("%Y").to_string() {
        current_month.clone()
    } else {
        format!("{}-12", year)
    };
    let start_this = format!("{}-01", year);

    // Previous year: same months as this year
    let prev_year: i32 = year.parse::<i32>().unwrap_or(2025) - 1;
    // For previous year, cap at same month as current year (or Dec)
    let end_prev = if year == now.format("%Y").to_string() {
        // Previous year's same month
        let prev_month = format!("{}-{}", prev_year, &current_month[5..]);
        prev_month
    } else {
        format!("{}-12", prev_year)
    };
    let start_prev = format!("{}-01", prev_year);

    let current = calc_ytd_for_year(&conn, branchId, &start_this, &end_this);
    let previous = calc_ytd_for_year(&conn, branchId, &start_prev, &end_prev);

    Ok(YtdResult { current, previous })
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_missing_months(
    state: State<'_, AppState>,
    branchId: Option<i32>,
) -> Result<Vec<String>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // Generate last 12 calendar months using proper date arithmetic
    let now = chrono::Local::now();
    let mut months: Vec<String> = Vec::new();
    for i in 0..12 {
        if let Some(d) = now.checked_sub_months(chrono::Months::new(i)) {
            months.push(d.format("%Y-%m").to_string());
        }
    }

    months.sort();
    months.dedup();
    months.reverse();

    let mut missing = Vec::new();
    for month in &months {
        // Check across ALL dispensed tables for comprehensive detection
        let has_data: bool = {
            let (sql, params): (&str, Vec<Box<dyn rusqlite::ToSql>>) = if let Some(bid) = branchId {
                ("SELECT (
                    SELECT COUNT(*) > 0 FROM detailed_drug_dispensed WHERE dispense_month = ?1 AND branch_id = ?2
                 ) OR (
                    SELECT COUNT(*) > 0 FROM monthly_free_drugs_dispensed WHERE dispense_month = ?1 AND branch_id = ?2
                 ) OR (
                    SELECT COUNT(*) > 0 FROM monthly_supported_drugs_dispensed WHERE dispense_month = ?1 AND branch_id = ?2
                 ) OR (
                    SELECT COUNT(*) > 0 FROM insulin_dispensed WHERE dispense_month = ?1 AND branch_id = ?2
                 ) OR (
                    SELECT COUNT(*) > 0 FROM judicial_dispensed WHERE dispense_month = ?1 AND branch_id = ?2
                 ) OR (
                    SELECT COUNT(*) > 0 FROM medical_tickets WHERE dispense_month = ?1 AND branch_id = ?2
                 ) OR (
                    SELECT COUNT(*) > 0 FROM monthly_supplies_dispensed WHERE dispense_month = ?1 AND branch_id = ?2
                 ) OR (
                    SELECT COUNT(*) > 0 FROM drug_groups WHERE dispense_month = ?1 AND branch_id = ?2
                 )",
                 vec![Box::new(month.clone()), Box::new(bid)])
            } else {
                ("SELECT (
                    SELECT COUNT(*) > 0 FROM detailed_drug_dispensed WHERE dispense_month = ?1
                 ) OR (
                    SELECT COUNT(*) > 0 FROM monthly_free_drugs_dispensed WHERE dispense_month = ?1
                 ) OR (
                    SELECT COUNT(*) > 0 FROM monthly_supported_drugs_dispensed WHERE dispense_month = ?1
                 ) OR (
                    SELECT COUNT(*) > 0 FROM insulin_dispensed WHERE dispense_month = ?1
                 ) OR (
                    SELECT COUNT(*) > 0 FROM judicial_dispensed WHERE dispense_month = ?1
                 ) OR (
                    SELECT COUNT(*) > 0 FROM medical_tickets WHERE dispense_month = ?1
                 ) OR (
                    SELECT COUNT(*) > 0 FROM monthly_supplies_dispensed WHERE dispense_month = ?1
                 ) OR (
                    SELECT COUNT(*) > 0 FROM drug_groups WHERE dispense_month = ?1
                 )",
                 vec![Box::new(month.clone())])
            };
            let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
            conn.query_row(sql, params_ref.as_slice(), |row| row.get(0)).unwrap_or(false)
        };

        if !has_data {
            missing.push(month.clone());
        }
    }

    Ok(missing)
}

#[tauri::command]
pub fn get_recent_activity(
    state: State<'_, AppState>,
    limit: Option<i32>,
) -> Result<Vec<RecentActivity>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let max_rows = limit.unwrap_or(10);
    let mut stmt = conn
        .prepare("SELECT action, table_name, COALESCE(details, ''), timestamp FROM audit_log ORDER BY id DESC LIMIT ?1")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([max_rows], |row| {
            Ok(RecentActivity {
                action: row.get(0)?,
                table_name: row.get(1)?,
                details: row.get(2)?,
                timestamp: row.get::<_, String>(3).unwrap_or_else(|_| String::new()),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut activities = Vec::new();
    for row in rows {
        activities.push(row.map_err(|e| e.to_string())?);
    }

    Ok(activities)
}

#[tauri::command]
pub fn get_latest_dispense_month(state: State<'_, AppState>) -> Result<String, String> {
    // Business rule: the dashboard MUST open on the PREVIOUS CALENDAR MONTH
    // (current month - 1), because the current month is still in progress and
    // its data is incomplete. The default is NEVER "the latest month that
    // contains data" — that would create a mixed-month dashboard.
    let _ = state;
    let now = chrono::Local::now();
    use chrono::Datelike;
    let mut year = now.format("%Y").to_string().parse::<i32>().unwrap_or_else(|_| now.year());
    let mut month = now.format("%m").to_string().parse::<i32>().unwrap_or_else(|_| now.month() as i32);

    month -= 1;
    if month == 0 {
        month = 12;
        year -= 1;
    }

    Ok(format!("{:04}-{:02}", year, month))
}
