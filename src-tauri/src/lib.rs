mod commands;
mod db;

use tauri::Emitter;

/// Helper: emit a splash progress event to the frontend
fn splash_progress(app: &tauri::AppHandle, message: &str) {
    let _ = app.emit("splash:progress", message);
    println!("[splash] {}", message);
}

/// Helper: signal splash complete and dismiss the splash screen
fn splash_complete(app: &tauri::AppHandle) {
    let _ = app.emit("splash:complete", "");
    println!("[splash] complete — hiding splash screen");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ── WebView2 stability fix ─────────────────────────────────────────
    if std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_err() {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--disable-gpu --disable-features=msWebView2BrowserHitTransparent",
        );
    }

    tauri::Builder::default()
        .manage(db::AppState {
            db: std::sync::Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::login,
            commands::audit::get_audit_logs,
            commands::audit::log_frontend_action,
            commands::hierarchy::get_branches,
            commands::hierarchy::get_areas,
            commands::hierarchy::get_areas_all,
            commands::hierarchy::get_clinics,
            commands::hierarchy::get_clinics_all,
            commands::hierarchy::add_branch,
            commands::hierarchy::update_branch,
            commands::hierarchy::delete_branch,
            commands::hierarchy::bulk_delete_branches,
            commands::hierarchy::add_area,
            commands::hierarchy::update_area,
            commands::hierarchy::delete_area,
            commands::hierarchy::bulk_delete_areas,
            commands::hierarchy::add_clinic,
            commands::hierarchy::update_clinic,
            commands::hierarchy::delete_clinic,
            commands::hierarchy::bulk_delete_clinics,
            commands::hierarchy::bulk_add_branches,
            commands::hierarchy::bulk_add_areas,
            commands::hierarchy::bulk_add_clinics,
            // Drug Categories & Drugs
            commands::master_data::get_drug_categories,
            commands::master_data::add_drug_category,
            commands::master_data::update_drug_category,
            commands::master_data::delete_drug_category,
            commands::master_data::bulk_add_drug_categories,
            commands::master_data::bulk_delete_drug_categories,
            commands::master_data::get_drugs,
            commands::master_data::add_drug,
            commands::master_data::update_drug,
            commands::master_data::delete_drug,
            commands::master_data::bulk_add_drugs,
            commands::master_data::bulk_delete_drugs,
            commands::master_data::get_drug_units,
            commands::master_data::add_drug_unit,
            commands::master_data::update_drug_unit,
            commands::master_data::delete_drug_unit,
            commands::master_data::bulk_add_drug_units,
            commands::master_data::bulk_delete_drug_units,
            commands::master_data::get_insulin_codes,
            commands::master_data::add_insulin_code,
            commands::master_data::update_insulin_code,
            commands::master_data::delete_insulin_code,
            commands::master_data::bulk_add_insulin_codes,
            commands::master_data::bulk_delete_insulin_codes,
            commands::master_data::get_insulin_categories,
            commands::master_data::add_insulin_category,
            commands::master_data::update_insulin_category,
            commands::master_data::delete_insulin_category,
            commands::master_data::bulk_add_insulin_categories,
            commands::master_data::bulk_delete_insulin_categories,
            commands::master_data::get_insulin_types,
            commands::master_data::add_insulin_type,
            commands::master_data::update_insulin_type,
            commands::master_data::delete_insulin_type,
            commands::master_data::bulk_add_insulin_types,
            commands::master_data::bulk_delete_insulin_types,
            commands::master_data::get_insulin_units,
            commands::master_data::add_insulin_unit,
            commands::master_data::update_insulin_unit,
            commands::master_data::delete_insulin_unit,
            commands::master_data::bulk_add_insulin_units,
            commands::master_data::bulk_delete_insulin_units,
            // Supply Categories & Supplies
            commands::master_data::get_supply_categories,
            commands::master_data::add_supply_category,
            commands::master_data::update_supply_category,
            commands::master_data::delete_supply_category,
            commands::master_data::bulk_add_supply_categories,
            commands::master_data::bulk_delete_supply_categories,
            commands::master_data::get_supplies,
            commands::master_data::add_supply,
            commands::master_data::update_supply,
            commands::master_data::delete_supply,
            commands::master_data::bulk_add_supplies,
            commands::master_data::bulk_delete_supplies,
            // Judicial Patients & Medicines
            commands::master_data::get_judicial_patients,
            commands::master_data::add_judicial_patient,
            commands::master_data::update_judicial_patient,
            commands::master_data::delete_judicial_patient,
            commands::master_data::bulk_delete_judicial_patients,
            commands::master_data::add_patient_pdf,
            commands::master_data::get_patient_pdfs_list,
            commands::master_data::get_patient_pdf_data,
            commands::master_data::delete_patient_pdf,
            commands::master_data::get_judicial_medicines,
            commands::master_data::add_judicial_medicine,
            commands::master_data::update_judicial_medicine,
            commands::master_data::delete_judicial_medicine,
            commands::master_data::bulk_add_judicial_medicines,
            commands::master_data::bulk_delete_judicial_medicines,
            commands::master_data::get_patient_medicines,
            commands::master_data::save_patient_medicines,
            // Drug Groups
            commands::master_data::get_drug_groups,
            commands::master_data::add_drug_group_code,
            commands::master_data::update_drug_group_code,
            commands::master_data::delete_drug_group_code,
            commands::master_data::bulk_add_drug_group_codes,
            commands::master_data::bulk_delete_drug_group_codes,
            // Dispensing Operations
            commands::monthly_dispensed::save_monthly_drugs_dispensed,
            commands::monthly_dispensed::get_monthly_drugs_dispensed,
            commands::monthly_dispensed::save_detailed_drug_dispensed,
            commands::monthly_dispensed::get_detailed_drug_dispensed,
            commands::monthly_dispensed::update_detailed_drug_dispensed,
            commands::monthly_dispensed::delete_detailed_drug_dispensed,
            commands::monthly_dispensed::get_drug_previous_prices,
            commands::monthly_dispensed::get_detailed_supplies_report,
            commands::monthly_dispensed::get_detailed_drug_dispensed_range,
            commands::monthly_dispensed::get_all_monthly_drugs_dispensed,
            commands::monthly_dispensed::get_all_monthly_supplies_dispensed,
            commands::monthly_dispensed::get_report_monthly_drugs_dispensed,
            commands::monthly_dispensed::get_report_monthly_supplies_dispensed,
            commands::monthly_dispensed::save_detailed_supply_dispensed,
            commands::monthly_dispensed::delete_monthly_drugs_dispensed,
            commands::monthly_dispensed::delete_monthly_supplies_dispensed,
            commands::insulin_dispensed::save_insulin_dispensed,
            commands::insulin_dispensed::get_insulin_dispensed,
            commands::insulin_dispensed::get_insulin_previous_prices,
            commands::insulin_dispensed::delete_insulin_dispensed,
            commands::insulin_dispensed::get_insulin_dispensed_range,
            commands::drug_groups::save_drug_group,
            commands::drug_groups::save_drug_group_cost,
            commands::drug_groups::get_drug_groups_report,
            commands::drug_groups::get_drug_groups_report_range,
            commands::drug_groups::save_drug_group_costs_bulk,
            commands::drug_groups::get_exact_drug_groups,
            commands::drug_groups::delete_drug_group,
            commands::judicial_dispensed::save_judicial_dispensed,
            commands::judicial_dispensed::get_judicial_dispensed,
            commands::judicial_dispensed::get_judicial_dispensed_range,
            commands::judicial_dispensed::delete_judicial_dispensed,
            commands::tickets::save_medical_tickets,
            commands::tickets::save_medical_tickets_bulk,
            commands::tickets::get_medical_tickets_report,
            commands::tickets::delete_medical_tickets,
            commands::reports::get_analytical_report,
            commands::reports::get_financial_report,
            commands::reports::get_cost_breakdown_report,
            commands::reports::get_top_items_report,
            commands::reports::get_supplies_dispensed_range,
            commands::reports::get_monthly_drugs_dispensed_range,
            commands::reports::get_executive_report_summary,
            commands::reports::get_demographic_report,
            commands::reports::get_anomaly_report,
            commands::reports::get_pivot_data,
            commands::reports::get_data_quality_report,
            commands::reports::get_judicial_analytics,
            commands::reports::get_compliance_report,
            // Reconciliation Panel for comparing financial data
            commands::reports::get_reconciliation_report,
            commands::month_isolation::get_month_isolation_rule,
            commands::month_isolation::set_month_isolation_rule,
            commands::month_isolation::check_month_data_exists,
            commands::month_isolation::clear_month_isolation_rule,
            commands::dashboard::get_dashboard_summary,
            commands::dashboard::get_dashboard_trend,
            commands::dashboard::get_ytd_summary,
            commands::dashboard::get_missing_months,
            commands::dashboard::get_recent_activity,
            commands::dashboard::get_latest_dispense_month,
            commands::locks::get_months_with_data,
            commands::locks::get_manual_locked_months,
            commands::locks::toggle_month_lock,
            commands::admin::get_backup_files,
            commands::admin::create_backup,
            commands::admin::delete_backup,
            commands::admin::delete_multiple_backups,
            commands::admin::restore_backup,
            commands::admin::get_data_management_summary,
            commands::admin::open_backups_folder,
            commands::admin::clear_data,
            commands::admin::get_db_size,
            commands::admin::check_db_integrity,
            commands::admin::import_backup,
            commands::admin::auto_backup_with_rotation,
            commands::admin::auto_backup,
            commands::admin::save_backup_note,
            commands::admin::get_backup_notes,
            commands::admin::export_table_to_csv,
            commands::admin::export_to_excel,
            commands::admin::show_save_dialog,
            commands::admin::write_binary_file,
            // User Management
            commands::users::get_users,
            commands::users::add_user,
            commands::users::update_user,
            commands::users::delete_user,
            commands::users::change_user_password,
            commands::users::get_user_count,
            commands::users::reset_admin_password,
            // Excel Import
            commands::excel_import::preview_excel_file,
            commands::excel_import::get_excel_sheets,
            commands::excel_import::import_monthly_drugs_from_excel,
            commands::excel_import::import_detailed_drugs_from_excel,
            commands::excel_import::export_import_template,
            // Branch Batch Summary
            commands::branch_batch::save_branch_batch_summary,
            commands::branch_batch::get_branch_batch_summary,
            // Tickets Batch
            commands::tickets_batch::get_tickets_batch_for_branch,
            commands::tickets_batch::save_tickets_batch_bulk,
            // Performance Metrics
            commands::performance::get_performance_metrics,
            // Audit Log - add log_frontend_action for frontend action tracking
            commands::audit::log_frontend_action,
            // Report Signatures
            commands::signatures::get_report_signatures,
            commands::signatures::save_report_signatures,
            // Export Presets
            commands::signatures::get_export_presets,
            commands::signatures::save_export_preset,
            commands::signatures::delete_export_preset,
            commands::signatures::set_default_export_preset,
            // Scheduled Reports
            commands::scheduled_reports::get_scheduled_reports,
            commands::scheduled_reports::save_scheduled_report,
            commands::scheduled_reports::delete_scheduled_report,
            commands::scheduled_reports::toggle_scheduled_report,
            commands::scheduled_reports::run_scheduled_report_now,
            commands::scheduled_reports::get_report_history,
            commands::scheduled_reports::check_due_reports,
        ])
        .setup(|app| {
            let handle = app.handle();

            if cfg!(debug_assertions) {
                handle.plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // ═══ Phase 1: Database initialization ═══
            splash_progress(handle, "init-db");
            println!("[setup] initializing database...");
            if let Err(e) = db::init_db(handle) {
                eprintln!("Failed to initialize database: {}", e);
            }
            splash_progress(handle, "schema");
            println!("[setup] database init complete");

            // ═══ Phase 2: Skip window check ═══
            if std::env::var("MYSTATS_SKIP_WINDOW").ok().as_deref() == Some("1") {
                println!("[setup] MYSTATS_SKIP_WINDOW=1 — skipping window creation");
                println!("[setup] setup finished (headless)");
                return Ok(());
            }

            // ═══ Phase 3: Create main window ═══
            splash_progress(handle, "window");
            println!("[setup] creating main window...");
            let url = if std::env::var("MYSTATS_BLANK_WINDOW").ok().as_deref() == Some("1") {
                tauri::WebviewUrl::External(
                    "data:text/html,<html><body style='font-family:sans-serif;padding:2rem'>OK</body></html>"
                        .parse()
                        .expect("valid data url"),
                )
            } else if cfg!(debug_assertions) {
                tauri::WebviewUrl::External(
                    "http://localhost:5173/"
                        .parse()
                        .expect("valid dev url"),
                )
            } else {
                tauri::WebviewUrl::App("index.html".into())
            };

            let window = tauri::WebviewWindowBuilder::new(app, "main", url)
                .title("نظام إحصائيات الأدوية والمستلزمات الطبية")
                .inner_size(1200.0, 800.0)
                .resizable(true)
                .visible(true)
                .build();

            match window {
                Ok(_w) => println!("[setup] window created OK"),
                Err(e) => eprintln!("[setup] FAILED to create window: {}", e),
            }

            // ═══ Done ═══
            splash_progress(handle, "done");
            splash_complete(handle);
            println!("[setup] setup finished");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
