//! `/api/orchestra/*`: the licence, papers sent to pleadli.com/verify, and
//! backups to the service's own storage. Every officer signed in sees the state
//! (the trial or licence bar); acting needs `node.manage`, and only someone
//! who holds it sees where backups go.

use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::{Extension, Json};
use pleadli_node_core::orchestra::{BackupRun, Orchestra, OrchestraError, Status};
use pleadli_node_core::snapshot::{RestoreError, Staged};
use serde::Deserialize;
use serde_json::{json, Value};

use super::error::ApiError;
use super::guard::{Need, RouteTable};
use crate::domain::authz::{perm, Actor};
use crate::node::NodeRef;

fn fail(e: OrchestraError) -> ApiError {
    let status = match &e {
        OrchestraError::Offline(_) => StatusCode::SERVICE_UNAVAILABLE,
        // pleadli.com's own refusal (a 401 or 403 there) must not read as this
        // officer's session ending here: the code inside says what it was.
        OrchestraError::Api { .. } => StatusCode::BAD_GATEWAY,
        OrchestraError::Needs(_) => StatusCode::CONFLICT,
        OrchestraError::Storage(_) | OrchestraError::Backup(_) => StatusCode::BAD_GATEWAY,
        OrchestraError::Db(_) => StatusCode::INTERNAL_SERVER_ERROR,
    };
    ApiError::new(status, &e.code(), &e.to_string())
}

fn orchestra(node: &NodeRef) -> Result<Arc<Orchestra>, ApiError> {
    node.orchestra.get().cloned().ok_or_else(|| ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "offline", "Pleadli Orchestra is not running on this computer."))
}

async fn status(State(node): State<NodeRef>, actor: Option<Extension<Actor>>) -> Result<Json<Status>, ApiError> {
    let mut status = orchestra(&node)?.status().await.map_err(fail)?;
    if !actor.is_some_and(|Extension(a)| a.can(perm::NODE_MANAGE)) {
        // Officers see the bar; storage places and the device are for whoever manages the node.
        status.backup.storage.clear();
        status.backup.history.clear();
        status.device = String::new();
    }
    Ok(Json(status))
}

/// Asks pleadli.com now, instead of waiting for the next hello.
async fn contact(State(node): State<NodeRef>) -> Result<Json<Status>, ApiError> {
    let o = orchestra(&node)?;
    o.contact().await.map_err(fail)?;
    o.status().await.map(Json).map_err(fail)
}

#[derive(Deserialize)]
struct ActivateInput {
    key: String,
}

async fn activate(State(node): State<NodeRef>, Json(input): Json<ActivateInput>) -> Result<Json<Status>, ApiError> {
    orchestra(&node)?.activate(&input.key).await.map(Json).map_err(fail)
}

#[derive(Deserialize)]
struct OfficeInput {
    address: String,
}

async fn office(State(node): State<NodeRef>, Json(input): Json<OfficeInput>) -> Result<Json<Status>, ApiError> {
    orchestra(&node)?.set_office(&input.address).await.map(Json).map_err(fail)
}

async fn back_up(State(node): State<NodeRef>) -> Result<Json<Vec<BackupRun>>, ApiError> {
    orchestra(&node)?.back_up_now().await.map(Json).map_err(fail)
}

async fn check_storage(State(node): State<NodeRef>, Path(id): Path<String>) -> Result<Json<Value>, ApiError> {
    orchestra(&node)?.check_storage(&id).await.map(|_| Json(json!({ "ok": true }))).map_err(fail)
}

async fn send_papers(State(node): State<NodeRef>) -> Result<Json<Value>, ApiError> {
    orchestra(&node)?.send_papers().await.map(|n| Json(json!({ "sent": n }))).map_err(fail)
}

#[derive(Deserialize)]
struct RestoreInput {
    path: String,
    phrase: String,
}

async fn restore(State(node): State<NodeRef>, Json(input): Json<RestoreInput>) -> Result<Json<Staged>, ApiError> {
    orchestra(&node)?.stage_restore(std::path::Path::new(&input.path), &input.phrase).await.map(Json).map_err(|e| {
        let code = match &e {
            RestoreError::Phrase => "restore_phrase",
            RestoreError::Unreadable => "restore_unreadable",
            RestoreError::WrongApp(_) => "restore_wrong_app",
            RestoreError::Newer => "restore_newer",
            RestoreError::Io(_) => "restore_io",
        };
        ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, code, &e.to_string())
    })
}

async fn cancel_restore(State(node): State<NodeRef>) -> Result<Json<Value>, ApiError> {
    orchestra(&node)?.cancel_restore().map(|_| Json(json!({ "ok": true }))).map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "restore_io", &e.to_string()))
}

pub fn routes(node: NodeRef) -> RouteTable {
    RouteTable::new(node)
        .get("/api/orchestra", Need::Session, status)
        .post("/api/orchestra/contact", Need::Perm(perm::NODE_MANAGE), contact)
        .post("/api/orchestra/activate", Need::Perm(perm::NODE_MANAGE), activate)
        .post("/api/orchestra/office", Need::Perm(perm::NODE_MANAGE), office)
        .post("/api/orchestra/backup", Need::Perm(perm::NODE_MANAGE), back_up)
        .post("/api/orchestra/storage/{id}/check", Need::Perm(perm::NODE_MANAGE), check_storage)
        .post("/api/orchestra/papers/send", Need::Perm(perm::NODE_MANAGE), send_papers)
        .post("/api/orchestra/restore", Need::Perm(perm::NODE_MANAGE), restore)
        .post("/api/orchestra/restore/cancel", Need::Perm(perm::NODE_MANAGE), cancel_restore)
}
