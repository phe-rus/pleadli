mod commands;
mod db;
mod domain;
mod transport;

pub struct RemoteServer(pub tokio::sync::Mutex<Option<transport::remote_server::RemoteServerHandle>>);
pub struct CloudflaredSidecar(pub tokio::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

pub fn run() {
    tauri::Builder::default()
        // Single-instance must be the first plugin registered — it needs
        // to intercept a second launch before anything else runs. With
        // one SQLite file as the only datastore, a second window writing
        // concurrently is a real corruption risk, not a cosmetic one.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("police") {
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: None }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                ])
                .build(),
        )
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("police.db");

            // The structured database stays in the app's own managed data
            // directory — the Police Vault (original files, generated
            // documents, imported material) is a separate concern and
            // belongs where an officer would actually go looking for it:
            // the OS's real Documents directory, resolved through Tauri's
            // own path API, never a hardcoded path.
            //
            // `document_dir()` fails with `UnknownPath` on Linux whenever
            // xdg-user-dirs hasn't registered `XDG_DOCUMENTS_DIR` (no
            // desktop environment ever having run `xdg-user-dirs-update`,
            // as on a bare Crostini/container setup) — a real environment
            // gap, not a rare edge case, so it falls back to the user's
            // home directory, and finally to the app's own data directory,
            // rather than crashing app setup entirely.
            let vault_root = app
                .path()
                .document_dir()
                .or_else(|_| app.path().home_dir().map(|home| home.join("Documents")))
                .unwrap_or_else(|_| data_dir.join("vault"))
                .join("Pleadli Police");

            let db = tauri::async_runtime::block_on(db::connect(db_path, vault_root))?;

            #[cfg(debug_assertions)]
            {
                let pool = db.pool.clone();
                let vault_root = db.vault_root.clone();
                tauri::async_runtime::spawn(transport::dev_server::serve(pool, vault_root));
            }

            // Remote access, if this station already had it turned on
            // (the setting persists across restarts). Off by default
            // otherwise, matching the app's offline-first default.
            let remote_settings = tauri::async_runtime::block_on(domain::officers::get_remote_access_settings(&db.pool))?;
            let initial_handle = if remote_settings.enabled {
                let app_handle = app.handle().clone();
                match tauri::async_runtime::block_on(transport::remote_server::start(
                    db.pool.clone(),
                    transport::remote_server::DEFAULT_PORT,
                    app_handle,
                )) {
                    Ok(handle) => Some(handle),
                    Err(e) => {
                        log::warn!("could not start remote-access server on launch: {e}");
                        None
                    }
                }
            } else {
                None
            };
            app.manage(RemoteServer(tokio::sync::Mutex::new(initial_handle)));

            app.manage(CloudflaredSidecar(tokio::sync::Mutex::new(None)));

            if remote_settings.enabled {
                let app_handle = app.handle().clone();
                let pool = db.pool.clone();
                tauri::async_runtime::spawn(async move {
                    let sidecar = app_handle.state::<CloudflaredSidecar>();
                    if let Err(e) = commands::cloudflare::start_sidecar_if_configured(&app_handle, &pool, &sidecar).await {
                        log::warn!("could not start cloudflared on launch: {e}");
                    }
                });
            }

            app.manage(db);

            // The window itself stays fully custom-chrome (decorations
            // off, its own drag region and traffic-light controls in the
            // toolbar) — a native OS menu bar would sit awkwardly on top
            // of that, so the tray is deliberately the only native menu
            // surface: a quick way back into the app, and a clean quit,
            // without a second window-management surface.
            let show_item = MenuItemBuilder::with_id("show", "Show Pleadli Police").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let tray_menu = MenuBuilder::new(app).items(&[&show_item, &quit_item]).build()?;

            let mut tray_builder = TrayIconBuilder::new().menu(&tray_menu);
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            tray_builder
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(window) = app.get_webview_window("police") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("police") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::people::create_person,
            commands::people::search_people,
            commands::people::get_person,
            commands::people::get_person_profile,
            commands::people::update_person,
            commands::people::set_person_headshot,
            commands::people::clear_person_headshot,
            commands::people::set_person_photo_from_path,
            commands::people::clear_person_photo,
            commands::station_diary::create_station_diary_entry,
            commands::station_diary::list_station_diary_entries,
            commands::station_diary::update_station_diary_entry,
            commands::incidents::create_incident,
            commands::incidents::list_incidents,
            commands::incidents::update_incident,
            commands::duty::create_duty_assignment,
            commands::duty::list_duty_assignments,
            commands::duty::update_duty_assignment,
            commands::station_assets::create_station_asset,
            commands::station_assets::list_station_assets,
            commands::station_assets::update_station_asset,
            commands::cases::create_case,
            commands::cases::list_cases,
            commands::cases::update_case,
            commands::cases::list_case_people,
            commands::cases::get_case_workspace,
            commands::statements::create_statement,
            commands::statements::list_statements,
            commands::statements::update_statement,
            commands::custody::create_custody_record,
            commands::custody::list_custody_records,
            commands::custody::update_custody_record,
            commands::bonds::create_bond,
            commands::bonds::list_bonds,
            commands::bonds::update_bond,
            commands::station_admin::get_station_profile,
            commands::station_admin::save_station_profile,
            commands::station_admin::create_station_establishment_member,
            commands::station_admin::update_station_establishment_member,
            commands::station_admin::list_station_establishment,
            commands::referrals::create_referral,
            commands::referrals::list_referrals,
            commands::referrals::update_referral,
            commands::charge_sheets::create_charge_sheet,
            commands::charge_sheets::list_charge_sheets,
            commands::charge_sheets::update_charge_sheet,
            commands::exhibits::create_exhibit,
            commands::exhibits::list_exhibits,
            commands::exhibits::update_exhibit,
            commands::exhibits::create_exhibit_movement,
            commands::exhibits::list_exhibit_movements,
            commands::attachments::add_attachment,
            commands::attachments::bulk_attach_files,
            commands::attachments::list_attachments,
            commands::attachments::delete_attachment,
            commands::attachments::list_all_attachments,
            commands::attachments::get_attachment_route,
            commands::attachments::list_vault_directory,
            commands::attachments::get_attachment_data_url,
            commands::officers::create_officer,
            commands::officers::update_officer,
            commands::officers::list_officers,
            commands::officers::list_remote_access_log,
            commands::officers::get_remote_access_settings,
            commands::officers::list_backup_alerts,
            commands::officers::acknowledge_backup_alert,
            commands::officers::list_active_backup_alerts,
            commands::officers::respond_to_backup_alert,
            commands::officers::end_backup_alert,
            commands::network::get_remote_access_status,
            commands::network::set_remote_access_enabled,
            commands::network::get_local_network_info,
            commands::network::get_local_pairing_qr,
            commands::cloudflare::save_cloudflare_config,
            commands::cloudflare::get_cloudflare_config,
            commands::cloudflare::get_cloudflare_tunnel_state,
            commands::search::search,
            commands::reports::get_reports_summary,
            commands::documents::export_all_markdown,
            commands::documents::export_all_xlsx,
            commands::documents::export_all_pdf,
            commands::documents::export_all_docx,
            commands::documents::export_person_document,
            commands::documents::export_case_document,
            commands::documents::export_charge_sheet_document,
            commands::import::import_fields,
            commands::import::parse_import_file,
            commands::import::resolve_people,
            commands::import::resolve_cases,
            commands::import::bulk_import,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
