use crate::db::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::commands::audit::log_action;

#[derive(Serialize, Deserialize, Debug)]
pub struct TicketBatchItem {
    pub clinic_id: i32,
    pub clinic_name: String,
    pub area_id: i32,
    pub area_name: String,
    pub branch_id: i32,
    pub branch_name: String,
    pub morning_56b: i32,
    pub morning_56c: i32,
    pub evening_56b: i32,
    pub evening_56c: i32,
    pub morning_authority: i32,
    pub morning_students: i32,
    pub morning_infants: i32,
    pub evening_authority: i32,
    pub evening_students: i32,
    pub evening_infants: i32,
    pub category: String,
    pub period: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TicketBatchResult {
    pub saved: i32,
    pub skipped: i32,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_tickets_batch_for_branch(
    state: State<'_, AppState>,
    branchId: i32,
    dispenseMonth: String,
    weekNumber: Option<i32>,
) -> Result<Vec<TicketBatchItem>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let week_filter = if let Some(w) = weekNumber {
        format!(" AND week_number = {}", w)
    } else {
        String::new()
    };

    let sql = format!(
        "SELECT 
            t.clinic_id,
            COALESCE(c.name, 'عيادة محذوفة') as clinic_name,
            COALESCE(a.id, 0) as area_id,
            COALESCE(a.name, 'منطقة محذوفة') as area_name,
            t.branch_id,
            COALESCE(b.name, 'فرع محذوف') as branch_name,
            t.is_supported_clinic,
            t.category,
            t.period,
            t.week_number
         FROM medical_tickets t
         LEFT JOIN clinics c ON t.clinic_id = c.id
         LEFT JOIN areas a ON t.area_id = a.id
         LEFT JOIN branches b ON t.branch_id = b.id
         WHERE t.branch_id = ?1 AND t.dispense_month = ?2{}
         ORDER BY a.name, c.name, t.is_supported_clinic, t.category, t.period",
        week_filter
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![branchId, &dispenseMonth], |row| {
        Ok((
            row.get::<_, i32>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i32>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, i32>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, Option<bool>>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, Option<i32>>(9)?,
        ))
    }).map_err(|e| e.to_string())?;

    // Get all clinics for the branch
    let clinics_sql = String::from(
        "SELECT c.id, c.name, c.area_id, COALESCE(a.name, '') as area_name, a.branch_id, COALESCE(b.name, '') as branch_name
         FROM clinics c
         LEFT JOIN areas a ON c.area_id = a.id
         LEFT JOIN branches b ON a.branch_id = b.id
         WHERE a.branch_id = ?1
         ORDER BY a.name, c.name"
    );

    let mut clinics_stmt = conn.prepare(&clinics_sql).map_err(|e| e.to_string())?;
    let clinics_rows = clinics_stmt.query_map([branchId], |row| {
        Ok((
            row.get::<_, i32>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i32>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, i32>(4)?,
            row.get::<_, String>(5)?,
        ))
    }).map_err(|e| e.to_string())?;

    // Build clinics map
    let mut clinics_map: std::collections::HashMap<i32, (String, i32, String, i32, String)> = std::collections::HashMap::new();
    for row in clinics_rows {
        let (id, name, area_id, area_name, branch_id, branch_name) = row.map_err(|e| e.to_string())?;
        clinics_map.insert(id, (name, area_id, area_name, branch_id, branch_name));
    }

    // Get existing tickets grouped by clinic
    let mut result: Vec<TicketBatchItem> = Vec::new();
    let mut seen_clinics: std::collections::HashSet<i32> = std::collections::HashSet::new();

    for row_res in rows {
        let (clinic_id, clinic_name, area_id, area_name, branch_id, branch_name, _is_supported, _category, _period, _week) = 
            row_res.map_err(|e| e.to_string())?;

        if seen_clinics.contains(&clinic_id) {
            continue;
        }
        seen_clinics.insert(clinic_id);

        // Get all tickets for this clinic
        let ticket_sql = format!(
            "SELECT t.tickets_56b, t.tickets_56c, t.is_supported_clinic, t.category, t.period
             FROM medical_tickets t
             WHERE t.clinic_id = ?1 AND t.dispense_month = ?2{}", 
            week_filter
        );
        
        let mut ticket_stmt = conn.prepare(&ticket_sql).map_err(|e| e.to_string())?;
        let tickets = ticket_stmt.query_map(rusqlite::params![clinic_id, &dispenseMonth], |row| {
            Ok((
                row.get::<_, i32>(0)?,
                row.get::<_, i32>(1)?,
                row.get::<_, Option<bool>>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        }).map_err(|e| e.to_string())?;

        let mut morning_56b = 0;
        let mut morning_56c = 0;
        let mut evening_56b = 0;
        let mut evening_56c = 0;
        let mut morning_authority = 0;
        let mut morning_students = 0;
        let mut morning_infants = 0;
        let mut evening_authority = 0;
        let mut evening_students = 0;
        let mut evening_infants = 0;

        for ticket in tickets {
            let (t56b, t56c, t_supported, t_cat, t_period) = ticket.map_err(|e| e.to_string())?;
            let is_supported = t_supported.unwrap_or(false);
            
            if is_supported {
                // Supported clinic tickets
                let morning = t_period.contains("صباح") || t_period == "صباحي";
                match t_cat.as_str() {
                    "هيئة" => {
                        if morning { morning_authority += t56b + t56c; }
                        else { evening_authority += t56b + t56c; }
                    },
                    "طلاب" => {
                        if morning { morning_students += t56b + t56c; }
                        else { evening_students += t56b + t56c; }
                    },
                    "رضع" => {
                        if morning { morning_infants += t56b + t56c; }
                        else { evening_infants += t56b + t56c; }
                    },
                    _ => {}
                }
            } else {
                // Free clinic tickets (56b, 56c)
                if t_period.contains("صباح") || t_period == "صباحي" {
                    morning_56b += t56b;
                    morning_56c += t56c;
                } else {
                    evening_56b += t56b;
                    evening_56c += t56c;
                }
            }
        }

        let (final_clinic_name, final_area_id, final_area_name, final_branch_id, final_branch_name) = 
            clinics_map.get(&clinic_id)
            .map(|(n, aid, an, bid, bn)| (n.clone(), *aid, an.clone(), *bid, bn.clone()))
            .unwrap_or_else(|| (clinic_name.clone(), area_id, area_name.clone(), branch_id, branch_name.clone()));

        result.push(TicketBatchItem {
            clinic_id,
            clinic_name: final_clinic_name,
            area_id: final_area_id,
            area_name: final_area_name,
            branch_id: final_branch_id,
            branch_name: final_branch_name,
            morning_56b,
            morning_56c,
            evening_56b,
            evening_56c,
            morning_authority,
            morning_students,
            morning_infants,
            evening_authority,
            evening_students,
            evening_infants,
            category: "عام".to_string(),
            period: "موحد".to_string(),
        });
    }

    // Add clinics that have no tickets yet
    for (clinic_id, (clinic_name, area_id, area_name, branch_id, branch_name)) in &clinics_map {
        if !seen_clinics.contains(clinic_id) {
            result.push(TicketBatchItem {
                clinic_id: *clinic_id,
                clinic_name: clinic_name.clone(),
                area_id: *area_id,
                area_name: area_name.clone(),
                branch_id: *branch_id,
                branch_name: branch_name.clone(),
                morning_56b: 0,
                morning_56c: 0,
                evening_56b: 0,
                evening_56c: 0,
                morning_authority: 0,
                morning_students: 0,
                morning_infants: 0,
                evening_authority: 0,
                evening_students: 0,
                evening_infants: 0,
                category: "عام".to_string(),
                period: "موحد".to_string(),
            });
        }
    }

    // Sort by area name then clinic name
    result.sort_by(|a, b| {
        a.area_name.cmp(&b.area_name).then(a.clinic_name.cmp(&b.clinic_name))
    });

    Ok(result)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn save_tickets_batch_bulk(
    state: State<'_, AppState>,
    items: Vec<TicketBatchItem>,
    dispenseMonth: String,
    weekNumber: i32,
) -> Result<TicketBatchResult, String> {
    let mut conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_mut().ok_or("Database not initialized")?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut saved = 0;
    let skipped = 0;

    for item in items {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let branch_id = item.branch_id;

        // Helper to save or update a ticket
        let save_ticket = |conn: &rusqlite::Connection, 
                           clinic_id: i32, area_id: i32, branch_id: i32,
                           category: &str, period: &str, count: i32, 
                           is_supported: bool| -> Result<(), String> {
            if count == 0 { return Ok(()); }

            let count56b = if is_supported { count } else { 0 };
            let count56c = if !is_supported { count } else { 0 };

            // Check existing
            let existing_id: Option<i32> = conn.query_row(
                "SELECT id FROM medical_tickets 
                 WHERE clinic_id = ?1 AND dispense_month = ?2 AND category = ?3 AND period = ?4 AND week_number = ?5",
                rusqlite::params![clinic_id, &dispenseMonth, category, period, weekNumber],
                |row| row.get(0)
            ).ok();

            if let Some(id) = existing_id {
                conn.execute(
                    "UPDATE medical_tickets SET tickets_56b = ?1, tickets_56c = ?2 WHERE id = ?3",
                    rusqlite::params![count56b, count56c, id]
                ).map_err(|e| e.to_string())?;
            } else {
                conn.execute(
                    "INSERT INTO medical_tickets (clinic_id, area_id, branch_id, dispense_month, category, period, week_number, tickets_56b, tickets_56c, is_supported_clinic, entry_date)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    rusqlite::params![clinic_id, area_id, branch_id, &dispenseMonth, category, period, weekNumber, count56b, count56c, is_supported, &today]
                ).map_err(|e| e.to_string())?;
            }
            Ok(())
        };

        // Save Free tickets (56b, 56c) - Morning
        let _ = save_ticket(&tx, item.clinic_id, item.area_id, branch_id, "عام", "صباحي", item.morning_56b + item.morning_56c, false);
        // Save Free tickets (56b, 56c) - Evening  
        let _ = save_ticket(&tx, item.clinic_id, item.area_id, branch_id, "عام", "مسائي", item.evening_56b + item.evening_56c, false);

        // Save Supported tickets - Authority Morning/Evening
        let _ = save_ticket(&tx, item.clinic_id, item.area_id, branch_id, "هيئة", "صباحي", item.morning_authority, true);
        let _ = save_ticket(&tx, item.clinic_id, item.area_id, branch_id, "هيئة", "مسائي", item.evening_authority, true);

        // Save Supported tickets - Students Morning/Evening
        let _ = save_ticket(&tx, item.clinic_id, item.area_id, branch_id, "طلاب", "صباحي", item.morning_students, true);
        let _ = save_ticket(&tx, item.clinic_id, item.area_id, branch_id, "طلاب", "مسائي", item.evening_students, true);

        // Save Supported tickets - Infants Morning/Evening
        let _ = save_ticket(&tx, item.clinic_id, item.area_id, branch_id, "رضع", "صباحي", item.morning_infants, true);
        let _ = save_ticket(&tx, item.clinic_id, item.area_id, branch_id, "رضع", "مسائي", item.evening_infants, true);

        saved += 1;
    }

    tx.commit().map_err(|e| e.to_string())?;
    
    // Audit log
    let _ = log_action(
        conn, None, "BULK_UPDATE", "medical_tickets",
        None,
        Some(&format!("حفظ مجمع لـ {} تذكرة طبية (شهر: {} أسبوع: {})", saved, dispenseMonth, weekNumber))
    );
    
    Ok(TicketBatchResult { saved, skipped })
}
