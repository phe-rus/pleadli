use tauri::State;

use crate::db::Db;
use crate::domain::documents;

/// `destination_path` is chosen by the frontend's own `save()` dialog
/// before this is called; this just writes bytes to it, same as
/// `attachments::add_attachment_bytes` writes to a path the frontend
/// already resolved.
#[tauri::command]
pub async fn export_all_markdown(_who: super::api::SignedIn, state: State<'_, Db>, destination_path: String) -> Result<(), String> {
    documents::export_all_markdown(&state.pool, &state.vault_root, std::path::Path::new(&destination_path))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_all_xlsx(_who: super::api::SignedIn, state: State<'_, Db>, destination_path: String) -> Result<(), String> {
    documents::export_all_xlsx(&state.pool, std::path::Path::new(&destination_path))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_all_pdf(_who: super::api::SignedIn, state: State<'_, Db>, destination_path: String) -> Result<(), String> {
    documents::export_all_pdf(&state.pool, std::path::Path::new(&destination_path))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_all_docx(_who: super::api::SignedIn, state: State<'_, Db>, destination_path: String) -> Result<(), String> {
    documents::export_all_docx(&state.pool, std::path::Path::new(&destination_path))
        .await
        .map_err(|e| e.to_string())
}

fn parse_format(format: &str) -> Result<documents::DocumentFormat, String> {
    documents::DocumentFormat::parse(format).ok_or_else(|| "Invalid document format.".to_string())
}

/// Returns `false` (not an error) when the record itself doesn't exist:
/// the frontend only offers this action from a record's own page, so
/// that's an edge case (deleted mid-export), not a broken request.
#[tauri::command]
pub async fn export_person_document(_who: super::api::SignedIn,
    state: State<'_, Db>,
    id: String,
    format: String,
    destination_path: String,
) -> Result<bool, String> {
    documents::export_person_document(&state.pool, &state.vault_root, &id, parse_format(&format)?, std::path::Path::new(&destination_path))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_case_document(_who: super::api::SignedIn,
    state: State<'_, Db>,
    id: String,
    format: String,
    destination_path: String,
) -> Result<bool, String> {
    documents::export_case_document(&state.pool, &id, parse_format(&format)?, std::path::Path::new(&destination_path))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_charge_sheet_document(_who: super::api::SignedIn,
    state: State<'_, Db>,
    id: String,
    format: String,
    destination_path: String,
) -> Result<bool, String> {
    documents::export_charge_sheet_document(&state.pool, &id, parse_format(&format)?, std::path::Path::new(&destination_path))
        .await
        .map_err(|e| e.to_string())
}

/// A paper or table leaving the station in the format chosen (Word, PDF,
/// Excel, CSV), saved where the officer chose in the system's save window.
#[tauri::command]
pub async fn save_paper_file(_who: super::api::SignedIn, path: String, data: String) -> Result<(), String> {
    use base64::Engine;
    let lower = path.to_lowercase();
    if ![".doc", ".docx", ".pdf", ".xlsx", ".csv", ".txt"].iter().any(|ext| lower.ends_with(ext)) {
        return Err("This kind of file is not saved from here.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
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
pub async fn open_paper_file(_who: super::api::SignedIn, name: String, data: String) -> Result<(), String> {
    use base64::Engine;
    let lower = name.to_lowercase();
    if ![".doc", ".docx", ".xlsx", ".csv", ".pdf"].iter().any(|ext| lower.ends_with(ext)) {
        return Err("This kind of file is not opened from here.".into());
    }
    let safe: String = name.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '.' { c } else { '-' }).collect();
    let dir = std::env::temp_dir().join("pleadli-police");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(safe);
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| e.to_string())
}
