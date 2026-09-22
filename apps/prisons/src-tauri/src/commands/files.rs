//! Exchange files (transfer dossiers and receipts) cross between facilities
//! as ordinary files. The webview never names a path: the operating system's
//! save and open dialogs choose it, so only what the officer picks is read or
//! written.

use base64::Engine as _;
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// Where a document is placed to be opened by another program. Private to this
/// installation, and emptied at every start and exit.
const OPENED_DIR: &str = "opened";

/// Overwrites and removes every file left in the opened-documents folder.
pub fn clear_opened(data_dir: &std::path::Path) {
    let dir = data_dir.join(OPENED_DIR);
    if let Ok(files) = crate::domain::vault::walk(&dir) {
        for file in files {
            let _ = crate::domain::vault::shred_file(&file);
        }
    }
    let _ = std::fs::remove_dir_all(&dir);
}

/// A file name that is only a name: no folder, no control characters.
fn plain_name(name: &str) -> String {
    let base = std::path::Path::new(name).file_name().and_then(|n| n.to_str()).unwrap_or("document");
    let cleaned: String = base.chars().map(|c| if c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') { '-' } else { c }).collect();
    let cleaned = cleaned.trim().trim_start_matches('.').to_string();
    if cleaned.is_empty() { "document".to_string() } else { cleaned }
}

/// Opens a document in the program the system uses for its type. Documents are
/// sealed in the vault, so no other program can read them there: the plain bytes
/// are written to a private folder for the moment they are viewed, and removed
/// when the app starts or exits. This is the one place a plain copy of a
/// document exists on disk, and only because an officer asked to view it.
#[tauri::command]
pub async fn open_document(app: AppHandle, file_name: String, content_base64: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(content_base64.as_bytes()).map_err(|_| "The document content is not valid.".to_string())?;
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let folder = data_dir.join(OPENED_DIR).join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let path = folder.join(plain_name(&file_name));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    app.opener().open_path(path.to_string_lossy().to_string(), None::<&str>).map_err(|e| e.to_string())
}

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
