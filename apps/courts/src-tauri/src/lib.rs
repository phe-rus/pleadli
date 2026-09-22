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
    let router = match db::startup(&data_dir).await {
        Ok(db) => api::router(api::AppState { pool: db.pool, vault_root: db.vault_root }),
        Err(db::StartupError::Recovery(reason)) => api::recovery_router(reason),
        Err(db::StartupError::Fatal(reason)) => return Err(reason),
    };
    api::serve_dev(router).await;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        // Single-instance must be the first plugin registered: it has to
        // intercept a second launch before anything else runs. With one SQLite
        // file as the only datastore, a second window writing concurrently is a
        // real corruption risk, not a cosmetic one.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("courts") {
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            let router = match tauri::async_runtime::block_on(db::startup(&data_dir)) {
                Ok(db) => {
                    let router = api::router(api::AppState { pool: db.pool.clone(), vault_root: db.vault_root.clone() });
                    app.manage(db);
                    router
                }
                // The data cannot be opened. Start anyway, in recovery: the
                // window explains instead of failing to load.
                Err(db::StartupError::Recovery(reason)) => {
                    log::error!("starting in recovery mode: {reason}");
                    api::recovery_router(reason)
                }
                Err(db::StartupError::Fatal(reason)) => return Err(reason.into()),
            };
            #[cfg(debug_assertions)]
            tauri::async_runtime::spawn(api::serve_dev(router.clone()));
            app.manage(commands::api::LocalApi(router));

            // Custom window chrome (decorations off) means a native OS menu bar
            // would sit awkwardly on top of it: the tray is deliberately the only
            // native menu surface, as in the other applications.
            let show_item = MenuItemBuilder::with_id("show", "Show Pleadli Courts").build(app)?;
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
                        if let Some(window) = app.get_webview_window("courts") {
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
                        if let Some(window) = app.get_webview_window("courts") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::api::api_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
