mod commands;
mod db;
mod domain;
#[cfg(debug_assertions)]
mod server;

use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("police.db");
            let db = tauri::async_runtime::block_on(db::connect(db_path))?;

            #[cfg(debug_assertions)]
            {
                let pool = db.pool.clone();
                tauri::async_runtime::spawn(server::serve(pool));
            }

            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::people::create_person,
            commands::people::search_people,
            commands::people::get_person,
            commands::people::update_person,
            commands::station_diary::create_station_diary_entry,
            commands::station_diary::list_station_diary_entries,
            commands::station_diary::update_station_diary_entry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
