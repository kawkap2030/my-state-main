use rusqlite::OptionalExtension;

// ─── PHASE 2: Tiny shared helpers for the Free / Supported monthly dispensing ──
// CRUD. The two tables have DIFFERENT columns, so the save/read logic lives in
// the dedicated monthly_free.rs / monthly_supported.rs files. Only the truly
// common, table-agnostic pieces (logical-key resolution, the Branch-vs-Area/Clinic
// coexistence guard, and the structural level) are shared here to avoid copying.

/// Derive the structural entry level from the presence of clinic/area ids.
/// Highest specificity wins: clinic > area > branch.
pub fn level_from(area_id: Option<i32>, clinic_id: Option<i32>) -> &'static str {
    if clinic_id.is_some() {
        "clinic"
    } else if area_id.is_some() {
        "area"
    } else {
        "branch"
    }
}

/// Locate an existing row in `table` by its LOGICAL key
/// (branch_id + area_id + clinic_id + dispense_month), with correct NULL
/// handling for area/clinic. Returns None when no row matches the key.
pub fn resolve_id_by_logical_key(
    conn: &rusqlite::Connection,
    table: &str,
    branch_id: i32,
    dispense_month: &str,
    area_id: Option<i32>,
    clinic_id: Option<i32>,
) -> Result<Option<i32>, String> {
    let sql = format!(
        "SELECT id FROM {}
         WHERE branch_id = ?1 AND dispense_month = ?2
           AND ((?3 IS NULL AND area_id IS NULL) OR area_id = ?3)
           AND ((?4 IS NULL AND clinic_id IS NULL) OR clinic_id = ?4)
         LIMIT 1",
        table
    );
    conn.query_row(
        &sql,
        rusqlite::params![branch_id, dispense_month, area_id, clinic_id],
        |r| r.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// Coexistence guard, scoped to a SINGLE table: forbids a Branch-level total for
/// a branch+month from coexisting with Area/Clinic-level rows of that same
/// branch+month (and vice versa), and forbids an Area-level total for an area
/// from coexisting with Clinic-level rows of that same area+month (and vice
/// versa). Because it only inspects `table`, Free and Supported records never
/// conflict with each other.
pub fn enforce_coexistence(
    conn: &rusqlite::Connection,
    table: &str,
    branch_id: i32,
    dispense_month: &str,
    clinic_id: Option<i32>,
    area_id: Option<i32>,
    exclude_id: i32,
) -> Result<(), String> {
    let level = level_from(area_id, clinic_id);
    if level == "branch" {
        let exists_lower: i32 = conn
            .query_row(
                &format!(
                    "SELECT COUNT(*) FROM {}
                     WHERE branch_id = ?1 AND dispense_month = ?2 AND id != ?3
                       AND (area_id IS NOT NULL OR clinic_id IS NOT NULL)",
                    table
                ),
                rusqlite::params![branch_id, dispense_month, exclude_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists_lower > 0 {
            return Err("عذراً، توجد سجلات تفصيلية (مناطق أو عيادات) لهذا الفرع والشهر. لا يمكن إدخال إجمالي على مستوى الفرع منعاً لتضارب البيانات.".to_string());
        }
    } else {
        let exists_branch: i32 = conn
            .query_row(
                &format!(
                    "SELECT COUNT(*) FROM {}
                     WHERE branch_id = ?1 AND dispense_month = ?2 AND id != ?3
                       AND area_id IS NULL AND clinic_id IS NULL",
                    table
                ),
                rusqlite::params![branch_id, dispense_month, exclude_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists_branch > 0 {
            return Err("عذراً، توجد بيانات مجمعة على مستوى الفرع لهذا الشهر. لا يمكن إدخال سجلات مناطق أو عيادات لهذا الفرع منعاً للتكرار.".to_string());
        }

        // An Area-level total already contains its clinics, so it must not
        // coexist with a clinic row of that SAME area+month (and vice versa)
        // or the same quantities would be counted twice. Clinics of DIFFERENT
        // areas of the same branch stay allowed, and several distinct clinics
        // inside the same area stay allowed.
        if let Some(area) = area_id {
            let conflict_clause = if level == "clinic" {
                "area_id = ?4 AND clinic_id IS NULL"
            } else {
                "area_id = ?4 AND clinic_id IS NOT NULL"
            };
            let exists_area_clinic_conflict: i32 = conn
                .query_row(
                    &format!(
                        "SELECT COUNT(*) FROM {}
                         WHERE branch_id = ?1 AND dispense_month = ?2 AND id != ?3 AND {}",
                        table, conflict_clause
                    ),
                    rusqlite::params![branch_id, dispense_month, exclude_id, area],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if exists_area_clinic_conflict > 0 {
                return Err(if level == "clinic" {
                    "عذراً، توجد بيانات مجمعة على مستوى المنطقة لهذا الشهر. لا يمكن إدخال سجل عيادة تابعة لنفس المنطقة منعاً لتضارب البيانات.".to_string()
                } else {
                    "عذراً، توجد سجلات عيادات تابعة لنفس المنطقة في هذا الفرع والشهر. لا يمكن إدخال إجمالي على مستوى المنطقة منعاً لتضارب البيانات.".to_string()
                });
            }
        }
    }
    Ok(())
}

/// Test-only: build an in-memory DB mirroring the PHASE 1/2 tables the Free and
/// Supported commands touch: the two split tables with their UNIQUE indexes, and
/// the shared month-isolation lock table (needed by the isolation helpers).
#[cfg(test)]
pub fn test_db_with_new_tables() -> rusqlite::Connection {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "CREATE TABLE monthly_free_drugs_dispensed (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            branch_id INTEGER NOT NULL,
            area_id INTEGER NULL,
            clinic_id INTEGER NULL,
            dispense_month TEXT NOT NULL,
            drugs_free_authority REAL NOT NULL DEFAULT 0,
            drugs_free_students REAL NOT NULL DEFAULT 0,
            drugs_free_infants REAL NOT NULL DEFAULT 0,
            drugs_free_breadwinner_women REAL NOT NULL DEFAULT 0,
            notes TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL
        );
        CREATE UNIQUE INDEX uq_free_location_month
            ON monthly_free_drugs_dispensed (branch_id, COALESCE(area_id, -1), COALESCE(clinic_id, -1), dispense_month);
        CREATE TABLE monthly_supported_drugs_dispensed (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            branch_id INTEGER NOT NULL,
            area_id INTEGER NULL,
            clinic_id INTEGER NULL,
            dispense_month TEXT NOT NULL,
            drugs_supported_authority_value REAL NOT NULL DEFAULT 0,
            drugs_supported_authority_patient_share REAL NOT NULL DEFAULT 0,
            drugs_supported_students_value REAL NOT NULL DEFAULT 0,
            drugs_supported_students_patient_share REAL NOT NULL DEFAULT 0,
            drugs_supported_infants_value REAL NOT NULL DEFAULT 0,
            drugs_supported_infants_patient_share REAL NOT NULL DEFAULT 0,
            notes TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL
        );
        CREATE UNIQUE INDEX uq_supported_location_month
            ON monthly_supported_drugs_dispensed (branch_id, COALESCE(area_id, -1), COALESCE(clinic_id, -1), dispense_month);
        CREATE TABLE dispensing_month_isolation (
            branch_id INTEGER NOT NULL,
            dispense_month TEXT NOT NULL,
            isolation_level TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (branch_id, dispense_month)
        );
        ",
    )
    .unwrap();
    conn
}

/// Cross-table independence tests for PHASE 2: Free and Supported storage are
/// fully separate, so one must never conflict with, overwrite, or delete the other.
#[cfg(test)]
mod tests {
    use super::test_db_with_new_tables;
    use crate::commands::monthly_free::{
        delete_free_monthly_drugs_dispensed_core, save_free_monthly_drugs_dispensed_core,
        MonthlyFreeDrugsDispensed,
    };
    use crate::commands::monthly_supported::{
        delete_supported_monthly_drugs_dispensed_core, save_supported_monthly_drugs_dispensed_core,
        MonthlySupportedDrugsDispensed,
    };

    fn free_save(conn: &rusqlite::Connection, clinic: Option<i32>, value: f64) -> i32 {
        let area = if clinic.is_some() { Some(1) } else { None };
        save_free_monthly_drugs_dispensed_core(
            conn,
            &MonthlyFreeDrugsDispensed {
                id: None,
                clinic_id: clinic,
                area_id: area,
                branch_id: 1,
                dispense_month: "2026-08".to_string(),
                drugs_free_authority: value,
                drugs_free_students: 0.0,
                drugs_free_infants: 0.0,
                drugs_free_breadwinner_women: 0.0,
                notes: None,
            },
            true,
        )
        .unwrap()
    }

    fn free_update(conn: &rusqlite::Connection, id: i32, value: f64) -> i32 {
        save_free_monthly_drugs_dispensed_core(
            conn,
            &MonthlyFreeDrugsDispensed {
                id: Some(id),
                clinic_id: None,
                area_id: None,
                branch_id: 1,
                dispense_month: "2026-08".to_string(),
                drugs_free_authority: value,
                drugs_free_students: 0.0,
                drugs_free_infants: 0.0,
                drugs_free_breadwinner_women: 0.0,
                notes: None,
            },
            false,
        )
        .unwrap()
    }

    fn sup_save(conn: &rusqlite::Connection, clinic: Option<i32>, value: f64, share: f64) -> i32 {
        let area = if clinic.is_some() { Some(1) } else { None };
        save_supported_monthly_drugs_dispensed_core(
            conn,
            &MonthlySupportedDrugsDispensed {
                id: None,
                clinic_id: clinic,
                area_id: area,
                branch_id: 1,
                dispense_month: "2026-08".to_string(),
                drugs_supported_authority_value: value,
                drugs_supported_authority_patient_share: share,
                drugs_supported_students_value: 0.0,
                drugs_supported_students_patient_share: 0.0,
                drugs_supported_infants_value: 0.0,
                drugs_supported_infants_patient_share: 0.0,
                notes: None,
            },
            true,
        )
        .unwrap()
    }

    fn sup_update(conn: &rusqlite::Connection, id: i32, value: f64, share: f64) -> i32 {
        save_supported_monthly_drugs_dispensed_core(
            conn,
            &MonthlySupportedDrugsDispensed {
                id: Some(id),
                clinic_id: None,
                area_id: None,
                branch_id: 1,
                dispense_month: "2026-08".to_string(),
                drugs_supported_authority_value: value,
                drugs_supported_authority_patient_share: share,
                drugs_supported_students_value: 0.0,
                drugs_supported_students_patient_share: 0.0,
                drugs_supported_infants_value: 0.0,
                drugs_supported_infants_patient_share: 0.0,
                notes: None,
            },
            false,
        )
        .unwrap()
    }

    fn free_id(conn: &rusqlite::Connection) -> i32 {
        conn.query_row("SELECT id FROM monthly_free_drugs_dispensed WHERE dispense_month='2026-08'", [], |r| r.get(0)).unwrap()
    }
    fn sup_id(conn: &rusqlite::Connection) -> i32 {
        conn.query_row("SELECT id FROM monthly_supported_drugs_dispensed WHERE dispense_month='2026-08'", [], |r| r.get(0)).unwrap()
    }
    fn count(conn: &rusqlite::Connection, table: &str) -> i32 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {}", table), [], |r| r.get(0)).unwrap()
    }

    // Test 5 (most important): Free Clinic 1 + Month X AND Supported Clinic 1 +
    // Month X coexist with NO conflict (different physical tables).
    #[test]
    fn free_and_supported_same_clinic_same_month_coexist() {
        let conn = test_db_with_new_tables();
        free_save(&conn, Some(1), 50.0);
        sup_save(&conn, Some(1), 500.0, 100.0);
        assert_eq!(count(&conn, "monthly_free_drugs_dispensed"), 1);
        assert_eq!(count(&conn, "monthly_supported_drugs_dispensed"), 1);
    }

    // Test 6: editing Free does not change Supported.
    #[test]
    fn editing_free_does_not_change_supported() {
        let conn = test_db_with_new_tables();
        free_save(&conn, None, 100.0);
        sup_save(&conn, None, 777.0, 77.0);
        let sid = sup_id(&conn);
        free_update(&conn, free_id(&conn), 9999.0); // explicit Free Update only
        let sup_value: f64 = conn
            .query_row("SELECT drugs_supported_authority_value FROM monthly_supported_drugs_dispensed WHERE id=?1", [sid], |r| r.get(0))
            .unwrap();
        assert_eq!(sup_value, 777.0, "Supported must be untouched by Free edit");
    }

    // Test 7: editing Supported does not change Free.
    #[test]
    fn editing_supported_does_not_change_free() {
        let conn = test_db_with_new_tables();
        free_save(&conn, None, 111.0);
        sup_save(&conn, None, 777.0, 77.0);
        let fid = free_id(&conn);
        sup_update(&conn, sup_id(&conn), 8888.0, 88.0); // explicit Supported Update only
        let free_value: f64 = conn
            .query_row("SELECT drugs_free_authority FROM monthly_free_drugs_dispensed WHERE id=?1", [fid], |r| r.get(0))
            .unwrap();
        assert_eq!(free_value, 111.0, "Free must be untouched by Supported edit");
    }

    // Test 8: deleting Free leaves Supported intact.
    #[test]
    fn deleting_free_keeps_supported() {
        let conn = test_db_with_new_tables();
        free_save(&conn, None, 111.0);
        sup_save(&conn, None, 777.0, 77.0);
        delete_free_monthly_drugs_dispensed_core(&conn, free_id(&conn)).unwrap();
        assert_eq!(count(&conn, "monthly_free_drugs_dispensed"), 0);
        assert_eq!(count(&conn, "monthly_supported_drugs_dispensed"), 1);
    }

    // Test 9: deleting Supported leaves Free intact.
    #[test]
    fn deleting_supported_keeps_free() {
        let conn = test_db_with_new_tables();
        free_save(&conn, None, 111.0);
        sup_save(&conn, None, 777.0, 77.0);
        delete_supported_monthly_drugs_dispensed_core(&conn, sup_id(&conn)).unwrap();
        assert_eq!(count(&conn, "monthly_supported_drugs_dispensed"), 0);
        assert_eq!(count(&conn, "monthly_free_drugs_dispensed"), 1);
    }
}

