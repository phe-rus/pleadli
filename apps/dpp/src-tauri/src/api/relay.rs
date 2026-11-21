//! `/api/relay/*`: the postbox. Everyone signed in sees what was sent and
//! received; only an administrator changes who this office writes to.

use std::sync::Arc;

use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use super::{ApiError, AppState};
use crate::domain::relay::{Relay, Status};

type Shared = Extension<Arc<Relay>>;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnswerInput {
    contact: Option<String>,
}

async fn answer(State(s): State<AppState>, Extension(r): Shared, Path(id): Path<String>, Json(input): Json<AnswerInput>) -> Result<Json<Value>, ApiError> {
    admin(&s)?;
    r.answer_court_invitation(&id, input.contact.as_deref().map(str::trim).filter(|c| !c.is_empty())).await?;
    let _ = r.sync().await;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct DeclineInput {
    reason: Option<String>,
}

async fn decline(State(s): State<AppState>, Extension(r): Shared, Path(id): Path<String>, Json(input): Json<DeclineInput>) -> Result<Json<Status>, ApiError> {
    admin(&s)?;
    r.decline_court_invitation(&id, input.reason.as_deref().unwrap_or("")).await?;
    Ok(Json(r.status().await))
}

fn admin(s: &AppState) -> Result<(), ApiError> {
    if s.security.actor().is_some_and(|a| a.is_administrator()) {
        Ok(())
    } else {
        Err(ApiError(StatusCode::FORBIDDEN, "FORBIDDEN", "Only an administrator can do that.".to_string()))
    }
}

async fn status(Extension(r): Shared) -> Json<Status> {
    Json(r.status().await)
}

/// "Check now": a full round, then the new picture. A failed round is not an
/// error of this call: it is in `last.error`, and the packages are still queued.
async fn check(State(s): State<AppState>, Extension(r): Shared) -> Result<Json<Status>, ApiError> {
    admin(&s)?;
    let _ = r.sync().await;
    Ok(Json(r.status().await))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InviteInput {
    station_address: String,
}

async fn invite(State(s): State<AppState>, Extension(r): Shared, Path(id): Path<String>, Json(input): Json<InviteInput>) -> Result<Json<Value>, ApiError> {
    admin(&s)?;
    r.send_invite(&id, &input.station_address).await?;
    let _ = r.sync().await;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct RetryInput {
    id: Option<String>,
}

async fn retry(State(s): State<AppState>, Extension(r): Shared, Json(input): Json<RetryInput>) -> Result<Json<Status>, ApiError> {
    admin(&s)?;
    r.retry(input.id.as_deref()).await?;
    let _ = r.sync().await;
    Ok(Json(r.status().await))
}

async fn reopen(State(s): State<AppState>, Extension(r): Shared, Path(id): Path<String>) -> Result<Json<Status>, ApiError> {
    admin(&s)?;
    r.reopen(&id).await?;
    let _ = r.sync().await;
    Ok(Json(r.status().await))
}

async fn connections(Extension(r): Shared) -> Result<Json<Value>, ApiError> {
    Ok(Json(r.connections().await?))
}

pub fn routes(relay: Arc<Relay>) -> Router<AppState> {
    Router::new()
        .route("/", get(status))
        .route("/check", post(check))
        .route("/retry", post(retry))
        .route("/connections", get(connections))
        .route("/connections/{id}/invite", post(invite))
        .route("/inbox/{id}/reopen", post(reopen))
        .route("/inbox/{id}/answer", post(answer))
        .route("/inbox/{id}/decline", post(decline))
        .layer(Extension(relay))
}
