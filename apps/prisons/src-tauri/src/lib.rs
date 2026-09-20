mod api;
mod commands;
mod db;
mod domain;
mod node;
mod transport;
#[cfg(target_os = "linux")]
mod watchdog;

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

/// Runs a node without a window: opens the database under `data_dir`, starts
/// the network supervisor and (debug builds) the loopback listener, and blocks.
/// Used by `src/bin/node.rs`.
pub fn run_headless(data_dir: std::path::PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    std::fs::create_dir_all(&data_dir)?;
    let vault_root = data_dir.join("vault");
    std::fs::create_dir_all(&vault_root)?;
    let runtime = tokio::runtime::Runtime::new()?;
    runtime.block_on(async move {
        match db::startup(&data_dir, &vault_root).await {
            Ok(started) => {
                let node = node::Node::new(started.pool, vault_root, data_dir);
                tokio::spawn(api::network::supervise(node.clone()));
                tokio::spawn(domain::tunnel_connector::supervise(node.clone()));
                domain::nodeconfig::load_remote(&node).await;
                tokio::spawn(transport::lan::supervise(node.clone()));
                tokio::spawn(domain::backup::scheduler(node.clone()));
                // A headless node is a real facility node: it exchanges with Head Office too.
                tokio::spawn(domain::sync::background_loop(node.pool.clone()));
                #[cfg(debug_assertions)]
                tokio::spawn(transport::dev_loopback::serve(node.clone()));
                log::info!("node running; press Ctrl+C to stop");
            }
            Err(db::StartupError::Recovery(reason)) => {
                eprintln!("the database needs recovery: {reason}");
                #[cfg(debug_assertions)]
                tokio::spawn(transport::dev_loopback::serve_router(api::recovery::router(data_dir, reason)));
            }
            Err(db::StartupError::Fatal(reason)) => return Err(reason.into()),
        }
        tokio::signal::ctrl_c().await?;
        Ok::<(), Box<dyn std::error::Error>>(())
    })
}

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
            // The ceiling on memory and CPU: see `watchdog.rs`.
            #[cfg(target_os = "linux")]
            watchdog::start(app.handle().clone());
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            let vault_root = app
                .path()
                .document_dir()
                .or_else(|_| app.path().home_dir().map(|home| home.join("Documents")))
                .unwrap_or_else(|_| data_dir.join("vault"))
                .join("Pleadli Prisons");
            std::fs::create_dir_all(&vault_root)?;

            // Integrity check, staged restore, snapshot-before-migration, then
            // migrate. A database that cannot be trusted is never opened for
            // work: the node serves only the recovery router instead.
            match tauri::async_runtime::block_on(db::startup(&data_dir, &vault_root)) {
                Ok(started) => {
                    if let Some(snapshot) = &started.pre_migration_snapshot {
                        log::info!("snapshot before migration: {}", snapshot.display());
                    }
                    let node = node::Node::new(started.pool, vault_root, data_dir);

                    // The desktop shell reaches the node in process: no socket.
                    tauri::async_runtime::block_on(domain::nodeconfig::load_remote(&node));
                    app.manage(commands::api::LocalApi { router: api::router(node.clone()), node: Some(node.clone()) });

                    // The network surface, on its own listener. Started when (and
                    // only when) this installation is Head Office.
                    tauri::async_runtime::spawn(api::network::supervise(node.clone()));
                    tauri::async_runtime::spawn(domain::tunnel_connector::supervise(node.clone()));
                    tauri::async_runtime::spawn(transport::lan::supervise(node.clone()));
                    tauri::async_runtime::spawn(domain::backup::scheduler(node.clone()));
                    // Browser development only; compiled out of release builds.
                    #[cfg(debug_assertions)]
                    tauri::async_runtime::spawn(transport::dev_loopback::serve(node.clone()));
                    tauri::async_runtime::spawn(domain::sync::background_loop(node.pool.clone()));

                    app.manage(node);
                }
                Err(db::StartupError::Recovery(reason)) => {
                    log::error!("database needs recovery: {reason}");
                    app.manage(commands::api::LocalApi { router: api::recovery::router(data_dir, reason), node: None });
                }
                Err(db::StartupError::Fatal(reason)) => return Err(reason.into()),
            }

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
        .invoke_handler(tauri::generate_handler![commands::api::api_request, commands::api::pick_file, commands::api::restart_app,
            commands::files::export_file,
            commands::files::import_file
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // The tunnel's connector is a child process: stop it with the app.
            if let tauri::RunEvent::Exit = event {
                if let Some(node) = app.try_state::<commands::api::LocalApi>().and_then(|api| api.node.clone()) {
                    tauri::async_runtime::block_on(node.connector.stop());
                }
            }
        });
}
