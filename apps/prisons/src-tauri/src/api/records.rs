//! `/api/records/*`: the facility's records directory. What the Library shows, a manual "save
//! now", and recovery from the folder. Reading needs prisoner access; saving and recovering need
//! someone who manages the node.

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use pleadli_node_core::records_db::{self, Attach, Found, Overview, RecoverReport, SyncReport};
use serde::{Deserialize, Serialize};

use super::error::ApiError;
use super::guard::{Need, RouteTable};
use crate::domain::authz::perm;
use crate::domain::records_dir;
use crate::node::NodeRef;

fn bad(message: impl ToString) -> ApiError {
    ApiError::new(StatusCode::BAD_REQUEST, "records", &message.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Library {
    #[serde(flatten)]
    overview: Overview,
    /// Made by another installation: needs the recovery phrase before anything is written.
    locked: bool,
    /// An institution is in this folder that this computer has not restored: offer to restore it.
    restore: Option<Found>,
}

async fn overview() -> Result<Json<Library>, ApiError> {
    let ctx = records_dir::context().map_err(bad)?;
    let overview = records_db::overview(&ctx.root).map_err(bad)?;
    let restore = match records_db::attach_state(&ctx.root, &ctx.data_dir) {
        Attach::Foreign(f) => Some(f),
        _ => None,
    };
    Ok(Json(Library { overview, locked: records_db::is_locked(&ctx.root, &ctx.data_dir), restore }))
}

/// Before setup: is there already a facility in the records folder?
async fn found(State(node): State<NodeRef>) -> Result<Json<Option<Found>>, ApiError> {
    if !crate::domain::officers::is_bootstrap(&node.pool).await.map_err(bad)? {
        return Ok(Json(None));
    }
    let ctx = records_dir::context().map_err(bad)?;
    Ok(Json(match records_db::attach_state(&ctx.root, &ctx.data_dir) {
        Attach::Foreign(f) => Some(f),
        _ => None,
    }))
}

/// Before setup: restore the facility from the folder instead of setting up a new one.
async fn restore(State(node): State<NodeRef>, Json(i): Json<Recover>) -> Result<Json<RecoverReport>, ApiError> {
    if !crate::domain::officers::is_bootstrap(&node.pool).await.map_err(bad)? {
        return Err(bad("This facility is already set up."));
    }
    run_recover(&node, i.phrase, records_dir::RESTORE_REPLACES).await.map(Json)
}

#[derive(Deserialize)]
struct PaperQuery {
    id: String,
}

async fn paper(Query(q): Query<PaperQuery>) -> Result<Json<Option<String>>, ApiError> {
    let ctx = records_dir::context().map_err(bad)?;
    Ok(Json(records_db::read_paper(&ctx.root, &q.id)))
}

async fn sync_now(State(node): State<NodeRef>) -> Result<Json<SyncReport>, ApiError> {
    let ctx = records_dir::context().map_err(bad)?;
    let key = match &ctx.orchestra {
        Some(o) => o.institution_key().await,
        None => None,
    }
                    .or_else(pleadli_node_core::records_db::debug_institution_key);
    records_db::sync(&node.pool, &ctx.vault_root, &ctx.root, &ctx.data_dir, &records_dir::layout(), key.as_ref()).await.map(Json).map_err(bad)
}

#[derive(Deserialize)]
struct Recover {
    #[serde(default)]
    phrase: Option<String>,
}

/// Rebuilds the database from the folder. Never overwrites a row that is already there.
async fn recover(State(node): State<NodeRef>, Json(i): Json<Recover>) -> Result<Json<RecoverReport>, ApiError> {
    run_recover(&node, i.phrase, &[]).await.map(Json)
}

async fn run_recover(node: &NodeRef, phrase: Option<String>, replace: &[&str]) -> Result<RecoverReport, ApiError> {
    let ctx = records_dir::context().map_err(bad)?;
    let rk = match phrase.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        Some(p) => records_db::unlock_with_phrase(&ctx.root, &ctx.data_dir, p),
        None => records_db::open_keys(&ctx.root, "prisons", &ctx.data_dir, None),
    }
    .map_err(bad)?;
    records_db::recover(&node.pool, &ctx.vault_root, &ctx.root, &ctx.data_dir, &rk, replace).await.map_err(bad)
}

pub fn routes(node: NodeRef) -> RouteTable {
    RouteTable::new(node)
        .get("/api/records", Need::Perm(perm::PRISONER_READ), overview)
        .get("/api/records/paper", Need::Perm(perm::PRISONER_READ), paper)
        .post("/api/records/sync", Need::Perm(perm::NODE_MANAGE), sync_now)
        .post("/api/records/recover", Need::Perm(perm::NODE_MANAGE), recover)
        .get("/api/records/found", Need::Device, found)
        .post("/api/records/restore", Need::Onboarding, restore)
}
