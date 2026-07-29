use crate::db::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::commands::month_isolation::enforce_isolation_lock;
use crate::commands::audit::log_action;

#[derive(Serialize, Deserialize, Debug)]
pub struct MonthlyDrugsDispensed {
    pub id: Option<i32>,
    pub clinic_id: Option<i32>,
    pub area_id: Option<i32>,
    pub branch_id: i32,
    pub dispense_month: String, // YYYY-MM
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
    pub notes: Option<String>,
}

#[tauri::command]
pub fn save_monthly_drugs_dispensed(
    state: State<'_, AppState>,
    data: MonthlyDrugsDispensed,
) -> Result<i32, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // --- Global Month Isolation Lock ---
    let level = if data.clinic_id.is_some() { "clinic" } 
                else if data.area_id.is_some() { "area" } 
                else { "branch" };
    
    enforce_isolation_lock(conn, data.branch_id, &data.dispense_month, level, true)?;

    if let Some(id) = data.id {
        // Update
        conn.execute(
            "UPDATE monthly_drugs_dispensed SET 
                clinic_id = ?1, area_id = ?2, branch_id = ?3, dispense_month = ?4,
                drugs_free_authority = ?5, drugs_free_students = ?6, drugs_free_infants = ?7, drugs_free_breadwinner_women = ?8,
                drugs_supported_authority_value = ?9, drugs_supported_authority_patient_share = ?10,
                drugs_supported_students_value = ?11, drugs_supported_students_patient_share = ?12,
                drugs_supported_infants_value = ?13, drugs_supported_infants_patient_share = ?14, notes = ?15
             WHERE id = ?16",
            rusqlite::params![
                data.clinic_id, data.area_id, data.branch_id, data.dispense_month,
                data.drugs_free_authority, data.drugs_free_students, data.drugs_free_infants, data.drugs_free_breadwinner_women,
                data.drugs_supported_authority_value, data.drugs_supported_authority_patient_share,
                data.drugs_supported_students_value, data.drugs_supported_students_patient_share,
                data.drugs_supported_infants_value, data.drugs_supported_infants_patient_share,
                data.notes, id
            ],
        ).map_err(|e| e.to_string())?;
        
        // Audit log
        let _ = log_action(
            conn, None, "UPDATE", "monthly_drugs_dispensed",
            Some(&id.to_string()),
            Some(&format!("تحديث الإجماليات الشهرية للفرع {} لشهر {}", data.branch_id, data.dispense_month))
        );
        
        Ok(id)
    } else {
        // Insert
        conn.execute(
            "INSERT INTO monthly_drugs_dispensed (
                clinic_id, area_id, branch_id, dispense_month,
                drugs_free_authority, drugs_free_students, drugs_free_infants, drugs_free_breadwinner_women,
                drugs_supported_authority_value, drugs_supported_authority_patient_share,
                drugs_supported_students_value, drugs_supported_students_patient_share,
                drugs_supported_infants_value, drugs_supported_infants_patient_share, notes
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            rusqlite::params![
                data.clinic_id, data.area_id, data.branch_id, data.dispense_month,
                data.drugs_free_authority, data.drugs_free_students, data.drugs_free_infants, data.drugs_free_breadwinner_women,
                data.drugs_supported_authority_value, data.drugs_supported_authority_patient_share,
                data.drugs_supported_students_value, data.drugs_supported_students_patient_share,
                data.drugs_supported_infants_value, data.drugs_supported_infants_patient_share,
                data.notes
            ],
        ).map_err(|e| e.to_string())?;
        let new_id = conn.last_insert_rowid() as i32;
        
        // Audit log
        let _ = log_action(
            conn, None, "INSERT", "monthly_drugs_dispensed",
            Some(&new_id.to_string()),
            Some(&format!("إضافة إجماليات شهرية للفرع {} لشهر {}", data.branch_id, data.dispense_month))
        );
        
        Ok(new_id)
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_monthly_drugs_dispensed(
    state: State<'_, AppState>,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: String,
) -> Result<Option<MonthlyDrugsDispensed>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "SELECT id, clinic_id, area_id, branch_id, dispense_month, 
                        drugs_free_authority, drugs_free_students, drugs_free_infants, drugs_free_breadwinner_women,
                        drugs_supported_authority_value, drugs_supported_authority_patient_share,
                        drugs_supported_students_value, drugs_supported_students_patient_share,
                        drugs_supported_infants_value, drugs_supported_infants_patient_share, notes
                 FROM monthly_drugs_dispensed 
                 WHERE branch_id = ?1 AND dispense_month = ?2".to_string();
    
    if clinicId.is_some() {
        sql.push_str(" AND clinic_id = ?3");
    } else if areaId.is_some() {
        sql.push_str(" AND area_id = ?3 AND clinic_id IS NULL");
    } else {
        sql.push_str(" AND area_id IS NULL AND clinic_id IS NULL");
    }

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(branchId), Box::new(dispenseMonth)];
    if let Some(cid) = clinicId {
        params.push(Box::new(cid));
    } else if let Some(aid) = areaId {
        params.push(Box::new(aid));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();

    let mut rows = stmt
        .query_map(params_ref.as_slice(), |row| {
            Ok(MonthlyDrugsDispensed {
                id: Some(row.get(0)?),
                clinic_id: row.get(1)?,
                area_id: row.get(2)?,
                branch_id: row.get(3)?,
                dispense_month: row.get(4)?,
                drugs_free_authority: row.get(5)?,
                drugs_free_students: row.get(6)?,
                drugs_free_infants: row.get(7)?,
                drugs_free_breadwinner_women: row.get(8)?,
                drugs_supported_authority_value: row.get(9)?,
                drugs_supported_authority_patient_share: row.get(10)?,
                drugs_supported_students_value: row.get(11)?,
                drugs_supported_students_patient_share: row.get(12)?,
                drugs_supported_infants_value: row.get(13)?,
                drugs_supported_infants_patient_share: row.get(14)?,
                notes: row.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?;

    if let Some(row) = rows.next() {
        Ok(Some(row.map_err(|e| e.to_string())?))
    } else {
        Ok(None)
    }
}
#[tauri::command]
#[allow(non_snake_case)]
pub fn get_all_monthly_drugs_dispensed(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: Option<String>,
) -> Result<Vec<MonthlyDrugsDispensed>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "SELECT id, clinic_id, area_id, branch_id, dispense_month, 
                        drugs_free_authority, drugs_free_students, drugs_free_infants, drugs_free_breadwinner_women,
                        drugs_supported_authority_value, drugs_supported_authority_patient_share,
                        drugs_supported_students_value, drugs_supported_students_patient_share,
                        drugs_supported_infants_value, drugs_supported_infants_patient_share, notes
                 FROM monthly_drugs_dispensed WHERE 1=1".to_string();
    
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut param_idx = 1;

    if let Some(bid) = branchId {
        sql.push_str(&format!(" AND branch_id = ?{}", param_idx));
        params.push(Box::new(bid));
        param_idx += 1;
    }
    if let Some(aid) = areaId {
        sql.push_str(&format!(" AND area_id = ?{}", param_idx));
        params.push(Box::new(aid));
        param_idx += 1;
    }
    if let Some(cid) = clinicId {
        sql.push_str(&format!(" AND clinic_id = ?{}", param_idx));
        params.push(Box::new(cid));
        param_idx += 1;
    }
    if let Some(month) = dispenseMonth {
        sql.push_str(&format!(" AND dispense_month = ?{}", param_idx));
        params.push(Box::new(month));
    }

    sql.push_str(" ORDER BY dispense_month DESC, id DESC LIMIT 50");

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(MonthlyDrugsDispensed {
            id: Some(row.get(0)?),
            clinic_id: row.get(1)?,
            area_id: row.get(2)?,
            branch_id: row.get(3)?,
            dispense_month: row.get(4)?,
            drugs_free_authority: row.get(5)?,
            drugs_free_students: row.get(6)?,
            drugs_free_infants: row.get(7)?,
            drugs_free_breadwinner_women: row.get(8)?,
            drugs_supported_authority_value: row.get(9)?,
            drugs_supported_authority_patient_share: row.get(10)?,
            drugs_supported_students_value: row.get(11)?,
            drugs_supported_students_patient_share: row.get(12)?,
            drugs_supported_infants_value: row.get(13)?,
            drugs_supported_infants_patient_share: row.get(14)?,
            notes: row.get(15)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

// ===== Detailed Drug Dispensing (per-item records) =====

#[tauri::command]
#[allow(non_snake_case)]
pub fn save_detailed_drug_dispensed(
    state: State<'_, AppState>,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: String,
    drugId: i32,
    quantity: f64,
    casesCount: i32,
    unitPrice: f64,
    totalCost: f64,
) -> Result<i32, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // --- 0. Global Month Isolation Lock ---
    let current_level = if clinicId.is_some() { "clinic" } 
                        else if areaId.is_some() { "area" } 
                        else { "branch" };
    
    enforce_isolation_lock(conn, branchId, &dispenseMonth, current_level, false)?;

    // --- 1. Triple-Layer Isolation & Duplicate Check ---
    // Check for ANY existing records for this (drug, month, branch)
    let mut stmt = conn.prepare(
        "SELECT area_id, clinic_id, quantity, unit_price 
         FROM detailed_drug_dispensed 
         WHERE branch_id = ?1 AND drug_id = ?2 AND dispense_month = ?3"
    ).map_err(|e| e.to_string())?;

    let existing_rows = stmt.query_map(rusqlite::params![branchId, drugId, dispenseMonth], |row| {
        Ok((
            row.get::<_, Option<i32>>(0)?, 
            row.get::<_, Option<i32>>(1)?,
            row.get::<_, f64>(2)?,
            row.get::<_, f64>(3)?
        ))
    }).map_err(|e| e.to_string())?;

    for row_res in existing_rows {
        let (ex_area, ex_clinic, _ex_qty, ex_price) = row_res.map_err(|e| e.to_string())?;
        
        // --- Refined Isolation Logic ---
        
        // 1. If we are saving at Branch level (areaId is None)
        if areaId.is_none() {
            // Must have NO ex_area (existing must also be Branch level)
            if ex_area.is_some() {
                return Err("عذراً، هذا الصنف مسجل مسبقاً لهذا الشهر في عيادات أو مناطق تفصيلية تابعة لهذا الفرع. لا يمكن إدخاله كفرع مجمع منعاً لتضارب البيانات.".to_string());
            }
        } 
        
        // 2. If we are saving at Area level (areaId is Some, clinicId is None)
        else if areaId.is_some() && clinicId.is_none() {
            // Check if existing is Branch level (forbidden)
            if ex_area.is_none() {
                return Err("عذراً، هذا الصنف مسجل مسبقاً كـ 'فرع مجمع'. لا يمكن إدخاله كمناطق تفصيلية لنفس الفرع منعاً للتكرار.".to_string());
            }
            // If same area, existing must also have NO clinic
            if ex_area == areaId && ex_clinic.is_some() {
                return Err("عذراً، هذا الصنف مسجل مسبقاً في عيادات تفصيلية تابعة لهذه المنطقة. لا يمكن إدخاله كمنطقة مجمعة.".to_string());
            }
        }
        
        // 3. If we are saving at Clinic level (clinicId is Some)
        else {
            // Check if existing is Branch level (forbidden)
            if ex_area.is_none() {
                return Err("عذراً، هذا الصنف مسجل مسبقاً كـ 'فرع مجمع'. لا يمكن إدخاله كعيادات لهذا الفرع منعاً للتكرار.".to_string());
            }
            // Check if existing is Area level for THIS area (forbidden)
            if ex_area == areaId && ex_clinic.is_none() {
                return Err("عذراً، هذا الصنف مسجل مسبقاً كـ 'منطقة مجمعة' لهذه المنطقة. لا يمكن إدخاله كعيادات تفصيلية تابعة لها.".to_string());
            }
        }

        // Duplicate check for EXACT SAME level (Item + Price)
        if ex_area == areaId && ex_clinic == clinicId {
            if (ex_price - unitPrice).abs() < 0.0001 {
                return Err("يوجد ادخال سابق للصنف بنفس السعر يمكنك مراجعة الصنف والتعديل عليه".to_string());
            }
        }
    }

    // --- 2. Insert ---
    conn.execute(
        "INSERT INTO detailed_drug_dispensed (
            branch_id, area_id, clinic_id, dispense_month, drug_id,
            quantity, cases_count, unit_price, total_cost
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            branchId, areaId, clinicId, dispenseMonth, drugId,
            quantity, casesCount, unitPrice, totalCost
        ],
    ).map_err(|e| e.to_string())?;
    let new_id = conn.last_insert_rowid() as i32;
    
    // Audit log
    let _ = log_action(
        conn, None, "INSERT", "detailed_drug_dispensed",
        Some(&new_id.to_string()),
        Some(&format!("إضافة صنف {} للفرع {} شهر {} (كمية: {}, إجمالي: {})", 
            drugId, branchId, dispenseMonth, quantity, totalCost))
    );
    
    Ok(new_id)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn update_detailed_drug_dispensed(
    state: State<'_, AppState>,
    id: i32,
    quantity: f64,
    casesCount: i32,
    unitPrice: f64,
    totalCost: f64,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "UPDATE detailed_drug_dispensed 
         SET quantity = ?1, cases_count = ?2, unit_price = ?3, total_cost = ?4 
         WHERE id = ?5",
        rusqlite::params![quantity, casesCount, unitPrice, totalCost, id],
    ).map_err(|e| e.to_string())?;
    
    // Audit log
    let _ = log_action(
        conn, None, "UPDATE", "detailed_drug_dispensed",
        Some(&id.to_string()),
        Some(&format!("تعديل الصنف {} (كمية: {}, إجمالي: {})", id, quantity, totalCost))
    );
    
    Ok(())
}

#[tauri::command]
pub fn delete_detailed_drug_dispensed(
    state: State<'_, AppState>,
    id: i32,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "DELETE FROM detailed_drug_dispensed WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;
    
    // Audit log
    let _ = log_action(
        conn, None, "DELETE", "detailed_drug_dispensed",
        Some(&id.to_string()),
        Some(&format!("حذف الصنف التفصيلي رقم {}", id))
    );
    
    Ok(())
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DetailedDrugDispensedRow {
    pub id: i32,
    pub branch_id: i32,
    pub area_id: Option<i32>,
    pub clinic_id: Option<i32>,
    pub dispense_month: String,
    pub drug_id: i32,
    pub quantity: f64,
    pub cases_count: i32,
    pub unit_price: f64,
    pub total_cost: f64,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_detailed_drug_dispensed(
    state: State<'_, AppState>,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: String,
) -> Result<Vec<DetailedDrugDispensedRow>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "SELECT id, branch_id, area_id, clinic_id, dispense_month, drug_id,
                        quantity, cases_count, unit_price, total_cost
                   FROM detailed_drug_dispensed
                   WHERE dispense_month = ?1".to_string();
    
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(dispenseMonth)];

    if let Some(cid) = clinicId {
        sql.push_str(" AND clinic_id = ?2");
        params.push(Box::new(cid));
    } else if let Some(aid) = areaId {
        sql.push_str(" AND area_id = ?2");
        params.push(Box::new(aid));
    } else {
        sql.push_str(" AND branch_id = ?2");
        params.push(Box::new(branchId));
    }

    sql.push_str(" ORDER BY id DESC");

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params_ref.as_slice(), |row| {
            Ok(DetailedDrugDispensedRow {
                id: row.get(0)?,
                branch_id: row.get(1)?,
                area_id: row.get(2)?,
                clinic_id: row.get(3)?,
                dispense_month: row.get(4)?,
                drug_id: row.get(5)?,
                quantity: row.get(6)?,
                cases_count: row.get(7)?,
                unit_price: row.get(8)?,
                total_cost: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn get_drug_previous_prices(
    state: State<'_, AppState>,
    drug_id: i32,
) -> Result<Vec<f64>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn.prepare(
        "SELECT DISTINCT unit_price 
         FROM detailed_drug_dispensed 
         WHERE drug_id = ?1 
         ORDER BY unit_price DESC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(rusqlite::params![drug_id], |row| {
        row.get::<_, f64>(0)
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}
#[derive(Serialize, Deserialize, Debug)]
pub struct SuppliesDispensedRow {
    pub id: i32,
    pub clinic_id: Option<i32>,
    pub area_id: Option<i32>,
    pub branch_id: i32,
    pub supply_id: i32,
    pub consumer_value: f64,
    pub collective_entities_value: f64,
    pub dispense_month: String,
    pub notes: Option<String>,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_detailed_supplies_report(
    state: State<'_, AppState>,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: String,
) -> Result<Vec<SuppliesDispensedRow>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "SELECT id, clinic_id, area_id, branch_id, supply_id, consumer_value, collective_entities_value, dispense_month, notes 
                   FROM monthly_supplies_dispensed 
                   WHERE dispense_month = ?1 AND branch_id = ?2".to_string();
    
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(dispenseMonth), Box::new(branchId)];

    if let Some(cid) = clinicId {
        sql.push_str(" AND clinic_id = ?3");
        params.push(Box::new(cid));
    } else if let Some(aid) = areaId {
        sql.push_str(" AND area_id = ?3");
        params.push(Box::new(aid));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(SuppliesDispensedRow {
            id: row.get(0)?,
            clinic_id: row.get(1)?,
            area_id: row.get(2)?,
            branch_id: row.get(3)?,
            supply_id: row.get(4)?,
            consumer_value: row.get(5)?,
            collective_entities_value: row.get(6)?,
            dispense_month: row.get(7)?,
            notes: row.get(8)?,
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
pub fn get_detailed_drug_dispensed_range(
    state: State<'_, AppState>,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    startMonth: String,
    endMonth: String,
) -> Result<Vec<DetailedDrugDispensedRow>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "SELECT id, branch_id, area_id, clinic_id, dispense_month, drug_id, 
                          quantity, cases_count, unit_price, total_cost 
                   FROM detailed_drug_dispensed 
                   WHERE dispense_month >= ?1 AND dispense_month <= ?2".to_string();
    
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
        Ok(DetailedDrugDispensedRow {
            id: row.get(0)?,
            branch_id: row.get(1)?,
            area_id: row.get(2)?,
            clinic_id: row.get(3)?,
            dispense_month: row.get(4)?,
            drug_id: row.get(5)?,
            quantity: row.get(6)?,
            cases_count: row.get(7)?,
            unit_price: row.get(8)?,
            total_cost: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SuppliesHistoryRow {
    pub id: i32,
    pub clinic_id: Option<i32>,
    pub area_id: Option<i32>,
    pub branch_id: i32,
    pub supply_id: Option<i32>,
    pub category_id: Option<i32>,
    pub item_name: String, // Can be supply name or category name
    pub consumer_value: f64,
    pub collective_entities_value: f64,
    pub dispense_month: String,
    pub notes: Option<String>,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn save_detailed_supply_dispensed(
    state: State<'_, AppState>,
    id: Option<i32>,
    clinicId: Option<i32>,
    areaId: Option<i32>,
    branchId: i32,
    supplyId: Option<i32>,
    categoryId: Option<i32>,
    consumerValue: f64,
    collectiveEntitiesValue: f64,
    dispenseMonth: String,
    notes: Option<String>,
) -> Result<i32, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    if supplyId.is_none() && categoryId.is_none() {
        return Err("يجب اختيار مستلزم أو تصنيف".to_string());
    }

    // --- Global Month Isolation Lock ---
    let level = if clinicId.is_some() { "clinic" } 
                else if areaId.is_some() { "area" } 
                else { "branch" };
    
    enforce_isolation_lock(conn, branchId, &dispenseMonth, level, true)?;

    if let Some(rid) = id {
        conn.execute(
            "UPDATE monthly_supplies_dispensed 
             SET supply_id = ?1, category_id = ?2, consumer_value = ?3, collective_entities_value = ?4, notes = ?5,
                 clinic_id = ?6, area_id = ?7, branch_id = ?8
             WHERE id = ?9",
            rusqlite::params![supplyId, categoryId, consumerValue, collectiveEntitiesValue, notes, clinicId, areaId, branchId, rid],
        ).map_err(|e| e.to_string())?;
        
        // Audit log
        let _ = log_action(
            conn, None, "UPDATE", "monthly_supplies_dispensed",
            Some(&rid.to_string()),
            Some(&format!("تعديل المستلزمات للفرع {} شهر {} (مستهلك: {}, جماعي: {})", 
                branchId, dispenseMonth, consumerValue, collectiveEntitiesValue))
        );
        
        Ok(rid)
    } else {
        conn.execute(
            "INSERT INTO monthly_supplies_dispensed 
            (clinic_id, area_id, branch_id, supply_id, category_id, consumer_value, collective_entities_value, dispense_month, notes)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![clinicId, areaId, branchId, supplyId, categoryId, consumerValue, collectiveEntitiesValue, dispenseMonth, notes],
        ).map_err(|e| e.to_string())?;
        let new_id = conn.last_insert_rowid() as i32;
        
        // Audit log
        let _ = log_action(
            conn, None, "INSERT", "monthly_supplies_dispensed",
            Some(&new_id.to_string()),
            Some(&format!("إضافة مستلزمات للفرع {} شهر {} (مستهلك: {}, جماعي: {})", 
                branchId, dispenseMonth, consumerValue, collectiveEntitiesValue))
        );
        
        Ok(new_id)
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_all_monthly_supplies_dispensed(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: Option<String>,
) -> Result<Vec<SuppliesHistoryRow>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "SELECT m.id, m.clinic_id, m.area_id, m.branch_id, m.supply_id, m.category_id,
                        COALESCE(s.name, sc.name) as item_name, 
                        m.consumer_value, m.collective_entities_value, m.dispense_month, m.notes 
                 FROM monthly_supplies_dispensed m
                 LEFT JOIN supplies s ON m.supply_id = s.id
                 LEFT JOIN supply_categories sc ON m.category_id = sc.id
                 WHERE 1=1".to_string();
    
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut param_idx = 1;

    if let Some(bid) = branchId {
        sql.push_str(&format!(" AND m.branch_id = ?{}", param_idx));
        params.push(Box::new(bid));
        param_idx += 1;
    }
    if let Some(aid) = areaId {
        sql.push_str(&format!(" AND m.area_id = ?{}", param_idx));
        params.push(Box::new(aid));
        param_idx += 1;
    }
    if let Some(cid) = clinicId {
        sql.push_str(&format!(" AND m.clinic_id = ?{}", param_idx));
        params.push(Box::new(cid));
        param_idx += 1;
    }
    if let Some(month) = dispenseMonth {
        sql.push_str(&format!(" AND m.dispense_month = ?{}", param_idx));
        params.push(Box::new(month));
    }

    sql.push_str(" ORDER BY m.dispense_month DESC, m.id DESC LIMIT 50");

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(SuppliesHistoryRow {
            id: row.get(0)?,
            clinic_id: row.get(1)?,
            area_id: row.get(2)?,
            branch_id: row.get(3)?,
            supply_id: row.get(4)?,
            category_id: row.get(5)?,
            item_name: row.get(6)?,
            consumer_value: row.get(7)?,
            collective_entities_value: row.get(8)?,
            dispense_month: row.get(9)?,
            notes: row.get(10)?,
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
pub fn get_report_monthly_drugs_dispensed(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: Option<String>,
) -> Result<Vec<MonthlyDrugsDispensed>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "SELECT id, clinic_id, area_id, branch_id, dispense_month, 
                        drugs_free_authority, drugs_free_students, drugs_free_infants, drugs_free_breadwinner_women,
                        drugs_supported_authority_value, drugs_supported_authority_patient_share,
                        drugs_supported_students_value, drugs_supported_students_patient_share,
                        drugs_supported_infants_value, drugs_supported_infants_patient_share, notes
                 FROM monthly_drugs_dispensed WHERE 1=1".to_string();
    
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut param_idx = 1;

    if let Some(bid) = branchId {
        sql.push_str(&format!(" AND branch_id = ?{}", param_idx));
        params.push(Box::new(bid));
        param_idx += 1;
    }
    if let Some(aid) = areaId {
        sql.push_str(&format!(" AND area_id = ?{}", param_idx));
        params.push(Box::new(aid));
        param_idx += 1;
    }
    if let Some(cid) = clinicId {
        sql.push_str(&format!(" AND clinic_id = ?{}", param_idx));
        params.push(Box::new(cid));
        param_idx += 1;
    }
    if let Some(month) = dispenseMonth {
        sql.push_str(&format!(" AND dispense_month = ?{}", param_idx));
        params.push(Box::new(month));
    }

    sql.push_str(" ORDER BY dispense_month DESC, id DESC");

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(MonthlyDrugsDispensed {
            id: Some(row.get(0)?),
            clinic_id: row.get(1)?,
            area_id: row.get(2)?,
            branch_id: row.get(3)?,
            dispense_month: row.get(4)?,
            drugs_free_authority: row.get(5)?,
            drugs_free_students: row.get(6)?,
            drugs_free_infants: row.get(7)?,
            drugs_free_breadwinner_women: row.get(8)?,
            drugs_supported_authority_value: row.get(9)?,
            drugs_supported_authority_patient_share: row.get(10)?,
            drugs_supported_students_value: row.get(11)?,
            drugs_supported_students_patient_share: row.get(12)?,
            drugs_supported_infants_value: row.get(13)?,
            drugs_supported_infants_patient_share: row.get(14)?,
            notes: row.get(15)?,
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
pub fn get_report_monthly_supplies_dispensed(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: Option<String>,
    categoryId: Option<i32>,
) -> Result<Vec<SuppliesHistoryRow>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "SELECT m.id, m.clinic_id, m.area_id, m.branch_id, m.supply_id, m.category_id,
                        COALESCE(s.name, sc.name) as item_name, 
                        m.consumer_value, m.collective_entities_value, m.dispense_month, m.notes 
                 FROM monthly_supplies_dispensed m
                 LEFT JOIN supplies s ON m.supply_id = s.id
                 LEFT JOIN supply_categories sc ON m.category_id = sc.id
                 WHERE 1=1".to_string();
    
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut param_idx = 1;

    if let Some(bid) = branchId {
        sql.push_str(&format!(" AND m.branch_id = ?{}", param_idx));
        params.push(Box::new(bid));
        param_idx += 1;
    }
    if let Some(aid) = areaId {
        sql.push_str(&format!(" AND m.area_id = ?{}", param_idx));
        params.push(Box::new(aid));
        param_idx += 1;
    }
    if let Some(cid) = clinicId {
        sql.push_str(&format!(" AND m.clinic_id = ?{}", param_idx));
        params.push(Box::new(cid));
        param_idx += 1;
    }
    if let Some(month) = dispenseMonth {
        sql.push_str(&format!(" AND m.dispense_month = ?{}", param_idx));
        params.push(Box::new(month));
        param_idx += 1;
    }
    if let Some(cat_id) = categoryId {
        sql.push_str(&format!(" AND m.category_id = ?{}", param_idx));
        params.push(Box::new(cat_id));
    }

    sql.push_str(" ORDER BY m.dispense_month DESC, m.id DESC");

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(SuppliesHistoryRow {
            id: row.get(0)?,
            clinic_id: row.get(1)?,
            area_id: row.get(2)?,
            branch_id: row.get(3)?,
            supply_id: row.get(4)?,
            category_id: row.get(5)?,
            item_name: row.get(6)?,
            consumer_value: row.get(7)?,
            collective_entities_value: row.get(8)?,
            dispense_month: row.get(9)?,
            notes: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn delete_monthly_drugs_dispensed(
    state: State<'_, AppState>,
    id: i32,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "DELETE FROM monthly_drugs_dispensed WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;
    
    // Audit log
    let _ = log_action(
        conn, None, "DELETE", "monthly_drugs_dispensed",
        Some(&id.to_string()),
        Some(&format!("حذف الإجماليات الشهرية رقم {}", id))
    );
    
    Ok(())
}

#[tauri::command]
pub fn delete_monthly_supplies_dispensed(
    state: State<'_, AppState>,
    id: i32,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "DELETE FROM monthly_supplies_dispensed WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;
    
    // Audit log
    let _ = log_action(
        conn, None, "DELETE", "monthly_supplies_dispensed",
        Some(&id.to_string()),
        Some(&format!("حذف المستلزمات الشهرية رقم {}", id))
    );
    
    Ok(())
}
