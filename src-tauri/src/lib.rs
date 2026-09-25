mod commands;
mod db;
mod password;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

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

/// Handshake state between the frontend splash and the Rust backend.
///
/// Tauri 2.10.x does NOT buffer emitted events for webviews that have no
/// registered JS listener — `emit_js_filter` silently drops them. `setup()`
/// runs synchronously before the webview finishes loading, so emitting
/// `splash:complete` there used to be lost and the splash stuck at 95%.
/// We now emit the completion events only after BOTH sides are ready:
///   - `backend_ready`  : set once `init_db` finished (in setup)
///   - `listener_ready` : set when the frontend invokes `splash_listener_ready`
///                        AFTER its real `splash:complete` listener registered
struct SplashState {
    backend_ready: AtomicBool,
    backend_failed: AtomicBool,
    listener_ready: AtomicBool,
}

/// Frontend handshake: called after the `splash:progress`/`splash:complete`
/// JS listeners are registered. Only then does the backend emit them, so
/// the events can never be dropped for having no registered listener.
#[tauri::command]
fn splash_listener_ready(app: tauri::AppHandle, state: tauri::State<'_, SplashState>) {
    state.listener_ready.store(true, Ordering::SeqCst);
    println!("[splash] listener-ready received from frontend");
    if state.backend_ready.load(Ordering::SeqCst) {
        splash_progress(&app, "done");
        splash_complete(&app);
    } else if state.backend_failed.load(Ordering::SeqCst) {
        // DB init failed: dismiss the splash without claiming success.
        // The existing db_error mechanism (ConnectionStatusBar) shows the error.
        println!("[splash] backend init had failed — dismissing splash (db_error shown in UI)");
        splash_complete(&app);
    }
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
            db_error: std::sync::Mutex::new(None),
            current_user_id: std::sync::Mutex::new(None),
        })
        .manage(SplashState {
            backend_ready: AtomicBool::new(false),
            backend_failed: AtomicBool::new(false),
            listener_ready: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            splash_listener_ready,
            commands::auth::login,
            commands::auth::logout,
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
            commands::monthly_dispensed::save_detailed_drug_dispensed,
            commands::monthly_dispensed::get_detailed_drug_dispensed,
            commands::monthly_dispensed::update_detailed_drug_dispensed,
            commands::monthly_dispensed::delete_detailed_drug_dispensed,
            commands::monthly_dispensed::get_drug_previous_prices,
            commands::monthly_dispensed::get_detailed_supplies_report,
            commands::monthly_dispensed::get_detailed_drug_dispensed_range,
            commands::monthly_dispensed::get_all_monthly_supplies_dispensed,
            commands::monthly_dispensed::get_report_monthly_supplies_dispensed,
            commands::monthly_dispensed::save_detailed_supply_dispensed,
            commands::monthly_dispensed::delete_monthly_supplies_dispensed,
            // PHASE 2: Independent Free / Supported monthly CRUD
            commands::monthly_free::save_free_monthly_drugs_dispensed,
            commands::monthly_free::get_free_monthly_drugs_dispensed,
            commands::monthly_free::get_all_free_monthly_drugs_dispensed,
            commands::monthly_free::get_report_free_monthly_drugs_dispensed,
            commands::monthly_free::delete_free_monthly_drugs_dispensed,
            commands::monthly_free::get_free_monthly_drugs_dispensed_range,
            commands::monthly_supported::save_supported_monthly_drugs_dispensed,
            commands::monthly_supported::get_supported_monthly_drugs_dispensed,
            commands::monthly_supported::get_all_supported_monthly_drugs_dispensed,
            commands::monthly_supported::get_report_supported_monthly_drugs_dispensed,
            commands::monthly_supported::delete_supported_monthly_drugs_dispensed,
            commands::monthly_supported::get_supported_monthly_drugs_dispensed_range,
            commands::insulin_dispensed::save_insulin_dispensed,
            commands::insulin_dispensed::get_insulin_dispensed,
            commands::insulin_dispensed::get_insulin_previous_prices,
            commands::insulin_dispensed::delete_insulin_dispensed,
            commands::insulin_dispensed::get_insulin_dispensed_range,
            commands::insulin_dispensed::check_insulin_entry_allowed,
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
            commands::tickets::check_medical_tickets_exist,
            commands::tickets::check_general_category_conflicts,
            commands::tickets::get_medical_tickets_report,
            commands::tickets::delete_medical_tickets,
            commands::reports::get_analytical_report,
            commands::reports::get_financial_report,
            commands::reports::get_cost_breakdown_report,
            commands::reports::get_top_items_report,
            commands::reports::get_supplies_dispensed_range,
            commands::reports::get_executive_report_summary,
            commands::reports::get_demographic_report,
            commands::reports::get_anomaly_report,
            commands::reports::get_pivot_data,
            commands::reports::get_data_quality_report,
            commands::reports::get_judicial_analytics,
            commands::reports::get_compliance_report,
            // Reconciliation Panel for comparing financial data
            commands::reports::get_reconciliation_report,
            commands::reports::get_reconciliation_drug_details,
            commands::reports::get_reconciliation_insulin_details,
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
            commands::locks::verify_admin_password,
            commands::admin::get_db_status,
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
            commands::admin::delete_file,
            commands::admin::pick_folder,
            // User Management
            commands::users::get_users,
            commands::users::add_user,
            commands::users::update_user,
            commands::users::delete_user,
            commands::users::change_user_password,
            commands::users::get_user_count,
            commands::users::create_first_admin,
            commands::users::create_recovery_code,
            commands::users::recover_password,
            commands::users::has_recovery_code,
            // Excel Import
            commands::excel_import::preview_excel_file,
            commands::excel_import::get_excel_sheets,
            commands::excel_import::import_monthly_drugs_from_excel,
            commands::excel_import::import_detailed_drugs_from_excel,
            commands::excel_import::export_import_template,
            // Tickets Batch
            commands::tickets_batch::get_tickets_batch_for_branch,
            commands::tickets_batch::save_tickets_batch_bulk,
            commands::tickets_batch::delete_medical_tickets_by_scope,
            // Performance Metrics
            commands::performance::get_performance_metrics,
            // Audit Log - add log_frontend_action for frontend action tracking
            commands::audit::log_frontend_action,
            // Report Signatures
            // Export Presets
            commands::signatures::get_export_presets,
            commands::signatures::save_export_preset,
            commands::signatures::delete_export_preset,
            commands::signatures::set_default_export_preset,
            commands::signatures::reorder_export_presets,
            // Scheduled Reports
            commands::scheduled_reports::get_scheduled_reports,
            commands::scheduled_reports::save_scheduled_report,
            commands::scheduled_reports::delete_scheduled_report,
            commands::scheduled_reports::toggle_scheduled_report,
            commands::scheduled_reports::run_scheduled_report_now,
            commands::scheduled_reports::complete_scheduled_report,
            commands::scheduled_reports::fail_scheduled_report,
            commands::scheduled_reports::cancel_scheduled_report,
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

            // ═══ Phase 1: Skip window check (headless mode) ═══
            if std::env::var("MYSTATS_SKIP_WINDOW").ok().as_deref() == Some("1") {
                println!("[setup] MYSTATS_SKIP_WINDOW=1 — running headless");
                if let Err(e) = db::init_db(handle) {
                    eprintln!("Failed to initialize database: {}", e);
                }
                println!("[setup] setup finished (headless)");
                return Ok(());
            }

            // ═══ Phase 2: Create main window FIRST ═══
            // The window loads index.html which shows the splash screen and starts
            // listening for 'splash:progress' and 'splash:complete' events.
            // By creating the window before heavy DB work, the splash JavaScript
            // is ready to receive those events.
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
                    "http://localhost:5174/"
                        .parse()
                        .expect("valid dev url"),
                )
            } else {
                tauri::WebviewUrl::App("index.html".into())
            };

            let window = tauri::WebviewWindowBuilder::new(app, "main", url)
                .title("منظومة إحصائيات الأدوية والمستلزمات الطبية")
                .background_color(tauri::webview::Color(15, 23, 42, 255))
                .inner_size(1200.0, 800.0)
                .resizable(true)
                .visible(false)
                .build();

            match window {
                Ok(ref w) => {
                    println!("[setup] window created OK");
                    let _ = w.show();
                }
                Err(e) => eprintln!("[setup] FAILED to create window: {}", e),
            }

            // ═══ Phase 3: Database initialization (with progress events) ═══
            // IMPORTANT: Tauri 2.10.x does NOT buffer events for webviews that
            // have no registered JS listener — `emit_js_filter` drops them.
            // The window was created above but its JS may still be loading, so
            // emitting 'splash:complete' right here could be silently lost.
            // Instead we record backend readiness and let the frontend handshake
            // (splash_listener_ready) trigger the actual completion emit, so the
            // events are only sent once a real listener exists.
            splash_progress(handle, "init-db");
            println!("[setup] initializing database...");
            let init_result = db::init_db(handle);
            splash_progress(handle, "schema");
            println!("[setup] database init finished");

            let splash_state = app.state::<SplashState>();
            if init_result.is_ok() {
                splash_state.backend_ready.store(true, Ordering::SeqCst);
                println!("[splash] backend ready");
                if splash_state.listener_ready.load(Ordering::SeqCst) {
                    splash_progress(handle, "done");
                    splash_complete(handle);
                }
            } else {
                // DB init failed — do NOT claim the backend is ready. The splash
                // will still be dismissed (via the frontend handshake path) so
                // the app does not freeze silently; the existing db_error
                // mechanism (ConnectionStatusBar) surfaces the failure.
                splash_state.backend_failed.store(true, Ordering::SeqCst);
                println!("[splash] backend init FAILED — waiting for listener to dismiss splash");
                if splash_state.listener_ready.load(Ordering::SeqCst) {
                    splash_complete(handle);
                }
            }

            println!("[setup] setup finished");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
