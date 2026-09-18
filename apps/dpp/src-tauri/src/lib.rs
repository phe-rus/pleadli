mod commands;
mod db;
mod domain;
mod transport;

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        // Single-instance must be the first plugin registered — it needs
        // to intercept a second launch before anything else runs. With
        // one SQLite file as the only datastore, a second window writing
        // concurrently is a real corruption risk, not a cosmetic one.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("dpp") {
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
            let db_path = data_dir.join("dpp.db");

            // The structured database stays in the app's own managed data
            // directory; the DPP Vault (attached documents) belongs where a
            // prosecutor would actually go looking for it — the OS's real
            // Documents directory. Same fallback chain as Police, for the
            // same reason: `document_dir()` fails with `UnknownPath` on a
            // bare Linux setup with no `xdg-user-dirs-update` ever run.
            let vault_root = app
                .path()
                .document_dir()
                .or_else(|_| app.path().home_dir().map(|home| home.join("Documents")))
                .unwrap_or_else(|_| data_dir.join("vault"))
                .join("Pleadli DPP");

            let db = tauri::async_runtime::block_on(db::connect(db_path, vault_root))?;

            #[cfg(debug_assertions)]
            {
                let pool = db.pool.clone();
                let vault_root = db.vault_root.clone();
                tauri::async_runtime::spawn(transport::dev_server::serve(pool, vault_root));
            }

            app.manage(db);

            // Custom window chrome (decorations off) means a native OS menu
            // bar would sit awkwardly on top of it — the tray is
            // deliberately the only native menu surface, same as Police.
            let show_item = MenuItemBuilder::with_id("show", "Show Pleadli DPP").build(app)?;
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
                        if let Some(window) = app.get_webview_window("dpp") {
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
                        if let Some(window) = app.get_webview_window("dpp") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::people::create_person,
            commands::people::update_person,
            commands::people::search_people,
            commands::people::get_person,
            commands::prosecution_files::create_prosecution_file,
            commands::prosecution_files::update_prosecution_file,
            commands::prosecution_files::list_prosecution_files,
            commands::prosecution_files::list_intake_queue,
            commands::prosecution_files::get_prosecution_file,
            commands::prosecution_files::link_person_to_file,
            commands::prosecution_files::unlink_person_from_file,
            commands::prosecution_files::list_file_people,
            commands::referrals::create_resubmission,
            commands::referrals::list_referrals_for_file,
            commands::decisions::create_decision,
            commands::decisions::list_decisions_for_file,
            commands::search::search,
            commands::attachments::add_attachment,
            commands::attachments::list_attachments,
            commands::attachments::delete_attachment,
            commands::attachments::get_attachment_data_url,
            commands::statements::create_statement,
            commands::statements::list_statements_for_file,
            commands::evidence::create_evidence_item,
            commands::evidence::list_evidence_for_file,
            commands::charges::create_charge,
            commands::charges::list_charges_for_file,
            commands::review_notes::create_review_note,
            commands::review_notes::list_review_notes_for_file,
            commands::comments::create_comment,
            commands::comments::list_comments_for_entity,
            commands::prosecutor_profile::get_prosecutor_profile,
            commands::prosecutor_profile::save_prosecutor_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
