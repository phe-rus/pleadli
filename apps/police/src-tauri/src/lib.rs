mod commands;
mod db;
mod domain;
#[cfg(debug_assertions)]
mod server;

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
                tauri::async_runtime::spawn(server::serve(pool, vault_root));
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
            commands::attachments::list_attachments,
            commands::attachments::delete_attachment,
            commands::attachments::list_all_attachments,
            commands::attachments::get_attachment_route,
            commands::attachments::list_vault_directory,
            commands::search::search,
            commands::reports::get_reports_summary,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
