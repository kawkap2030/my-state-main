use crate::db::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::commands::audit::log_action;
use crate::commands::month_isolation::enforce_isolation_lock;

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
    // Monthly mode (weekNumber = None): per-week breakdown of the SAME counters
    // (weeks[0] = أسبوع 1 … weeks[3] = أسبوع 4) so the quick-entry grid can
    // render one column per week — exactly like the regular tickets page.
    // Weekly mode leaves this empty and relies on the flat fields above.
    #[serde(default)]
    pub weeks: Vec<TicketWeekCounters>,
}

#[derive(Serialize, Deserialize, Debug, Default, Clone)]
pub struct TicketWeekCounters {
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
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TicketBatchResult {
    pub saved: i32,
    pub skipped: i32,
}

// ── Aggregated ticket counters for one grid row ─────────────────────────
#[derive(Default, Debug, Clone)]
struct RowCounters {
    morning_56b: i32,
    morning_56c: i32,
    evening_56b: i32,
    evening_56c: i32,
    morning_authority: i32,
    morning_students: i32,
    morning_infants: i32,
    evening_authority: i32,
    evening_students: i32,
    evening_infants: i32,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_tickets_batch_for_branch(
    state: State<'_, AppState>,
    level: String,
    branchIds: Vec<i32>,
    areaIds: Vec<i32>,
    clinicIds: Vec<i32>,
    dispenseMonth: String,
    weekNumber: Option<i32>,
    category: Option<String>,
) -> Result<Vec<TicketBatchItem>, String> {
    // Free tickets may be filtered by funding category (هيئة/طلاب/رضع/
    // المرأة المعيلة) so the quick-entry grid can edit ONE category at a time
    // — exactly like the regular tickets page. "عام" / None = all categories.
    let free_category = category.filter(|c| !c.is_empty() && c != "عام");
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let week_filter = if let Some(w) = weekNumber {
        format!(" AND t.week_number = {}", w)
    } else {
        String::new()
    };

    // ── Resolve branches (empty list = ALL branches) ─────────────────────
    let branch_rows: Vec<(i32, String)> = if branchIds.is_empty() {
        let mut stmt = conn
            .prepare("SELECT id, name FROM branches ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, i32>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        let mut v = Vec::new();
        for r in rows { v.push(r.map_err(|e| e.to_string())?); }
        v
    } else {
        let ph = branchIds.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("SELECT id, name FROM branches WHERE id IN ({}) ORDER BY name", ph);
        let params: Vec<Box<dyn rusqlite::ToSql>> = branchIds.iter().map(|b| Box::new(*b) as Box<dyn rusqlite::ToSql>).collect();
        let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params_ref.as_slice(), |r| Ok((r.get::<_, i32>(0)?, r.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
        let mut v = Vec::new();
        for r in rows { v.push(r.map_err(|e| e.to_string())?); }
        v
    };

    // ── Resolve areas (empty list = ALL areas of the resolved branches) ──
    let area_rows: Vec<(i32, String, i32, String)> = if areaIds.is_empty() {
        if branch_rows.is_empty() { Vec::new() } else {
            let ph = branch_rows.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            let sql = format!(
                "SELECT a.id, a.name, a.branch_id, COALESCE(b.name, '')
                 FROM areas a
                 LEFT JOIN branches b ON a.branch_id = b.id
                 WHERE a.branch_id IN ({})
                 ORDER BY a.name", ph);
            let params: Vec<Box<dyn rusqlite::ToSql>> = branch_rows.iter().map(|(id, _)| Box::new(*id) as Box<dyn rusqlite::ToSql>).collect();
            let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params_ref.as_slice(), |r| Ok((r.get::<_, i32>(0)?, r.get::<_, String>(1)?, r.get::<_, i32>(2)?, r.get::<_, String>(3)?))).map_err(|e| e.to_string())?;
            let mut v = Vec::new();
            for r in rows { v.push(r.map_err(|e| e.to_string())?); }
            v
        }
    } else {
        let ph = areaIds.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT a.id, a.name, a.branch_id, COALESCE(b.name, '')
             FROM areas a
             LEFT JOIN branches b ON a.branch_id = b.id
             WHERE a.id IN ({})
             ORDER BY a.name", ph);
        let params: Vec<Box<dyn rusqlite::ToSql>> = areaIds.iter().map(|b| Box::new(*b) as Box<dyn rusqlite::ToSql>).collect();
        let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params_ref.as_slice(), |r| Ok((r.get::<_, i32>(0)?, r.get::<_, String>(1)?, r.get::<_, i32>(2)?, r.get::<_, String>(3)?))).map_err(|e| e.to_string())?;
        let mut v = Vec::new();
        for r in rows { v.push(r.map_err(|e| e.to_string())?); }
        v
    };

    // ── Resolve clinics (empty list = ALL clinics of the resolved areas) ──
    let clinic_rows: Vec<(i32, String, i32, String)> = if clinicIds.is_empty() {
        if area_rows.is_empty() { Vec::new() } else {
            let ph = area_rows.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            let sql = format!(
                "SELECT c.id, c.name, c.area_id, COALESCE(a.name, '')
                 FROM clinics c
                 LEFT JOIN areas a ON c.area_id = a.id
                 WHERE c.area_id IN ({})
                 ORDER BY a.name, c.name", ph);
            let params: Vec<Box<dyn rusqlite::ToSql>> = area_rows.iter().map(|(id, _, _, _)| Box::new(*id) as Box<dyn rusqlite::ToSql>).collect();
            let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params_ref.as_slice(), |r| Ok((r.get::<_, i32>(0)?, r.get::<_, String>(1)?, r.get::<_, i32>(2)?, r.get::<_, String>(3)?))).map_err(|e| e.to_string())?;
            let mut v = Vec::new();
            for r in rows { v.push(r.map_err(|e| e.to_string())?); }
            v
        }
    } else {
        let ph = clinicIds.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT c.id, c.name, c.area_id, COALESCE(a.name, '')
             FROM clinics c
             LEFT JOIN areas a ON c.area_id = a.id
             WHERE c.id IN ({})
             ORDER BY a.name, c.name", ph);
        let params: Vec<Box<dyn rusqlite::ToSql>> = clinicIds.iter().map(|b| Box::new(*b) as Box<dyn rusqlite::ToSql>).collect();
        let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params_ref.as_slice(), |r| Ok((r.get::<_, i32>(0)?, r.get::<_, String>(1)?, r.get::<_, i32>(2)?, r.get::<_, String>(3)?))).map_err(|e| e.to_string())?;
        let mut v = Vec::new();
        for r in rows { v.push(r.map_err(|e| e.to_string())?); }
        v
    };

    // ── Build display rows per isolation level ───────────────────────────
    // (clinic_id, area_id, branch_id, clinic_name, area_name, branch_name)
    let mut nodes: Vec<(Option<i32>, Option<i32>, i32, String, String, String)> = Vec::new();

    if level == "clinics" {
        // Level: clinics — one row per selected clinic (or ALL clinics of the
        // selected areas). Each clinic is entered individually.
        if !clinic_rows.is_empty() {
            for (cid, cname, aid, aname) in clinic_rows {
                let (bid, bname) = area_rows.iter()
                    .find(|(a_id, _, _, _)| *a_id == aid)
                    .map(|(_, _, b_id, b_n)| (*b_id, b_n.clone()))
                    .unwrap_or_else(|| {
                        let b = branch_rows.first();
                        (b.map(|(i, _)| *i).unwrap_or(0), b.map(|(_, n)| n.clone()).unwrap_or_default())
                    });
                nodes.push((Some(cid), Some(aid), bid, cname, aname, bname));
            }
        } else {
            // No clinics registered yet → fall back to one row per area so
            // the user can still enter area-level tickets.
            for (aid, aname, bid, bname) in area_rows {
                nodes.push((None, Some(aid), bid, aname.clone(), aname.clone(), bname));
            }
        }
    } else if level == "areas" {
        // Level: areas — one row per area (ALL areas of the chosen branch).
        if !area_rows.is_empty() {
            for (aid, aname, bid, bname) in area_rows {
                nodes.push((None, Some(aid), bid, aname.clone(), aname.clone(), bname));
            }
        } else {
            // No areas → fall back to one row per branch
            for (bid, bname) in branch_rows {
                nodes.push((None, None, bid, bname.clone(), bname.clone(), bname.clone()));
            }
        }
    } else {
        // Level: branches — one row per branch (ALL branches when the list is
        // empty / "الكل" is chosen).
        for (bid, bname) in branch_rows {
            nodes.push((None, None, bid, bname.clone(), bname.clone(), bname.clone()));
        }
    }

    // ── Aggregate existing tickets per node ─────────────────────────────
    let mut result: Vec<TicketBatchItem> = Vec::new();

    for (clinic_id, area_id, bid, clinic_name, area_name, bname) in nodes {
        let mut sql = String::from(
            "SELECT t.tickets_56b, t.tickets_56c, t.is_supported_clinic, t.category, t.period, t.week_number
             FROM medical_tickets t
             WHERE t.dispense_month = ?1 AND t.branch_id = ?2",
        );
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
            Box::new(dispenseMonth.clone()),
            Box::new(bid),
        ];

        let mut idx = 3;
        if let Some(c) = clinic_id {
            sql.push_str(&format!(" AND t.clinic_id = ?{}", idx));
            params.push(Box::new(c));
            idx += 1;
        } else {
            sql.push_str(" AND t.clinic_id IS NULL");
        }
        if let Some(a) = area_id {
            sql.push_str(&format!(" AND t.area_id = ?{}", idx));
            params.push(Box::new(a));
            idx += 1;
        } else {
            sql.push_str(" AND t.area_id IS NULL");
        }
        sql.push_str(&week_filter);
        // Free tickets: when a specific funding category is selected, only that
        // category's rows feed the grid (supported rows keep their own columns).
        if let Some(cat) = &free_category {
            sql.push_str(&format!(" AND t.category = ?{} AND t.is_supported_clinic = 0", idx));
            params.push(Box::new(cat.clone()));
        }

        let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params_ref.as_slice(), |r| {
                Ok((
                    r.get::<_, i32>(0)?,
                    r.get::<_, i32>(1)?,
                    r.get::<_, Option<bool>>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, Option<i32>>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        // Bucket counters PER WEEK (index 0..3 = أسبوع 1..4). Weekly mode
        // (weekNumber = Some) still aggregates into the flat fields for that
        // single week; monthly mode (weekNumber = None) returns the whole
        // per-week breakdown in `weeks` so the grid shows all four weeks.
        let mut week_counters: Vec<RowCounters> = vec![RowCounters::default(); 4];
        for ticket in rows {
            let (t56b, t56c, t_supported, t_cat, t_period, t_week) = ticket.map_err(|e| e.to_string())?;
            let wi = ((t_week.unwrap_or(1) - 1).clamp(0, 3)) as usize;
            let counters = &mut week_counters[wi];
            let is_supported = t_supported.unwrap_or(false);
            // A period is MORNING unless it is explicitly an evening one.
            // This keeps صباحي/الصباحية and the monthly unified "موحد" period
            // on the morning side — previously "موحد" fell into the evening
            // bucket, which made monthly data from the regular page appear
            // swapped in the quick entry grid.
            let morning = !(t_period.contains("مسائي") || t_period.contains("المسائية"));

            if is_supported {
                match t_cat.as_str() {
                    "هيئة" => {
                        if morning { counters.morning_authority += t56b + t56c; }
                        else { counters.evening_authority += t56b + t56c; }
                    }
                    "طلاب" => {
                        if morning { counters.morning_students += t56b + t56c; }
                        else { counters.evening_students += t56b + t56c; }
                    }
                    "رضع" => {
                        if morning { counters.morning_infants += t56b + t56c; }
                        else { counters.evening_infants += t56b + t56c; }
                    }
                    _ => {}
                }
            } else {
                if morning {
                    counters.morning_56b += t56b;
                    counters.morning_56c += t56c;
                } else {
                    counters.evening_56b += t56b;
                    counters.evening_56c += t56c;
                }
            }
        }

        // Flat counters: the single requested week (weekly mode) or the sum of
        // all four weeks (monthly mode — keeps summary badges working).
        let counters: RowCounters = match weekNumber {
            Some(w) => week_counters[((w - 1).clamp(0, 3)) as usize].clone(),
            None => {
                let mut total = RowCounters::default();
                for c in &week_counters {
                    total.morning_56b += c.morning_56b;
                    total.morning_56c += c.morning_56c;
                    total.evening_56b += c.evening_56b;
                    total.evening_56c += c.evening_56c;
                    total.morning_authority += c.morning_authority;
                    total.morning_students += c.morning_students;
                    total.morning_infants += c.morning_infants;
                    total.evening_authority += c.evening_authority;
                    total.evening_students += c.evening_students;
                    total.evening_infants += c.evening_infants;
                }
                total
            }
        };

        let weeks: Vec<TicketWeekCounters> = if weekNumber.is_some() {
            Vec::new()
        } else {
            week_counters.iter().map(|c| TicketWeekCounters {
                morning_56b: c.morning_56b,
                morning_56c: c.morning_56c,
                evening_56b: c.evening_56b,
                evening_56c: c.evening_56c,
                morning_authority: c.morning_authority,
                morning_students: c.morning_students,
                morning_infants: c.morning_infants,
                evening_authority: c.evening_authority,
                evening_students: c.evening_students,
                evening_infants: c.evening_infants,
            }).collect()
        };

        result.push(TicketBatchItem {
            clinic_id: clinic_id.unwrap_or(0),
            clinic_name,
            area_id: area_id.unwrap_or(0),
            area_name,
            branch_id: bid,
            branch_name: bname,
            morning_56b: counters.morning_56b,
            morning_56c: counters.morning_56c,
            evening_56b: counters.evening_56b,
            evening_56c: counters.evening_56c,
            morning_authority: counters.morning_authority,
            morning_students: counters.morning_students,
            morning_infants: counters.morning_infants,
            evening_authority: counters.evening_authority,
            evening_students: counters.evening_students,
            evening_infants: counters.evening_infants,
            category: "عام".to_string(),
            period: "موحد".to_string(),
            weeks,
        });
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

    // ── Triple isolation lock ────────────────────────────────────────
    {
        let mut seen: Vec<(i32, String, &str)> = Vec::new();
        for item in &items {
            let level = if item.clinic_id > 0 { "clinic" }
                        else if item.area_id > 0 { "area" }
                        else { "branch" };
            if seen.iter().any(|(b, m, l)| *b == item.branch_id && *m == dispenseMonth && *l == level) {
                continue;
            }
            enforce_isolation_lock(conn, item.branch_id, &dispenseMonth, level, false)?;
            seen.push((item.branch_id, dispenseMonth.clone(), level));
        }
    }

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

// ── Scope-level delete for the quick entry grid ────────────────────────────
// The quick entry grid shows AGGREGATED counters per entity (branch/area/
// clinic), not per-record ids — so a row delete must target the whole scope:
// branch_id + optional area_id/clinic_id + month + week + type + category.
#[tauri::command]
#[allow(non_snake_case)]
pub fn delete_medical_tickets_by_scope(
    state: State<'_, AppState>,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: String,
    weekNumber: Option<i32>,
    isSupported: bool,
    category: Option<String>,
) -> Result<i32, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = String::from(
        "DELETE FROM medical_tickets WHERE branch_id = ?1 AND dispense_month = ?2 AND is_supported_clinic = ?3",
    );
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
        Box::new(branchId),
        Box::new(dispenseMonth.clone()),
        Box::new(if isSupported { 1 } else { 0 }),
    ];

    let mut idx = 4;
    if let Some(c) = clinicId {
        sql.push_str(&format!(" AND clinic_id = ?{}", idx));
        params.push(Box::new(c));
        idx += 1;
    } else {
        sql.push_str(" AND clinic_id IS NULL");
    }
    if let Some(a) = areaId {
        sql.push_str(&format!(" AND area_id = ?{}", idx));
        params.push(Box::new(a));
        idx += 1;
    } else {
        sql.push_str(" AND area_id IS NULL");
    }
    if let Some(w) = weekNumber {
        sql.push_str(&format!(" AND week_number = ?{}", idx));
        params.push(Box::new(w));
        idx += 1;
    }
    // Free tickets: optionally narrow to the selected funding category. When a
    // specific category is chosen the grid only holds that category's rows, so
    // deleting should remove exactly that category; 'عام'/None = all free rows
    // of the scope.
    if !isSupported {
        if let Some(cat) = category {
            if !cat.is_empty() && cat != "عام" {
                sql.push_str(&format!(" AND category = ?{}", idx));
                params.push(Box::new(cat));
            }
        }
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let deleted: i32 = conn.execute(&sql, params_ref.as_slice()).map_err(|e| e.to_string())? as i32;

    // Audit log
    let _ = log_action(
        conn, None, "DELETE", "medical_tickets",
        None,
        Some(&format!(
            "حذف سجلات تذاكر طبية حسب النطاق: فرع {} {} {} شهر {} أسبوع {} نوع {}",
            branchId,
            areaId.map(|a| format!("منطقة {}", a)).unwrap_or_default(),
            clinicId.map(|c| format!("عيادة {}", c)).unwrap_or_default(),
            dispenseMonth,
            weekNumber.map(|w| w.to_string()).unwrap_or_else(|| "الكل".to_string()),
            if isSupported { "مدعم" } else { "مجاني" }
        ))
    );

    Ok(deleted)
}

