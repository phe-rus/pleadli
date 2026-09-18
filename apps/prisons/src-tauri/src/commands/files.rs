//! Exchange files (transfer dossiers and receipts) cross between facilities
//! as ordinary files. The webview never names a path: the operating system's
//! save and open dialogs choose it, so only what the officer picks is read or
//! written.

use base64::Engine as _;
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFile {
    name: String,
    content_base64: String,
}

/// Save dialog, then writes the decoded bytes. Returns the chosen path, or
/// `None` if the officer cancelled.
#[tauri::command]
pub async fn export_file(app: AppHandle, default_name: String, content_base64: String) -> Result<Option<String>, String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(content_base64.as_bytes()).map_err(|_| "The file content is not valid.".to_string())?;
    let chosen = tauri::async_runtime::spawn_blocking(move || app.dialog().file().set_file_name(default_name).blocking_save_file())
        .await
        .map_err(|e| e.to_string())?;
    let Some(file) = chosen else { return Ok(None) };
    let path = file.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Open dialog filtered to one extension, then reads the chosen file.
#[tauri::command]
pub async fn import_file(app: AppHandle, extension: String) -> Result<Option<OpenedFile>, String> {
    if extension.is_empty() || !extension.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("Not a valid file type.".to_string());
    }
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().add_filter("Pleadli exchange file", &[extension.as_str()]).blocking_pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(file) = picked else { return Ok(None) };
    let path = file.into_path().map_err(|e| e.to_string())?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file").to_string();
    Ok(Some(OpenedFile { name, content_base64: base64::engine::general_purpose::STANDARD.encode(bytes) }))
}
