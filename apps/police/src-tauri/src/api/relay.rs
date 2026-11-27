//! `/api/relay/*`: the station's postbox. Anyone signed in sees what was sent
//! and received; sending a referral needs the right to open that case, and
//! deciding who this station talks to is an administrator's.

use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use super::session::domain_error;
use super::{ApiError, AppState};
use crate::domain::relay::{Relay, Status};
use crate::domain::sessions::Actor;

type Shared = Extension<Arc<Relay>>;

fn admin(actor: &Actor) -> Result<(), ApiError> {
    if actor.is_admin() {
        Ok(())
    } else {
        Err((StatusCode::FORBIDDEN, "Only an administrator can change who this station exchanges with.".to_string()))
    }
}

async fn status(Extension(r): Shared) -> Json<Status> {
    Json(r.status().await)
}

async fn check(Extension(r): Shared) -> Json<Status> {
    let _ = r.sync().await;
    Json(r.status().await)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnswerInput {
    officer_in_charge: Option<String>,
}

async fn answer(Extension(actor): Extension<Actor>, Extension(r): Shared, Path(id): Path<String>, Json(input): Json<AnswerInput>) -> Result<Json<Status>, ApiError> {
    admin(&actor)?;
    r.answer_invitation(&id, input.officer_in_charge.as_deref()).await.map_err(domain_error)?;
    let _ = r.sync().await;
    Ok(Json(r.status().await))
}

#[derive(Deserialize)]
struct DeclineInput {
    #[serde(default)]
    reason: String,
}

async fn decline(Extension(actor): Extension<Actor>, Extension(r): Shared, Path(id): Path<String>, Json(input): Json<DeclineInput>) -> Result<Json<Status>, ApiError> {
    admin(&actor)?;
    r.decline_invitation(&id, &input.reason).await.map_err(domain_error)?;
    Ok(Json(r.status().await))
}

/// A referral of a case this officer may not open is refused, as for the file route.
async fn send_referral(State(state): State<AppState>, Extension(actor): Extension<Actor>, Extension(r): Shared, Path(id): Path<String>) -> Result<Json<Value>, ApiError> {
    let case_id: Option<String> = sqlx::query_scalar("SELECT case_id FROM referrals WHERE id = ?").bind(&id).fetch_optional(&state.pool).await.map_err(super::internal_error)?;
    if let Some(case_id) = case_id {
        let hidden = crate::domain::cases::hidden_case_ids(&state.pool, &actor).await.map_err(super::internal_error)?;
        if hidden.contains(&case_id) {
            return Err((StatusCode::FORBIDDEN, "You may not open that case, so you may not send it.".to_string()));
        }
    }
    let package_id = r.send_referral(&id).await.map_err(domain_error)?;
    let _ = r.sync().await;
    Ok(Json(json!({ "packageId": package_id })))
}

async fn send_service_report(Extension(r): Shared, Path(minute_id): Path<String>, Json(input): Json<super::exchange::ServiceReportInput>) -> Result<Json<Value>, ApiError> {
    let package_id = r.send_service_report(&minute_id, input.results, input.reported_by).await.map_err(domain_error)?;
    let _ = r.sync().await;
    Ok(Json(json!({ "packageId": package_id })))
}

#[derive(Deserialize)]
struct RetryInput {
    id: Option<String>,
}

async fn retry(Extension(r): Shared, Json(input): Json<RetryInput>) -> Result<Json<Status>, ApiError> {
    r.retry(input.id.as_deref()).await.map_err(domain_error)?;
    let _ = r.sync().await;
    Ok(Json(r.status().await))
}

async fn reopen(Extension(actor): Extension<Actor>, Extension(r): Shared, Path(id): Path<String>) -> Result<Json<Status>, ApiError> {
    admin(&actor)?;
    r.reopen(&id).await.map_err(domain_error)?;
    let _ = r.sync().await;
    Ok(Json(r.status().await))
}

pub fn routes(state: AppState, relay: Arc<Relay>) -> Router {
    Router::new()
        .route("/api/relay", get(status))
        .route("/api/relay/check", post(check))
        .route("/api/relay/retry", post(retry))
        .route("/api/relay/invitations/{id}/answer", post(answer))
        .route("/api/relay/invitations/{id}/decline", post(decline))
        .route("/api/relay/inbox/{id}/reopen", post(reopen))
        .route("/api/relay/referrals/{id}/send", post(send_referral))
        .route("/api/relay/minutes/{id}/service-report", post(send_service_report))
        .layer(Extension(relay))
        .with_state(state)
}
