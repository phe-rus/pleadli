mod api;
mod commands;
mod db;
mod domain;

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

/// The router's state: the old PIN lock (it only guards an installation that
/// is not set up yet) and who is signed in. Under basic or full protection the
/// app always starts with nobody signed in.
async fn app_state(pool: sqlx::SqlitePool, vault_root: std::path::PathBuf, data_dir: std::path::PathBuf) -> Result<api::AppState, sqlx::Error> {
    let security = domain::security::Security::new();
    security.load(&pool).await?;
    let legacy_locked = !security.is_installed() && domain::lock::is_enabled(&pool).await?;
    let network = domain::network::Runtime::load(&pool).await?;
    Ok(api::AppState {
        pool,
        vault_root,
        lock: std::sync::Arc::new(domain::lock::Runtime::new(legacy_locked)),
        security: std::sync::Arc::new(security),
        network: std::sync::Arc::new(network),
        lan: std::sync::Arc::new(api::Lan::new(data_dir)),
    })
}

/// Development only: the API without a window, for driving the real frontend
/// from a browser or a script. Same router, same migrations, same seed.
#[cfg(debug_assertions)]
pub async fn run_headless(data_dir: std::path::PathBuf) -> Result<(), String> {
    let router = match db::startup(&data_dir).await {
        Ok(db) => {
            let state = app_state(db.pool, db.vault_root, data_dir.clone()).await.map_err(|e| e.to_string())?;
            tokio::spawn(api::supervise_office(state.clone()));
            api::router(state)
        }
        Err(db::StartupError::Recovery(reason)) => api::recovery_router(reason),
        Err(db::StartupError::Fatal(reason)) => return Err(reason),
    };
    api::serve_dev(router).await;
    Ok(())
}

/// Development builds: read the developer's `.env.local` (git-ignored) for an Assist key.
pub fn load_dev_env() {
    pleadli_node_core::ai::load_dev_env(concat!(env!("CARGO_MANIFEST_DIR"), "/.env.local"));
}

pub fn run() {
    load_dev_env();
    tauri::Builder::default()
        // Single-instance must be the first plugin registered: it has to
        // intercept a second launch before anything else runs. With one SQLite
        // file as the only datastore, a second window writing concurrently is a
        // real corruption risk, not a cosmetic one.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("lawyers") {
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
        // Installed copies check the public releases for a signed update (see .github/workflows/release.yml).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
                    #[cfg(debug_assertions)]
                    if let Ok(pin) = std::env::var("PLEADLI_DEV_RESET_PINS") {
                        match tauri::async_runtime::block_on(domain::staff::dev_reset_pins(&db.pool, &pin)) {
                            Ok(names) => log::warn!("development: PIN set to {pin} for {}", names.join(", ")),
                            Err(e) => log::error!("development: PIN reset failed: {e}"),
                        }
                    }
                    let state = tauri::async_runtime::block_on(app_state(db.pool.clone(), db.vault_root.clone(), data_dir.clone()))?;
                    tauri::async_runtime::spawn(api::supervise_office(state.clone()));
                    // Saving a filing pack asks the same "is anyone signed in" as the API.
                    app.manage(state.security.clone());
                    app.manage(state.network.clone());
                    let router = api::router(state);
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
            let show_item = MenuItemBuilder::with_id("show", "Show Pleadli Lawyers").build(app)?;
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
                        if let Some(window) = app.get_webview_window("lawyers") {
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
                        if let Some(window) = app.get_webview_window("lawyers") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::api::api_request, commands::export::save_pdf, commands::export::save_export, commands::export::office_apps, commands::export::open_paper_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
