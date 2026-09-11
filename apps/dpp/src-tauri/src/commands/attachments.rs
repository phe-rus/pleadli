use tauri::State;

use crate::db::Db;
use crate::domain::attachments::{self, Attachment};

#[tauri::command]
pub async fn add_attachment(
    state: State<'_, Db>,
    entity_type: String,
    entity_id: String,
    source_path: String,
) -> Result<Attachment, String> {
    attachments::add_attachment_from_path(&state.pool, &state.vault_root, &entity_type, &entity_id, std::path::Path::new(&source_path))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_attachments(state: State<'_, Db>, entity_type: String, entity_id: String) -> Result<Vec<Attachment>, String> {
    attachments::list_attachments(&state.pool, &entity_type, &entity_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_attachment(state: State<'_, Db>, id: String) -> Result<(), String> {
    attachments::delete_attachment(&state.pool, &id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_attachment_data_url(state: State<'_, Db>, id: String) -> Result<Option<String>, String> {
    attachments::get_attachment_data_url(&state.pool, &id).await.map_err(|e| e.to_string())
}
