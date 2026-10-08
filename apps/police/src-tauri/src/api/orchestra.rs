//! `/api/orchestra/*`: the licence, papers sent to pleadli.com/verify, and
//! backups to the institution's own storage. Every officer sees the state (the
//! trial or licence bar); only an administrator acts (session::admin_only), and
//! only an administrator sees where backups go.

use std::sync::Arc;

use axum::{
    extract::{Extension, Path},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use pleadli_node_core::orchestra::{BackupRun, Orchestra, OrchestraError, Status};
use pleadli_node_core::snapshot::{RestoreError, Staged};
use serde::Deserialize;
use serde_json::{json, Value};

use super::ApiError;
use crate::domain::sessions::Actor;

type Shared = Extension<Arc<Orchestra>>;

/// Errors carry a code the window turns into its own words, and the English
/// as a fallback.
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
    (status, json!({ "code": e.code(), "message": e.to_string() }).to_string())
}

fn for_actor(mut status: Status, actor: &Actor) -> Status {
    if !actor.is_admin() {
        // Officers see the bar; storage places and the device are an administrator's business.
        status.backup.storage.clear();
        status.backup.history.clear();
        status.device = String::new();
    }
    status
}

async fn status(Extension(o): Shared, Extension(actor): Extension<Actor>) -> Result<Json<Status>, ApiError> {
    o.status().await.map(|s| Json(for_actor(s, &actor))).map_err(fail)
}

/// Asks pleadli.com now, instead of waiting for the next hello.
async fn contact(Extension(o): Shared) -> Result<Json<Status>, ApiError> {
    o.contact().await.map_err(fail)?;
    o.status().await.map(Json).map_err(fail)
}

#[derive(Deserialize)]
struct ActivateInput {
    key: String,
}

async fn activate(Extension(o): Shared, Json(input): Json<ActivateInput>) -> Result<Json<Status>, ApiError> {
    o.activate(&input.key).await.map(Json).map_err(fail)
}

#[derive(Deserialize)]
struct OfficeInput {
    address: String,
}

async fn office(Extension(o): Shared, Json(input): Json<OfficeInput>) -> Result<Json<Status>, ApiError> {
    o.set_office(&input.address).await.map(Json).map_err(fail)
}

async fn back_up(Extension(o): Shared) -> Result<Json<Vec<BackupRun>>, ApiError> {
    o.back_up_now().await.map(Json).map_err(fail)
}

async fn check_storage(Extension(o): Shared, Path(id): Path<String>) -> Result<Json<Value>, ApiError> {
    o.check_storage(&id).await.map(|_| Json(json!({ "ok": true }))).map_err(fail)
}

async fn send_papers(Extension(o): Shared) -> Result<Json<Value>, ApiError> {
    o.send_papers().await.map(|n| Json(json!({ "sent": n }))).map_err(fail)
}

#[derive(Deserialize)]
struct RestoreInput {
    path: String,
    phrase: String,
}

async fn restore(Extension(o): Shared, Json(input): Json<RestoreInput>) -> Result<Json<Staged>, ApiError> {
    o.stage_restore(std::path::Path::new(&input.path), &input.phrase).await.map(Json).map_err(|e| {
        let code = match &e {
            RestoreError::Phrase => "restore_phrase",
            RestoreError::Unreadable => "restore_unreadable",
            RestoreError::WrongApp(_) => "restore_wrong_app",
            RestoreError::Newer => "restore_newer",
            RestoreError::Io(_) => "restore_io",
        };
        (StatusCode::UNPROCESSABLE_ENTITY, json!({ "code": code, "message": e.to_string() }).to_string())
    })
}

async fn cancel_restore(Extension(o): Shared) -> Result<Json<Value>, ApiError> {
    o.cancel_restore().map(|_| Json(json!({ "ok": true }))).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// Nested at `/api/orchestra`.
pub fn routes(orchestra: Arc<Orchestra>) -> Router {
    Router::new()
        .route("/", get(status))
        .route("/contact", post(contact))
        .route("/activate", post(activate))
        .route("/office", post(office))
        .route("/backup", post(back_up))
        .route("/storage/{id}/check", post(check_storage))
        .route("/papers/send", post(send_papers))
        .route("/restore", post(restore))
        .route("/restore/cancel", post(cancel_restore))
        .layer(Extension(orchestra))
}
