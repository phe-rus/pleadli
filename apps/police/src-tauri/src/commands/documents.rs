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
