//! Moving package files between the application and where the prosecutor keeps
//! them (a USB stick, a folder). The webview names a path it got from the
//! operating system's dialog; the bytes are made and read here.

use tauri::State;

use crate::db::Db;
use crate::domain::interchange::{self, ImportOutcome};

/// Reads a package from `path` and takes it in.
#[tauri::command]
pub async fn import_interchange_file(state: State<'_, Db>, path: String) -> Result<ImportOutcome, String> {
    state.security.ensure_unlocked()?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    interchange::import_package(&state.pool, &state.vault_root, &bytes).await.map_err(|e| e.to_string())
}

/// Writes an invitation (`kind` = "invite") or an outgoing package (`kind` =
/// "outgoing") to `path`.
#[tauri::command]
pub async fn save_interchange_file(state: State<'_, Db>, kind: String, id: String, path: String) -> Result<(), String> {
    state.security.ensure_unlocked()?;
    let bytes = match kind.as_str() {
        "invite" => interchange::invite_file(&state.pool, &id).await.map_err(|e| e.to_string())?,
        "outgoing" => interchange::export_outgoing(&state.pool, &id).await.map_err(|e| e.to_string())?.0,
        _ => return Err("Unknown kind of file.".to_string()),
    };
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

/// The name to offer in the save dialog.
#[tauri::command]
pub async fn interchange_file_name(state: State<'_, Db>, kind: String, id: String) -> Result<String, String> {
    state.security.ensure_unlocked()?;
    match kind.as_str() {
        "invite" => Ok("dpp-invitation.pxpkg".to_string()),
        _ => {
            let row: Option<(String, i64)> = sqlx::query_as("SELECT kind, seq FROM outgoing_packages WHERE id = ?").bind(&id).fetch_optional(&state.pool).await.map_err(|e| e.to_string())?;
            let (k, seq) = row.ok_or_else(|| "Nothing to send with that id.".to_string())?;
            Ok(format!("dpp-{}-{seq}.pxpkg", k.replace('_', "-")))
        }
    }
}

/// A court package the prosecutor chose in the window's open dialog, as base64. None if cancelled.
#[tauri::command]
pub async fn pick_court_package(app: tauri::AppHandle, state: State<'_, Db>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    state.security.ensure_unlocked()?;
    let chosen = tauri::async_runtime::spawn_blocking(move || app.dialog().file().add_filter("Pleadli package", &["pxpkg"]).blocking_pick_file()).await.map_err(|_| "The open dialog could not open.".to_string())?;
    let Some(file) = chosen else { return Ok(None) };
    let path = file.into_path().map_err(|_| "Choose a file on this computer.".to_string())?;
    if !path.extension().is_some_and(|e| e.eq_ignore_ascii_case("pxpkg")) { return Err("Only Pleadli package files are opened here.".into()); }
    let bytes = std::fs::read(path).map_err(|_| "The file could not be read.".to_string())?;
    if bytes.len() > 50 * 1024 * 1024 { return Err("That file is too large.".into()); }
    Ok(Some(base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes)))
}

/// Saves a court package where the prosecutor chooses in the window's save dialog.
#[tauri::command]
pub async fn save_court_package(app: tauri::AppHandle, state: State<'_, Db>, name: String, content_base64: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    state.security.ensure_unlocked()?;
    if content_base64.len() > 70 * 1024 * 1024 { return Err("This package is too large.".into()); }
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, content_base64).map_err(|_| "Invalid package data.".to_string())?;
    let safe: String = name.chars().take(100).map(|c| if c.is_alphanumeric() || matches!(c, '-' | '_' | '.') { c } else { '-' }).collect();
    let safe = if safe.to_lowercase().ends_with(".pxpkg") { safe } else { format!("{safe}.pxpkg") };
    let chosen = tauri::async_runtime::spawn_blocking(move || app.dialog().file().add_filter("Pleadli package", &["pxpkg"]).set_file_name(safe).blocking_save_file()).await.map_err(|_| "The save dialog could not open.".to_string())?;
    let Some(file) = chosen else { return Ok(false) };
    let path = file.into_path().map_err(|_| "Choose a file on this computer.".to_string())?;
    std::fs::write(path, bytes).map_err(|_| "The package could not be saved at that destination.".to_string())?;
    Ok(true)
}
