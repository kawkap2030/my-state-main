use crate::db::AppState;
use tauri::State;
use serde::Serialize;

#[derive(Serialize, Debug)]
pub struct BreakdownItem {
    pub label: String,
    pub value: f64,
    pub unit: String,
}

#[derive(Serialize, Debug)]
pub struct PerformanceMetric {
    pub label: String,
    pub actual: f64,
    pub unit: String,
    pub color: String,
    /// True when the section's source table holds rows for the selected scope,
    /// so the UI can show a real value / zero vs "لا توجد بيانات" honestly.
    pub has_data: bool,
    /// Optional intra-section breakdown (e.g. free/supported insulin, 56ب/56ج)
    /// backed by real columns of the SAME table — never artificial sections.
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub breakdown: Vec<BreakdownItem>,
}

/// Run a SUM query for a section and return (value, has_rows).
/// count_sql mirrors the exact WHERE of the sum query, so "has rows" reflects
/// the section's own filter (e.g. insulin type) and not just the table.
fn sum_section(
    conn: &rusqlite::Connection,
    sum_sql: &str,
    count_sql: &str,
    dispense_month: &str,
    branch_id: Option<i32>,
) -> (f64, bool) {
    let params: Vec<Box<dyn rusqlite::ToSql>> = match branch_id {
        Some(bid) => vec![Box::new(dispense_month.to_string()), Box::new(bid)],
        None => vec![Box::new(dispense_month.to_string())],
    };
    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();

    let has_rows: i32 = conn.query_row(count_sql, params_ref.as_slice(), |row| row.get(0)).unwrap_or(0);
    let value: f64 = conn.query_row(sum_sql, params_ref.as_slice(), |row| row.get(0)).unwrap_or(0.0);
    (value, has_rows > 0)
}

/// Build the paired (count, sum) SQL strings for one section.
/// `extra` is appended verbatim after `WHERE dispense_month = ?1{filter}`.
fn section_sql(select_expr: &str, table: &str, extra: &str, branch_filter: &str) -> (String, String) {
    let count_sql = format!(
        "SELECT COUNT(*) FROM {} WHERE dispense_month = ?1{}{}",
        table, branch_filter, extra
    );
    let sum_sql = format!(
        "SELECT COALESCE(SUM({}),0) FROM {} WHERE dispense_month = ?1{}{}",
        select_expr, table, branch_filter, extra
    );
    (count_sql, sum_sql)
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

    // Every section is filtered by (month, branch) — nothing else, matching
    // the triple-isolation model where a branch-level record legitimately has
    // area_id/clinic_id NULL and must not disappear under clinic filters.
    let branch_filter = if branchId.is_some() { " AND branch_id = ?2" } else { "" };

    // ---- Real sections (one per actual table, no artificial splits) ----
    // 1. Detailed drugs
    let (detailed_c, detailed_s) = section_sql("total_cost", "detailed_drug_dispensed", "", &branch_filter);

    // 2. Monthly drug totals. Phase 1 split the legacy combined table into two
    //    dedicated tables (monthly_free_drugs_dispensed, monthly_supported_
    //    drugs_dispensed); the combined "monthly totals" section merges the two
    //    authoritative split tables. The legacy monthly_drugs_dispensed table is
    //    archive-only and is deliberately excluded from the totals.
    let monthly_free_expr = "COALESCE(drugs_free_authority,0) + COALESCE(drugs_free_students,0) + COALESCE(drugs_free_infants,0) + COALESCE(drugs_free_breadwinner_women,0)";
    let monthly_supported_expr = "COALESCE(drugs_supported_authority_value,0) + COALESCE(drugs_supported_authority_patient_share,0) + COALESCE(drugs_supported_students_value,0) + COALESCE(drugs_supported_students_patient_share,0) + COALESCE(drugs_supported_infants_value,0) + COALESCE(drugs_supported_infants_patient_share,0)";
    let (monthly_free_c, monthly_free_s) = section_sql(monthly_free_expr, "monthly_free_drugs_dispensed", "", &branch_filter);
    let (monthly_sup_c, monthly_sup_s) = section_sql(monthly_supported_expr, "monthly_supported_drugs_dispensed", "", &branch_filter);

    // 3. Insulin (free/supported are rows in ONE table distinguished by type)
    let (ins_c, ins_s) = section_sql("cost", "insulin_dispensed", "", &branch_filter);
    let (ins_free_c, ins_free_s) = section_sql("cost", "insulin_dispensed", " AND type LIKE '%مجان%'", &branch_filter);
    let (ins_sup_c, ins_sup_s) = section_sql("cost", "insulin_dispensed", " AND type LIKE '%مدعم%'", &branch_filter);

    // 4. Medical tickets (56ب/56ج are columns of ONE table)
    let (tickets_c, tickets_s) = section_sql("COALESCE(tickets_56b,0) + COALESCE(tickets_56c,0)", "medical_tickets", "", &branch_filter);
    let (t56b_c, t56b_s) = section_sql("COALESCE(tickets_56b,0)", "medical_tickets", "", &branch_filter);
    let (t56c_c, t56c_s) = section_sql("COALESCE(tickets_56c,0)", "medical_tickets", "", &branch_filter);

    // 5. Drug groups
    let (groups_c, groups_s) = section_sql("cost", "drug_groups", "", &branch_filter);
    // 6. Judicial drugs
    let (judicial_c, judicial_s) = section_sql("monthly_cost", "judicial_dispensed", "", &branch_filter);
    // 7. Supplies
    let (supplies_c, supplies_s) = section_sql("COALESCE(consumer_value,0) + COALESCE(collective_entities_value,0)", "monthly_supplies_dispensed", "", &branch_filter);

    let (detailed, detailed_has) = sum_section(&conn, &detailed_s, &detailed_c, &dispenseMonth, branchId);

    let (monthly_free, monthly_free_has) = sum_section(&conn, &monthly_free_s, &monthly_free_c, &dispenseMonth, branchId);
    let (monthly_sup, monthly_sup_has) = sum_section(&conn, &monthly_sup_s, &monthly_sup_c, &dispenseMonth, branchId);
    let monthly_total = monthly_free + monthly_sup;
    let monthly_has = monthly_free_has || monthly_sup_has;

    let (ins_total, ins_has) = sum_section(&conn, &ins_s, &ins_c, &dispenseMonth, branchId);
    let (ins_free, _) = sum_section(&conn, &ins_free_s, &ins_free_c, &dispenseMonth, branchId);
    let (ins_sup, _) = sum_section(&conn, &ins_sup_s, &ins_sup_c, &dispenseMonth, branchId);

    let (tickets_total, tickets_has) = sum_section(&conn, &tickets_s, &tickets_c, &dispenseMonth, branchId);
    let (t56b, _) = sum_section(&conn, &t56b_s, &t56b_c, &dispenseMonth, branchId);
    let (t56c, _) = sum_section(&conn, &t56c_s, &t56c_c, &dispenseMonth, branchId);

    let (groups, groups_has) = sum_section(&conn, &groups_s, &groups_c, &dispenseMonth, branchId);
    let (judicial, judicial_has) = sum_section(&conn, &judicial_s, &judicial_c, &dispenseMonth, branchId);
    let (supplies, supplies_has) = sum_section(&conn, &supplies_s, &supplies_c, &dispenseMonth, branchId);

    // Real section values only — no invented targets, ratios or fallbacks.
    Ok(vec![
        PerformanceMetric {
            label: "الأدوية التفصيلية".to_string(),
            actual: detailed,
            unit: "ج.م".to_string(),
            color: "var(--color-dash-1)".to_string(),
            has_data: detailed_has,
            breakdown: Vec::new(),
        },
        PerformanceMetric {
            label: "الأدوية (إجماليات شهرية)".to_string(),
            actual: monthly_total,
            unit: "ج.م".to_string(),
            color: "var(--color-dash-2)".to_string(),
            has_data: monthly_has,
            breakdown: vec![
                BreakdownItem { label: "مجانية".to_string(), value: monthly_free, unit: "ج.م".to_string() },
                BreakdownItem { label: "مدعمة".to_string(), value: monthly_sup, unit: "ج.م".to_string() },
            ],
        },
        PerformanceMetric {
            label: "الإنسولين".to_string(),
            actual: ins_total,
            unit: "ج.م".to_string(),
            color: "var(--color-dash-3)".to_string(),
            has_data: ins_has,
            breakdown: vec![
                BreakdownItem { label: "مجاني".to_string(), value: ins_free, unit: "ج.م".to_string() },
                BreakdownItem { label: "مدعم".to_string(), value: ins_sup, unit: "ج.م".to_string() },
            ],
        },
        PerformanceMetric {
            label: "التذاكر الطبية".to_string(),
            actual: tickets_total,
            unit: "تذكرة".to_string(),
            color: "var(--color-dash-4)".to_string(),
            has_data: tickets_has,
            breakdown: vec![
                BreakdownItem { label: "تذاكر 56ب".to_string(), value: t56b, unit: "تذكرة".to_string() },
                BreakdownItem { label: "تذاكر 56ج".to_string(), value: t56c, unit: "تذكرة".to_string() },
            ],
        },
        PerformanceMetric {
            label: "المجموعات الدوائية".to_string(),
            actual: groups,
            unit: "ج.م".to_string(),
            color: "var(--color-dash-5)".to_string(),
            has_data: groups_has,
            breakdown: Vec::new(),
        },
        PerformanceMetric {
            label: "أدوية حكم المحكمة".to_string(),
            actual: judicial,
            unit: "ج.م".to_string(),
            color: "var(--color-dash-6)".to_string(),
            has_data: judicial_has,
            breakdown: Vec::new(),
        },
        PerformanceMetric {
            label: "منصرف المستلزمات".to_string(),
            actual: supplies,
            unit: "ج.م".to_string(),
            color: "var(--color-dash-7)".to_string(),
            has_data: supplies_has,
            breakdown: Vec::new(),
        },
    ])
}
