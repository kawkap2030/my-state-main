use crate::db::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::OptionalExtension;
use crate::commands::month_isolation::{
    enforce_isolation_lock, enforce_isolation_lock_guard, cleanup_isolation_lock_if_empty,
    validate_non_negative_f64, validate_strictly_positive_f64, validate_strictly_positive_i32,
};
use crate::commands::audit::log_action;

#[derive(Serialize, Deserialize, Debug)]
pub struct InsulinDispensed {
    pub id: Option<i32>,
    pub name: String,
    pub type_: String,
    pub unit: String,
    pub cases_count: i32,
    pub quantity: f64,
    pub price: f64,
    pub cost: f64,
    pub rate: f64,
    pub balance: f64,
    pub category: String,
    pub branch_id: i32,
    pub area_id: Option<i32>,
    pub clinic_id: Option<i32>,
    pub dispense_month: String, // YYYY-MM
    pub insulin_code_id: Option<i32>,
}

#[tauri::command]
pub fn save_insulin_dispensed(
    state: State<'_, AppState>,
    data: InsulinDispensed,
) -> Result<i32, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // --- 0. Negative value validation ---
    validate_strictly_positive_i32("عدد الحالات", data.cases_count)?;
    validate_strictly_positive_f64("سعر الوحدة", data.price)?;
    validate_non_negative_f64("الكمية", data.quantity)?;
    validate_non_negative_f64("التكلفة", data.cost)?;

    // --- 1. Global Month Isolation Lock ---
    let current_level = if data.clinic_id.is_some() { "clinic" } 
                        else if data.area_id.is_some() { "area" } 
                        else { "branch" };
    
    enforce_isolation_lock(conn, data.branch_id, &data.dispense_month, current_level, false)?;

    // --- 2. Triple-Layer Isolation Logic ---
    // If clinic_id is provided, check if record exists at Area or Branch level
    if let Some(c_id) = data.clinic_id {
        // Find area_id for this clinic if not provided or to verify
        let area_of_clinic: i32 = conn.query_row(
            "SELECT area_id FROM clinics WHERE id = ?1",
            [c_id],
            |row| row.get(0)
        ).map_err(|e| e.to_string())?;

        let exists_upper: bool = conn.query_row(
            "SELECT EXISTS(
                SELECT 1 FROM insulin_dispensed 
                WHERE name = ?1 AND dispense_month = ?2 AND branch_id = ?3 
                AND (
                    (clinic_id IS NULL AND area_id = ?4) OR 
                    (clinic_id IS NULL AND area_id IS NULL)
                )
             )",
            rusqlite::params![data.name, data.dispense_month, data.branch_id, area_of_clinic],
            |row| row.get(0)
        ).unwrap_or(false);

        if exists_upper {
            return Err("لا يمكن الإضافة للعيادة، يوجد سجل مسجل بالفعل لهذا الصنف على مستوى المنطقة أو الفرع لهذا الشهر.".to_string());
        }
    } else if let Some(a_id) = data.area_id {
        // Area level check: exists at Branch level OR any child Clinic?
        let exists_up_or_down: bool = conn.query_row(
            "SELECT EXISTS(
                SELECT 1 FROM insulin_dispensed 
                WHERE name = ?1 AND dispense_month = ?2 AND branch_id = ?3 
                AND (
                    (clinic_id IS NULL AND area_id IS NULL) OR 
                    (clinic_id IS NOT NULL AND area_id = ?4)
                )
             )",
            rusqlite::params![data.name, data.dispense_month, data.branch_id, a_id],
            |row| row.get(0)
        ).unwrap_or(false);

        if exists_up_or_down {
            return Err("لا يمكن الإضافة للمنطقة، يوجد سجل مسجل بالفعل لهذا الصنف على مستوى الفرع أو في إحدى عيادات هذه المنطقة.".to_string());
        }
    } else {
        // Branch level check: exists at any Area or Clinic inside this Branch?
        let exists_down: bool = conn.query_row(
            "SELECT EXISTS(
                SELECT 1 FROM insulin_dispensed 
                WHERE name = ?1 AND dispense_month = ?2 AND branch_id = ?3 
                AND (area_id IS NOT NULL OR clinic_id IS NOT NULL)
             )",
            rusqlite::params![data.name, data.dispense_month, data.branch_id],
            |row| row.get(0)
        ).unwrap_or(false);

        if exists_down {
            return Err("لا يمكن الإضافة للفرع، يوجد سجلات مسجلة بالفعل لهذا الصنف في مناطق أو عيادات تابعة لهذا الفرع.".to_string());
        }
    }

    // --- 3. Duplicate Record Check (Within Same Level) ---
    // Prevent exactly same record (same insulin, location, month, price,
    // category, type) — enforced on BOTH insert and update, excluding self.
    let exclude_id = data.id.unwrap_or(-1);
    let trimmed_name = data.name.trim().to_string();
    let trimmed_category = data.category.trim().to_string();

    let exists_duplicate: bool = conn.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM insulin_dispensed 
            WHERE (TRIM(name) = ?1 OR (insulin_code_id IS NOT NULL AND ?10 IS NOT NULL AND insulin_code_id = ?10))
            AND dispense_month = ?2 AND branch_id = ?3 
            AND (area_id IS ?4)
            AND (clinic_id IS ?5)
            AND ABS(price - ?6) < 0.001
            AND TRIM(category) = ?7 AND type = ?8
            AND id != ?9
         )",
        rusqlite::params![
            trimmed_name, 
            data.dispense_month, 
            data.branch_id, 
            data.area_id, 
            data.clinic_id,
            data.price,
            trimmed_category,
            data.type_,
            exclude_id,
            data.insulin_code_id
        ],
        |row| row.get(0)
    ).unwrap_or(false);

    if exists_duplicate {
        return Err("يوجد ادخال سابق للصنف بنفس السعر يمكنك مراجعة الصنف والتعديل عليه".to_string());
    }

    // --- 4. Mutual Exclusion: "الكل" (All) vs Individual Categories (Scope-Level) ---
    // Within a single type (مجاني OR مدعم) and a single hierarchy scope (branch/area/clinic)
    // and a single month, "الكل" and the individual categories are mutually exclusive.
    // Also, an individual category cannot be repeated for the same scope, and "الكل"
    // cannot be repeated for the same scope.
    const ALL_CATEGORY_NAME: &str = "الكل";
    let is_new_all = trimmed_category == ALL_CATEGORY_NAME;

    let type_label = {
        let t = data.type_.trim();
        if t.contains("مجان") || t.contains("مجاني") {
            "المجانية"
        } else if t.contains("مدعم") || t.contains("تجاري") {
            "المدعمة"
        } else {
            "المدخلة"
        }
    };

    // Records already stored for the same type + scope + month (any drug / any price).
    let scope_categories: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT DISTINCT TRIM(category)
             FROM insulin_dispensed
             WHERE type = ?1
               AND dispense_month = ?2 AND branch_id = ?3
               AND (area_id IS ?4)
               AND (clinic_id IS ?5)
               AND id != ?6"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(
            rusqlite::params![
                data.type_,
                data.dispense_month,
                data.branch_id,
                data.area_id,
                data.clinic_id,
                exclude_id
            ],
            |row| row.get::<_, String>(0)
        ).map_err(|e| e.to_string())?;
        let mut cats = Vec::new();
        for r in rows {
            cats.push(r.map_err(|e| e.to_string())?);
        }
        cats
    };

    if is_new_all {
        // Saving "الكل": no individual category may exist for the same scope.
        let has_individual = scope_categories.iter().any(|c| c != ALL_CATEGORY_NAME);
        if has_individual {
            return Err(
                format!(
                    "لا يمكن الإدخال الجماعي. توجد بيانات {} مدخلة مسبقًا لفئات مفردة لهذه الجهة خلال هذا الشهر.",
                    type_label
                )
            );
        }
        // Also "الكل" itself cannot be repeated.
        if scope_categories.iter().any(|c| c == ALL_CATEGORY_NAME) {
            return Err(
                format!(
                    "لا يمكن الإدخال. تم إدخال البيانات {} لجميع الفئات مسبقًا لهذه الجهة خلال هذا الشهر.",
                    type_label
                )
            );
        }
    } else {
        // Saving an individual category.
        // 1) "الكل" exists for same scope -> reject (mutual exclusion of "الكل" vs individual).
        if scope_categories.iter().any(|c| c == ALL_CATEGORY_NAME) {
            return Err(
                format!(
                    "لا يمكن الإدخال. تم إدخال البيانات {} لجميع الفئات مسبقًا لهذه الجهة خلال هذا الشهر.",
                    type_label
                )
            );
        }
        // NOTE: A repeated individual category is intentionally ALLOWED here because the
        // exact-duplicate (price-aware) check in step 3 already rejects same drug + type +
        // category + scope + month + price. unit_price is part of record identity, so the
        // same category at a DIFFERENT price is a valid, separate record.
    }

    if let Some(id) = data.id {
        // Update
        conn.execute(
            "UPDATE insulin_dispensed SET 
                name = ?1, type = ?2, unit = ?3, cases_count = ?4, quantity = ?5, price = ?6,
                cost = ?7, rate = ?8, balance = ?9, category = ?10, branch_id = ?11, area_id = ?12, clinic_id = ?13,
                dispense_month = ?14, insulin_code_id = ?15
             WHERE id = ?16",
            rusqlite::params![
                data.name,
                data.type_,
                data.unit,
                data.cases_count,
                data.quantity,
                data.price,
                data.cost,
                data.rate,
                data.balance,
                data.category,
                data.branch_id,
                data.area_id,
                data.clinic_id,
                data.dispense_month,
                data.insulin_code_id,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        
        // Audit log
        let _ = log_action(
            conn, None, "UPDATE", "insulin_dispensed",
            Some(&id.to_string()),
            Some(&format!("تعديل الإنسولين: {} للفرع {} شهر {} (كمية: {})", data.name, data.branch_id, data.dispense_month, data.quantity))
        );
        
        Ok(id)
    } else {
        // Insert
        conn.execute(
            "INSERT INTO insulin_dispensed (
                name, type, unit, cases_count, quantity, price, cost, rate, balance,
                category, branch_id, area_id, clinic_id, dispense_month, insulin_code_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            rusqlite::params![
                data.name,
                data.type_,
                data.unit,
                data.cases_count,
                data.quantity,
                data.price,
                data.cost,
                data.rate,
                data.balance,
                data.category,
                data.branch_id,
                data.area_id,
                data.clinic_id,
                data.dispense_month,
                data.insulin_code_id
            ],
        )
        .map_err(|e| e.to_string())?;
        let new_id = conn.last_insert_rowid() as i32;
        
        // Audit log
        let _ = log_action(
            conn, None, "INSERT", "insulin_dispensed",
            Some(&new_id.to_string()),
            Some(&format!("إضافة إنسولين: {} للفرع {} شهر {} (كمية: {})", data.name, data.branch_id, data.dispense_month, data.quantity))
        );
        
        Ok(new_id)
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_insulin_dispensed(
    state: State<'_, AppState>,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: String,
) -> Result<Vec<InsulinDispensed>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "SELECT id, name, type, unit, cases_count, quantity, price, cost, rate, balance, category, branch_id, area_id, clinic_id, dispense_month, insulin_code_id 
                    FROM insulin_dispensed 
                    WHERE dispense_month = ?1".to_string();
    
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(dispenseMonth)];

    if let Some(c_id) = clinicId {
        sql.push_str(" AND clinic_id = ?2");
        params.push(Box::new(c_id));
    } else if let Some(a_id) = areaId {
        sql.push_str(" AND area_id = ?2");
        params.push(Box::new(a_id));
    } else {
        sql.push_str(" AND branch_id = ?2");
        params.push(Box::new(branchId));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params_ref.as_slice(), |row| {
            Ok(InsulinDispensed {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                type_: row.get(2)?,
                unit: row.get(3)?,
                cases_count: row.get(4)?,
                quantity: row.get(5)?,
                price: row.get(6)?,
                cost: row.get(7)?,
                rate: row.get(8)?,
                balance: row.get(9)?,
                category: row.get(10)?,
                branch_id: row.get(11)?,
                area_id: row.get(12)?,
                clinic_id: row.get(13)?,
                dispense_month: row.get(14)?,
                insulin_code_id: row.get(15)?,
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
pub fn get_insulin_previous_prices(
    state: State<'_, AppState>,
    name: String,
) -> Result<Vec<f64>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn.prepare(
        "SELECT DISTINCT price 
         FROM insulin_dispensed 
         WHERE name = ?1 
         ORDER BY price DESC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(rusqlite::params![name], |row| {
        row.get::<_, f64>(0)
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn delete_insulin_dispensed(
    state: State<'_, AppState>,
    id: i32,
) -> Result<(), String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let rec: Option<(i32, Option<i32>, Option<i32>, String)> = conn.query_row(
        "SELECT branch_id, area_id, clinic_id, dispense_month 
         FROM insulin_dispensed WHERE id = ?1",
        [id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).optional().map_err(|e| e.to_string())?;

    let (branch_id, area_id, clinic_id, dispense_month) = match rec {
        Some(r) => r,
        None => return Err("السجل غير موجود".to_string()),
    };

    let current_level = if clinic_id.is_some() { "clinic" }
                        else if area_id.is_some() { "area" }
                        else { "branch" };
    enforce_isolation_lock_guard(conn, branch_id, &dispense_month, current_level)?;

    conn.execute("DELETE FROM insulin_dispensed WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    cleanup_isolation_lock_if_empty(conn, branch_id, &dispense_month)?;
    
    // Audit log
    let _ = log_action(
        conn, None, "DELETE", "insulin_dispensed",
        Some(&id.to_string()),
        Some(&format!("حذف سجل الإنسولين رقم {}", id))
    );
    
    Ok(())
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn get_insulin_dispensed_range(
    state: State<'_, AppState>,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    startMonth: String,
    endMonth: String,
) -> Result<Vec<InsulinDispensed>, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut sql = "SELECT id, name, type, unit, cases_count, quantity, price, cost, rate, balance, 
                          category, branch_id, area_id, clinic_id, dispense_month, insulin_code_id 
                   FROM insulin_dispensed 
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
        Ok(InsulinDispensed {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            type_: row.get(2)?,
            unit: row.get(3)?,
            cases_count: row.get(4)?,
            quantity: row.get(5)?,
            price: row.get(6)?,
            cost: row.get(7)?,
            rate: row.get(8)?,
            balance: row.get(9)?,
            category: row.get(10)?,
            branch_id: row.get(11)?,
            area_id: row.get(12)?,
            clinic_id: row.get(13)?,
            dispense_month: row.get(14)?,
            insulin_code_id: row.get(15)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[derive(Serialize)]
pub struct InsulinEntryCheckResult {
    pub allowed: bool,
    pub message: Option<String>,
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn check_insulin_entry_allowed(
    state: State<'_, AppState>,
    type_: String,
    branchId: i32,
    areaId: Option<i32>,
    clinicId: Option<i32>,
    dispenseMonth: String,
    allMode: bool,
    category: Option<String>,
) -> Result<InsulinEntryCheckResult, String> {
    let conn_guard = state.db.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    const ALL_CATEGORY_NAME: &str = "الكل";

    // Friendly label for the current type to build dynamic messages.
    let type_label = {
        let t = type_.trim();
        if t.contains("مجان") || t.contains("مجاني") {
            "المجانية"
        } else if t.contains("مدعم") || t.contains("تجاري") {
            "المدعمة"
        } else {
            "المدخلة"
        }
    };

    // Categories already stored for the same type + scope + month.
    let scope_categories: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT DISTINCT TRIM(category)
             FROM insulin_dispensed
             WHERE type = ?1
               AND dispense_month = ?2 AND branch_id = ?3
               AND (area_id IS ?4)
               AND (clinic_id IS ?5)"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(
            rusqlite::params![type_, dispenseMonth, branchId, areaId, clinicId],
            |row| row.get::<_, String>(0)
        ).map_err(|e| e.to_string())?;
        let mut cats = Vec::new();
        for r in rows {
            cats.push(r.map_err(|e| e.to_string())?);
        }
        cats
    };

    let has_all = scope_categories.iter().any(|c| c == ALL_CATEGORY_NAME);
    let has_individual = scope_categories.iter().any(|c| c != ALL_CATEGORY_NAME);

    if allMode {
        // Attempting "الكل".
        if has_individual {
            return Ok(InsulinEntryCheckResult {
                allowed: false,
                message: Some(
                    format!(
                        "لا يمكن الإدخال الجماعي.\nتوجد بيانات {} مدخلة مسبقًا لفئات مفردة لهذه الجهة خلال هذا الشهر.",
                        type_label
                    ),
                ),
            });
        }
        if has_all {
            return Ok(InsulinEntryCheckResult {
                allowed: false,
                message: Some(
                    format!(
                        "لا يمكن الإدخال.\nتم إدخال البيانات {} لجميع الفئات مسبقًا لهذه الجهة خلال هذا الشهر.",
                        type_label
                    ),
                ),
            });
        }
        return Ok(InsulinEntryCheckResult { allowed: true, message: None });
    }

    // Attempting a specific individual category.
    let target = category.unwrap_or_default().trim().to_string();
    if has_all {
        return Ok(InsulinEntryCheckResult {
            allowed: false,
            message: Some(
                format!(
                    "لا يمكن الإدخال.\nتم إدخال البيانات {} لجميع الفئات مسبقًا لهذه الجهة خلال هذا الشهر.",
                    type_label
                ),
            ),
        });
    }
    if !target.is_empty() && scope_categories.iter().any(|c| c == &target) {
        return Ok(InsulinEntryCheckResult {
            allowed: false,
            message: Some(
                format!(
                    "لا يمكن الإدخال.\nتم إدخال هذه الفئة {} مسبقًا لهذه الجهة خلال هذا الشهر.",
                    type_label
                ),
            ),
        });
    }
    Ok(InsulinEntryCheckResult { allowed: true, message: None })
}
