//! Saving a document export where the prosecutor chose. The webview names the
//! document and the format; the bytes are made here from the stored content.

use tauri::State;

use crate::api::export_bytes;
use crate::db::Db;
use crate::domain::documents;

#[tauri::command]
pub async fn save_document_export(state: State<'_, Db>, id: String, format: String, path: String) -> Result<(), String> {
    state.security.ensure_unlocked()?;
    let doc = documents::get(&state.pool, &id).await.map_err(|e| e.to_string())?;
    let (bytes, _, _) = export_bytes(&doc, &format).map_err(|e| format!("{}", e.2))?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

/// The file name to offer in the save dialog.
#[tauri::command]
pub async fn document_export_name(state: State<'_, Db>, id: String, format: String) -> Result<String, String> {
    state.security.ensure_unlocked()?;
    let doc = documents::get(&state.pool, &id).await.map_err(|e| e.to_string())?;
    let ext = if format == "docx" { "docx" } else { "md" };
    Ok(crate::domain::document_export::file_name(&doc, ext))
}
