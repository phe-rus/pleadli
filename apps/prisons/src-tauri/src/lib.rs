mod commands;
mod db;
mod domain;
mod transport;

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("prisons") {
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
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("prisons.db");

            let vault_root = app
                .path()
                .document_dir()
                .or_else(|_| app.path().home_dir().map(|home| home.join("Documents")))
                .unwrap_or_else(|_| data_dir.join("vault"))
                .join("Pleadli Prisons");

            let db = tauri::async_runtime::block_on(db::connect(db_path, vault_root))?;

            #[cfg(debug_assertions)]
            {
                let pool = db.pool.clone();
                let vault_root = db.vault_root.clone();
                tauri::async_runtime::spawn(transport::dev_server::serve(pool, vault_root));
            }

            app.manage(db);

            let show_item = MenuItemBuilder::with_id("show", "Show Pleadli Prisons").build(app)?;
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
                        if let Some(window) = app.get_webview_window("prisons") {
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
                        if let Some(window) = app.get_webview_window("prisons") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::prisoners::create_prisoner,
            commands::prisoners::update_prisoner,
            commands::prisoners::list_prisoners,
            commands::prisoners::list_in_custody,
            commands::prisoners::get_prisoner,
            commands::releases::create_release,
            commands::releases::list_releases_for_prisoner,
            commands::court_productions::create_court_production,
            commands::court_productions::list_court_productions_for_prisoner,
            commands::court_productions::list_remand,
            commands::search::search,
            commands::attachments::add_attachment,
            commands::attachments::list_attachments,
            commands::attachments::delete_attachment,
            commands::attachments::get_attachment_data_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
