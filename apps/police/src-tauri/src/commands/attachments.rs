use tauri::State;

use crate::db::Db;
use crate::domain::attachments::{self, Attachment, BulkAttachResult, VaultEntry};
use crate::domain::cases;

use super::api::{signed_in_actor, LocalSession};

#[tauri::command]
pub async fn add_attachment(_who: super::api::SignedIn,
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
pub async fn bulk_attach_files(_who: super::api::SignedIn,
    state: State<'_, Db>,
    entity_type: String,
    entity_id: String,
    source_paths: Vec<String>,
) -> Result<BulkAttachResult, String> {
    let paths: Vec<std::path::PathBuf> = source_paths.into_iter().map(std::path::PathBuf::from).collect();
    Ok(attachments::bulk_attach_from_paths(&state.pool, &state.vault_root, &entity_type, &entity_id, &paths).await)
}

#[tauri::command]
pub async fn list_attachments(_who: super::api::SignedIn,
    state: State<'_, Db>,
    entity_type: String,
    entity_id: String,
) -> Result<Vec<Attachment>, String> {
    attachments::list_attachments(&state.pool, &entity_type, &entity_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_attachment(_who: super::api::SignedIn, state: State<'_, Db>, id: String) -> Result<(), String> {
    attachments::delete_attachment(&state.pool, &state.vault_root, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_all_attachments(_who: super::api::SignedIn, state: State<'_, Db>, query: String) -> Result<Vec<Attachment>, String> {
    attachments::list_all(&state.pool, &query).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_attachment_route(_who: super::api::SignedIn, state: State<'_, Db>, entity_type: String, entity_id: String) -> Result<String, String> {
    attachments::resolve_entity_route(&state.pool, &entity_type, &entity_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_vault_directory(session: State<'_, LocalSession>, state: State<'_, Db>, relative_path: String) -> Result<Vec<VaultEntry>, String> {
    let actor = signed_in_actor(&session, &state.pool).await?;
    let hidden = cases::hidden_case_ids(&state.pool, &actor).await.map_err(|e| e.to_string())?;
    attachments::list_vault_directory(&state.pool, &relative_path, &hidden)
        .await
        .map_err(|e| e.to_string())
}

/// Refuses a file whose record is a restricted case the signed-in officer may not open.
async fn may_open(session: &LocalSession, state: &Db, attachment: &Attachment) -> Result<(), String> {
    let actor = signed_in_actor(session, &state.pool).await?;
    let hidden = cases::hidden_case_ids(&state.pool, &actor).await.map_err(|e| e.to_string())?;
    if cases::may_see_entity(&state.pool, &attachment.entity_type, &attachment.entity_id, &hidden).await.map_err(|e| e.to_string())? {
        Ok(())
    } else {
        Err("This case is restricted. Only an administrator or the officer who restricted it can open it.".to_string())
    }
}

#[tauri::command]
pub async fn get_attachment_data_url(session: State<'_, LocalSession>, state: State<'_, Db>, id: String) -> Result<Option<String>, String> {
    let Some(attachment) = attachments::get_attachment(&state.pool, &id).await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    may_open(&session, &state, &attachment).await?;
    attachments::get_attachment_data_url(&state.pool, &state.vault_root, &id).await.map_err(|e| e.to_string())
}

/// Where a file is placed to be opened by another program: private to this installation, and emptied at
/// every start and exit. The one place a plain copy of a document exists, and only because an officer
/// asked to open it in another program.
const OPENED_DIR: &str = "opened";

/// Overwrites and removes every file left in the opened-files folder next to the vault.
pub fn clear_opened(data_dir: &std::path::Path) {
    let dir = data_dir.join(OPENED_DIR);
    if let Ok(files) = pleadli_node_core::vault::walk(&dir) {
        for file in files {
            let _ = pleadli_node_core::vault::shred_file(&file);
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

async fn open_in_other_program(app: &tauri::AppHandle, state: &Db, attachment: &Attachment) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let (attachment, bytes) = attachments::read_attachment(&state.pool, &state.vault_root, &attachment.id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "That file no longer exists.".to_string())?;
    let data_dir = state.vault_root.parent().ok_or_else(|| "The data folder could not be found.".to_string())?;
    let folder = data_dir.join(OPENED_DIR).join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let path = folder.join(plain_name(&attachment.file_name));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    app.opener().open_path(path.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

/// Opens an attachment in the program the system uses for that kind of file. The window only ever names
/// the attachment; the sealed file is opened here and a plain copy is placed for the moment it is viewed.
#[tauri::command]
pub async fn open_attachment(session: State<'_, LocalSession>, app: tauri::AppHandle, state: State<'_, Db>, id: String) -> Result<(), String> {
    let attachment = attachments::get_attachment(&state.pool, &id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "That file no longer exists.".to_string())?;
    may_open(&session, &state, &attachment).await?;
    open_in_other_program(&app, &state, &attachment).await
}

/// Reads a file of the Files page for the app's own viewer.
#[tauri::command]
pub async fn read_vault_file(session: State<'_, LocalSession>, state: State<'_, Db>, relative_path: String) -> Result<String, String> {
    let attachment = attachments::attachment_at(&state.pool, &relative_path).await.map_err(|e| e.to_string())?.ok_or_else(|| "That file no longer exists.".to_string())?;
    may_open(&session, &state, &attachment).await?;
    attachments::read_vault_file(&state.pool, &state.vault_root, &relative_path).await.map_err(|e| e.to_string())
}

/// Opens a file of the Files page, named by its place there.
#[tauri::command]
pub async fn open_vault_path(session: State<'_, LocalSession>, app: tauri::AppHandle, state: State<'_, Db>, relative_path: String) -> Result<(), String> {
    let attachment = attachments::attachment_at(&state.pool, &relative_path).await.map_err(|e| e.to_string())?.ok_or_else(|| "That file no longer exists.".to_string())?;
    may_open(&session, &state, &attachment).await?;
    open_in_other_program(&app, &state, &attachment).await
}

/// Files are sealed, so there is no place in the system file manager to show one in.
#[tauri::command]
pub async fn reveal_vault_path(_who: super::api::SignedIn, _relative_path: String) -> Result<(), String> {
    Err("Files are kept sealed inside Pleadli, so they cannot be shown in the file manager. Open the file, or export it.".to_string())
}
