mod api;
mod commands;
mod db;
mod domain;
mod transport;

pub struct RemoteServer(pub tokio::sync::Mutex<Option<transport::remote_server::RemoteServerHandle>>);
pub struct CloudflaredSidecar(pub tokio::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

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
        // Installed copies check the public releases for a signed update (see .github/workflows/release.yml).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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

            let db = match tauri::async_runtime::block_on(db::startup(&data_dir, vault_root)) {
                Ok(db) => db,
                // Police doesn't yet have a recovery-mode window (the newer
                // applications do); until it does, both cases stop startup
                // with a clear log line rather than opening on data that
                // cannot be trusted, which matches how this app already
                // treated any database-open failure before encryption.
                Err(db::StartupError::Recovery(reason)) => {
                    log::error!("database recovery required: {reason}");
                    return Err(reason.into());
                }
                Err(db::StartupError::Fatal(reason)) => return Err(reason.into()),
            };

            let router = api::router(db.pool.clone(), db.vault_root.clone());
            #[cfg(debug_assertions)]
            tauri::async_runtime::spawn(api::serve_dev(router.clone()));
            app.manage(commands::api::LocalApi(router));
            app.manage(commands::api::LocalSession::default());

            // Both sides of the connection run for the life of the application and
            // do nothing unless this installation is that side.
            tauri::async_runtime::spawn(transport::command_server::run(db.pool.clone()));
            tauri::async_runtime::spawn(domain::command_link::run(db.pool.clone()));

            // Remote access, if this station already had it turned on
            // (the setting persists across restarts). Off by default
            // otherwise, matching the app's offline-first default.
            let remote_settings = tauri::async_runtime::block_on(domain::officers::get_remote_access_settings(&db.pool))?;
            let initial_handle = if remote_settings.enabled {
                let app_handle = app.handle().clone();
                match tauri::async_runtime::block_on(transport::remote_server::start(
                    db.pool.clone(),
                    db.vault_root.clone(),
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
            commands::api::api_request,
            commands::people::set_person_photo_from_path,
            commands::officers::respond_to_backup_alert,
            commands::officers::end_backup_alert,
            commands::attachments::add_attachment,
            commands::attachments::bulk_attach_files,
            commands::attachments::list_attachments,
            commands::attachments::delete_attachment,
            commands::attachments::list_all_attachments,
            commands::attachments::get_attachment_route,
            commands::attachments::list_vault_directory,
            commands::attachments::get_attachment_data_url,
            commands::attachments::open_attachment,
            commands::attachments::open_vault_path,
            commands::attachments::reveal_vault_path,
            commands::network::get_remote_access_status,
            commands::network::set_remote_access_enabled,
            commands::network::get_local_network_info,
            commands::network::get_local_pairing_qr,
            commands::cloudflare::save_cloudflare_config,
            commands::cloudflare::get_cloudflare_config,
            commands::cloudflare::get_cloudflare_tunnel_state,
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
