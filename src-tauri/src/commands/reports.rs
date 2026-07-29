use crate::db::AppState;
use tauri::State;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct AnalyticalReportRow {
    pub name: String,
    pub count: String,
    pub value: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ReconciliationRow {
    pub name: String,
    pub detailed_total: f64,
    pub monthly_total: f64,
    pub difference: f64,
    pub status: String, // "MATCH", "MISMATCH"
    pub category: String, // "drugs", "supplies", "insulin", "tickets"
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_reconciliation_report(
    state: State<'_, AppState>,
    branchId: i32,
    dispenseMonth: String,
) -> Result<Vec<ReconciliationRow>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut report = Vec::new();

    // ===============================================================
    // 1. DRUGS: Detailed (per-item) vs Monthly (aggregated) Totals
    // ===============================================================
    let detailed_drugs_total: f64 = conn.query_row(
        "SELECT COALESCE(SUM(total_cost), 0) FROM detailed_drug_dispensed 
         WHERE branch_id = ?1 AND dispense_month = ?2",
        rusqlite::params![branchId, dispenseMonth],
        |row| row.get(0)
    ).unwrap_or(0.0);

    let monthly_drugs_total: f64 = conn.query_row(
        "SELECT COALESCE(SUM(
            drugs_free_authority + drugs_free_students + drugs_free_infants + drugs_free_breadwinner_women +
            drugs_supported_authority_value + drugs_supported_students_value + drugs_supported_infants_value +
            drugs_supported_authority_patient_share + drugs_supported_students_patient_share + drugs_supported_infants_patient_share
        ), 0) FROM monthly_drugs_dispensed 
         WHERE branch_id = ?1 AND dispense_month = ?2",
        rusqlite::params![branchId, dispenseMonth],
        |row| row.get(0)
    ).unwrap_or(0.0);

    let drugs_diff = detailed_drugs_total - monthly_drugs_total;
    report.push(ReconciliationRow {
        name: "إجمالي الأدوية (التفصيلي vs الإجمالي الشهري)".to_string(),
        detailed_total: detailed_drugs_total,
        monthly_total: monthly_drugs_total,
        difference: drugs_diff,
        status: if drugs_diff.abs() < 1.0 { "MATCH".to_string() } else { "MISMATCH".to_string() },
        category: "drugs".to_string(),
    });

    // ===============================================================
    // 2. SUPPLIES: Monthly aggregates vs monthly_drugs supplies columns
    //    supplies are in monthly_supplies_dispensed only (no per-item detail table).
    //    We also check if monthly_drugs_dispensed has supply-related rows to reconcile against.
    // ===============================================================
    let supplies_monthly_total: f64 = conn.query_row(
        "SELECT COALESCE(SUM(consumer_value + collective_entities_value), 0) 
         FROM monthly_supplies_dispensed 
         WHERE branch_id = ?1 AND dispense_month = ?2",
        rusqlite::params![branchId, dispenseMonth],
        |row| row.get(0)
    ).unwrap_or(0.0);

    // Check if there is a supplies figure in monthly_drugs_dispensed for cross-reference
    let supplies_in_monthly_drugs: f64 = conn.query_row(
        "SELECT COALESCE(SUM(supplies_value), 0) FROM monthly_drugs_dispensed 
         WHERE branch_id = ?1 AND dispense_month = ?2",
        rusqlite::params![branchId, dispenseMonth],
        |row| row.get(0)
    ).unwrap_or(0.0);

    let (supplies_detailed, supplies_monthly, supplies_diff, supplies_status) = 
        if supplies_in_monthly_drugs > 0.0 {
            // We have two sources to compare
            let d = supplies_in_monthly_drugs - supplies_monthly_total;
            let s = if d.abs() < 1.0 { "MATCH" } else { "MISMATCH" };
            (supplies_in_monthly_drugs, supplies_monthly_total, d, s.to_string())
        } else {
            // Only monthly_supplies_dispensed source
            (0.0, supplies_monthly_total, 0.0, "INFO".to_string())
        };

    report.push(ReconciliationRow {
        name: "إجمالي المستلزمات الطبية (الشهري)".to_string(),
        detailed_total: supplies_detailed,
        monthly_total: supplies_monthly,
        difference: supplies_diff,
        status: supplies_status,
        category: "supplies".to_string(),
    });

    // ===============================================================
    // 3. INSULIN: Detailed records vs monthly insulin aggregate (if exists)
    // ===============================================================
    let insulin_detailed_total: f64 = conn.query_row(
        "SELECT COALESCE(SUM(cost), 0) FROM insulin_dispensed 
         WHERE branch_id = ?1 AND dispense_month = ?2",
        rusqlite::params![branchId, dispenseMonth],
        |row| row.get(0)
    ).unwrap_or(0.0);

    // Try to find insulin in monthly_drugs_dispensed (some systems track it there)
    let insulin_in_monthly: f64 = conn.query_row(
        "SELECT COALESCE(SUM(insulin_value), 0) FROM monthly_drugs_dispensed 
         WHERE branch_id = ?1 AND dispense_month = ?2",
        rusqlite::params![branchId, dispenseMonth],
        |row| row.get(0)
    ).unwrap_or(0.0);

    let (insulin_monthly, insulin_diff, insulin_status) = 
        if insulin_in_monthly > 0.0 {
            let d = insulin_detailed_total - insulin_in_monthly;
            let s = if d.abs() < 1.0 { "MATCH" } else { "MISMATCH" };
            (insulin_in_monthly, d, s.to_string())
        } else {
            (0.0, 0.0, "INFO".to_string())
        };

    report.push(ReconciliationRow {
        name: "إجمالي الإنسولين (التفصيلي)".to_string(),
        detailed_total: insulin_detailed_total,
        monthly_total: insulin_monthly,
        difference: insulin_diff,
        status: insulin_status,
        category: "insulin".to_string(),
    });

    // ===============================================================
    // 4. JUDICIAL: Detailed records vs judicial monthly aggregate (if exists)
    // ===============================================================
    let judicial_detailed_total: f64 = conn.query_row(
        "SELECT COALESCE(SUM(monthly_cost), 0) FROM judicial_dispensed 
         WHERE branch_id = ?1 AND dispense_month = ?2",
        rusqlite::params![branchId, dispenseMonth],
        |row| row.get(0)
    ).unwrap_or(0.0);

    let judicial_in_monthly: f64 = conn.query_row(
        "SELECT COALESCE(SUM(judicial_value), 0) FROM monthly_drugs_dispensed 
         WHERE branch_id = ?1 AND dispense_month = ?2",
        rusqlite::params![branchId, dispenseMonth],
        |row| row.get(0)
    ).unwrap_or(0.0);

    let (judicial_monthly, judicial_diff, judicial_status) = 
        if judicial_in_monthly > 0.0 {
            let d = judicial_detailed_total - judicial_in_monthly;
            let s = if d.abs() < 1.0 { "MATCH" } else { "MISMATCH" };
            (judicial_in_monthly, d, s.to_string())
        } else {
            (0.0, 0.0, "INFO".to_string())
        };

    report.push(ReconciliationRow {
        name: "إجمالي الأحكام القضائية (التفصيلي)".to_string(),
        detailed_total: judicial_detailed_total,
        monthly_total: judicial_monthly,
        difference: judicial_diff,
        status: judicial_status,
        category: "judicial".to_string(),
    });

    // ===============================================================
    // 5. MEDICAL TICKETS: Detailed records vs tickets in monthly aggregate
    // ===============================================================
    let tickets_detailed_total: f64 = conn.query_row(
        "SELECT COALESCE(SUM(total_amount), 0) FROM medical_tickets 
         WHERE branch_id = ?1 AND dispense_month = ?2",
        rusqlite::params![branchId, dispenseMonth],
        |row| row.get(0)
    ).unwrap_or(0.0);

    let tickets_in_monthly: f64 = conn.query_row(
        "SELECT COALESCE(SUM(tickets_value), 0) FROM monthly_drugs_dispensed 
         WHERE branch_id = ?1 AND dispense_month = ?2",
        rusqlite::params![branchId, dispenseMonth],
        |row| row.get(0)
    ).unwrap_or(0.0);

    let (tickets_monthly, tickets_diff, tickets_status) = 
        if tickets_in_monthly > 0.0 {
            let d = tickets_detailed_total - tickets_in_monthly;
            let s = if d.abs() < 1.0 { "MATCH" } else { "MISMATCH" };
            (tickets_in_monthly, d, s.to_string())
        } else {
            (0.0, 0.0, "INFO".to_string())
        };

    report.push(ReconciliationRow {
        name: "إجمالي التذاكر الطبية (التفصيلي)".to_string(),
        detailed_total: tickets_detailed_total,
        monthly_total: tickets_monthly,
        difference: tickets_diff,
        status: tickets_status,
        category: "tickets".to_string(),
    });

    // ===============================================================
    // 6. CROSS-CHECK GRAND TOTAL:
    //    Detailed side: All detailed sources (drugs_detailed + insulin + judicial + tickets)
    //    Monthly side:  All monthly sources (drugs_monthly + supplies_monthly)
    //    Compare to find the overall balance difference
    // ===============================================================
    let grand_detailed = detailed_drugs_total + insulin_detailed_total + judicial_detailed_total + tickets_detailed_total;
    let grand_monthly = monthly_drugs_total + supplies_monthly_total;
    let grand_diff = grand_detailed - grand_monthly;
    report.push(ReconciliationRow {
        name: "الإجمالي الكلي (جميع المصادر مجمعة)".to_string(),
        detailed_total: grand_detailed,
        monthly_total: grand_monthly,
        difference: grand_diff,
        status: if grand_diff.abs() < 1.0 { "MATCH".to_string() } else { "MISMATCH".to_string() },
        category: "summary".to_string(),
    });

    Ok(report)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_analytical_report(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: String,
) -> Result<Vec<AnalyticalReportRow>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut report = Vec::new();

    // Helper for building WHERE clause based on hierarchy
    let mut where_clause = "WHERE dispense_month = ?1".to_string();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(dispenseMonth)];

    if let Some(bid) = branchId {
        where_clause.push_str(" AND branch_id = ?2");
        params.push(Box::new(bid));
    }
    if let Some(aid) = areaId {
        where_clause.push_str(" AND area_id = ?3");
        params.push(Box::new(aid));
    }
    if let Some(cid) = clinicId {
        where_clause.push_str(" AND clinic_id = ?4");
        params.push(Box::new(cid));
    }

    // Convert Vec<Box<dyn ToSql>> to Vec<&dyn ToSql>
    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();

    // 1. Detailed Drugs
    let drugs_sql = format!(
        "SELECT SUM(cases_count), SUM(total_cost) FROM detailed_drug_dispensed {}", 
        where_clause
    );
    let (drug_cases, drug_cost): (Option<i32>, Option<f64>) = conn.query_row(
        &drugs_sql, 
        params_ref.as_slice(),
        |row| Ok((row.get(0)?, row.get(1)?))
    ).unwrap_or((None, None));
    
    report.push(AnalyticalReportRow {
        name: "منصرف الأدوية (تفصيلي)".to_string(),
        count: drug_cases.unwrap_or(0).to_string(),
        value: format!("{:.2}", drug_cost.unwrap_or(0.0)),
    });

    // 2. Insulin
    let insulin_sql = format!(
        "SELECT SUM(cases_count), SUM(cost) FROM insulin_dispensed {}", 
        where_clause
    );
    let (ins_cases, ins_cost): (Option<i32>, Option<f64>) = conn.query_row(
        &insulin_sql, 
        params_ref.as_slice(),
        |row| Ok((row.get(0)?, row.get(1)?))
    ).unwrap_or((None, None));

    report.push(AnalyticalReportRow {
        name: "منصرف الأنسولين".to_string(),
        count: ins_cases.unwrap_or(0).to_string(),
        value: format!("{:.2}", ins_cost.unwrap_or(0.0)),
    });

    // 3. Medical Tickets
    // medical_tickets only has clinic_id. I need to handle branch/area filtering.
    // Redo where clause for tables that only have clinic_id.
    
    let mut cid_where = "WHERE dispense_month = ?1".to_string();
    if let Some(_cid) = clinicId {
        cid_where.push_str(" AND clinic_id = ?2");
    } else if let Some(_aid) = areaId {
        cid_where.push_str(" AND clinic_id IN (SELECT id FROM clinics WHERE area_id = ?2)");
    } else if let Some(_bid) = branchId {
        cid_where.push_str(" AND clinic_id IN (SELECT c.id FROM clinics c JOIN areas a ON c.area_id = a.id WHERE a.branch_id = ?2)");
    }

    let params_cid: Vec<Box<dyn rusqlite::ToSql>> = if let Some(id) = clinicId.or(areaId).or(branchId) {
        vec![Box::new(params[0].as_ref()), Box::new(id)]
    } else {
        vec![Box::new(params[0].as_ref())]
    };
    let params_cid_ref: Vec<&dyn rusqlite::ToSql> = params_cid.iter().map(|b| b.as_ref()).collect();

    let (t_56b, t_56c): (Option<i32>, Option<i32>) = conn.query_row(
        &format!("SELECT SUM(tickets_56b), SUM(tickets_56c) FROM medical_tickets {}", cid_where),
        params_cid_ref.as_slice(),
        |row| Ok((row.get(0)?, row.get(1)?))
    ).unwrap_or((None, None));

    report.push(AnalyticalReportRow {
        name: "تذاكر طبية (56ب)".to_string(),
        count: t_56b.unwrap_or(0).to_string(),
        value: "-".to_string(),
    });
    report.push(AnalyticalReportRow {
        name: "تذاكر طبية (56ج)".to_string(),
        count: t_56c.unwrap_or(0).to_string(),
        value: "-".to_string(),
    });

    // 4. Judicial
    let jud_sql = format!(
        "SELECT COUNT(*), SUM(monthly_cost) FROM judicial_dispensed {}", 
        where_clause
    );
    let (jud_count, jud_cost): (Option<i32>, Option<f64>) = conn.query_row(
        &jud_sql,
        params_ref.as_slice(),
        |row| Ok((row.get(0)?, row.get(1)?))
    ).unwrap_or((None, None));

    report.push(AnalyticalReportRow {
        name: "صرف أحكام قضائية".to_string(),
        count: jud_count.unwrap_or(0).to_string(),
        value: format!("{:.2}", jud_cost.unwrap_or(0.0)),
    });

    // 5. Supplies
    let supplies_sql = format!(
        "SELECT SUM(consumer_value + collective_entities_value) FROM monthly_supplies_dispensed {}", 
        where_clause
    );
    let supplies_val: Option<f64> = conn.query_row(
        &supplies_sql,
        params_ref.as_slice(),
        |row| row.get(0)
    ).unwrap_or(None);

    report.push(AnalyticalReportRow {
        name: "المستلزمات الطبية".to_string(),
        count: "-".to_string(),
        value: format!("{:.2}", supplies_val.unwrap_or(0.0)),
    });

    // 6. Monthly Totals Groups
    let monthly_sql = format!(
        "SELECT SUM(drugs_free_authority + drugs_free_students + drugs_free_infants + drugs_free_breadwinner_women),
                SUM(drugs_supported_authority_value + drugs_supported_students_value + drugs_supported_infants_value)
         FROM monthly_drugs_dispensed {}", 
        where_clause
    );
    let (free_total, supported_total): (Option<f64>, Option<f64>) = conn.query_row(
        &monthly_sql,
        params_ref.as_slice(),
        |row| Ok((row.get(0)?, row.get(1)?))
    ).unwrap_or((None, None));

    report.push(AnalyticalReportRow {
        name: "أدوية مجانية (كلي)".to_string(),
        count: "-".to_string(),
        value: format!("{:.2}", free_total.unwrap_or(0.0)),
    });
    report.push(AnalyticalReportRow {
        name: "أدوية مدعمة (كلي)".to_string(),
        count: "-".to_string(),
        value: format!("{:.2}", supported_total.unwrap_or(0.0)),
    });

    Ok(report)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FinancialReportRow {
    pub item: String,
    pub value: String,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_financial_report(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: String,
) -> Result<Vec<FinancialReportRow>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut report = Vec::new();

    let mut where_clause = "WHERE dispense_month = ?1".to_string();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(dispenseMonth)];

    if let Some(bid) = branchId {
        where_clause.push_str(" AND branch_id = ?2");
        params.push(Box::new(bid));
    }
    if let Some(aid) = areaId {
        where_clause.push_str(" AND area_id = ?3");
        params.push(Box::new(aid));
    }
    if let Some(cid) = clinicId {
        where_clause.push_str(" AND clinic_id = ?4");
        params.push(Box::new(cid));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();

    // 1. Patient Share & Supported Values from monthly_drugs_dispensed
    let monthly_sql = format!(
        "SELECT SUM(drugs_supported_authority_patient_share + drugs_supported_students_patient_share + drugs_supported_infants_patient_share),
                SUM(drugs_supported_authority_value + drugs_supported_students_value + drugs_supported_infants_value),
                SUM(drugs_free_authority + drugs_free_students + drugs_free_infants + drugs_free_breadwinner_women)
         FROM monthly_drugs_dispensed {}", 
        where_clause
    );
    let (patient_share, supported_val, free_val): (Option<f64>, Option<f64>, Option<f64>) = conn.query_row(
        &monthly_sql,
        params_ref.as_slice(),
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    ).unwrap_or((None, None, None));

    report.push(FinancialReportRow {
        item: "إجمالي المبالغ المحصلة (حصة المريض)".to_string(),
        value: format!("{:.2}", patient_share.unwrap_or(0.0)),
    });

    report.push(FinancialReportRow {
        item: "إجمالي قيمة المنصرف المجاني (أدوية)".to_string(),
        value: format!("{:.2}", free_val.unwrap_or(0.0)),
    });

    report.push(FinancialReportRow {
        item: "إجمالي قيمة المنصرف المدعم (مشاركة الهيئة)".to_string(),
        value: format!("{:.2}", supported_val.unwrap_or(0.0)),
    });

    // 2. Drug Group Costs
    let groups_sql = format!(
        "SELECT SUM(cost) FROM drug_groups {}", 
        where_clause
    );
    let group_cost: Option<f64> = conn.query_row(
        &groups_sql,
        params_ref.as_slice(),
        |row| row.get(0)
    ).unwrap_or(None);

    report.push(FinancialReportRow {
        item: "إجمالي تكلفة المجموعات الدوائية".to_string(),
        value: format!("{:.2}", group_cost.unwrap_or(0.0)),
    });

    // 3. Insulin
    let insulin_sql = format!(
        "SELECT SUM(cost) FROM insulin_dispensed {}", 
        where_clause
    );
    let ins_cost: Option<f64> = conn.query_row(
        &insulin_sql,
        params_ref.as_slice(),
        |row| row.get(0)
    ).unwrap_or(None);

    report.push(FinancialReportRow {
        item: "إجمالي تكلفة الإنسولين".to_string(),
        value: format!("{:.2}", ins_cost.unwrap_or(0.0)),
    });

    // 4. Judicial
    let jud_sql = format!(
        "SELECT SUM(monthly_cost) FROM judicial_dispensed {}", 
        where_clause
    );
    let jud_cost: Option<f64> = conn.query_row(
        &jud_sql,
        params_ref.as_slice(),
        |row| row.get(0)
    ).unwrap_or(None);

    report.push(FinancialReportRow {
        item: "إجمالي تكلفة الأحكام القضائية".to_string(),
        value: format!("{:.2}", jud_cost.unwrap_or(0.0)),
    });

    // 5. Supplies
    let supplies_sql = format!(
        "SELECT SUM(consumer_value + collective_entities_value) FROM monthly_supplies_dispensed {}", 
        where_clause
    );
    let supplies_val: Option<f64> = conn.query_row(
        &supplies_sql,
        params_ref.as_slice(),
        |row| row.get(0)
    ).unwrap_or(None);

    report.push(FinancialReportRow {
        item: "إجمالي قيمة المستلزمات الطبية".to_string(),
        value: format!("{:.2}", supplies_val.unwrap_or(0.0)),
    });

    Ok(report)
}

// ===== Cost Analysis Report =====

#[derive(Serialize, Deserialize, Debug)]
pub struct CostBreakdownRow {
    pub category: String,
    pub month: String,
    pub cost: f64,
}

/// Returns cost breakdown by category for multiple months.
/// Categories: drugs, insulin, drug_groups, free_drugs, supported_drugs, supplies, judicial
#[tauri::command]
#[allow(non_snake_case)]
pub fn get_cost_breakdown_report(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    months: Vec<String>,
) -> Result<Vec<CostBreakdownRow>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    if months.is_empty() {
        return Ok(Vec::new());
    }

    // Build month placeholders: ?1, ?2, ?3...
    let month_placeholders: Vec<String> = (1..=months.len()).map(|i| format!("?{}", i)).collect();
    let month_list = month_placeholders.join(", ");

    // Build hierarchy filter with param indices after months
    let base_idx = months.len() + 1;
    let mut hierarchy_clause = String::new();
    let mut extra_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(cid) = clinicId {
        hierarchy_clause = format!(" AND clinic_id = ?{}", base_idx);
        extra_params.push(Box::new(cid));
    } else if let Some(aid) = areaId {
        hierarchy_clause = format!(" AND area_id = ?{}", base_idx);
        extra_params.push(Box::new(aid));
    } else if let Some(bid) = branchId {
        hierarchy_clause = format!(" AND branch_id = ?{}", base_idx);
        extra_params.push(Box::new(bid));
    }

    // Build full params vector
    let mut all_params: Vec<Box<dyn rusqlite::ToSql>> = months.iter().map(|m| Box::new(m.clone()) as Box<dyn rusqlite::ToSql>).collect();
    all_params.extend(extra_params);
    let params_ref: Vec<&dyn rusqlite::ToSql> = all_params.iter().map(|b| b.as_ref()).collect();

    let mut report = Vec::new();

    // 1. Detailed Drugs
    let sql = format!("SELECT dispense_month, COALESCE(SUM(total_cost), 0) FROM detailed_drug_dispensed WHERE dispense_month IN ({}) {} GROUP BY dispense_month", month_list, hierarchy_clause);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for row in stmt.query_map(params_ref.as_slice(), |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))).unwrap().flatten() {
        map.insert(row.0, row.1);
    }
    for m in &months {
        report.push(CostBreakdownRow { category: "الأدوية (تفصيلي)".to_string(), month: m.clone(), cost: *map.get(m).unwrap_or(&0.0) });
    }

    // 2. Insulin
    let sql = format!("SELECT dispense_month, COALESCE(SUM(cost), 0) FROM insulin_dispensed WHERE dispense_month IN ({}) {} GROUP BY dispense_month", month_list, hierarchy_clause);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for row in stmt.query_map(params_ref.as_slice(), |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))).unwrap().flatten() {
        map.insert(row.0, row.1);
    }
    for m in &months {
        report.push(CostBreakdownRow { category: "الإنسولين".to_string(), month: m.clone(), cost: *map.get(m).unwrap_or(&0.0) });
    }

    // 3. Drug Groups
    let sql = format!("SELECT dispense_month, COALESCE(SUM(cost), 0) FROM drug_groups WHERE dispense_month IN ({}) {} GROUP BY dispense_month", month_list, hierarchy_clause);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for row in stmt.query_map(params_ref.as_slice(), |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))).unwrap().flatten() {
        map.insert(row.0, row.1);
    }
    for m in &months {
        report.push(CostBreakdownRow { category: "المجموعات الدوائية".to_string(), month: m.clone(), cost: *map.get(m).unwrap_or(&0.0) });
    }

    // 4. Free Drugs
    let sql = format!("SELECT dispense_month, COALESCE(SUM(drugs_free_authority + drugs_free_students + drugs_free_infants + drugs_free_breadwinner_women), 0) FROM monthly_drugs_dispensed WHERE dispense_month IN ({}) {} GROUP BY dispense_month", month_list, hierarchy_clause);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for row in stmt.query_map(params_ref.as_slice(), |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))).unwrap().flatten() {
        map.insert(row.0, row.1);
    }
    for m in &months {
        report.push(CostBreakdownRow { category: "الأدوية المجانية".to_string(), month: m.clone(), cost: *map.get(m).unwrap_or(&0.0) });
    }

    // 5. Supported Drugs
    let sql = format!("SELECT dispense_month, COALESCE(SUM(drugs_supported_authority_value + drugs_supported_students_value + drugs_supported_infants_value), 0) FROM monthly_drugs_dispensed WHERE dispense_month IN ({}) {} GROUP BY dispense_month", month_list, hierarchy_clause);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for row in stmt.query_map(params_ref.as_slice(), |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))).unwrap().flatten() {
        map.insert(row.0, row.1);
    }
    for m in &months {
        report.push(CostBreakdownRow { category: "الأدوية المدعمة".to_string(), month: m.clone(), cost: *map.get(m).unwrap_or(&0.0) });
    }

    // 6. Supplies
    let sql = format!("SELECT dispense_month, COALESCE(SUM(consumer_value + collective_entities_value), 0) FROM monthly_supplies_dispensed WHERE dispense_month IN ({}) {} GROUP BY dispense_month", month_list, hierarchy_clause);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for row in stmt.query_map(params_ref.as_slice(), |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))).unwrap().flatten() {
        map.insert(row.0, row.1);
    }
    for m in &months {
        report.push(CostBreakdownRow { category: "المستلزمات الطبية".to_string(), month: m.clone(), cost: *map.get(m).unwrap_or(&0.0) });
    }

    // 7. Judicial
    let sql = format!("SELECT dispense_month, COALESCE(SUM(monthly_cost), 0) FROM judicial_dispensed WHERE dispense_month IN ({}) {} GROUP BY dispense_month", month_list, hierarchy_clause);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for row in stmt.query_map(params_ref.as_slice(), |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))).unwrap().flatten() {
        map.insert(row.0, row.1);
    }
    for m in &months {
        report.push(CostBreakdownRow { category: "الأحكام القضائية".to_string(), month: m.clone(), cost: *map.get(m).unwrap_or(&0.0) });
    }

    Ok(report)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TopItemRow {
    pub drug_id: i32,
    pub total_cost: f64,
    pub total_quantity: f64,
    pub total_cases: i32,
}

/// Returns top N drugs sorted by cost, quantity or cases across multiple months.
#[tauri::command]
#[allow(non_snake_case)]
pub fn get_top_items_report(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    months: Vec<String>,
    limit: i32,
    sortBy: String, // "cost", "cases", "quantity"
) -> Result<Vec<TopItemRow>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    if months.is_empty() {
        return Ok(Vec::new());
    }

    let month_placeholders: Vec<String> = (1..=months.len()).map(|i| format!("?{}", i)).collect();
    let month_list = month_placeholders.join(", ");
    let base_idx = months.len() + 1;

    let mut hierarchy_clause = String::new();
    let mut all_params: Vec<Box<dyn rusqlite::ToSql>> = months.iter().map(|m| Box::new(m.clone()) as Box<dyn rusqlite::ToSql>).collect();

    if let Some(cid) = clinicId {
        hierarchy_clause = format!(" AND clinic_id = ?{}", base_idx);
        all_params.push(Box::new(cid));
    } else if let Some(aid) = areaId {
        hierarchy_clause = format!(" AND area_id = ?{}", base_idx);
        all_params.push(Box::new(aid));
    } else if let Some(bid) = branchId {
        hierarchy_clause = format!(" AND branch_id = ?{}", base_idx);
        all_params.push(Box::new(bid));
    }

    // Add limit param
    let limit_idx = all_params.len() + 1;
    all_params.push(Box::new(limit));

    let params_ref: Vec<&dyn rusqlite::ToSql> = all_params.iter().map(|b| b.as_ref()).collect();

    let order_col = match sortBy.as_str() {
        "cases" => "total_cases",
        "quantity" => "total_quantity",
        _ => "total_cost",
    };

    let sql = format!(
        "SELECT drug_id, SUM(total_cost) as total_cost, SUM(quantity) as total_quantity, SUM(cases_count) as total_cases \
         FROM detailed_drug_dispensed \
         WHERE dispense_month IN ({}) {} \
         GROUP BY drug_id \
         ORDER BY {} DESC \
         LIMIT ?{}",
        month_list, hierarchy_clause, order_col, limit_idx
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(TopItemRow {
            drug_id: row.get(0)?,
            total_cost: row.get(1)?,
            total_quantity: row.get(2)?,
            total_cases: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SuppliesDispensedRow {
    pub supply_id: Option<i32>,
    pub category_id: Option<i32>,
    pub consumer_value: f64,
    pub collective_entities_value: f64,
    pub dispense_month: String,
    pub clinic_name: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MonthlyDrugsDispensedRangeRow {
    pub branch_id: i32,
    pub area_id: Option<i32>,
    pub clinic_id: Option<i32>,
    pub dispense_month: String,
    pub free_authority: f64,
    pub free_students: f64,
    pub free_infants: f64,
    pub free_women: f64,
    pub sup_authority: f64,
    pub sup_students: f64,
    pub sup_infants: f64,
    pub sup_patient_share: f64,
    pub clinic_name: Option<String>,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_monthly_drugs_dispensed_range(
    state: State<'_, AppState>,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    startMonth: String,
    endMonth: String,
) -> Result<Vec<MonthlyDrugsDispensedRangeRow>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "SELECT m.branch_id, m.area_id, m.clinic_id, m.dispense_month,
                          m.drugs_free_authority, m.drugs_free_students, m.drugs_free_infants, m.drugs_free_breadwinner_women,
                          m.drugs_supported_authority_value, m.drugs_supported_students_value, m.drugs_supported_infants_value,
                          (m.drugs_supported_authority_patient_share + m.drugs_supported_students_patient_share + m.drugs_supported_infants_patient_share) as total_patient_share,
                          c.name as clinic_name
                   FROM monthly_drugs_dispensed m
                   LEFT JOIN clinics c ON m.clinic_id = c.id
                   WHERE m.dispense_month >= ?1 AND m.dispense_month <= ?2".to_string();
    
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
        Box::new(startMonth),
        Box::new(endMonth),
    ];

    if let Some(cid) = clinicId {
        sql.push_str(" AND m.clinic_id = ?3");
        params.push(Box::new(cid));
    } else if let Some(aid) = areaId {
        sql.push_str(" AND m.area_id = ?3");
        params.push(Box::new(aid));
    } else {
        sql.push_str(" AND m.branch_id = ?3");
        params.push(Box::new(branchId));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(MonthlyDrugsDispensedRangeRow {
            branch_id: row.get(0)?,
            area_id: row.get(1)?,
            clinic_id: row.get(2)?,
            dispense_month: row.get(3)?,
            free_authority: row.get(4)?,
            free_students: row.get(5)?,
            free_infants: row.get(6)?,
            free_women: row.get(7)?,
            sup_authority: row.get(8)?,
            sup_students: row.get(9)?,
            sup_infants: row.get(10)?,
            sup_patient_share: row.get(11)?,
            clinic_name: row.get(12)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_supplies_dispensed_range(
    state: State<'_, AppState>,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    startMonth: String,
    endMonth: String,
) -> Result<Vec<SuppliesDispensedRow>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "SELECT m.supply_id, m.category_id, m.consumer_value, m.collective_entities_value, m.dispense_month, c.name as clinic_name 
                   FROM monthly_supplies_dispensed m
                   LEFT JOIN clinics c ON m.clinic_id = c.id
                   WHERE m.dispense_month >= ?1 AND m.dispense_month <= ?2".to_string();
    
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
        Box::new(startMonth),
        Box::new(endMonth),
    ];

    if let Some(cid) = clinicId {
        sql.push_str(" AND clinic_id = ?3");
        params.push(Box::new(cid));
    } else if let Some(aid) = areaId {
        sql.push_str(" AND area_id = ?3");
        params.push(Box::new(aid));
    } else {
        sql.push_str(" AND branch_id = ?3");
        params.push(Box::new(branchId));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(SuppliesDispensedRow {
            supply_id: row.get(0)?,
            category_id: row.get(1)?,
            consumer_value: row.get(2)?,
            collective_entities_value: row.get(3)?,
            dispense_month: row.get(4)?,
            clinic_name: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TopItemInfo {
    pub name: String,
    pub cost: f64,
    pub quantity: f64,
    pub cases: i32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ComparisonItem {
    pub label: String,
    pub cost: f64,
    pub cases: i32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ExecutiveReportSummary {
    pub total_cost: f64,
    pub total_cases: i32,
    pub drug_cost: f64,
    pub drug_cases: i32,
    pub insulin_cost: f64,
    pub insulin_cases: i32,
    pub supply_cost: f64,
    pub judicial_cost: f64,
    pub judicial_cases: i32,
    pub free_drugs_cost: f64,
    pub supported_drugs_cost: f64,
    pub patient_share: f64,
    pub tickets_56b: i32,
    pub tickets_56c: i32,
    pub top_drugs: Vec<TopItemInfo>,
    pub top_insulin: Vec<TopItemInfo>,
    pub comparisons: Vec<ComparisonItem>,
}

fn get_total_cost_for_scope(
    conn: &rusqlite::Connection,
    branch_id: Option<i32>,
    area_id: Option<i32>,
    clinic_id: Option<i32>,
    month: &str,
) -> f64 {
    let mut where_clause = "WHERE dispense_month = ?1".to_string();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(month.to_string())];
    let mut idx = 2;
    if let Some(bid) = branch_id {
        where_clause.push_str(&format!(" AND branch_id = ?{}", idx));
        params.push(Box::new(bid));
        idx += 1;
    }
    if let Some(aid) = area_id {
        where_clause.push_str(&format!(" AND area_id = ?{}", idx));
        params.push(Box::new(aid));
        idx += 1;
    }
    if let Some(cid) = clinic_id {
        where_clause.push_str(&format!(" AND clinic_id = ?{}", idx));
        params.push(Box::new(cid));
    }
    
    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();

    let drug_cost: f64 = conn.query_row(
        &format!("SELECT COALESCE(SUM(total_cost), 0.0) FROM detailed_drug_dispensed {}", where_clause),
        params_ref.as_slice(),
        |row| row.get(0)
    ).unwrap_or(0.0);

    let ins_cost: f64 = conn.query_row(
        &format!("SELECT COALESCE(SUM(cost), 0.0) FROM insulin_dispensed {}", where_clause),
        params_ref.as_slice(),
        |row| row.get(0)
    ).unwrap_or(0.0);

    let supply_cost: f64 = conn.query_row(
        &format!("SELECT COALESCE(SUM(consumer_value + collective_entities_value), 0.0) FROM monthly_supplies_dispensed {}", where_clause),
        params_ref.as_slice(),
        |row| row.get(0)
    ).unwrap_or(0.0);

    let jud_cost: f64 = conn.query_row(
        &format!("SELECT COALESCE(SUM(monthly_cost), 0.0) FROM judicial_dispensed {}", where_clause),
        params_ref.as_slice(),
        |row| row.get(0)
    ).unwrap_or(0.0);

    drug_cost + ins_cost + supply_cost + jud_cost
}

fn get_total_cases_for_scope(
    conn: &rusqlite::Connection,
    branch_id: Option<i32>,
    area_id: Option<i32>,
    clinic_id: Option<i32>,
    month: &str,
) -> i32 {
    let mut where_clause = "WHERE dispense_month = ?1".to_string();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(month.to_string())];
    let mut idx = 2;
    if let Some(bid) = branch_id {
        where_clause.push_str(&format!(" AND branch_id = ?{}", idx));
        params.push(Box::new(bid));
        idx += 1;
    }
    if let Some(aid) = area_id {
        where_clause.push_str(&format!(" AND area_id = ?{}", idx));
        params.push(Box::new(aid));
        idx += 1;
    }
    if let Some(cid) = clinic_id {
        where_clause.push_str(&format!(" AND clinic_id = ?{}", idx));
        params.push(Box::new(cid));
    }
    
    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();

    let drug_cases: i32 = conn.query_row(
        &format!("SELECT COALESCE(SUM(cases_count), 0) FROM detailed_drug_dispensed {}", where_clause),
        params_ref.as_slice(),
        |row| row.get(0)
    ).unwrap_or(0);

    let ins_cases: i32 = conn.query_row(
        &format!("SELECT COALESCE(SUM(cases_count), 0) FROM insulin_dispensed {}", where_clause),
        params_ref.as_slice(),
        |row| row.get(0)
    ).unwrap_or(0);

    let jud_cases: i32 = conn.query_row(
        &format!("SELECT COUNT(*) FROM judicial_dispensed {}", where_clause),
        params_ref.as_slice(),
        |row| row.get(0)
    ).unwrap_or(0);

    drug_cases + ins_cases + jud_cases
}

fn get_last_6_months(month_str: &str) -> Vec<String> {
    let parts: Vec<&str> = month_str.split('-').collect();
    if parts.len() < 2 {
        return vec![month_str.to_string()];
    }
    let year: i32 = parts[0].parse().unwrap_or(2026);
    let month: i32 = parts[1].parse().unwrap_or(1);
    
    let mut months = Vec::new();
    for i in (0..6).rev() {
        let mut m = month - i;
        let mut y = year;
        while m <= 0 {
            m += 12;
            y -= 1;
        }
        months.push(format!("{:04}-{:02}", y, m));
    }
    months
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_executive_report_summary(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: String,
) -> Result<ExecutiveReportSummary, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut where_clause = "WHERE dispense_month = ?1".to_string();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(dispenseMonth.clone())];

    if let Some(bid) = branchId {
        where_clause.push_str(" AND branch_id = ?2");
        params.push(Box::new(bid));
    }
    if let Some(aid) = areaId {
        where_clause.push_str(" AND area_id = ?3");
        params.push(Box::new(aid));
    }
    if let Some(cid) = clinicId {
        where_clause.push_str(" AND clinic_id = ?4");
        params.push(Box::new(cid));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();

    // 1. Detailed Drugs
    let (drug_cases, drug_cost): (Option<i32>, Option<f64>) = conn.query_row(
        &format!("SELECT SUM(cases_count), SUM(total_cost) FROM detailed_drug_dispensed {}", where_clause),
        params_ref.as_slice(),
        |row| Ok((row.get(0)?, row.get(1)?))
    ).unwrap_or((None, None));

    // 2. Insulin
    let (ins_cases, ins_cost): (Option<i32>, Option<f64>) = conn.query_row(
        &format!("SELECT SUM(cases_count), SUM(cost) FROM insulin_dispensed {}", where_clause),
        params_ref.as_slice(),
        |row| Ok((row.get(0)?, row.get(1)?))
    ).unwrap_or((None, None));

    // 3. Supplies
    let supplies_val: Option<f64> = conn.query_row(
        &format!("SELECT SUM(consumer_value + collective_entities_value) FROM monthly_supplies_dispensed {}", where_clause),
        params_ref.as_slice(),
        |row| row.get(0)
    ).unwrap_or(None);

    // 4. Judicial
    let (jud_cases, jud_cost): (Option<i32>, Option<f64>) = conn.query_row(
        &format!("SELECT COUNT(*), SUM(monthly_cost) FROM judicial_dispensed {}", where_clause),
        params_ref.as_slice(),
        |row| Ok((row.get(0)?, row.get(1)?))
    ).unwrap_or((None, None));

    // 5. Monthly Totals Groups
    let (free_total, supported_total, patient_share): (Option<f64>, Option<f64>, Option<f64>) = conn.query_row(
        &format!("SELECT SUM(drugs_free_authority + drugs_free_students + drugs_free_infants + drugs_free_breadwinner_women),
                        SUM(drugs_supported_authority_value + drugs_supported_students_value + drugs_supported_infants_value),
                        SUM(drugs_supported_authority_patient_share + drugs_supported_students_patient_share + drugs_supported_infants_patient_share)
                 FROM monthly_drugs_dispensed {}", where_clause),
        params_ref.as_slice(),
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    ).unwrap_or((None, None, None));

    // 6. Medical Tickets (only clinic_id directly referenced)
    let mut cid_where = "WHERE dispense_month = ?1".to_string();
    if let Some(_cid) = clinicId {
        cid_where.push_str(" AND clinic_id = ?2");
    } else if let Some(_aid) = areaId {
        cid_where.push_str(" AND clinic_id IN (SELECT id FROM clinics WHERE area_id = ?2)");
    } else if let Some(_bid) = branchId {
        cid_where.push_str(" AND clinic_id IN (SELECT c.id FROM clinics c JOIN areas a ON c.area_id = a.id WHERE a.branch_id = ?2)");
    }

    let params_cid: Vec<Box<dyn rusqlite::ToSql>> = if let Some(id) = clinicId.or(areaId).or(branchId) {
        vec![Box::new(dispenseMonth.clone()), Box::new(id)]
    } else {
        vec![Box::new(dispenseMonth.clone())]
    };
    let params_cid_ref: Vec<&dyn rusqlite::ToSql> = params_cid.iter().map(|b| b.as_ref()).collect();

    let (t_56b, t_56c): (Option<i32>, Option<i32>) = conn.query_row(
        &format!("SELECT SUM(tickets_56b), SUM(tickets_56c) FROM medical_tickets {}", cid_where),
        params_cid_ref.as_slice(),
        |row| Ok((row.get(0)?, row.get(1)?))
    ).unwrap_or((None, None));

    // 7. Top 5 Drugs
    let top_drugs_sql = format!(
        "SELECT d.name, SUM(dd.total_cost) as c, SUM(dd.quantity) as q, SUM(dd.cases_count) as cs \
         FROM detailed_drug_dispensed dd \
         JOIN drugs d ON dd.drug_id = d.id \
         {} \
         GROUP BY dd.drug_id \
         ORDER BY c DESC \
         LIMIT 5",
        where_clause
    );
    let mut stmt = conn.prepare(&top_drugs_sql).map_err(|e| e.to_string())?;
    let top_drugs_rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(TopItemInfo {
            name: row.get(0)?,
            cost: row.get(1)?,
            quantity: row.get(2)?,
            cases: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut top_drugs = Vec::new();
    for r in top_drugs_rows {
        if let Ok(item) = r {
            top_drugs.push(item);
        }
    }

    // 8. Top 5 Insulin
    let top_ins_sql = format!(
        "SELECT name, SUM(cost) as c, SUM(quantity) as q, SUM(cases_count) as cs \
         FROM insulin_dispensed \
         {} \
         GROUP BY name \
         ORDER BY c DESC \
         LIMIT 5",
        where_clause
    );
    let mut stmt = conn.prepare(&top_ins_sql).map_err(|e| e.to_string())?;
    let top_ins_rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(TopItemInfo {
            name: row.get(0)?,
            cost: row.get(1)?,
            quantity: row.get(2)?,
            cases: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut top_insulin = Vec::new();
    for r in top_ins_rows {
        if let Ok(item) = r {
            top_insulin.push(item);
        }
    }

    // 9. Comparisons / Breakdown of sub-units
    let mut comparisons = Vec::new();
    if clinicId.is_some() {
        // Trend for the selected clinic
        let months = get_last_6_months(&dispenseMonth);
        for m in months {
            let cost = get_total_cost_for_scope(&conn, branchId, areaId, clinicId, &m);
            let cases = get_total_cases_for_scope(&conn, branchId, areaId, clinicId, &m);
            comparisons.push(ComparisonItem { label: m, cost, cases });
        }
    } else if let Some(aid) = areaId {
        // Clinics in this area
        let mut stmt = conn.prepare("SELECT id, name FROM clinics WHERE area_id = ?1").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([aid], |row| {
            Ok((row.get::<_, i32>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| e.to_string())?;
        for r in rows {
            if let Ok((cid, name)) = r {
                let cost = get_total_cost_for_scope(&conn, branchId, areaId, Some(cid), &dispenseMonth);
                let cases = get_total_cases_for_scope(&conn, branchId, areaId, Some(cid), &dispenseMonth);
                comparisons.push(ComparisonItem { label: name, cost, cases });
            }
        }
    } else if let Some(bid) = branchId {
        // Areas in this branch
        let mut stmt = conn.prepare("SELECT id, name FROM areas WHERE branch_id = ?1").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([bid], |row| {
            Ok((row.get::<_, i32>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| e.to_string())?;
        for r in rows {
            if let Ok((aid, name)) = r {
                let cost = get_total_cost_for_scope(&conn, branchId, Some(aid), None, &dispenseMonth);
                let cases = get_total_cases_for_scope(&conn, branchId, Some(aid), None, &dispenseMonth);
                comparisons.push(ComparisonItem { label: name, cost, cases });
            }
        }
    } else {
        // Branches
        let mut stmt = conn.prepare("SELECT id, name FROM branches").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, i32>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| e.to_string())?;
        for r in rows {
            if let Ok((bid, name)) = r {
                let cost = get_total_cost_for_scope(&conn, Some(bid), None, None, &dispenseMonth);
                let cases = get_total_cases_for_scope(&conn, Some(bid), None, None, &dispenseMonth);
                comparisons.push(ComparisonItem { label: name, cost, cases });
            }
        }
    }

    let drug_c = drug_cost.unwrap_or(0.0);
    let ins_c = ins_cost.unwrap_or(0.0);
    let sup_c = supplies_val.unwrap_or(0.0);
    let jud_c = jud_cost.unwrap_or(0.0);
    let total_cost = drug_c + ins_c + sup_c + jud_c;

    let drug_cs = drug_cases.unwrap_or(0);
    let ins_cs = ins_cases.unwrap_or(0);
    let jud_cs = jud_cases.unwrap_or(0);
    let total_cases = drug_cs + ins_cs + jud_cs;

    Ok(ExecutiveReportSummary {
        total_cost,
        total_cases,
        drug_cost: drug_c,
        drug_cases: drug_cs,
        insulin_cost: ins_c,
        insulin_cases: ins_cs,
        supply_cost: sup_c,
        judicial_cost: jud_c,
        judicial_cases: jud_cs,
        free_drugs_cost: free_total.unwrap_or(0.0),
        supported_drugs_cost: supported_total.unwrap_or(0.0),
        patient_share: patient_share.unwrap_or(0.0),
        tickets_56b: t_56b.unwrap_or(0),
        tickets_56c: t_56c.unwrap_or(0),
        top_drugs,
        top_insulin,
        comparisons,
    })
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DemographicReportRow {
    pub month: String,
    pub free_authority: f64,
    pub free_students: f64,
    pub free_infants: f64,
    pub free_women: f64,
    pub sup_authority_val: f64,
    pub sup_authority_share: f64,
    pub sup_students_val: f64,
    pub sup_students_share: f64,
    pub sup_infants_val: f64,
    pub sup_infants_share: f64,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_demographic_report(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    startMonth: String,
    endMonth: String,
) -> Result<Vec<DemographicReportRow>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut where_clause = "WHERE dispense_month >= ?1 AND dispense_month <= ?2".to_string();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
        Box::new(startMonth),
        Box::new(endMonth),
    ];
    let mut idx = 3;
    if let Some(bid) = branchId {
        where_clause.push_str(&format!(" AND branch_id = ?{}", idx));
        params.push(Box::new(bid));
        idx += 1;
    }
    if let Some(aid) = areaId {
        where_clause.push_str(&format!(" AND area_id = ?{}", idx));
        params.push(Box::new(aid));
        idx += 1;
    }
    if let Some(cid) = clinicId {
        where_clause.push_str(&format!(" AND clinic_id = ?{}", idx));
        params.push(Box::new(cid));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();

    let sql = format!(
        "SELECT dispense_month,
                SUM(drugs_free_authority),
                SUM(drugs_free_students),
                SUM(drugs_free_infants),
                SUM(drugs_free_breadwinner_women),
                SUM(drugs_supported_authority_value),
                SUM(drugs_supported_authority_patient_share),
                SUM(drugs_supported_students_value),
                SUM(drugs_supported_students_patient_share),
                SUM(drugs_supported_infants_value),
                SUM(drugs_supported_infants_patient_share)
         FROM monthly_drugs_dispensed
         {}
         GROUP BY dispense_month
         ORDER BY dispense_month ASC",
        where_clause
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(DemographicReportRow {
            month: row.get(0)?,
            free_authority: row.get::<_, Option<f64>>(1)?.unwrap_or(0.0),
            free_students: row.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
            free_infants: row.get::<_, Option<f64>>(3)?.unwrap_or(0.0),
            free_women: row.get::<_, Option<f64>>(4)?.unwrap_or(0.0),
            sup_authority_val: row.get::<_, Option<f64>>(5)?.unwrap_or(0.0),
            sup_authority_share: row.get::<_, Option<f64>>(6)?.unwrap_or(0.0),
            sup_students_val: row.get::<_, Option<f64>>(7)?.unwrap_or(0.0),
            sup_students_share: row.get::<_, Option<f64>>(8)?.unwrap_or(0.0),
            sup_infants_val: row.get::<_, Option<f64>>(9)?.unwrap_or(0.0),
            sup_infants_share: row.get::<_, Option<f64>>(10)?.unwrap_or(0.0),
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

// ===== Anomaly & Waste Detection Report =====

#[derive(Serialize, Deserialize, Debug)]
pub struct ClinicOutlier {
    pub clinic_name: String,
    pub drug_name: String,
    pub actual_qty: f64,
    pub avg_qty: f64,
    pub std_dev: f64,
    pub deviation_pct: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TicketCostMismatch {
    pub clinic_name: String,
    pub total_tickets: i32,
    pub total_cost: f64,
    pub cost_per_ticket: f64,
    pub avg_cost_per_ticket: f64,
    pub deviation_pct: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SurgeDrug {
    pub drug_name: String,
    pub current_cost: f64,
    pub previous_cost: f64,
    pub growth_pct: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AnomalyReport {
    pub clinic_outliers: Vec<ClinicOutlier>,
    pub ticket_mismatches: Vec<TicketCostMismatch>,
    pub surge_drugs: Vec<SurgeDrug>,
    pub insulin_outliers: Vec<ClinicOutlier>,
    pub supply_outliers: Vec<ClinicOutlier>,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_anomaly_report(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    areaId: Option<i32>,
    dispenseMonth: String,
) -> Result<AnomalyReport, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // Build a scope filter for the branch/area level
    let mut scope_where = "WHERE dispense_month = ?1".to_string();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(dispenseMonth.clone())];

    if let Some(bid) = branchId {
        scope_where.push_str(" AND branch_id = ?2");
        params.push(Box::new(bid));
    }
    if let Some(aid) = areaId {
        scope_where.push_str(&format!(" AND area_id = ?{}", params.len() + 1));
        params.push(Box::new(aid));
    }
    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();

    // ====== 1. Clinic Outlier Detection ======
    // For each drug in the scope, compute per-clinic quantities, then flag outliers
    let outlier_sql = format!(
        "SELECT c.name AS clinic_name, d.name AS drug_name, \
                SUM(dd.quantity) AS actual_qty, \
                drug_stats.avg_qty, \
                drug_stats.std_dev \
         FROM detailed_drug_dispensed dd \
         JOIN clinics c ON dd.clinic_id = c.id \
         JOIN drugs d ON dd.drug_id = d.id \
         JOIN ( \
             SELECT drug_id, \
                    AVG(clinic_qty) AS avg_qty, \
                    CASE WHEN COUNT(*) > 1 THEN \
                        SQRT(SUM((clinic_qty - avg_all) * (clinic_qty - avg_all)) / (COUNT(*) - 1)) \
                    ELSE 0 END AS std_dev \
             FROM ( \
                 SELECT drug_id, clinic_id, SUM(quantity) AS clinic_qty, \
                        AVG(SUM(quantity)) OVER (PARTITION BY drug_id) AS avg_all \
                 FROM detailed_drug_dispensed \
                 {} \
                 GROUP BY drug_id, clinic_id \
             ) sub \
             GROUP BY drug_id \
             HAVING COUNT(*) >= 3 AND std_dev > 0 \
         ) drug_stats ON dd.drug_id = drug_stats.drug_id \
         {} \
         GROUP BY dd.clinic_id, dd.drug_id \
         HAVING actual_qty > drug_stats.avg_qty + 2 * drug_stats.std_dev \
         ORDER BY (actual_qty - drug_stats.avg_qty) / CASE WHEN drug_stats.std_dev > 0 THEN drug_stats.std_dev ELSE 1 END DESC \
         LIMIT 20",
        scope_where, scope_where
    );

    // We need double params for the subquery and outer query
    let mut double_params: Vec<&dyn rusqlite::ToSql> = Vec::new();
    double_params.extend(params_ref.iter());
    double_params.extend(params_ref.iter());

    let mut clinic_outliers = Vec::new();
    if let Ok(mut stmt) = conn.prepare(&outlier_sql) {
        if let Ok(rows) = stmt.query_map(double_params.as_slice(), |row| {
            let clinic_name: String = row.get(0)?;
            let drug_name: String = row.get(1)?;
            let actual_qty: f64 = row.get(2)?;
            let avg_qty: f64 = row.get(3)?;
            let std_dev: f64 = row.get(4)?;
            let deviation_pct = if avg_qty > 0.0 { ((actual_qty - avg_qty) / avg_qty) * 100.0 } else { 0.0 };
            Ok(ClinicOutlier { clinic_name, drug_name, actual_qty, avg_qty, std_dev, deviation_pct })
        }) {
            for r in rows {
                if let Ok(item) = r { clinic_outliers.push(item); }
            }
        }
    }

    // ====== 2. Ticket-Cost Mismatch ======
    // Compare cost-per-ticket per clinic to the overall average
    let ticket_sql = format!(
        "SELECT c.name AS clinic_name, \
                COALESCE(t.total_tickets, 0) AS total_tickets, \
                COALESCE(dd.total_cost, 0) AS total_cost \
         FROM clinics c \
         LEFT JOIN ( \
             SELECT clinic_id, SUM(tickets_56b + tickets_56c) AS total_tickets \
             FROM medical_tickets \
             WHERE dispense_month = ?1 \
             GROUP BY clinic_id \
         ) t ON c.id = t.clinic_id \
         LEFT JOIN ( \
             SELECT clinic_id, SUM(total_cost) AS total_cost \
             FROM detailed_drug_dispensed \
             {} \
             GROUP BY clinic_id \
         ) dd ON c.id = dd.clinic_id \
         WHERE (t.total_tickets > 0 OR dd.total_cost > 0)",
        scope_where
    );

    let mut ticket_data: Vec<(String, i32, f64)> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(&ticket_sql) {
        if let Ok(rows) = stmt.query_map(params_ref.as_slice(), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?, row.get::<_, f64>(2)?))
        }) {
            for r in rows {
                if let Ok(item) = r { ticket_data.push(item); }
            }
        }
    }

    // Calculate overall avg cost per ticket
    let total_tickets_sum: i32 = ticket_data.iter().map(|d| d.1).sum();
    let total_cost_sum: f64 = ticket_data.iter().map(|d| d.2).sum();
    let overall_avg_cpt = if total_tickets_sum > 0 { total_cost_sum / total_tickets_sum as f64 } else { 0.0 };

    let mut ticket_mismatches = Vec::new();
    for (name, tickets, cost) in &ticket_data {
        if *tickets > 0 {
            let cpt = *cost / *tickets as f64;
            let dev_pct = if overall_avg_cpt > 0.0 { ((cpt - overall_avg_cpt) / overall_avg_cpt) * 100.0 } else { 0.0 };
            if dev_pct >= 80.0 {
                ticket_mismatches.push(TicketCostMismatch {
                    clinic_name: name.clone(),
                    total_tickets: *tickets,
                    total_cost: *cost,
                    cost_per_ticket: cpt,
                    avg_cost_per_ticket: overall_avg_cpt,
                    deviation_pct: dev_pct,
                });
            }
        }
    }
    ticket_mismatches.sort_by(|a, b| b.deviation_pct.partial_cmp(&a.deviation_pct).unwrap_or(std::cmp::Ordering::Equal));
    if ticket_mismatches.len() > 20 { ticket_mismatches.truncate(20); }

    // ====== 3. Sudden Surge Detection ======
    // Compare each drug's cost this month vs previous month
    let prev_month = get_previous_month(&dispenseMonth);

    // Simpler approach: do two separate queries
    let mut current_costs: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    let mut previous_costs: std::collections::HashMap<String, f64> = std::collections::HashMap::new();

    // Current month costs per drug
    let cur_sql = format!(
        "SELECT d.name, SUM(dd.total_cost) \
         FROM detailed_drug_dispensed dd \
         JOIN drugs d ON dd.drug_id = d.id \
         {} \
         GROUP BY dd.drug_id",
        scope_where
    );
    if let Ok(mut stmt) = conn.prepare(&cur_sql) {
        if let Ok(rows) = stmt.query_map(params_ref.as_slice(), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        }) {
            for r in rows {
                if let Ok((name, cost)) = r { current_costs.insert(name, cost); }
            }
        }
    }

    // Previous month costs per drug
    let mut prev_where = "WHERE dispense_month = ?1".to_string();
    let mut prev_params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(prev_month)];
    if let Some(bid) = branchId {
        prev_where.push_str(" AND branch_id = ?2");
        prev_params.push(Box::new(bid));
    }
    if let Some(aid) = areaId {
        prev_where.push_str(&format!(" AND area_id = ?{}", prev_params.len() + 1));
        prev_params.push(Box::new(aid));
    }
    let prev_params_ref: Vec<&dyn rusqlite::ToSql> = prev_params.iter().map(|b| b.as_ref()).collect();

    let prev_sql = format!(
        "SELECT d.name, SUM(dd.total_cost) \
         FROM detailed_drug_dispensed dd \
         JOIN drugs d ON dd.drug_id = d.id \
         {} \
         GROUP BY dd.drug_id",
        prev_where
    );
    if let Ok(mut stmt) = conn.prepare(&prev_sql) {
        if let Ok(rows) = stmt.query_map(prev_params_ref.as_slice(), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        }) {
            for r in rows {
                if let Ok((name, cost)) = r { previous_costs.insert(name, cost); }
            }
        }
    }

    let mut surge_drugs = Vec::new();
    for (name, cur_cost) in &current_costs {
        if let Some(prev_cost) = previous_costs.get(name) {
            if *prev_cost > 0.0 {
                let growth = ((*cur_cost - *prev_cost) / *prev_cost) * 100.0;
                if growth >= 150.0 {
                    surge_drugs.push(SurgeDrug {
                        drug_name: name.clone(),
                        current_cost: *cur_cost,
                        previous_cost: *prev_cost,
                        growth_pct: growth,
                    });
                }
            }
        }
    }
    surge_drugs.sort_by(|a, b| b.growth_pct.partial_cmp(&a.growth_pct).unwrap_or(std::cmp::Ordering::Equal));
    if surge_drugs.len() > 20 { surge_drugs.truncate(20); }

    // ====== 4. Insulin Outlier Detection ======
    let insulin_outlier_sql = format!(
        "SELECT c.name AS clinic_name, ins.name AS drug_name, \
                SUM(ins.quantity) AS actual_qty, \
                ins_stats.avg_qty, \
                ins_stats.std_dev \
         FROM insulin_dispensed ins \
         JOIN clinics c ON ins.clinic_id = c.id \
         JOIN ( \
             SELECT name, \
                    AVG(clinic_qty) AS avg_qty, \
                    CASE WHEN COUNT(*) > 1 THEN \
                        SQRT(SUM((clinic_qty - avg_all) * (clinic_qty - avg_all)) / (COUNT(*) - 1)) \
                    ELSE 0 END AS std_dev \
             FROM ( \
                 SELECT name, clinic_id, SUM(quantity) AS clinic_qty, \
                        AVG(SUM(quantity)) OVER (PARTITION BY name) AS avg_all \
                 FROM insulin_dispensed \
                 {} \
                 GROUP BY name, clinic_id \
             ) sub \
             GROUP BY name \
             HAVING COUNT(*) >= 3 AND std_dev > 0 \
         ) ins_stats ON ins.name = ins_stats.name \
         {} \
         GROUP BY ins.clinic_id, ins.name \
         HAVING actual_qty > ins_stats.avg_qty + 2 * ins_stats.std_dev \
         ORDER BY (actual_qty - ins_stats.avg_qty) / CASE WHEN ins_stats.std_dev > 0 THEN ins_stats.std_dev ELSE 1 END DESC \
         LIMIT 20",
        scope_where, scope_where
    );

    let mut insulin_outliers = Vec::new();
    if let Ok(mut stmt) = conn.prepare(&insulin_outlier_sql) {
        if let Ok(rows) = stmt.query_map(double_params.as_slice(), |row| {
            let clinic_name: String = row.get(0)?;
            let drug_name: String = row.get(1)?;
            let actual_qty: f64 = row.get(2)?;
            let avg_qty: f64 = row.get(3)?;
            let std_dev: f64 = row.get(4)?;
            let deviation_pct = if avg_qty > 0.0 { ((actual_qty - avg_qty) / avg_qty) * 100.0 } else { 0.0 };
            Ok(ClinicOutlier { clinic_name, drug_name, actual_qty, avg_qty, std_dev, deviation_pct })
        }) {
            for r in rows.flatten() { insulin_outliers.push(r); }
        }
    }

    // ====== 5. Supply Outlier Detection ======
    let supply_outlier_sql = format!(
        "SELECT c.name AS clinic_name, COALESCE(s.name, cat.name, 'غير محدد') AS drug_name, \
                SUM(sup.consumer_value + sup.collective_entities_value) AS actual_qty, \
                sup_stats.avg_qty, \
                sup_stats.std_dev \
         FROM monthly_supplies_dispensed sup \
         JOIN clinics c ON sup.clinic_id = c.id \
         LEFT JOIN supplies s ON sup.supply_id = s.id \
         LEFT JOIN supply_categories cat ON sup.category_id = cat.id \
         JOIN ( \
             SELECT COALESCE(supply_id, category_id, 0) as item_id, \
                    AVG(clinic_qty) AS avg_qty, \
                    CASE WHEN COUNT(*) > 1 THEN \
                        SQRT(SUM((clinic_qty - avg_all) * (clinic_qty - avg_all)) / (COUNT(*) - 1)) \
                    ELSE 0 END AS std_dev \
             FROM ( \
                 SELECT COALESCE(supply_id, category_id, 0) as item_id, clinic_id, \
                        SUM(consumer_value + collective_entities_value) AS clinic_qty, \
                        AVG(SUM(consumer_value + collective_entities_value)) OVER (PARTITION BY COALESCE(supply_id, category_id, 0)) AS avg_all \
                 FROM monthly_supplies_dispensed \
                 {} \
                 GROUP BY COALESCE(supply_id, category_id, 0), clinic_id \
             ) sub \
             GROUP BY item_id \
             HAVING COUNT(*) >= 3 AND std_dev > 0 \
         ) sup_stats ON COALESCE(sup.supply_id, sup.category_id, 0) = sup_stats.item_id \
         {} \
         GROUP BY sup.clinic_id, COALESCE(sup.supply_id, sup.category_id, 0) \
         HAVING actual_qty > sup_stats.avg_qty + 2 * sup_stats.std_dev \
         ORDER BY (actual_qty - sup_stats.avg_qty) / CASE WHEN sup_stats.std_dev > 0 THEN sup_stats.std_dev ELSE 1 END DESC \
         LIMIT 20",
        scope_where, scope_where
    );

    let mut supply_outliers = Vec::new();
    if let Ok(mut stmt) = conn.prepare(&supply_outlier_sql) {
        if let Ok(rows) = stmt.query_map(double_params.as_slice(), |row| {
            let clinic_name: String = row.get(0)?;
            let drug_name: String = row.get(1)?;
            let actual_qty: f64 = row.get(2)?;
            let avg_qty: f64 = row.get(3)?;
            let std_dev: f64 = row.get(4)?;
            let deviation_pct = if avg_qty > 0.0 { ((actual_qty - avg_qty) / avg_qty) * 100.0 } else { 0.0 };
            Ok(ClinicOutlier { clinic_name, drug_name, actual_qty, avg_qty, std_dev, deviation_pct })
        }) {
            for r in rows.flatten() { supply_outliers.push(r); }
        }
    }

    Ok(AnomalyReport {
        clinic_outliers,
        ticket_mismatches,
        surge_drugs,
        insulin_outliers,
        supply_outliers,
    })
}

fn get_previous_month(month_str: &str) -> String {
    let parts: Vec<&str> = month_str.split('-').collect();
    if parts.len() < 2 { return month_str.to_string(); }
    let year: i32 = parts[0].parse().unwrap_or(2026);
    let month: i32 = parts[1].parse().unwrap_or(1);
    let (py, pm) = if month <= 1 { (year - 1, 12) } else { (year, month - 1) };
    format!("{:04}-{:02}", py, pm)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_pivot_data(
    state: State<'_, AppState>,
    dataSource: String,
    startMonth: String,
    endMonth: String,
) -> Result<Vec<serde_json::Value>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut result = Vec::new();

    match dataSource.as_str() {
        "detailed_drugs" => {
            let mut stmt = conn.prepare("
                SELECT b.name, a.name, c.name, dd.dispense_month, d.name, cat.name, dd.quantity, dd.cases_count, dd.total_cost
                FROM detailed_drug_dispensed dd
                JOIN branches b ON dd.branch_id = b.id
                LEFT JOIN areas a ON dd.area_id = a.id
                LEFT JOIN clinics c ON dd.clinic_id = c.id
                JOIN drugs d ON dd.drug_id = d.id
                JOIN drug_categories cat ON d.category_id = cat.id
                WHERE dd.dispense_month >= ?1 AND dd.dispense_month <= ?2
            ").map_err(|e| e.to_string())?;

            let rows = stmt.query_map([startMonth, endMonth], |row| {
                Ok(serde_json::json!({
                    "branch": row.get::<_, String>(0)?,
                    "area": row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "غير محدد".to_string()),
                    "clinic": row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "غير محدد".to_string()),
                    "month": row.get::<_, String>(3)?,
                    "drug": row.get::<_, String>(4)?,
                    "category": row.get::<_, String>(5)?,
                    "qty": row.get::<_, f64>(6)?,
                    "cases": row.get::<_, i32>(7)?,
                    "cost": row.get::<_, f64>(8)?,
                }))
            }).map_err(|e| e.to_string())?;

            for r in rows {
                result.push(r.map_err(|e| e.to_string())?);
            }
        }
        "monthly_totals" => {
            let mut stmt = conn.prepare("
                SELECT b.name, a.name, c.name, md.dispense_month,
                       md.drugs_free_authority, md.drugs_free_students, md.drugs_free_infants, md.drugs_free_breadwinner_women,
                       md.drugs_supported_authority_value, md.drugs_supported_students_value, md.drugs_supported_infants_value
                FROM monthly_drugs_dispensed md
                JOIN branches b ON md.branch_id = b.id
                JOIN areas a ON md.area_id = a.id
                JOIN clinics c ON md.clinic_id = c.id
                WHERE md.dispense_month >= ?1 AND md.dispense_month <= ?2
            ").map_err(|e| e.to_string())?;

            let rows = stmt.query_map([startMonth, endMonth], |row| {
                let free_auth = row.get::<_, Option<f64>>(4)?.unwrap_or(0.0);
                let free_stud = row.get::<_, Option<f64>>(5)?.unwrap_or(0.0);
                let free_inf  = row.get::<_, Option<f64>>(6)?.unwrap_or(0.0);
                let free_women= row.get::<_, Option<f64>>(7)?.unwrap_or(0.0);
                let sup_auth  = row.get::<_, Option<f64>>(8)?.unwrap_or(0.0);
                let sup_stud  = row.get::<_, Option<f64>>(9)?.unwrap_or(0.0);
                let sup_inf   = row.get::<_, Option<f64>>(10)?.unwrap_or(0.0);

                let total_free = free_auth + free_stud + free_inf + free_women;
                let total_sup  = sup_auth + sup_stud + sup_inf;

                Ok(serde_json::json!({
                    "branch": row.get::<_, String>(0)?,
                    "area": row.get::<_, String>(1)?,
                    "clinic": row.get::<_, String>(2)?,
                    "month": row.get::<_, String>(3)?,
                    "free_authority": free_auth,
                    "free_students": free_stud,
                    "free_infants": free_inf,
                    "free_women": free_women,
                    "supported_authority": sup_auth,
                    "supported_students": sup_stud,
                    "supported_infants": sup_inf,
                    "total_free": total_free,
                    "total_supported": total_sup,
                    "total_cost": total_free + total_sup,
                }))
            }).map_err(|e| e.to_string())?;

            for r in rows {
                result.push(r.map_err(|e| e.to_string())?);
            }
        }
        "insulin" => {
            let mut stmt = conn.prepare("
                SELECT b.name, a.name, c.name, ind.dispense_month, ind.name, ind.type, ind.category, ind.quantity, ind.cases_count, ind.cost
                FROM insulin_dispensed ind
                JOIN clinics c ON ind.clinic_id = c.id
                JOIN areas a ON ind.area_id = a.id
                JOIN branches b ON a.branch_id = b.id
                WHERE ind.dispense_month >= ?1 AND ind.dispense_month <= ?2
            ").map_err(|e| e.to_string())?;

            let rows = stmt.query_map([startMonth, endMonth], |row| {
                Ok(serde_json::json!({
                    "branch": row.get::<_, String>(0)?,
                    "area": row.get::<_, String>(1)?,
                    "clinic": row.get::<_, String>(2)?,
                    "month": row.get::<_, String>(3)?,
                    "insulin": row.get::<_, String>(4)?,
                    "type": row.get::<_, String>(5)?,
                    "category": row.get::<_, String>(6)?,
                    "qty": row.get::<_, f64>(7)?,
                    "cases": row.get::<_, i32>(8)?,
                    "cost": row.get::<_, f64>(9)?,
                }))
            }).map_err(|e| e.to_string())?;

            for r in rows {
                result.push(r.map_err(|e| e.to_string())?);
            }
        }
        "judicial" => {
            let mut stmt = conn.prepare("
                SELECT b.name, a.name, c.name, jd.dispense_month, p.name, jd.diagnosis, jd.medicine_name, jd.monthly_dose, jd.monthly_cost
                FROM judicial_dispensed jd
                JOIN clinics c ON jd.clinic_id = c.id
                JOIN areas a ON jd.area_id = a.id
                JOIN branches b ON a.branch_id = b.id
                JOIN judicial_patients p ON jd.patient_id = p.id
                WHERE jd.dispense_month >= ?1 AND jd.dispense_month <= ?2
            ").map_err(|e| e.to_string())?;

            let rows = stmt.query_map([startMonth, endMonth], |row| {
                Ok(serde_json::json!({
                    "branch": row.get::<_, String>(0)?,
                    "area": row.get::<_, String>(1)?,
                    "clinic": row.get::<_, String>(2)?,
                    "month": row.get::<_, String>(3)?,
                    "patient": row.get::<_, String>(4)?,
                    "diagnosis": row.get::<_, String>(5)?,
                    "medicine": row.get::<_, String>(6)?,
                    "qty": row.get::<_, f64>(7)?,
                    "cost": row.get::<_, f64>(8)?,
                }))
            }).map_err(|e| e.to_string())?;

            for r in rows {
                result.push(r.map_err(|e| e.to_string())?);
            }
        }
        "supplies" => {
            let mut stmt = conn.prepare("
                SELECT b.name, a.name, c.name, sd.dispense_month, s.name, scat.name, sd.consumer_value, sd.collective_entities_value
                FROM monthly_supplies_dispensed sd
                JOIN clinics c ON sd.clinic_id = c.id
                JOIN areas a ON sd.area_id = a.id
                JOIN branches b ON sd.branch_id = b.id
                JOIN supplies s ON sd.supply_id = s.id
                JOIN supply_categories scat ON s.category_id = scat.id
                WHERE sd.dispense_month >= ?1 AND sd.dispense_month <= ?2
            ").map_err(|e| e.to_string())?;

            let rows = stmt.query_map([startMonth, endMonth], |row| {
                let consumer_val = row.get::<_, Option<f64>>(6)?.unwrap_or(0.0);
                let collective_val = row.get::<_, Option<f64>>(7)?.unwrap_or(0.0);
                Ok(serde_json::json!({
                    "branch": row.get::<_, String>(0)?,
                    "area": row.get::<_, String>(1)?,
                    "clinic": row.get::<_, String>(2)?,
                    "month": row.get::<_, String>(3)?,
                    "supply": row.get::<_, String>(4)?,
                    "category": row.get::<_, String>(5)?,
                    "consumer_val": consumer_val,
                    "collective_val": collective_val,
                    "total_val": consumer_val + collective_val,
                }))
            }).map_err(|e| e.to_string())?;

            for r in rows {
                result.push(r.map_err(|e| e.to_string())?);
            }
        }
        "medical_tickets" => {
            let mut stmt = conn.prepare("
                SELECT b.name, a.name, c.name, mt.dispense_month, mt.category, mt.period, mt.tickets_56b, mt.tickets_56c
                FROM medical_tickets mt
                LEFT JOIN clinics c ON mt.clinic_id = c.id
                LEFT JOIN areas a ON mt.area_id = a.id
                LEFT JOIN branches b ON mt.branch_id = b.id
                WHERE mt.dispense_month >= ?1 AND mt.dispense_month <= ?2
            ").map_err(|e| e.to_string())?;

            let rows = stmt.query_map([startMonth, endMonth], |row| {
                let t_56b = row.get::<_, Option<i32>>(6)?.unwrap_or(0);
                let t_56c = row.get::<_, Option<i32>>(7)?.unwrap_or(0);
                Ok(serde_json::json!({
                    "branch": row.get::<_, Option<String>>(0)?.unwrap_or_else(|| "غير محدد".to_string()),
                    "area": row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "غير محدد".to_string()),
                    "clinic": row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "غير محدد".to_string()),
                    "month": row.get::<_, String>(3)?,
                    "category": row.get::<_, String>(4)?,
                    "period": row.get::<_, String>(5)?,
                    "tickets_56b": t_56b,
                    "tickets_56c": t_56c,
                    "total_tickets": t_56b + t_56c,
                }))
            }).map_err(|e| e.to_string())?;

            for r in rows {
                result.push(r.map_err(|e| e.to_string())?);
            }
        }
        _ => return Err("Invalid data source selected".to_string()),
    }

    Ok(result)
}

// ===== Data Quality Report =====

#[derive(Serialize, Deserialize, Debug)]
pub struct MonthQualityRow {
    pub dispense_month: String,
    pub is_locked: bool,
    pub total_clinics: i32,
    pub clinics_with_drugs: i32,
    pub clinics_with_monthly: i32,
    pub clinics_with_insulin: i32,
    pub clinics_with_tickets: i32,
    pub clinics_with_supplies: i32,
    pub branches_with_data: i32,
    pub total_branches: i32,
    pub completeness_pct: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MissingClinicRow {
    pub clinic_name: String,
    pub area_name: String,
    pub branch_name: String,
    pub last_active_month: Option<String>,
    pub missing_months_count: i32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DataQualityReport {
    pub months: Vec<MonthQualityRow>,
    pub missing_clinics: Vec<MissingClinicRow>,
    pub total_months_with_data: i32,
    pub total_months_locked: i32,
    pub overall_completeness_pct: f64,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_data_quality_report(
    state: State<'_, AppState>,
    referenceMonth: Option<String>,
) -> Result<DataQualityReport, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // 1. Get total number of clinics and branches
    let total_clinics: i32 = conn.query_row(
        "SELECT COUNT(*) FROM clinics", [], |r| r.get(0)
    ).unwrap_or(0);
    let total_branches: i32 = conn.query_row(
        "SELECT COUNT(*) FROM branches", [], |r| r.get(0)
    ).unwrap_or(0);

    // 2. Get all distinct months that have any data
    let mut all_months: Vec<String> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT DISTINCT dispense_month FROM (
            SELECT dispense_month FROM detailed_drug_dispensed
            UNION SELECT dispense_month FROM monthly_drugs_dispensed
            UNION SELECT dispense_month FROM insulin_dispensed
            UNION SELECT dispense_month FROM medical_tickets WHERE dispense_month IS NOT NULL
            UNION SELECT dispense_month FROM monthly_supplies_dispensed
        ) ORDER BY dispense_month DESC LIMIT 24"
    ) {
        if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
            for r in rows.flatten() { all_months.push(r); }
        }
    }

    // 3. For each month, build quality row
    let mut months: Vec<MonthQualityRow> = Vec::new();
    for m in &all_months {
        let is_locked: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM manual_locked_months WHERE dispense_month = ?1",
            [m], |r| r.get(0)
        ).unwrap_or(false);

        let clinics_with_drugs: i32 = conn.query_row(
            "SELECT COUNT(DISTINCT clinic_id) FROM detailed_drug_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL",
            [m], |r| r.get(0)
        ).unwrap_or(0);

        let clinics_with_monthly: i32 = conn.query_row(
            "SELECT COUNT(DISTINCT clinic_id) FROM monthly_drugs_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL",
            [m], |r| r.get(0)
        ).unwrap_or(0);

        let clinics_with_insulin: i32 = conn.query_row(
            "SELECT COUNT(DISTINCT clinic_id) FROM insulin_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL",
            [m], |r| r.get(0)
        ).unwrap_or(0);

        let clinics_with_tickets: i32 = conn.query_row(
            "SELECT COUNT(DISTINCT clinic_id) FROM medical_tickets WHERE dispense_month = ?1 AND clinic_id IS NOT NULL",
            [m], |r| r.get(0)
        ).unwrap_or(0);

        let clinics_with_supplies: i32 = conn.query_row(
            "SELECT COUNT(DISTINCT clinic_id) FROM monthly_supplies_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL",
            [m], |r| r.get(0)
        ).unwrap_or(0);

        let branches_with_data: i32 = conn.query_row(
            "SELECT COUNT(DISTINCT branch_id) FROM (
                SELECT branch_id FROM detailed_drug_dispensed WHERE dispense_month = ?1
                UNION SELECT branch_id FROM monthly_drugs_dispensed WHERE dispense_month = ?1
                UNION SELECT branch_id FROM insulin_dispensed WHERE dispense_month = ?1
            )",
            [m], |r| r.get(0)
        ).unwrap_or(0);

        // Completeness = (clinics that have at least one data type) / total clinics * 100
        let active_clinics: i32 = conn.query_row(
            "SELECT COUNT(DISTINCT clinic_id) FROM (
                SELECT clinic_id FROM detailed_drug_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL
                UNION SELECT clinic_id FROM monthly_drugs_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL
                UNION SELECT clinic_id FROM insulin_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL
                UNION SELECT clinic_id FROM medical_tickets WHERE dispense_month = ?1 AND clinic_id IS NOT NULL
                UNION SELECT clinic_id FROM monthly_supplies_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL
            )",
            [m], |r| r.get(0)
        ).unwrap_or(0);

        let completeness_pct = if total_clinics > 0 {
            (active_clinics as f64 / total_clinics as f64) * 100.0
        } else { 0.0 };

        months.push(MonthQualityRow {
            dispense_month: m.clone(),
            is_locked,
            total_clinics,
            clinics_with_drugs,
            clinics_with_monthly,
            clinics_with_insulin,
            clinics_with_tickets,
            clinics_with_supplies,
            branches_with_data,
            total_branches,
            completeness_pct,
        });
    }

    // 4. Missing clinics: clinics that were active in previous months but missing from last month
    let ref_month = referenceMonth.unwrap_or_else(|| {
        all_months.first().cloned().unwrap_or_else(|| "2026-01".to_string())
    });

    let mut missing_clinics: Vec<MissingClinicRow> = Vec::new();
    // Clinics that have data in any past month but NOT in the reference month
    if let Ok(mut stmt) = conn.prepare(
        "SELECT c.name, a.name, b.name,
                MAX(prev.dispense_month) as last_active,
                0 as missing_count
         FROM clinics c
         JOIN areas a ON c.area_id = a.id
         JOIN branches b ON a.branch_id = b.id
         JOIN (
             SELECT DISTINCT clinic_id, dispense_month FROM detailed_drug_dispensed
             WHERE dispense_month < ?1 AND clinic_id IS NOT NULL
             UNION
             SELECT DISTINCT clinic_id, dispense_month FROM monthly_drugs_dispensed
             WHERE dispense_month < ?1 AND clinic_id IS NOT NULL
         ) prev ON c.id = prev.clinic_id
         WHERE c.id NOT IN (
             SELECT DISTINCT clinic_id FROM detailed_drug_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL
             UNION
             SELECT DISTINCT clinic_id FROM monthly_drugs_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL
             UNION
             SELECT DISTINCT clinic_id FROM insulin_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL
             UNION
             SELECT DISTINCT clinic_id FROM medical_tickets WHERE dispense_month = ?1 AND clinic_id IS NOT NULL
         )
         GROUP BY c.id
         ORDER BY last_active DESC
         LIMIT 30"
    ) {
        if let Ok(rows) = stmt.query_map([&ref_month, &ref_month], |row| {
            Ok(MissingClinicRow {
                clinic_name: row.get(0)?,
                area_name: row.get(1)?,
                branch_name: row.get(2)?,
                last_active_month: row.get(3)?,
                missing_months_count: row.get(4)?,
            })
        }) {
            for r in rows.flatten() { missing_clinics.push(r); }
        }
    }

    let total_months_with_data = months.len() as i32;
    let total_months_locked = months.iter().filter(|m| m.is_locked).count() as i32;
    let overall_completeness_pct = if !months.is_empty() {
        months.iter().map(|m| m.completeness_pct).sum::<f64>() / months.len() as f64
    } else { 0.0 };

    Ok(DataQualityReport {
        months,
        missing_clinics,
        total_months_with_data,
        total_months_locked,
        overall_completeness_pct,
    })
}

// ===== Judicial Analytics Report =====

#[derive(Serialize, Deserialize, Debug)]
pub struct TopPatientRow {
    pub patient_id: i32,
    pub patient_name: String,
    pub diagnosis: String,
    pub total_cost: f64,
    pub months_active: i32,
    pub avg_monthly_cost: f64,
    pub medicine_count: i32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DiagnosisGroupRow {
    pub diagnosis: String,
    pub patient_count: i32,
    pub total_cost: f64,
    pub avg_cost_per_patient: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PatientContinuityRow {
    pub patient_name: String,
    pub diagnosis: String,
    pub expected_months: i32,
    pub actual_months: i32,
    pub continuity_pct: f64,
    pub last_active_month: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct JudicialAnalyticsReport {
    pub top_patients: Vec<TopPatientRow>,
    pub diagnosis_groups: Vec<DiagnosisGroupRow>,
    pub continuity_issues: Vec<PatientContinuityRow>,
    pub total_patients: i32,
    pub total_cost: f64,
    pub avg_cost_per_patient: f64,
    pub most_expensive_medicine: Option<String>,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_judicial_analytics(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    areaId: Option<i32>,
    startMonth: Option<String>,
    endMonth: Option<String>,
) -> Result<JudicialAnalyticsReport, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut where_parts: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut idx = 1usize;

    if let Some(ref sm) = startMonth {
        where_parts.push(format!("jd.dispense_month >= ?{}", idx));
        params.push(Box::new(sm.clone()));
        idx += 1;
    }
    if let Some(ref em) = endMonth {
        where_parts.push(format!("jd.dispense_month <= ?{}", idx));
        params.push(Box::new(em.clone()));
        idx += 1;
    }
    if let Some(bid) = branchId {
        where_parts.push(format!("jd.branch_id = ?{}", idx));
        params.push(Box::new(bid));
        idx += 1;
    }
    if let Some(aid) = areaId {
        where_parts.push(format!("jd.area_id = ?{}", idx));
        params.push(Box::new(aid));
    }

    let where_clause = if where_parts.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_parts.join(" AND "))
    };

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();

    // 1. Top 20 patients by total cost
    let top_sql = format!(
        "SELECT jp.id, jp.name, jd.diagnosis,
                SUM(jd.monthly_cost) as total_cost,
                COUNT(DISTINCT jd.dispense_month) as months_active,
                AVG(jd.monthly_cost) as avg_cost,
                COUNT(DISTINCT jd.medicine_name) as medicine_count
         FROM judicial_dispensed jd
         JOIN judicial_patients jp ON jd.patient_id = jp.id
         {}
         GROUP BY jp.id
         ORDER BY total_cost DESC
         LIMIT 20",
        where_clause
    );

    let mut top_patients: Vec<TopPatientRow> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(&top_sql) {
        if let Ok(rows) = stmt.query_map(params_ref.as_slice(), |row| {
            Ok(TopPatientRow {
                patient_id: row.get(0)?,
                patient_name: row.get(1)?,
                diagnosis: row.get(2).unwrap_or_else(|_| "غير محدد".to_string()),
                total_cost: row.get(3).unwrap_or(0.0),
                months_active: row.get(4).unwrap_or(0),
                avg_monthly_cost: row.get(5).unwrap_or(0.0),
                medicine_count: row.get(6).unwrap_or(0),
            })
        }) {
            for r in rows.flatten() { top_patients.push(r); }
        }
    }

    // 2. Diagnosis groups
    let diag_sql = format!(
        "SELECT COALESCE(jd.diagnosis, 'غير محدد') as diag,
                COUNT(DISTINCT jd.patient_id) as patient_count,
                SUM(jd.monthly_cost) as total_cost,
                SUM(jd.monthly_cost) / NULLIF(COUNT(DISTINCT jd.patient_id), 0) as avg_cost
         FROM judicial_dispensed jd
         {}
         GROUP BY diag
         ORDER BY total_cost DESC
         LIMIT 15",
        where_clause
    );

    let mut diagnosis_groups: Vec<DiagnosisGroupRow> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(&diag_sql) {
        if let Ok(rows) = stmt.query_map(params_ref.as_slice(), |row| {
            Ok(DiagnosisGroupRow {
                diagnosis: row.get(0)?,
                patient_count: row.get(1).unwrap_or(0),
                total_cost: row.get(2).unwrap_or(0.0),
                avg_cost_per_patient: row.get(3).unwrap_or(0.0),
            })
        }) {
            for r in rows.flatten() { diagnosis_groups.push(r); }
        }
    }

    // 3. Patient continuity - patients with gaps in dispensing
    // Get first and last month for each patient, count actual months
    let continuity_sql = format!(
        "SELECT jp.name, jd.diagnosis,
                CAST((
                    (CAST(SUBSTR(MAX(jd.dispense_month), 1, 4) AS INTEGER) - CAST(SUBSTR(MIN(jd.dispense_month), 1, 4) AS INTEGER)) * 12 +
                    (CAST(SUBSTR(MAX(jd.dispense_month), 6, 2) AS INTEGER) - CAST(SUBSTR(MIN(jd.dispense_month), 6, 2) AS INTEGER)) + 1
                ) AS INTEGER) as expected_months,
                COUNT(DISTINCT jd.dispense_month) as actual_months,
                MAX(jd.dispense_month) as last_month
         FROM judicial_dispensed jd
         JOIN judicial_patients jp ON jd.patient_id = jp.id
         {}
         GROUP BY jp.id
         HAVING expected_months > actual_months AND expected_months > 1
         ORDER BY (expected_months - actual_months) DESC
         LIMIT 20",
        where_clause
    );

    let mut continuity_issues: Vec<PatientContinuityRow> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(&continuity_sql) {
        if let Ok(rows) = stmt.query_map(params_ref.as_slice(), |row| {
            let expected: i32 = row.get(2).unwrap_or(1);
            let actual: i32 = row.get(3).unwrap_or(0);
            let pct = if expected > 0 { (actual as f64 / expected as f64) * 100.0 } else { 0.0 };
            Ok(PatientContinuityRow {
                patient_name: row.get(0)?,
                diagnosis: row.get(1).unwrap_or_else(|_| "غير محدد".to_string()),
                expected_months: expected,
                actual_months: actual,
                continuity_pct: pct,
                last_active_month: row.get(4)?,
            })
        }) {
            for r in rows.flatten() { continuity_issues.push(r); }
        }
    }

    // 4. Summary KPIs
    let (total_patients, total_cost, avg_cost): (i32, f64, f64) = {
        let summary_sql = format!(
            "SELECT COUNT(DISTINCT jd.patient_id), SUM(jd.monthly_cost), AVG(jd.monthly_cost)
             FROM judicial_dispensed jd {}",
            where_clause
        );
        conn.query_row(&summary_sql, params_ref.as_slice(), |r| {
            Ok((
                r.get::<_, Option<i32>>(0)?.unwrap_or(0),
                r.get::<_, Option<f64>>(1)?.unwrap_or(0.0),
                r.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
            ))
        }).unwrap_or((0, 0.0, 0.0))
    };

    // 5. Most expensive medicine
    let most_expensive_sql = format!(
        "SELECT medicine_name FROM judicial_dispensed jd {}
         GROUP BY medicine_name ORDER BY SUM(monthly_cost) DESC LIMIT 1",
        where_clause
    );
    let most_expensive_medicine: Option<String> = conn.query_row(
        &most_expensive_sql, params_ref.as_slice(), |r| r.get(0)
    ).ok();

    Ok(JudicialAnalyticsReport {
        top_patients,
        diagnosis_groups,
        continuity_issues,
        total_patients,
        total_cost,
        avg_cost_per_patient: avg_cost,
        most_expensive_medicine,
    })
}

// ─── Compliance Report ────────────────────────────────────────────────────────
#[derive(Serialize, Deserialize, Debug)]
pub struct BranchComplianceRow {
    pub branch_name: String,
    pub total_clinics: i32,
    pub clinics_drugs: i32,
    pub clinics_monthly: i32,
    pub clinics_insulin: i32,
    pub clinics_tickets: i32,
    pub clinics_supplies: i32,
    pub overall_pct: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ClinicComplianceRow {
    pub clinic_name: String,
    pub area_name: String,
    pub branch_name: String,
    pub has_drugs: bool,
    pub has_monthly: bool,
    pub has_insulin: bool,
    pub has_tickets: bool,
    pub has_supplies: bool,
    pub score: i32,   // 0..5
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ComplianceReport {
    pub branches: Vec<BranchComplianceRow>,
    pub missing_clinics: Vec<ClinicComplianceRow>,
    pub dispense_month: String,
    pub total_clinics: i32,
    pub fully_compliant: i32,
    pub partially_compliant: i32,
    pub non_compliant: i32,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_compliance_report(
    state: State<'_, AppState>,
    dispenseMonth: String,
    branchId: Option<i32>,
) -> Result<ComplianceReport, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let month = dispenseMonth.clone();

    let total_clinics: i32 = if let Some(bid) = branchId {
        conn.query_row(
            "SELECT COUNT(*) FROM clinics c JOIN areas a ON c.area_id = a.id WHERE a.branch_id = ?1",
            [bid], |r| r.get(0)
        ).unwrap_or(0)
    } else {
        conn.query_row("SELECT COUNT(*) FROM clinics", [], |r| r.get(0)).unwrap_or(0)
    };

    // Per-branch compliance
    let branch_sql = "
        SELECT b.name,
               COUNT(DISTINCT c.id) as total,
               COUNT(DISTINCT d.clinic_id) as drugs,
               COUNT(DISTINCT md.clinic_id) as monthly,
               COUNT(DISTINCT i.clinic_id) as insulin,
               COUNT(DISTINCT t.clinic_id) as tickets,
               COUNT(DISTINCT s.clinic_id) as supplies
        FROM branches b
        JOIN areas a ON a.branch_id = b.id
        JOIN clinics c ON c.area_id = a.id
        LEFT JOIN (SELECT DISTINCT clinic_id FROM detailed_drug_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL) d ON d.clinic_id = c.id
        LEFT JOIN (SELECT DISTINCT clinic_id FROM monthly_drugs_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL) md ON md.clinic_id = c.id
        LEFT JOIN (SELECT DISTINCT clinic_id FROM insulin_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL) i ON i.clinic_id = c.id
        LEFT JOIN (SELECT DISTINCT clinic_id FROM medical_tickets WHERE dispense_month = ?1 AND clinic_id IS NOT NULL) t ON t.clinic_id = c.id
        LEFT JOIN (SELECT DISTINCT clinic_id FROM monthly_supplies_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL) s ON s.clinic_id = c.id
        GROUP BY b.id
        ORDER BY b.name
    ";

    let mut branches = Vec::new();
    if let Ok(mut stmt) = conn.prepare(branch_sql) {
        if let Ok(rows) = stmt.query_map([&month], |row| {
            let total: i32 = row.get(1)?;
            let drugs: i32 = row.get(2)?;
            let monthly: i32 = row.get(3)?;
            let insulin: i32 = row.get(4)?;
            let tickets: i32 = row.get(5)?;
            let supplies: i32 = row.get(6)?;
            let filled: f64 = (drugs + monthly + insulin + tickets + supplies) as f64;
            let max: f64 = (total * 5) as f64;
            let pct = if max > 0.0 { filled / max * 100.0 } else { 0.0 };
            Ok(BranchComplianceRow {
                branch_name: row.get(0)?,
                total_clinics: total,
                clinics_drugs: drugs,
                clinics_monthly: monthly,
                clinics_insulin: insulin,
                clinics_tickets: tickets,
                clinics_supplies: supplies,
                overall_pct: pct,
            })
        }) {
            for r in rows.flatten() { branches.push(r); }
        }
    }

    // Per-clinic compliance (missing or partial)
    let mut branch_filter = String::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(month.clone())];
    if let Some(bid) = branchId {
        branch_filter = " AND a.branch_id = ?2".to_string();
        params.push(Box::new(bid));
    }
    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();

    let clinic_sql = format!("
        SELECT c.name, a.name, b.name,
               CASE WHEN d.clinic_id IS NOT NULL THEN 1 ELSE 0 END,
               CASE WHEN md.clinic_id IS NOT NULL THEN 1 ELSE 0 END,
               CASE WHEN i.clinic_id IS NOT NULL THEN 1 ELSE 0 END,
               CASE WHEN t.clinic_id IS NOT NULL THEN 1 ELSE 0 END,
               CASE WHEN s.clinic_id IS NOT NULL THEN 1 ELSE 0 END
        FROM clinics c
        JOIN areas a ON c.area_id = a.id
        JOIN branches b ON a.branch_id = b.id
        LEFT JOIN (SELECT DISTINCT clinic_id FROM detailed_drug_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL) d ON d.clinic_id = c.id
        LEFT JOIN (SELECT DISTINCT clinic_id FROM monthly_drugs_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL) md ON md.clinic_id = c.id
        LEFT JOIN (SELECT DISTINCT clinic_id FROM insulin_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL) i ON i.clinic_id = c.id
        LEFT JOIN (SELECT DISTINCT clinic_id FROM medical_tickets WHERE dispense_month = ?1 AND clinic_id IS NOT NULL) t ON t.clinic_id = c.id
        LEFT JOIN (SELECT DISTINCT clinic_id FROM monthly_supplies_dispensed WHERE dispense_month = ?1 AND clinic_id IS NOT NULL) s ON s.clinic_id = c.id
        WHERE 1=1 {}
        ORDER BY (CASE WHEN d.clinic_id IS NOT NULL THEN 1 ELSE 0 END +
                  CASE WHEN md.clinic_id IS NOT NULL THEN 1 ELSE 0 END +
                  CASE WHEN i.clinic_id IS NOT NULL THEN 1 ELSE 0 END +
                  CASE WHEN t.clinic_id IS NOT NULL THEN 1 ELSE 0 END +
                  CASE WHEN s.clinic_id IS NOT NULL THEN 1 ELSE 0 END) ASC,
                 b.name, a.name, c.name
    ", branch_filter);

    let mut missing_clinics = Vec::new();
    let mut fully_compliant = 0i32;
    let mut partially_compliant = 0i32;
    let mut non_compliant = 0i32;

    if let Ok(mut stmt) = conn.prepare(&clinic_sql) {
        if let Ok(rows) = stmt.query_map(params_ref.as_slice(), |row| {
            let d: i32 = row.get(3)?;
            let md: i32 = row.get(4)?;
            let i: i32 = row.get(5)?;
            let t: i32 = row.get(6)?;
            let s: i32 = row.get(7)?;
            let score = d + md + i + t + s;
            Ok(ClinicComplianceRow {
                clinic_name: row.get(0)?,
                area_name: row.get(1)?,
                branch_name: row.get(2)?,
                has_drugs: d == 1,
                has_monthly: md == 1,
                has_insulin: i == 1,
                has_tickets: t == 1,
                has_supplies: s == 1,
                score,
            })
        }) {
            for r in rows.flatten() {
                match r.score {
                    5 => fully_compliant += 1,
                    0 => non_compliant += 1,
                    _ => partially_compliant += 1,
                }
                missing_clinics.push(r);
            }
        }
    }

    Ok(ComplianceReport {
        branches,
        missing_clinics,
        dispense_month: month,
        total_clinics,
        fully_compliant,
        partially_compliant,
        non_compliant,
    })
}

