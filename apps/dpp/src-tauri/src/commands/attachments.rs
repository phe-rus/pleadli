//! The attachment operations that need the operating system: reading a file
//! the prosecutor picked, and opening one in its own program. Everything else
//! about attachments goes through `/api/attachments`. The webview is never
//! given a path into the vault: it names an attachment by id. These commands
//! reach data without going through the API, so each asks the lock itself.

use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::db::Db;
use crate::domain::attachments::{self, Attachment};

#[tauri::command]
pub async fn add_attachment(state: State<'_, Db>, entity_type: String, entity_id: String, source_path: String) -> Result<Attachment, String> {
    state.security.ensure_unlocked()?;
    attachments::add_attachment_from_path(&state.pool, &state.vault_root, &entity_type, &entity_id, std::path::Path::new(&source_path))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_attachment_data_url(state: State<'_, Db>, id: String) -> Result<Option<String>, String> {
    state.security.ensure_unlocked()?;
    attachments::get_attachment_data_url(&state.pool, &state.vault_root, &id).await.map_err(|e| e.to_string())
}

/// Opens the document in the program the system associates with it, from a
/// readable copy in a private folder that is emptied when the app exits.
#[tauri::command]
pub async fn open_attachment(app: AppHandle, state: State<'_, Db>, id: String) -> Result<(), String> {
    state.security.ensure_unlocked()?;
    let path = attachments::open_copy(&state.pool, &state.vault_root, &state.data_dir.join("opened"), &id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Attachment not found.".to_string())?;
    app.opener().open_path(path.to_string_lossy().to_string(), None::<&str>).map_err(|e| e.to_string())
}
