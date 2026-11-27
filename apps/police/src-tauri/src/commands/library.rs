use tauri::State;

use super::api::{signed_in_actor, LocalSession};
use crate::db::Db;
use crate::domain::audit;
use crate::domain::library::{self, BinEntry, ImportResult, LibraryEntry, LibraryListing};

#[tauri::command]
pub async fn library_list(_who: super::api::SignedIn, state: State<'_, Db>, folder_id: String) -> Result<LibraryListing, String> {
    library::list(&state.pool, &folder_id).await
}

#[tauri::command]
pub async fn library_search(_who: super::api::SignedIn, state: State<'_, Db>, query: String) -> Result<Vec<LibraryEntry>, String> {
    library::search(&state.pool, &query).await
}

#[tauri::command]
pub async fn library_create_folder(_who: super::api::SignedIn, state: State<'_, Db>, parent_id: String, name: String) -> Result<LibraryEntry, String> {
    library::create_folder(&state.pool, &parent_id, &name).await
}

#[tauri::command]
pub async fn library_rename(_who: super::api::SignedIn, state: State<'_, Db>, kind: String, id: String, name: String) -> Result<(), String> {
    library::rename(&state.pool, &kind, &id, &name).await
}

#[tauri::command]
pub async fn library_move(_who: super::api::SignedIn, state: State<'_, Db>, kind: String, id: String, destination_id: String) -> Result<(), String> {
    library::move_to(&state.pool, &kind, &id, &destination_id).await
}

/// Deleting moves to the recycle bin (30 days); nothing is shredded yet.
#[tauri::command]
pub async fn library_delete(session: State<'_, LocalSession>, state: State<'_, Db>, kind: String, id: String) -> Result<(), String> {
    let actor = signed_in_actor(&session, &state.pool).await?;
    library::delete(&state.pool, &kind, &id, &actor.officer_id).await?;
    audit::log_event(&state.pool, &actor, "delete library item", Some(("library", &id)), Some("to the recycle bin"))
        .await
        .map_err(|e| format!("It was deleted but could not be written to the audit trail: {e}"))
}

#[tauri::command]
pub async fn library_bin(_who: super::api::SignedIn, state: State<'_, Db>) -> Result<Vec<BinEntry>, String> {
    library::bin(&state.pool, &state.vault_root).await
}

#[tauri::command]
pub async fn library_restore(session: State<'_, LocalSession>, state: State<'_, Db>, kind: String, id: String) -> Result<(), String> {
    let actor = signed_in_actor(&session, &state.pool).await?;
    library::restore(&state.pool, &kind, &id).await?;
    audit::log_event(&state.pool, &actor, "restore library item", Some(("library", &id)), None)
        .await
        .map_err(|e| format!("It was restored but could not be written to the audit trail: {e}"))
}

/// Permanent: the files are shredded and cannot be brought back.
#[tauri::command]
pub async fn library_purge(session: State<'_, LocalSession>, state: State<'_, Db>, kind: String, id: String) -> Result<(), String> {
    let actor = signed_in_actor(&session, &state.pool).await?;
    library::purge(&state.pool, &state.vault_root, &kind, &id).await?;
    audit::log_event(&state.pool, &actor, "permanently delete library item", Some(("library", &id)), None)
        .await
        .map_err(|e| format!("It was deleted but could not be written to the audit trail: {e}"))
}

#[tauri::command]
pub async fn library_empty_bin(session: State<'_, LocalSession>, state: State<'_, Db>) -> Result<usize, String> {
    let actor = signed_in_actor(&session, &state.pool).await?;
    let n = library::empty_bin(&state.pool, &state.vault_root).await?;
    audit::log_event(&state.pool, &actor, "empty library recycle bin", None, Some(&format!("{n} items")))
        .await
        .map_err(|e| format!("The bin was emptied but could not be written to the audit trail: {e}"))?;
    Ok(n)
}

/// Files and folders the officer dropped or chose, by their path on this computer.
#[tauri::command]
pub async fn library_import(_who: super::api::SignedIn, state: State<'_, Db>, folder_id: String, source_paths: Vec<String>) -> Result<ImportResult, String> {
    let paths: Vec<std::path::PathBuf> = source_paths.into_iter().map(std::path::PathBuf::from).collect();
    library::import_paths(&state.pool, &state.vault_root, &folder_id, &paths).await
}

/// A file, or a folder as a .zip, written at the path `downloads_path` approved.
#[tauri::command]
pub async fn library_export(_who: super::api::SignedIn, state: State<'_, Db>, kind: String, id: String, destination_path: String) -> Result<(), String> {
    let target = pleadli_node_core::save_grants::take(&destination_path)?;
    library::export(&state.pool, &state.vault_root, &kind, &id, &target).await
}
