use crate::db::AppState;
use tauri::State;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct DashboardSummary {
    pub total_dispensed: f64,
    pub active_clinics: i32,
    pub tickets_count: i32,
    pub judicial_count: i32,
    pub authority_cost: f64,
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

    // 1. Total Dispensed = Drugs + Insulin
    let drug_sql = format!("SELECT SUM(total_cost) FROM detailed_drug_dispensed {}", where_clause);
    let drug_cost: f64 = conn.query_row(&drug_sql, params_ref.as_slice(), |row| row.get(0)).unwrap_or(0.0);

    let ins_sql = format!("SELECT SUM(cost) FROM insulin_dispensed {}", where_clause);
    let ins_cost: f64 = conn.query_row(&ins_sql, params_ref.as_slice(), |row| row.get(0)).unwrap_or(0.0);
    
    let total_dispensed = drug_cost + ins_cost;

    // 2. Active Clinics
    let mut clinics_sql = "
        SELECT COUNT(DISTINCT clinic_id) FROM (
            SELECT clinic_id FROM detailed_drug_dispensed WHERE dispense_month = ?1
            UNION
            SELECT clinic_id FROM insulin_dispensed WHERE dispense_month = ?1
            UNION
            SELECT clinic_id FROM medical_tickets WHERE dispense_month = ?1
            UNION
            SELECT clinic_id FROM judicial_dispensed WHERE dispense_month = ?1
        )
    ".to_string();

    if branchId.is_some() {
        clinics_sql = "
            SELECT COUNT(DISTINCT clinic_id) FROM (
                SELECT clinic_id FROM detailed_drug_dispensed WHERE dispense_month = ?1 AND clinic_id IN (SELECT c.id FROM clinics c JOIN areas a ON c.area_id = a.id WHERE a.branch_id = ?2)
                UNION
                SELECT clinic_id FROM insulin_dispensed WHERE dispense_month = ?1 AND clinic_id IN (SELECT c.id FROM clinics c JOIN areas a ON c.area_id = a.id WHERE a.branch_id = ?2)
                UNION
                SELECT clinic_id FROM medical_tickets WHERE dispense_month = ?1 AND clinic_id IN (SELECT c.id FROM clinics c JOIN areas a ON c.area_id = a.id WHERE a.branch_id = ?2)
                UNION
                SELECT clinic_id FROM judicial_dispensed WHERE dispense_month = ?1 AND clinic_id IN (SELECT c.id FROM clinics c JOIN areas a ON c.area_id = a.id WHERE a.branch_id = ?2)
            )
        ".to_string();
    }

    let active_clinics: i32 = conn.query_row(&clinics_sql, params_ref.as_slice(), |row| row.get(0)).unwrap_or(0);

    // 3. Tickets
    let mut t_where_clause = "WHERE dispense_month = ?1".to_string();
    let mut t_params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(dispenseMonth.clone())];
    if let Some(bid) = branchId {
        t_where_clause.push_str(" AND clinic_id IN (SELECT c.id FROM clinics c JOIN areas a ON c.area_id = a.id WHERE a.branch_id = ?2)");
        t_params.push(Box::new(bid));
    }
    let t_params_ref: Vec<&dyn rusqlite::ToSql> = t_params.iter().map(|b| b.as_ref()).collect();

    let tickets_sql = format!("SELECT SUM(tickets_56b + tickets_56c) FROM medical_tickets {}", t_where_clause);
    let tickets_count: i32 = conn.query_row(&tickets_sql, t_params_ref.as_slice(), |row| row.get(0)).unwrap_or(0);

    // 4. Judicial
    let jud_sql = format!("SELECT COUNT(*) FROM judicial_dispensed {}", where_clause);
    let judicial_count: i32 = conn.query_row(&jud_sql, params_ref.as_slice(), |row| row.get(0)).unwrap_or(0);

    // 5. Authority Cost (Free + Supported)
    let auth_sql = format!(
        "SELECT SUM(drugs_free_authority + drugs_supported_authority_value) FROM monthly_drugs_dispensed {}", 
        where_clause
    );
    let authority_cost: f64 = conn.query_row(&auth_sql, params_ref.as_slice(), |row| row.get(0)).unwrap_or(0.0);

    Ok(DashboardSummary {
        total_dispensed,
        active_clinics,
        tickets_count,
        judicial_count,
        authority_cost,
    })
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TrendData {
    pub name: String,
    pub spending: f64,
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

        // Drugs + Insulin
        let drug_sql = format!("SELECT SUM(total_cost) FROM detailed_drug_dispensed {}", where_clause);
        let drug_cost: f64 = conn.query_row(&drug_sql, params_ref.as_slice(), |row| row.get(0)).unwrap_or(0.0);

        let ins_sql = format!("SELECT SUM(cost) FROM insulin_dispensed {}", where_clause);
        let ins_cost: f64 = conn.query_row(&ins_sql, params_ref.as_slice(), |row| row.get(0)).unwrap_or(0.0);

        let spending = drug_cost + ins_cost;

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
    let sql = if branch_id.is_some() {
        "SELECT COALESCE((SELECT SUM(total_cost) FROM detailed_drug_dispensed WHERE dispense_month BETWEEN ?1 AND ?2 AND branch_id = ?3), 0) +
                COALESCE((SELECT SUM(cost) FROM insulin_dispensed WHERE dispense_month BETWEEN ?1 AND ?2 AND branch_id = ?3), 0) +
                COALESCE((SELECT SUM(monthly_cost) FROM judicial_dispensed WHERE dispense_month BETWEEN ?1 AND ?2 AND branch_id = ?3), 0) +
                COALESCE((SELECT SUM(COALESCE(consumer_value,0)+COALESCE(collective_entities_value,0)) FROM monthly_supplies_dispensed WHERE dispense_month BETWEEN ?1 AND ?2 AND branch_id = ?3), 0)"
    } else {
        "SELECT COALESCE((SELECT SUM(total_cost) FROM detailed_drug_dispensed WHERE dispense_month BETWEEN ?1 AND ?2), 0) +
                COALESCE((SELECT SUM(cost) FROM insulin_dispensed WHERE dispense_month BETWEEN ?1 AND ?2), 0) +
                COALESCE((SELECT SUM(monthly_cost) FROM judicial_dispensed WHERE dispense_month BETWEEN ?1 AND ?2), 0) +
                COALESCE((SELECT SUM(COALESCE(consumer_value,0)+COALESCE(collective_entities_value,0)) FROM monthly_supplies_dispensed WHERE dispense_month BETWEEN ?1 AND ?2), 0)"
    };

    if let Some(bid) = branch_id {
        conn.query_row(sql, rusqlite::params![start, end, bid, start, end, bid, start, end, bid, start, end, bid], |row| row.get(0)).unwrap_or(0.0)
    } else {
        conn.query_row(sql, rusqlite::params![start, end, start, end, start, end, start, end], |row| row.get(0)).unwrap_or(0.0)
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
                    SELECT COUNT(*) > 0 FROM monthly_drugs_dispensed WHERE dispense_month = ?1 AND branch_id = ?2
                 ) OR (
                    SELECT COUNT(*) > 0 FROM insulin_dispensed WHERE dispense_month = ?1 AND branch_id = ?2
                 ) OR (
                    SELECT COUNT(*) > 0 FROM judicial_dispensed WHERE dispense_month = ?1 AND branch_id = ?2
                 ) OR (
                    SELECT COUNT(*) > 0 FROM medical_tickets WHERE dispense_month = ?1 AND branch_id = ?2
                 )",
                 vec![Box::new(month.clone()), Box::new(bid)])
            } else {
                ("SELECT (
                    SELECT COUNT(*) > 0 FROM detailed_drug_dispensed WHERE dispense_month = ?1
                 ) OR (
                    SELECT COUNT(*) > 0 FROM monthly_drugs_dispensed WHERE dispense_month = ?1
                 ) OR (
                    SELECT COUNT(*) > 0 FROM insulin_dispensed WHERE dispense_month = ?1
                 ) OR (
                    SELECT COUNT(*) > 0 FROM judicial_dispensed WHERE dispense_month = ?1
                 ) OR (
                    SELECT COUNT(*) > 0 FROM medical_tickets WHERE dispense_month = ?1
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
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let sql = "
        SELECT MAX(m) FROM (
            SELECT MAX(dispense_month) as m FROM monthly_drugs_dispensed
            UNION ALL
            SELECT MAX(dispense_month) as m FROM insulin_dispensed
        )
    ";

    let latest: Option<String> = conn.query_row(sql, [], |row| row.get(0)).unwrap_or(None);

    if let Some(month) = latest {
        if !month.is_empty() {
            return Ok(month);
        }
    }

    // Fallback to previous month if no data exists
    let now = chrono::Local::now();
    let mut year = now.format("%Y").to_string().parse::<i32>().unwrap();
    let mut month = now.format("%m").to_string().parse::<i32>().unwrap();
    
    month -= 1;
    if month == 0 {
        month = 12;
        year -= 1;
    }
    
    Ok(format!("{:04}-{:02}", year, month))
}
