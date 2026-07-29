use crate::db::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::commands::audit::log_action;
use crate::commands::month_isolation::enforce_isolation_lock;

#[derive(Serialize, Deserialize, Debug)]
pub struct JudicialDispensed {
    pub id: Option<i32>,
    pub patient_id: i32,
    pub diagnosis: String,
    pub medicine_name: String,
    pub unit: String,
    pub unit_price: f64,
    pub monthly_dose: f64,
    pub monthly_cost: f64,
    pub dispense_month: String, // YYYY-MM
    pub branch_id: i32,
    pub area_id: Option<i32>,
    pub clinic_id: Option<i32>,
    // Extended fields for details view
    pub court_ruling_date: Option<String>,
    pub treatment_start_date: Option<String>,
    pub authorized_dose: Option<f64>,
}

#[tauri::command]
pub fn save_judicial_dispensed(
    state: State<'_, AppState>,
    data: JudicialDispensed,
) -> Result<i32, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // --- Global Month Isolation Lock ---
    let current_level = if data.clinic_id.is_some() {
        "clinic"
    } else if data.area_id.is_some() {
        "area"
    } else {
        "branch"
    };

    enforce_isolation_lock(conn, data.branch_id, &data.dispense_month, current_level, false)?;

    if let Some(id) = data.id {
        // Update
        conn.execute(
            "UPDATE judicial_dispensed SET 
                patient_id = ?1, diagnosis = ?2, medicine_name = ?3, unit = ?4, unit_price = ?5,
                monthly_dose = ?6, monthly_cost = ?7, dispense_month = ?8, branch_id = ?9, area_id = ?10, clinic_id = ?11
             WHERE id = ?12",
            rusqlite::params![
                data.patient_id, data.diagnosis, data.medicine_name, data.unit, data.unit_price,
                data.monthly_dose, data.monthly_cost, data.dispense_month, data.branch_id, data.area_id, data.clinic_id, id
            ],
        ).map_err(|e| e.to_string())?;
        
        // Audit log
        let _ = log_action(
            conn, None, "UPDATE", "judicial_dispensed",
            Some(&id.to_string()),
            Some(&format!("تعديل حكم قضائي للمريض {} - {} شهر {}", data.patient_id, data.medicine_name, data.dispense_month))
        );
        
        Ok(id)
    } else {
        // Insert
        conn.execute(
            "INSERT INTO judicial_dispensed (
                patient_id, diagnosis, medicine_name, unit, unit_price,
                monthly_dose, monthly_cost, dispense_month, branch_id, area_id, clinic_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                data.patient_id,
                data.diagnosis,
                data.medicine_name,
                data.unit,
                data.unit_price,
                data.monthly_dose,
                data.monthly_cost,
                data.dispense_month,
                data.branch_id,
                data.area_id,
                data.clinic_id
            ],
        )
        .map_err(|e| e.to_string())?;
        let new_id = conn.last_insert_rowid() as i32;
        
        // Audit log
        let _ = log_action(
            conn, None, "INSERT", "judicial_dispensed",
            Some(&new_id.to_string()),
            Some(&format!("إضافة حكم قضائي للمريض {} - {} شهر {}", data.patient_id, data.medicine_name, data.dispense_month))
        );
        
        Ok(new_id)
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_judicial_dispensed(
    state: State<'_, AppState>,
    branchId: Option<i32>,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: String,
) -> Result<Vec<JudicialDispensed>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "
        SELECT d.id, d.patient_id, d.diagnosis, d.medicine_name, d.unit, d.unit_price, d.monthly_dose, d.monthly_cost, d.dispense_month, d.branch_id, d.area_id, d.clinic_id,
               p.court_ruling_date, p.treatment_start_date,
               (SELECT pm.monthly_dose FROM judicial_patient_medicines pm JOIN judicial_medicines m ON pm.medicine_id = m.id WHERE pm.patient_id = d.patient_id AND m.name = d.medicine_name LIMIT 1) as authorized_dose
        FROM judicial_dispensed d
        JOIN judicial_patients p ON d.patient_id = p.id
        WHERE d.dispense_month = ?1
    ".to_string();
    
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(dispenseMonth)];

    if let Some(cid) = clinicId {
        sql.push_str(" AND d.clinic_id = ?2");
        params.push(Box::new(cid));
    } else if let Some(aid) = areaId {
        sql.push_str(" AND d.area_id = ?2");
        params.push(Box::new(aid));
    } else if let Some(bid) = branchId {
        sql.push_str(" AND d.branch_id = ?2");
        params.push(Box::new(bid));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params_ref.as_slice(), |row| {
            Ok(JudicialDispensed {
                id: Some(row.get(0)?),
                patient_id: row.get(1)?,
                diagnosis: row.get(2)?,
                medicine_name: row.get(3)?,
                unit: row.get(4)?,
                unit_price: row.get(5)?,
                monthly_dose: row.get(6)?,
                monthly_cost: row.get(7)?,
                dispense_month: row.get(8)?,
                branch_id: row.get(9)?,
                area_id: row.get(10)?,
                clinic_id: row.get(11)?,
                court_ruling_date: row.get(12)?,
                treatment_start_date: row.get(13)?,
                authorized_dose: row.get(14)?,
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
#[allow(non_snake_case)]
pub fn get_judicial_dispensed_range(
    state: State<'_, AppState>,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    startMonth: String,
    endMonth: String,
) -> Result<Vec<JudicialDispensed>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "
        SELECT d.id, d.patient_id, d.diagnosis, d.medicine_name, d.unit, d.unit_price, d.monthly_dose, d.monthly_cost, d.dispense_month, d.branch_id, d.area_id, d.clinic_id,
               p.court_ruling_date, p.treatment_start_date,
               (SELECT pm.monthly_dose FROM judicial_patient_medicines pm JOIN judicial_medicines m ON pm.medicine_id = m.id WHERE pm.patient_id = d.patient_id AND m.name = d.medicine_name LIMIT 1) as authorized_dose
        FROM judicial_dispensed d
        JOIN judicial_patients p ON d.patient_id = p.id
        WHERE d.dispense_month >= ?1 AND d.dispense_month <= ?2
    ".to_string();
    
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
        Box::new(startMonth),
        Box::new(endMonth),
    ];

    if let Some(cid) = clinicId {
        sql.push_str(" AND d.clinic_id = ?3");
        params.push(Box::new(cid));
    } else if let Some(aid) = areaId {
        sql.push_str(" AND d.area_id = ?3");
        params.push(Box::new(aid));
    } else {
        sql.push_str(" AND d.branch_id = ?3");
        params.push(Box::new(branchId));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(JudicialDispensed {
            id: Some(row.get(0)?),
            patient_id: row.get(1)?,
            diagnosis: row.get(2)?,
            medicine_name: row.get(3)?,
            unit: row.get(4)?,
            unit_price: row.get(5)?,
            monthly_dose: row.get(6)?,
            monthly_cost: row.get(7)?,
            dispense_month: row.get(8)?,
            branch_id: row.get(9)?,
            area_id: row.get(10)?,
            clinic_id: row.get(11)?,
            court_ruling_date: row.get(12)?,
            treatment_start_date: row.get(13)?,
            authorized_dose: row.get(14)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn delete_judicial_dispensed(
    state: State<'_, AppState>,
    id: i32,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "DELETE FROM judicial_dispensed WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;
    
    // Audit log
    let _ = log_action(
        conn, None, "DELETE", "judicial_dispensed",
        Some(&id.to_string()),
        Some(&format!("حذف حكم قضائي رقم {}", id))
    );
    
    Ok(())
}
