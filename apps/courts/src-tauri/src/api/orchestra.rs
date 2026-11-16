//! `/api/orchestra/*`: the licence, papers sent to pleadli.com/verify, and
//! backups to the judiciary's own storage. The bench computer has no sign-in,
//! so whoever uses it sees and acts on it.

use std::sync::Arc;

use axum::{
    extract::{Extension, Path},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use pleadli_node_core::orchestra::{BackupRun, Orchestra, OrchestraError, Status};
use pleadli_node_core::snapshot::{RestoreError, Staged};
use serde::Deserialize;
use serde_json::{json, Value};

use super::AppState;

type Shared = Extension<Arc<Orchestra>>;
type Answer<T> = Result<Json<T>, Response>;

/// `{code, message}` like every other refusal here; the code is Orchestra's
/// own (offline, seats_full, restore_phrase, ...) for the window to say in its
/// own words.
fn refuse(status: StatusCode, code: &str, message: String) -> Response {
    (status, Json(json!({ "code": code, "message": message }))).into_response()
}

fn fail(e: OrchestraError) -> Response {
    let status = match &e {
        OrchestraError::Offline(_) => StatusCode::SERVICE_UNAVAILABLE,
        // pleadli.com's own refusal (a 401 or 403 there) must not read as a
        // refusal here: the code inside says what it was.
        OrchestraError::Api { .. } => StatusCode::BAD_GATEWAY,
        OrchestraError::Needs(_) => StatusCode::CONFLICT,
        OrchestraError::Storage(_) | OrchestraError::Backup(_) => StatusCode::BAD_GATEWAY,
        OrchestraError::Db(_) => StatusCode::INTERNAL_SERVER_ERROR,
    };
    refuse(status, &e.code(), e.to_string())
}

async fn status(Extension(o): Shared) -> Answer<Status> {
    o.status().await.map(Json).map_err(fail)
}

/// Asks pleadli.com now, instead of waiting for the next hello.
async fn contact(Extension(o): Shared) -> Answer<Status> {
    o.contact().await.map_err(fail)?;
    o.status().await.map(Json).map_err(fail)
}

#[derive(Deserialize)]
struct ActivateInput {
    key: String,
}

async fn activate(Extension(o): Shared, Json(input): Json<ActivateInput>) -> Answer<Status> {
    o.activate(&input.key).await.map(Json).map_err(fail)
}

#[derive(Deserialize)]
struct OfficeInput {
    address: String,
}

async fn office(Extension(o): Shared, Json(input): Json<OfficeInput>) -> Answer<Status> {
    o.set_office(&input.address).await.map(Json).map_err(fail)
}

async fn back_up(Extension(o): Shared) -> Answer<Vec<BackupRun>> {
    o.back_up_now().await.map(Json).map_err(fail)
}

async fn check_storage(Extension(o): Shared, Path(id): Path<String>) -> Answer<Value> {
    o.check_storage(&id).await.map(|_| Json(json!({ "ok": true }))).map_err(fail)
}

async fn send_papers(Extension(o): Shared) -> Answer<Value> {
    o.send_papers().await.map(|n| Json(json!({ "sent": n }))).map_err(fail)
}

#[derive(Deserialize)]
struct RestoreInput {
    path: String,
    phrase: String,
}

async fn restore(Extension(o): Shared, Json(input): Json<RestoreInput>) -> Answer<Staged> {
    o.stage_restore(std::path::Path::new(&input.path), &input.phrase).await.map(Json).map_err(|e| {
        let code = match &e {
            RestoreError::Phrase => "restore_phrase",
            RestoreError::Unreadable => "restore_unreadable",
            RestoreError::WrongApp(_) => "restore_wrong_app",
            RestoreError::Newer => "restore_newer",
            RestoreError::Io(_) => "restore_io",
        };
        refuse(StatusCode::UNPROCESSABLE_ENTITY, code, e.to_string())
    })
}

/// Throws away a staged restore that has not been put in place.
async fn cancel_restore(Extension(o): Shared) -> Answer<Value> {
    o.cancel_restore().map(|_| Json(json!({ "ok": true }))).map_err(|e| refuse(StatusCode::INTERNAL_SERVER_ERROR, "restore_io", e.to_string()))
}

/// Nested at `/api/orchestra`, behind the same gate as the rest of the API.
pub fn routes(orchestra: Arc<Orchestra>) -> Router<AppState> {
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
