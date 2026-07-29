use crate::db::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::commands::audit::log_action;

#[derive(Serialize, Deserialize, Debug)]
pub struct MedicalTicket {
    pub id: Option<i32>,
    pub branch_id: Option<i32>,
    pub area_id: Option<i32>,
    pub clinic_id: Option<i32>,
    pub category: String,
    pub period: String,
    pub ticket_56c_count: i32,
    pub ticket_56b_count: i32,
    pub dispense_month: String,
    pub week_number: Option<i32>,
    pub is_supported_clinic: Option<bool>,
    pub entry_date: Option<String>,
    pub clinic_name: Option<String>,
    pub area_name: Option<String>,
    pub branch_name: Option<String>,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn save_medical_tickets(
    state: State<'_, AppState>,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    period: String,
    ticket_56b_count: i32,
    ticket_56c_count: i32,
    dispenseMonth: String,
    category: Option<String>,
    weekNumber: Option<i32>,
    isSupportedClinic: Option<bool>,
    entryDate: Option<String>,
) -> Result<i32, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let cat = category.unwrap_or_else(|| "عام".to_string());
    let supported = isSupportedClinic.unwrap_or(false);
    let week = weekNumber.unwrap_or(1);

    // Filter logic based on what IDs are provided
    let mut sql = "SELECT id FROM medical_tickets WHERE dispense_month = ? AND period = ? AND category = ? AND week_number = ? AND branch_id = ?".to_string();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
        Box::new(dispenseMonth.clone()), Box::new(period.clone()), Box::new(cat.clone()), Box::new(week), Box::new(branchId)
    ];

    if let Some(cid) = clinicId {
        sql.push_str(" AND clinic_id = ?");
        params.push(Box::new(cid));
    } else {
        sql.push_str(" AND clinic_id IS NULL");
    }

    if let Some(aid) = areaId {
        sql.push_str(" AND area_id = ?");
        params.push(Box::new(aid));
    } else {
        sql.push_str(" AND area_id IS NULL");
    }

    if let Some(ref d) = entryDate {
        sql.push_str(" AND entry_date = ?");
        params.push(Box::new(d.clone()));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    
    let existing_id: Option<i32> = stmt.query_row(params_ref.as_slice(), |row| row.get(0)).ok();

    if let Some(id) = existing_id {
        conn.execute(
            "UPDATE medical_tickets SET tickets_56b = ?1, tickets_56c = ?2, is_supported_clinic = ?3, entry_date = ?4 
             WHERE id = ?5",
            rusqlite::params![ticket_56b_count, ticket_56c_count, supported, entryDate, id]
        ).map_err(|e| e.to_string())?;
        
        // Audit log
        let _ = log_action(
            conn, None, "UPDATE", "medical_tickets",
            Some(&id.to_string()),
            Some(&format!("تعديل تذاكر طبية: فرع {} شهر {} (56ب: {}, 56ج: {})", 
                branchId, dispenseMonth, ticket_56b_count, ticket_56c_count))
        );
        
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO medical_tickets (branch_id, area_id, clinic_id, dispense_month, period, category, tickets_56b, tickets_56c, is_supported_clinic, week_number, entry_date) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![branchId, areaId, clinicId, dispenseMonth, period, cat, ticket_56b_count, ticket_56c_count, supported, week, entryDate]
        ).map_err(|e| e.to_string())?;
        let new_id = conn.last_insert_rowid() as i32;
        
        // Audit log
        let _ = log_action(
            conn, None, "INSERT", "medical_tickets",
            Some(&new_id.to_string()),
            Some(&format!("إضافة تذاكر طبية: فرع {} شهر {} أسبوع {} (56ب: {}, 56ج: {})", 
                branchId, dispenseMonth, week, ticket_56b_count, ticket_56c_count))
        );
        
        Ok(new_id)
    }
}

#[tauri::command]
pub fn save_medical_tickets_bulk(
    state: State<'_, AppState>,
    data: Vec<MedicalTicket>
) -> Result<(), String> {
    let mut conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_mut().ok_or("Database not initialized")?;

    // Capture info for audit log BEFORE moving data
    let count = data.len();
    let first_dispense_month = data.first().map(|i| i.dispense_month.clone()).unwrap_or_default();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for item in data {
        let cat = if item.category.is_empty() { "عام".to_string() } else { item.category };
        let supported = item.is_supported_clinic.unwrap_or(false);
        let week = item.week_number.unwrap_or(1);
        let branch_id = item.branch_id.unwrap_or(1);

        let mut sql = "SELECT id FROM medical_tickets WHERE dispense_month = ? AND period = ? AND category = ? AND week_number = ? AND branch_id = ? AND is_supported_clinic = ?".to_string();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
            Box::new(item.dispense_month.clone()), Box::new(item.period.clone()), Box::new(cat.clone()), Box::new(week), Box::new(branch_id), Box::new(supported)
        ];

        if let Some(cid) = item.clinic_id {
            sql.push_str(" AND clinic_id = ?");
            params.push(Box::new(cid));
        } else {
            sql.push_str(" AND clinic_id IS NULL");
        }

        if let Some(aid) = item.area_id {
            sql.push_str(" AND area_id = ?");
            params.push(Box::new(aid));
        } else {
            sql.push_str(" AND area_id IS NULL");
        }

        if let Some(ref d) = item.entry_date {
            sql.push_str(" AND entry_date = ?");
            params.push(Box::new(d.clone()));
        }

        let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
        let existing_id: Option<i32> = tx.query_row(&sql, params_ref.as_slice(), |row| row.get(0)).ok();

        if let Some(id) = existing_id {
            tx.execute(
                "UPDATE medical_tickets SET tickets_56b = ?1, tickets_56c = ?2, is_supported_clinic = ?3, entry_date = ?4 
                 WHERE id = ?5",
                rusqlite::params![item.ticket_56b_count, item.ticket_56c_count, supported, item.entry_date, id]
            ).map_err(|e| e.to_string())?;
        } else {
            tx.execute(
                "INSERT INTO medical_tickets (branch_id, area_id, clinic_id, dispense_month, period, category, tickets_56b, tickets_56c, is_supported_clinic, week_number, entry_date) 
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                rusqlite::params![branch_id, item.area_id, item.clinic_id, item.dispense_month, item.period, cat, item.ticket_56b_count, item.ticket_56c_count, supported, week, item.entry_date]
            ).map_err(|e| e.to_string())?;
        }
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    
    // Audit log AFTER commit (after tx is released, so conn can be borrowed)
    let conn_ref = conn_guard.as_ref().ok_or("Database not initialized")?;
    let _ = log_action(
        conn_ref, None, "BULK_UPDATE", "medical_tickets",
        None,
        Some(&format!("حفظ مجمع لـ {} تذكرة طبية (شهر: {})", count, first_dispense_month))
    );
    
    Ok(())
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_medical_tickets_report(
    state: State<'_, AppState>,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: String,
) -> Result<Vec<MedicalTicket>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "SELECT t.id, t.clinic_id, t.category, t.period, t.tickets_56c, t.tickets_56b, t.dispense_month, t.week_number, t.is_supported_clinic, t.branch_id, t.area_id, t.entry_date,
                          c.name as clinic_name, a.name as area_name, b.name as branch_name
                   FROM medical_tickets t
                   LEFT JOIN clinics c ON t.clinic_id = c.id
                   LEFT JOIN areas a ON t.area_id = a.id
                   LEFT JOIN branches b ON t.branch_id = b.id
                   WHERE t.dispense_month = ?1".to_string();
    
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(dispenseMonth)];

    if let Some(cid) = clinicId {
        sql.push_str(" AND t.clinic_id = ?2");
        params.push(Box::new(cid));
    } else if let Some(aid) = areaId {
        sql.push_str(" AND t.area_id = ?2");
        params.push(Box::new(aid));
    } else {
        sql.push_str(" AND t.branch_id = ?2");
        params.push(Box::new(branchId));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(MedicalTicket {
            id: row.get(0)?,
            clinic_id: row.get(1)?,
            category: row.get(2)?,
            period: row.get(3)?,
            ticket_56c_count: row.get(4)?,
            ticket_56b_count: row.get(5)?,
            dispense_month: row.get(6)?,
            week_number: row.get(7)?,
            is_supported_clinic: row.get(8)?,
            branch_id: row.get(9)?,
            area_id: row.get(10)?,
            entry_date: row.get(11)?,
            clinic_name: row.get(12)?,
            area_name: row.get(13)?,
            branch_name: row.get(14)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn delete_medical_tickets(
    state: State<'_, AppState>,
    id: i32
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "DELETE FROM medical_tickets WHERE id = ?1",
        rusqlite::params![id]
    ).map_err(|e| e.to_string())?;
    
    // Audit log
    let _ = log_action(
        conn, None, "DELETE", "medical_tickets",
        Some(&id.to_string()),
        Some(&format!("حذف تذكرة طبية رقم {}", id))
    );
    
    Ok(())
}
