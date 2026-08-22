use crate::db::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::commands::audit::log_action;
use crate::commands::month_isolation::enforce_isolation_lock;

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

    // ── Triple isolation lock ────────────────────────────────────────
    // A month may be entered at ONLY ONE hierarchy level (branch / area /
    // clinic). Once the first save locks it, entries at the other levels are
    // rejected — this is what keeps ticket data consistent (no mixing of
    // branch-level and area-level records for the same month).
    let current_level = if clinicId.is_some() { "clinic" }
                        else if areaId.is_some() { "area" }
                        else { "branch" };
    enforce_isolation_lock(conn, branchId, &dispenseMonth, current_level, false)?;

    // Free tickets (is_supported = false) may be entered per funding category
    // (هيئة/طلاب/رضع/المرأة المعيلة) from the regular page, or as the unified
    // aggregate "عام" (the sum of the four categories) from the quick entry.
    let supported = isSupportedClinic.unwrap_or(false);
    let cat = category.filter(|c| !c.is_empty()).unwrap_or_else(|| "عام".to_string());
    let week = weekNumber.unwrap_or(1);

    // Free tickets keep a SINGLE representation per identity: saving a 'عام'
    // (aggregate) row removes any per-category rows, and saving a category row
    // removes the 'عام' row — so the two pages never coexist for the same
    // period and aggregations/reports never double count. The same rule
    // applies ACROSS period families: a unified monthly (موحد) row replaces
    // the weekly (صباحي/مسائي) rows of the same scope+week+category, and
    // vice versa.
    // One DELETE covers BOTH the عام↔فئات swap and the weekly↔monthly swap so
    // switching entry style for the same scope+week+category replaces the old
    // rows instead of leaving duplicates that double-count in reports.
    let is_unified = period.contains("موحد");
    let other_family = if is_unified { "period IN ('صباحي', 'مسائي')" } else { "period = 'موحد'" };
    let mut del = format!(
        "DELETE FROM medical_tickets WHERE dispense_month = ? AND week_number = ? AND branch_id = ? AND is_supported_clinic = ?",
    );
    let mut del_params: Vec<Box<dyn rusqlite::ToSql>> = vec![
        Box::new(dispenseMonth.clone()), Box::new(week), Box::new(branchId), Box::new(if supported { 1 } else { 0 }),
    ];
    if supported {
        // Supported tickets have no عام↔فئات axis, but the weekly ↔ monthly
        // axis still applies: a unified monthly row replaces the weekly rows
        // of the same scope+week+category, and vice versa.
        del.push_str(&format!(" AND category = ? AND {}", other_family));
        del_params.push(Box::new(cat.clone()));
    } else if cat == "عام" {
        // Saving the aggregate removes every per-category row (any period
        // family) plus the other family's 'عام' row.
        del.push_str(&format!(" AND (category <> 'عام' OR ({} AND category = 'عام'))", other_family));
    } else {
        // Saving a category removes the 'عام' aggregate (any family) and that
        // category's rows in the other period family.
        del.push_str(&format!(" AND (category = 'عام' OR (category = ? AND {}))", other_family));
        del_params.push(Box::new(cat.clone()));
    }
    if let Some(cid) = clinicId {
        del.push_str(" AND clinic_id = ?");
        del_params.push(Box::new(cid));
    } else {
        del.push_str(" AND clinic_id IS NULL");
    }
    if let Some(aid) = areaId {
        del.push_str(" AND area_id = ?");
        del_params.push(Box::new(aid));
    } else {
        del.push_str(" AND area_id IS NULL");
    }
    let del_refs: Vec<&dyn rusqlite::ToSql> = del_params.iter().map(|b| b.as_ref()).collect();
    conn.execute(&del, del_refs.as_slice()).map_err(|e| e.to_string())?;

    // Filter logic based on what IDs are provided.
    // NOTE: entry_date is intentionally NOT part of the identity — a period
    // (month + scope + week + category) already entered must be updated,
    // not duplicated, regardless of which page saved it.
    let mut sql = "SELECT id FROM medical_tickets WHERE dispense_month = ? AND period = ? AND category = ? AND week_number = ? AND branch_id = ? AND is_supported_clinic = ?".to_string();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
        Box::new(dispenseMonth.clone()), Box::new(period.clone()), Box::new(cat.clone()), Box::new(week), Box::new(branchId), Box::new(supported)
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

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    
    let existing_id: Option<i32> = stmt.query_row(params_ref.as_slice(), |row| row.get(0)).ok();

    if let Some(id) = existing_id {
        conn.execute(
            "UPDATE medical_tickets SET tickets_56b = ?1, tickets_56c = ?2, is_supported_clinic = ?3, category = ?4, entry_date = ?5 
             WHERE id = ?6",
            rusqlite::params![ticket_56b_count, ticket_56c_count, supported, cat, entryDate, id]
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

    // ── Triple isolation lock ────────────────────────────────────────
    // The quick entry can save MANY branches in one bulk call, so enforce the
    // month-level lock for every distinct (branch, month) in the payload. Each
    // branch+month may be entered at ONLY ONE level (branch / area / clinic).
    {
        // Key on (branch, month, LEVEL) so a payload that mixes levels for the
        // same branch+month fails loudly instead of silently checking only the
        // first item's level.
        let mut seen: Vec<(i32, String, &str)> = Vec::new();
        for item in &data {
            let branch_id = item.branch_id.unwrap_or(1);
            let current_level = if item.clinic_id.is_some() { "clinic" }
                                else if item.area_id.is_some() { "area" }
                                else { "branch" };
            if seen.iter().any(|(b, m, l)| *b == branch_id && *m == item.dispense_month && *l == current_level) {
                continue;
            }
            enforce_isolation_lock(conn, branch_id, &item.dispense_month, current_level, false)?;
            seen.push((branch_id, item.dispense_month.clone(), current_level));
        }
    }

    // Capture info for audit log BEFORE moving data
    let count = data.len();
    let first_dispense_month = data.first().map(|i| i.dispense_month.clone()).unwrap_or_default();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for item in data {
        // Free tickets may be entered per funding category (هيئة/طلاب/رضع/
        // المرأة المعيلة) from the regular page, or as the unified aggregate
        // "عام" (the sum of the four categories) from the quick entry.
        let supported = item.is_supported_clinic.unwrap_or(false);
        let cat = if item.category.is_empty() { "عام".to_string() } else { item.category.clone() };
        let week = item.week_number.unwrap_or(1);
        let branch_id = item.branch_id.unwrap_or(1);

        // Free tickets keep a SINGLE representation per identity: saving a
        // 'عام' (aggregate) row removes any per-category rows, and saving a
        // category row removes the 'عام' row — so the two pages never coexist
        // for the same period and aggregations/reports never double count.
        // The same rule applies ACROSS period families: saving a unified
        // monthly (موحد) row replaces the weekly (صباحي/مسائي) rows of the
        // same scope+week+category, and vice versa.
        // One DELETE covers BOTH the عام↔فئات swap and the weekly↔monthly swap
        // so switching entry style for the same scope+week+category replaces
        // the old rows instead of leaving duplicates that double-count.
        let is_unified = item.period.contains("موحد");
        let other_family = if is_unified { "period IN ('صباحي', 'مسائي')" } else { "period = 'موحد'" };
        let mut del = format!(
            "DELETE FROM medical_tickets WHERE dispense_month = ? AND week_number = ? AND branch_id = ? AND is_supported_clinic = ?",
        );
        let mut del_params: Vec<Box<dyn rusqlite::ToSql>> = vec![
            Box::new(item.dispense_month.clone()), Box::new(week), Box::new(branch_id), Box::new(if supported { 1 } else { 0 }),
        ];
        if supported {
            // Supported tickets have no عام↔فئات axis, but the weekly ↔ monthly
            // axis still applies: a unified monthly row replaces the weekly rows
            // of the same scope+week+category, and vice versa.
            del.push_str(&format!(" AND category = ? AND {}", other_family));
            del_params.push(Box::new(cat.clone()));
        } else if cat == "عام" {
            // Saving the aggregate removes every per-category row (any period
            // family) plus the other family's 'عام' row.
            del.push_str(&format!(" AND (category <> 'عام' OR ({} AND category = 'عام'))", other_family));
        } else {
            // Saving a category removes the 'عام' aggregate (any family) and
            // that category's rows in the other period family.
            del.push_str(&format!(" AND (category = 'عام' OR (category = ? AND {}))", other_family));
            del_params.push(Box::new(cat.clone()));
        }
        if let Some(cid) = item.clinic_id {
            del.push_str(" AND clinic_id = ?");
            del_params.push(Box::new(cid));
        } else {
            del.push_str(" AND clinic_id IS NULL");
        }
        if let Some(aid) = item.area_id {
            del.push_str(" AND area_id = ?");
            del_params.push(Box::new(aid));
        } else {
            del.push_str(" AND area_id IS NULL");
        }
        let del_refs: Vec<&dyn rusqlite::ToSql> = del_params.iter().map(|b| b.as_ref()).collect();
        tx.execute(&del, del_refs.as_slice()).map_err(|e| e.to_string())?;

        // NOTE: entry_date is intentionally NOT part of the identity — a
        // period already entered on any page must be updated, never duplicated.
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

        let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
        let existing_id: Option<i32> = tx.query_row(&sql, params_ref.as_slice(), |row| row.get(0)).ok();

        if let Some(id) = existing_id {
            tx.execute(
                "UPDATE medical_tickets SET tickets_56b = ?1, tickets_56c = ?2, is_supported_clinic = ?3, category = ?4, entry_date = ?5 
                 WHERE id = ?6",
                rusqlite::params![item.ticket_56b_count, item.ticket_56c_count, supported, cat, item.entry_date, id]
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

// ── Duplicate-period guard ─────────────────────────────────────────────
// Returns the identity keys of periods that ALREADY exist for the given
// payload AND would be CHANGED by it (i.e. the stored values differ from the
// incoming ones). Both tickets pages use this BEFORE saving so that
// re-entering a period with different values — the real data-corruption
// risk — is refused with "تم إدخال الفترة من قبل", while idempotent
// re-saves (identical values, which happen whenever the pre-filled grids are
// saved again) are silently allowed.
#[derive(Serialize, Deserialize, Debug)]
pub struct ExistingTicketKey {
    pub period: String,
    pub category: String,
    pub week_number: i32,
    pub clinic_id: Option<i32>,
    pub area_id: Option<i32>,
    pub branch_id: i32,
}

#[tauri::command]
pub fn check_medical_tickets_exist(
    state: State<'_, AppState>,
    data: Vec<MedicalTicket>,
) -> Result<Vec<ExistingTicketKey>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut found: Vec<ExistingTicketKey> = Vec::new();

    // Cross-family conflicts (weekly صباحي/مسائي ↔ monthly موحد) are reported
    // ONCE per identity, not once per payload row, so a weekly pair never flags
    // the same stored موحد row twice.
    let mut cross_family_seen: std::collections::HashSet<
        (String, i32, i32, Option<i32>, Option<i32>, String, bool),
    > = std::collections::HashSet::new();

    for item in data {
        let supported = item.is_supported_clinic.unwrap_or(false);
        let cat = if item.category.is_empty() { "عام".to_string() } else { item.category.clone() };
        let week = item.week_number.unwrap_or(1);
        let branch_id = item.branch_id.unwrap_or(1);
        let is_unified = item.period.contains("موحد");

        // ═══ 1) Same-period, value-aware check ═════════════════════════════
        // Same identity as save_medical_tickets_bulk (entry_date excluded).
        let mut sql = "SELECT tickets_56b, tickets_56c FROM medical_tickets WHERE dispense_month = ? AND period = ? AND category = ? AND week_number = ? AND branch_id = ? AND is_supported_clinic = ?".to_string();
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

        let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
        let existing: Option<(i32, i32)> = conn
            .query_row(&sql, params_ref.as_slice(), |r| Ok((r.get(0)?, r.get(1)?)))
            .ok();

        // Value-aware comparison against the period's EFFECTIVE total:
        //   - An incoming 'عام' (aggregate, quick entry) row must match the
        //     SUM of the existing per-category rows (regular page) when no
        //     'عام' row exists yet — quick entry writes the sum of the four
        //     categories, so the two pages must not silently disagree.
        //   - An incoming category row is also protected when an aggregate
        //     'عام' row already covers the same period.
        let mut effective = existing;
        if !supported && effective.is_none() {
            effective = free_ticket_category_sum(
                conn,
                &item.dispense_month, &item.period, week, branch_id,
                item.clinic_id, item.area_id,
                cat == "عام", // sum the category rows for عام; the عام row for a category
            );
        }

        if let Some((stored_b, stored_c)) = effective {
            // Flag only when the incoming values would CHANGE the stored row.
            // (Supported rows store the count in tickets_56b with 56c = 0, the
            // same shape the frontend sends, so the direct comparison covers
            // both free and supported flows.)
            if stored_b != item.ticket_56b_count || stored_c != item.ticket_56c_count {
                found.push(ExistingTicketKey {
                    period: item.period.clone(),
                    category: cat.clone(),
                    week_number: week,
                    clinic_id: item.clinic_id,
                    area_id: item.area_id,
                    branch_id,
                });
            }
        }

        // ═══ 2) Cross-period-family check ═════════════════════════════════
        // Saving ANY weekly row (صباحي/مسائي) deletes the stored 'موحد' row of
        // the same identity, and saving a 'موحد' row deletes the stored weekly
        // rows (see save_medical_tickets_bulk). Warn when the OTHER family
        // already holds data, so switching entry systems never wipes saved
        // records silently — the user can then replace or skip.
        let identity_key = (
            item.dispense_month.clone(), week, branch_id,
            item.clinic_id, item.area_id, cat.clone(), supported,
        );
        if cross_family_seen.insert(identity_key) {
            // Category axis mirrors save_medical_tickets_bulk's DELETE:
            //   supported  → same category
            //   free عام   → any category (a عام save wipes all categories)
            //   free فئة   → the عام row OR that category's other-family rows
            let cat_clause = if supported {
                "category = ?".to_string()
            } else if cat == "عام" {
                "1 = 1".to_string()
            } else {
                "(category = 'عام' OR category = ?)".to_string()
            };
            let other_family = if is_unified {
                "period IN ('صباحي', 'مسائي')"
            } else {
                "period = 'موحد'"
            };
            let mut xs = format!(
                "SELECT COUNT(*) FROM medical_tickets \
                 WHERE dispense_month = ? AND week_number = ? AND branch_id = ? \
                 AND is_supported_clinic = ? AND {} AND {}",
                other_family, cat_clause,
            );
            let mut xp: Vec<Box<dyn rusqlite::ToSql>> = vec![
                Box::new(item.dispense_month.clone()), Box::new(week), Box::new(branch_id),
                Box::new(if supported { 1 } else { 0 }),
            ];
            if !supported && cat != "عام" {
                xp.push(Box::new(cat.clone()));
            }
            if let Some(cid) = item.clinic_id {
                xs.push_str(" AND clinic_id = ?");
                xp.push(Box::new(cid));
            } else {
                xs.push_str(" AND clinic_id IS NULL");
            }
            if let Some(aid) = item.area_id {
                xs.push_str(" AND area_id = ?");
                xp.push(Box::new(aid));
            } else {
                xs.push_str(" AND area_id IS NULL");
            }
            let xref: Vec<&dyn rusqlite::ToSql> = xp.iter().map(|b| b.as_ref()).collect();
            let other_count: i64 = conn
                .query_row(&xs, xref.as_slice(), |r| r.get(0))
                .unwrap_or(0);
            if other_count > 0 {
                // Report the STORED family so the label reads naturally
                // (e.g. "فترة الشهري" when a موحد row already exists).
                found.push(ExistingTicketKey {
                    period: if is_unified { "صباحي".to_string() } else { "موحد".to_string() },
                    category: cat,
                    week_number: week,
                    clinic_id: item.clinic_id,
                    area_id: item.area_id,
                    branch_id,
                });
            }
        }
    }

    Ok(found)
}

// ── عام ↔ فئات replacement guard ───────────────────────────────────────
// Returns the identity keys of free-ticket periods where saving would
// SILENTLY DELETE the opposite representation: entering 'عام' wipes the
// per-category rows (and vice versa) inside save_medical_tickets_bulk.
// Unlike the client-side records check, this queries the DB directly, so the
// warning can never be skipped by an unloaded/async frontend state.
#[derive(Serialize, Deserialize, Debug)]
pub struct GeneralCategoryConflict {
    pub period: String,
    pub week_number: i32,
    pub category: String,                    // the category being saved ('عام' or a specific one)
    pub existing_categories: Vec<String>,    // the categories that would be deleted
}

#[tauri::command]
pub fn check_general_category_conflicts(
    state: State<'_, AppState>,
    data: Vec<MedicalTicket>,
) -> Result<Vec<GeneralCategoryConflict>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut found: Vec<GeneralCategoryConflict> = Vec::new();

    for item in data {
        let supported = item.is_supported_clinic.unwrap_or(false);
        if supported { continue; } // عام↔فئات exists only for free tickets
        let cat = if item.category.is_empty() { "عام".to_string() } else { item.category.clone() };
        let week = item.week_number.unwrap_or(1);
        let branch_id = item.branch_id.unwrap_or(1);

        // Same identity as save_medical_tickets_bulk (entry_date excluded).
        // A 'عام' save looks for per-category rows; a category save looks for
        // the existing 'عام' aggregate row.
        let cat_clause = if cat == "عام" { "category <> 'عام'" } else { "category = 'عام'" };
        // ORDER BY keeps the warning message stable (e.g. "(هيئة، رضع)") across runs.
        let mut sql = format!(
            "SELECT DISTINCT category FROM medical_tickets \
             WHERE dispense_month = ? AND period = ? AND week_number = ? AND branch_id = ? \
             AND is_supported_clinic = 0 AND {} ORDER BY category",
            cat_clause
        );
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
            Box::new(item.dispense_month.clone()), Box::new(item.period.clone()), Box::new(week), Box::new(branch_id),
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

        let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
        let existing_categories: Vec<String> = {
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params_ref.as_slice(), |r| r.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            let mut cats = Vec::new();
            for row in rows {
                cats.push(row.map_err(|e| e.to_string())?);
            }
            cats
        };

        if !existing_categories.is_empty() {
            found.push(GeneralCategoryConflict {
                period: item.period.clone(),
                week_number: week,
                category: cat,
                existing_categories,
            });
        }
    }

    Ok(found)
}

// Sum (tickets_56b, tickets_56c) of free tickets matching the identity scope,
// restricted to the per-category rows (sum_categories = true) or to the 'عام'
// aggregate row (sum_categories = false).
fn free_ticket_category_sum(
    conn: &rusqlite::Connection,
    dispense_month: &str, period: &str, week: i32, branch_id: i32,
    clinic_id: Option<i32>, area_id: Option<i32>,
    sum_categories: bool,
) -> Option<(i32, i32)> {
    let cat_clause = if sum_categories { "category <> 'عام'" } else { "category = 'عام'" };
    let mut sql = format!(
        // NOTE: no COALESCE on purpose — when no rows match, plain SUM returns
        // NULL and query_row(...).ok() yields None, so the caller treats "no
        // existing aggregate/category total" as no conflict (a brand-new period
        // must never be flagged as already-entered).
        "SELECT SUM(tickets_56b), SUM(tickets_56c) FROM medical_tickets \
         WHERE dispense_month = ? AND period = ? AND week_number = ? AND branch_id = ? \
         AND is_supported_clinic = 0 AND {}",
        cat_clause
    );
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![
        Box::new(dispense_month.to_string()),
        Box::new(period.to_string()),
        Box::new(week),
        Box::new(branch_id),
    ];
    if let Some(cid) = clinic_id {
        sql.push_str(" AND clinic_id = ?");
        params.push(Box::new(cid));
    } else {
        sql.push_str(" AND clinic_id IS NULL");
    }
    if let Some(aid) = area_id {
        sql.push_str(" AND area_id = ?");
        params.push(Box::new(aid));
    } else {
        sql.push_str(" AND area_id IS NULL");
    }
    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    conn.query_row(&sql, params_ref.as_slice(), |r| Ok((r.get(0)?, r.get(1)?))).ok()
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_medical_tickets_report(
    state: State<'_, AppState>,
    branchId: Option<i32>,
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

    // Each level narrows the scope; when none is provided (all-branches mode
    // on the regular page) no level filter is applied at all.
    if let Some(cid) = clinicId {
        sql.push_str(" AND t.clinic_id = ?2");
        params.push(Box::new(cid));
    } else if let Some(aid) = areaId {
        sql.push_str(" AND t.area_id = ?2");
        params.push(Box::new(aid));
    } else if let Some(bid) = branchId {
        sql.push_str(" AND t.branch_id = ?2");
        params.push(Box::new(bid));
    }
    // None branchId + None area + None clinic → ALL branches (no filter).

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
