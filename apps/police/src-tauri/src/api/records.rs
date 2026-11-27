//! The records directory over the app's own API: what the Library shows, a manual
//! "save now", and recovery from the folder.
use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use pleadli_node_core::records_db::{self, Attach, Found, Overview, RecoverReport, SyncReport};
use serde::{Deserialize, Serialize};

use super::{ApiError, AppState};
use crate::domain::records_dir;

fn bad(message: impl ToString) -> ApiError {
    (StatusCode::BAD_REQUEST, message.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    #[serde(flatten)]
    overview: Overview,
    /// Made by another installation: needs the recovery phrase before anything is written.
    locked: bool,
    /// An institution is in this folder that this computer has not restored: offer to restore it.
    restore: Option<Found>,
}

pub async fn overview() -> Result<Json<Library>, ApiError> {
    let ctx = records_dir::context().map_err(bad)?;
    let overview = records_db::overview(&ctx.root).map_err(bad)?;
    let restore = match records_db::attach_state(&ctx.root, &ctx.data_dir) {
        Attach::Foreign(f) => Some(f),
        _ => None,
    };
    Ok(Json(Library { overview, locked: records_db::is_locked(&ctx.root, &ctx.data_dir), restore }))
}

/// Before setup: is there already an institution in the records folder? Answers nothing once this station is set up.
pub async fn found(State(state): State<AppState>) -> Result<Json<Option<Found>>, ApiError> {
    if crate::domain::installation::state(&state.pool).await.map(|s| s.installed).unwrap_or(true) {
        return Ok(Json(None));
    }
    let ctx = records_dir::context().map_err(bad)?;
    Ok(Json(match records_db::attach_state(&ctx.root, &ctx.data_dir) {
        Attach::Foreign(f) => Some(f),
        _ => None,
    }))
}

/// Before setup: restore the institution from the folder instead of setting up a new one.
pub async fn restore(State(state): State<AppState>, Json(i): Json<Recover>) -> Result<Json<RecoverReport>, ApiError> {
    if crate::domain::installation::state(&state.pool).await.map(|s| s.installed).unwrap_or(true) {
        return Err((StatusCode::FORBIDDEN, "This station is already set up.".into()));
    }
    run_recover(&state, i.phrase, records_dir::RESTORE_REPLACES).await.map(Json)
}

#[derive(Deserialize)]
pub struct PaperQuery {
    id: String,
}

pub async fn paper(Query(q): Query<PaperQuery>) -> Result<Json<Option<String>>, ApiError> {
    let ctx = records_dir::context().map_err(bad)?;
    Ok(Json(records_db::read_paper(&ctx.root, &q.id)))
}

pub async fn sync_now(State(state): State<AppState>) -> Result<Json<SyncReport>, ApiError> {
    let ctx = records_dir::context().map_err(bad)?;
    let key = match &ctx.orchestra {
        Some(o) => o.institution_key().await,
        None => None,
    }
                    .or_else(pleadli_node_core::records_db::debug_institution_key);
    records_db::sync(&state.pool, &ctx.vault_root, &ctx.root, &ctx.data_dir, &records_dir::layout(), key.as_ref()).await.map(Json).map_err(bad)
}

#[derive(Deserialize)]
pub struct Recover {
    #[serde(default)]
    phrase: Option<String>,
}

/// Rebuilds the database from the folder. Never overwrites a row that is already there.
pub async fn recover(State(state): State<AppState>, Json(i): Json<Recover>) -> Result<Json<RecoverReport>, ApiError> {
    run_recover(&state, i.phrase, &[]).await.map(Json)
}

async fn run_recover(state: &AppState, phrase: Option<String>, replace: &[&str]) -> Result<RecoverReport, ApiError> {
    let ctx = records_dir::context().map_err(bad)?;
    let rk = match phrase.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        Some(p) => records_db::unlock_with_phrase(&ctx.root, &ctx.data_dir, p),
        None => records_db::open_keys(&ctx.root, "police", &ctx.data_dir, None),
    }
    .map_err(bad)?;
    records_db::recover(&state.pool, &ctx.vault_root, &ctx.root, &ctx.data_dir, &rk, replace).await.map_err(bad)
}
