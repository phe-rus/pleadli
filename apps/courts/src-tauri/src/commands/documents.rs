//! Portable paper export. Only a destination selected in the native dialog is written.
use base64::{engine::general_purpose::STANDARD, Engine};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

fn decode_document(format: &str, content: &str) -> Result<Vec<u8>, String> {
    if content.len() > 24 * 1024 * 1024 { return Err("This document is too large to export.".into()); }
    let bytes = STANDARD.decode(content).map_err(|_| "Invalid document data.".to_string())?;
    if bytes.len() > 16 * 1024 * 1024 { return Err("This document is too large to export.".into()); }
    let valid = match format {
        "pdf" => bytes.starts_with(b"%PDF-"),
        "docx" => bytes.starts_with(b"PK\x03\x04"),
        "md" => std::str::from_utf8(&bytes).is_ok(),
        _ => false,
    };
    if !valid { return Err("The document does not match its selected format.".into()); }
    Ok(bytes)
}

#[tauri::command]
pub async fn export_document(app: AppHandle, name: String, format: String, content_base64: String) -> Result<Option<String>, String> {
    let bytes = decode_document(&format, &content_base64)?;
    let label = match format.as_str() { "pdf" => "PDF document", "docx" => "Word document", _ => "Markdown document" };
    let stem = name.strip_suffix(&format!(".{format}")).unwrap_or(&name);
    let safe: String = stem.chars().take(100).map(|c| if c.is_alphanumeric() || matches!(c, ' ' | '-' | '_' | '.') { c } else { '-' }).collect();
    let safe = format!("{}.{}", safe.trim_start_matches('.'), format);
    let _ = label;
    // No Save window: the Downloads folder, under a name that is free there. The window learns the path from the answer.
    use tauri::Manager;
    let dir = pleadli_node_core::downloads::resolve_dir(app.path().download_dir().ok(), app.path().home_dir().ok())?;
    let path = pleadli_node_core::downloads::save_unique(&dir, &safe, &bytes)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Save only a verified original belonging to this case. No caller supplied path.
#[tauri::command]
pub async fn save_attachment(app: AppHandle, db: tauri::State<'_, crate::db::Db>, case_id: String, id: String) -> Result<bool, String> {
    let (attachment, bytes) = crate::domain::attachments::read(&db.pool, &db.vault_root, &case_id, &id).await.map_err(|e| e.to_string())?;
    let extension = attachment.name.rsplit('.').next().unwrap_or("txt").to_ascii_lowercase();
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().add_filter("Original supporting file", &[extension.as_str()]).set_file_name(attachment.name).blocking_save_file()
    }).await.map_err(|_| "The save dialog could not open.".to_string())?;
    let Some(file) = chosen else { return Ok(false) };
    let path = file.into_path().map_err(|_| "Choose a file on this computer.".to_string())?;
    std::fs::write(path, bytes).map_err(|_| "The original copy could not be saved.".to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_html_disguised_as_pdf_and_unknown_formats() {
        assert!(decode_document("pdf", &STANDARD.encode(b"<html>text</html>")).is_err());
        assert!(decode_document("html", &STANDARD.encode(b"text")).is_err());
        assert!(decode_document("pdf", &STANDARD.encode(b"%PDF-1.7\n")).is_ok());
        assert!(decode_document("docx", &STANDARD.encode(b"PK\x03\x04data")).is_ok());
        assert!(decode_document("md", &STANDARD.encode("Draft · Not issued")).is_ok());
        assert!(decode_document("md", &STANDARD.encode([255])).is_err());
    }
}

/// A package file for the exchange: saved only where the person chooses.
#[tauri::command]
pub async fn save_package(app: AppHandle, name: String, content_base64: String) -> Result<bool, String> {
    if content_base64.len() > 70 * 1024 * 1024 { return Err("This package is too large.".into()); }
    let bytes = STANDARD.decode(content_base64).map_err(|_| "Invalid package data.".to_string())?;
    let safe: String = name.chars().take(100).map(|c| if c.is_alphanumeric() || matches!(c, '-' | '_' | '.') { c } else { '-' }).collect();
    let safe = if safe.to_lowercase().ends_with(".pxpkg") { safe } else { format!("{safe}.pxpkg") };
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().add_filter("Pleadli package", &["pxpkg"]).set_file_name(safe).blocking_save_file()
    }).await.map_err(|_| "The save dialog could not open.".to_string())?;
    let Some(file) = chosen else { return Ok(false) };
    let path = file.into_path().map_err(|_| "Choose a file on this computer.".to_string())?;
    std::fs::write(path, bytes).map_err(|_| "The package could not be saved at that destination.".to_string())?;
    Ok(true)
}

/// A package file the person chose in the open window, as base64. None if cancelled.
#[tauri::command]
pub async fn pick_package(app: AppHandle) -> Result<Option<String>, String> {
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().add_filter("Pleadli package", &["pxpkg"]).blocking_pick_file()
    }).await.map_err(|_| "The open dialog could not open.".to_string())?;
    let Some(file) = chosen else { return Ok(None) };
    let path = file.into_path().map_err(|_| "Choose a file on this computer.".to_string())?;
    if !path.extension().is_some_and(|e| e.eq_ignore_ascii_case("pxpkg")) { return Err("Only Pleadli package files are opened here.".into()); }
    let bytes = std::fs::read(path).map_err(|_| "The file could not be read.".to_string())?;
    if bytes.len() > 50 * 1024 * 1024 { return Err("That file is too large.".into()); }
    Ok(Some(STANDARD.encode(bytes)))
}
