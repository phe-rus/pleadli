use tauri::State;

use crate::db::Db;
use crate::domain::attachments::{self, Attachment, BulkAttachResult, VaultEntry};

#[tauri::command]
pub async fn add_attachment(
    state: State<'_, Db>,
    entity_type: String,
    entity_id: String,
    source_path: String,
) -> Result<Attachment, String> {
    attachments::add_attachment_from_path(
        &state.pool,
        &state.vault_root,
        &entity_type,
        &entity_id,
        std::path::Path::new(&source_path),
    )
    .await
    .map_err(|e| e.to_string())
}

/// Bulk paperwork intake: attaches every path in `source_paths` to the
/// same record. Always returns `Ok`: a per-file failure is reported in
/// the result's `failed` list, not as a command error, since one bad file
/// in a batch of fifty shouldn't block the other forty-nine.
#[tauri::command]
pub async fn bulk_attach_files(
    state: State<'_, Db>,
    entity_type: String,
    entity_id: String,
    source_paths: Vec<String>,
) -> Result<BulkAttachResult, String> {
    let paths: Vec<std::path::PathBuf> = source_paths.into_iter().map(std::path::PathBuf::from).collect();
    Ok(attachments::bulk_attach_from_paths(&state.pool, &state.vault_root, &entity_type, &entity_id, &paths).await)
}

#[tauri::command]
pub async fn list_attachments(
    state: State<'_, Db>,
    entity_type: String,
    entity_id: String,
) -> Result<Vec<Attachment>, String> {
    attachments::list_attachments(&state.pool, &entity_type, &entity_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_attachment(state: State<'_, Db>, id: String) -> Result<(), String> {
    attachments::delete_attachment(&state.pool, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_all_attachments(state: State<'_, Db>, query: String) -> Result<Vec<Attachment>, String> {
    attachments::list_all(&state.pool, &query).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_attachment_route(state: State<'_, Db>, entity_type: String, entity_id: String) -> Result<String, String> {
    attachments::resolve_entity_route(&state.pool, &entity_type, &entity_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_vault_directory(state: State<'_, Db>, relative_path: String) -> Result<Vec<VaultEntry>, String> {
    attachments::list_vault_directory(&state.pool, &state.vault_root, &relative_path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_attachment_data_url(state: State<'_, Db>, id: String) -> Result<Option<String>, String> {
    attachments::get_attachment_data_url(&state.pool, &id).await.map_err(|e| e.to_string())
}
