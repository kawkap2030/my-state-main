use crate::db::AppState;
use tauri::State;
use serde::Serialize;

#[derive(Serialize, Debug)]
pub struct PerformanceMetric {
    pub label: String,
    pub actual: f64,
    pub target: f64,
    pub unit: String,
    pub color: String,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_performance_metrics(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    dispenseMonth: String,
) -> Result<Vec<PerformanceMetric>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // Build WHERE clause for branch
    let where_clause = if branchId.is_some() {
        "WHERE dispense_month = ?1 AND branch_id = ?2"
    } else {
        "WHERE dispense_month = ?1"
    };

    // 1. Free drugs cost (from monthly_drugs_dispensed — all drugs_free_* columns)
    let free_drugs_sql = format!(
        "SELECT COALESCE(SUM(COALESCE(drugs_free_authority,0) + COALESCE(drugs_free_students,0) + COALESCE(drugs_free_infants,0) + COALESCE(drugs_free_breadwinner_women,0)), 0) FROM monthly_drugs_dispensed {}",
        where_clause
    );
    let free_drugs: f64 = if let Some(bid) = branchId {
        conn.query_row(&free_drugs_sql, rusqlite::params![dispenseMonth, bid], |row| row.get(0)).unwrap_or(0.0)
    } else {
        conn.query_row(&free_drugs_sql, [&dispenseMonth], |row| row.get(0)).unwrap_or(0.0)
    };

    // 2. Supported drugs cost
    let supported_sql = format!(
        "SELECT COALESCE(SUM(COALESCE(drugs_supported_authority_value,0) + COALESCE(drugs_supported_students_value,0) + COALESCE(drugs_supported_infants_value,0)), 0) FROM monthly_drugs_dispensed {}",
        where_clause
    );
    let supported: f64 = if let Some(bid) = branchId {
        conn.query_row(&supported_sql, rusqlite::params![dispenseMonth, bid], |row| row.get(0)).unwrap_or(0.0)
    } else {
        conn.query_row(&supported_sql, [&dispenseMonth], |row| row.get(0)).unwrap_or(0.0)
    };

    // 3. Insulin cost
    let insulin_sql = format!("SELECT COALESCE(SUM(cost), 0) FROM insulin_dispensed {}", where_clause);
    let insulin: f64 = if let Some(bid) = branchId {
        conn.query_row(&insulin_sql, rusqlite::params![dispenseMonth, bid], |row| row.get(0)).unwrap_or(0.0)
    } else {
        conn.query_row(&insulin_sql, [&dispenseMonth], |row| row.get(0)).unwrap_or(0.0)
    };

    // 4. Supplies cost
    let supplies_sql = format!("SELECT COALESCE(SUM(COALESCE(consumer_value,0) + COALESCE(collective_entities_value,0)), 0) FROM monthly_supplies_dispensed {}", where_clause);
    let supplies: f64 = if let Some(bid) = branchId {
        conn.query_row(&supplies_sql, rusqlite::params![dispenseMonth, bid], |row| row.get(0)).unwrap_or(0.0)
    } else {
        conn.query_row(&supplies_sql, [&dispenseMonth], |row| row.get(0)).unwrap_or(0.0)
    };

    // 5. Judicial cost
    let judicial_sql = format!("SELECT COALESCE(SUM(monthly_cost), 0) FROM judicial_dispensed {}", where_clause);
    let judicial: f64 = if let Some(bid) = branchId {
        conn.query_row(&judicial_sql, rusqlite::params![dispenseMonth, bid], |row| row.get(0)).unwrap_or(0.0)
    } else {
        conn.query_row(&judicial_sql, [&dispenseMonth], |row| row.get(0)).unwrap_or(0.0)
    };

    // Total for target calculation
    let total = free_drugs + supported + insulin + supplies + judicial;

    // Return metrics with dynamic targets (80% of total as reference for each)
    Ok(vec![
        PerformanceMetric {
            label: "الأدوية المجانية".to_string(),
            actual: free_drugs,
            target: if total > 0.0 { total * 0.35 } else { 1.0 },
            unit: "ج.م".to_string(),
            color: "var(--color-dash-1)".to_string(),
        },
        PerformanceMetric {
            label: "الأدوية المدعمة".to_string(),
            actual: supported,
            target: if total > 0.0 { total * 0.25 } else { 1.0 },
            unit: "ج.م".to_string(),
            color: "var(--color-dash-2)".to_string(),
        },
        PerformanceMetric {
            label: "الإنسولين".to_string(),
            actual: insulin,
            target: if total > 0.0 { total * 0.20 } else { 1.0 },
            unit: "ج.م".to_string(),
            color: "var(--color-dash-5)".to_string(),
        },
        PerformanceMetric {
            label: "المستلزمات الطبية".to_string(),
            actual: supplies,
            target: if total > 0.0 { total * 0.12 } else { 1.0 },
            unit: "ج.م".to_string(),
            color: "var(--color-dash-4)".to_string(),
        },
        PerformanceMetric {
            label: "الأحكام القضائية".to_string(),
            actual: judicial,
            target: if total > 0.0 { total * 0.08 } else { 1.0 },
            unit: "ج.م".to_string(),
            color: "var(--color-dash-6)".to_string(),
        },
    ])
}
