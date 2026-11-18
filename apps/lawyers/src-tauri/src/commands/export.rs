//! A filing pack, built as a PDF in the webview, leaving the app: saved where
//! the person chose. Only PDFs pass through here, and only while someone is
//! signed in (the same gate the API keeps).

use std::sync::Arc;

use base64::Engine;
use tauri::State;

use crate::domain::network::Runtime as Network;
use crate::domain::security::Security;

/// Signed in here, or a computer joined to an office (the office checked who
/// is signed in when the file's contents were read).
fn may_save(security: &Security, network: &Network) -> bool {
    network.link().is_some() || (security.is_installed() && !security.is_locked())
}

#[tauri::command]
pub async fn save_pdf(security: State<'_, Arc<Security>>, network: State<'_, Arc<Network>>, path: String, data: String) -> Result<(), String> {
    if !may_save(&security, &network) {
        return Err("Sign in to save a filing pack.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    if !bytes.starts_with(b"%PDF") {
        return Err("Only a PDF can be saved this way.".into());
    }
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

/// Any file the person exports (a document as PDF or Word, all the records as
/// a ZIP), saved where they chose. The bytes must be what the kind says.
#[tauri::command]
pub async fn save_export(security: State<'_, Arc<Security>>, network: State<'_, Arc<Network>>, path: String, kind: String, data: String) -> Result<(), String> {
    if !may_save(&security, &network) {
        return Err("Sign in to export.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    let ok = match kind.as_str() {
        "pdf" => bytes.starts_with(b"%PDF"),
        "docx" | "zip" => bytes.starts_with(b"PK\x03\x04"),
        "json" => bytes.first().is_some_and(|b| *b == b'{' || *b == b'['),
        // A paper saved for Word: a web page Word opens as a document.
        "doc" => bytes.starts_with(b"<html"),
        "csv" => std::str::from_utf8(&bytes).is_ok(),
        "png" => bytes.starts_with(b"\x89PNG"),
        "jpg" => bytes.starts_with(&[0xFF, 0xD8, 0xFF]),
        "webp" => bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        _ => false,
    };
    if !ok {
        return Err("That file is not what it says it is.".into());
    }
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

/// Which office programs this computer has (Word, Excel, LibreOffice).
#[tauri::command]
pub async fn office_apps() -> pleadli_node_core::office::OfficeApps {
    pleadli_node_core::office::detect()
}

/// A copy of a paper in the temporary folder, opened in the program the
/// system uses for it (Word for a .doc where Office is installed).
#[tauri::command]
pub async fn open_paper_file(security: State<'_, Arc<Security>>, network: State<'_, Arc<Network>>, name: String, data: String) -> Result<(), String> {
    if !may_save(&security, &network) {
        return Err("Sign in to open a paper.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    if !bytes.starts_with(b"<html") && !bytes.starts_with(b"%PDF") {
        return Err("Only a paper can be opened this way.".into());
    }
    let safe: String = name.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '.' { c } else { '-' }).collect();
    let dir = std::env::temp_dir().join("pleadli-lawyers");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(safe);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| e.to_string())
}

/// A court package the person chose in the window's open dialog, as base64. None if cancelled.
#[tauri::command]
pub async fn pick_court_package(app: tauri::AppHandle, security: State<'_, Arc<Security>>, network: State<'_, Arc<Network>>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    if !may_save(&security, &network) {
        return Err("Sign in to open a court package.".into());
    }
    let chosen = tauri::async_runtime::spawn_blocking(move || app.dialog().file().add_filter("Pleadli package", &["pxpkg"]).blocking_pick_file()).await.map_err(|_| "The open dialog could not open.".to_string())?;
    let Some(file) = chosen else { return Ok(None) };
    let path = file.into_path().map_err(|_| "Choose a file on this computer.".to_string())?;
    if !path.extension().is_some_and(|e| e.eq_ignore_ascii_case("pxpkg")) {
        return Err("Only Pleadli package files are opened here.".into());
    }
    let bytes = std::fs::read(path).map_err(|_| "The file could not be read.".to_string())?;
    if bytes.len() > 50 * 1024 * 1024 {
        return Err("That file is too large.".into());
    }
    Ok(Some(base64::engine::general_purpose::STANDARD.encode(bytes)))
}

/// Saves a court package where the person chooses in the window's save dialog.
#[tauri::command]
pub async fn save_court_package(app: tauri::AppHandle, security: State<'_, Arc<Security>>, network: State<'_, Arc<Network>>, name: String, content_base64: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    if !may_save(&security, &network) {
        return Err("Sign in to save a court package.".into());
    }
    if content_base64.len() > 70 * 1024 * 1024 {
        return Err("This package is too large.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(content_base64).map_err(|_| "Invalid package data.".to_string())?;
    let safe: String = name.chars().take(100).map(|c| if c.is_alphanumeric() || matches!(c, '-' | '_' | '.') { c } else { '-' }).collect();
    let safe = if safe.to_lowercase().ends_with(".pxpkg") { safe } else { format!("{safe}.pxpkg") };
    let chosen = tauri::async_runtime::spawn_blocking(move || app.dialog().file().add_filter("Pleadli package", &["pxpkg"]).set_file_name(safe).blocking_save_file()).await.map_err(|_| "The save dialog could not open.".to_string())?;
    let Some(file) = chosen else { return Ok(false) };
    let path = file.into_path().map_err(|_| "Choose a file on this computer.".to_string())?;
    std::fs::write(path, bytes).map_err(|_| "The package could not be saved at that destination.".to_string())?;
    Ok(true)
}
