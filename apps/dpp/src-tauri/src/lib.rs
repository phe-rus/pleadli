mod api;
mod commands;
mod db;
mod domain;

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

/// Development only: the API without a window, for driving the real frontend
/// from a browser or a script. Same router, same migrations, same seed.
#[cfg(debug_assertions)]
pub async fn run_headless(data_dir: std::path::PathBuf) -> Result<(), String> {
    let router = match db::startup(&data_dir, None).await {
        Ok(db) => api::router(api::AppState { pool: db.pool, vault_root: db.vault_root, data_dir: db.data_dir, security: db.security }),
        Err(db::StartupError::Recovery(reason)) => api::recovery_router(data_dir, reason),
        Err(db::StartupError::Fatal(reason)) => return Err(reason),
    };
    api::serve_dev(router).await;
    Ok(())
}

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
            app.manage(commands::backup::DataDir(data_dir.clone()));

            // Where older builds kept plain documents, in the user's own
            // Documents folder. Read only to move what is there into the sealed
            // vault. Same fallback chain as before: `document_dir()` fails with
            // `UnknownPath` on a bare Linux setup.
            let legacy_vault = app
                .path()
                .document_dir()
                .or_else(|_| app.path().home_dir().map(|home| home.join("Documents")))
                .ok()
                .map(|dir| dir.join("Pleadli DPP"));

            let router = match tauri::async_runtime::block_on(db::startup(&data_dir, legacy_vault.as_deref())) {
                Ok(db) => {
                    let router = api::router(api::AppState {
                        pool: db.pool.clone(),
                        vault_root: db.vault_root.clone(),
                        data_dir: db.data_dir.clone(),
                        security: db.security.clone(),
                    });
                    app.manage(db);
                    router
                }
                // The data cannot be opened. Start anyway, in recovery: the
                // window explains and offers a restore from a backup.
                Err(db::StartupError::Recovery(reason)) => {
                    log::error!("starting in recovery mode: {reason}");
                    api::recovery_router(data_dir.clone(), reason)
                }
                Err(db::StartupError::Fatal(reason)) => return Err(reason.into()),
            };
            #[cfg(debug_assertions)]
            tauri::async_runtime::spawn(api::serve_dev(router.clone()));
            app.manage(commands::api::LocalApi(router));

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
            commands::api::api_request,
            commands::attachments::add_attachment,
            commands::attachments::get_attachment_data_url,
            commands::attachments::open_attachment,
            commands::documents::save_document_export,
            commands::documents::document_export_name,
            commands::backup::create_backup,
            commands::backup::stage_restore,
            commands::backup::restart_app,
            commands::interchange::import_interchange_file,
            commands::interchange::save_interchange_file,
            commands::interchange::interchange_file_name,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // A readable copy made to view a document does not outlive the app.
            if let tauri::RunEvent::Exit = event {
                if let Ok(dir) = app.path().app_data_dir() {
                    domain::attachments::clear_opened(&dir.join("opened"));
                }
            }
        });
}
