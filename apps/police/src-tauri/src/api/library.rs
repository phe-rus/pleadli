//! The library over the app's own API, so the window and the browser dev view
//! use the same routes (`api()` reaches them in-process from the window).
use axum::{
    extract::{Extension, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use super::{ApiError, AppState};
use crate::domain::audit;
use crate::domain::library::{self, BinEntry, LibraryEntry, LibraryListing};
use crate::domain::sessions::Actor;

fn bad(message: String) -> ApiError {
    (StatusCode::BAD_REQUEST, message)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    #[serde(default = "root")]
    folder_id: String,
    #[serde(default)]
    q: String,
}
fn root() -> String {
    library::ROOT.to_string()
}

pub async fn list(State(state): State<AppState>, Query(q): Query<ListQuery>) -> Result<Json<LibraryListing>, ApiError> {
    library::list(&state.pool, &q.folder_id).await.map(Json).map_err(bad)
}

pub async fn search(State(state): State<AppState>, Query(q): Query<ListQuery>) -> Result<Json<Vec<LibraryEntry>>, ApiError> {
    library::search(&state.pool, &q.q).await.map(Json).map_err(bad)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewFolder {
    parent_id: String,
    name: String,
}
pub async fn create_folder(State(state): State<AppState>, Json(i): Json<NewFolder>) -> Result<Json<LibraryEntry>, ApiError> {
    library::create_folder(&state.pool, &i.parent_id, &i.name).await.map(Json).map_err(bad)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    kind: String,
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    destination_id: String,
}
pub async fn rename(State(state): State<AppState>, Json(i): Json<Item>) -> Result<Json<()>, ApiError> {
    library::rename(&state.pool, &i.kind, &i.id, &i.name).await.map(Json).map_err(bad)
}
pub async fn move_to(State(state): State<AppState>, Json(i): Json<Item>) -> Result<Json<()>, ApiError> {
    library::move_to(&state.pool, &i.kind, &i.id, &i.destination_id).await.map(Json).map_err(bad)
}

pub async fn delete(State(state): State<AppState>, Extension(actor): Extension<Actor>, Json(i): Json<Item>) -> Result<Json<()>, ApiError> {
    library::delete(&state.pool, &i.kind, &i.id, &actor.officer_id).await.map_err(bad)?;
    audit::log_event(&state.pool, &actor, "delete library item", Some(("library", &i.id)), Some("to the recycle bin")).await.map_err(|e| bad(e.to_string()))?;
    Ok(Json(()))
}

pub async fn bin(State(state): State<AppState>) -> Result<Json<Vec<BinEntry>>, ApiError> {
    library::bin(&state.pool, &state.vault_root).await.map(Json).map_err(bad)
}

pub async fn restore(State(state): State<AppState>, Extension(actor): Extension<Actor>, Json(i): Json<Item>) -> Result<Json<()>, ApiError> {
    library::restore(&state.pool, &i.kind, &i.id).await.map_err(bad)?;
    audit::log_event(&state.pool, &actor, "restore library item", Some(("library", &i.id)), None).await.map_err(|e| bad(e.to_string()))?;
    Ok(Json(()))
}

pub async fn purge(State(state): State<AppState>, Extension(actor): Extension<Actor>, Json(i): Json<Item>) -> Result<Json<()>, ApiError> {
    library::purge(&state.pool, &state.vault_root, &i.kind, &i.id).await.map_err(bad)?;
    audit::log_event(&state.pool, &actor, "permanently delete library item", Some(("library", &i.id)), None).await.map_err(|e| bad(e.to_string()))?;
    Ok(Json(()))
}

pub async fn empty_bin(State(state): State<AppState>, Extension(actor): Extension<Actor>) -> Result<Json<usize>, ApiError> {
    let n = library::empty_bin(&state.pool, &state.vault_root).await.map_err(bad)?;
    audit::log_event(&state.pool, &actor, "empty library recycle bin", None, Some(&format!("{n} items"))).await.map_err(|e| bad(e.to_string()))?;
    Ok(Json(n))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewFile {
    folder_id: String,
    file_name: String,
    /// The file's bytes as base64, with or without a `data:...;base64,` prefix.
    data_base64: String,
}
/// A file whose bytes the page already holds (dropped or chosen in the browser view).
pub async fn add_file(State(state): State<AppState>, Json(i): Json<NewFile>) -> Result<Json<LibraryEntry>, ApiError> {
    use base64::Engine;
    let raw = i.data_base64.split_once(',').map(|(_, b)| b).unwrap_or(&i.data_base64);
    let bytes = base64::engine::general_purpose::STANDARD.decode(raw).map_err(|_| bad("That file could not be read.".into()))?;
    library::add_file(&state.pool, &state.vault_root, &i.folder_id, &i.file_name, &bytes).await.map(Json).map_err(bad)
}
