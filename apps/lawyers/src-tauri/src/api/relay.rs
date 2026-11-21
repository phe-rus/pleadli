//! `/api/relay/*`: the firm's postbox. Everyone signed in sees what was sent and received; only an administrator
//! changes who this firm writes to.

use std::sync::Arc;

use axum::extract::{Extension, Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use pleadli_node_core::hub::{Dispatched, Hub, Status};
use serde::Deserialize;
use serde_json::{json, Value};

use super::{ApiError, AppState};
use crate::domain::error::DomainError;
use crate::domain::relay as links;

pub type SharedHub = Option<Extension<Arc<Hub>>>;

fn admin(s: &AppState) -> Result<(), ApiError> {
    super::require_admin(s).map(|_| ())
}

fn invalid(m: String) -> ApiError {
    DomainError::Invalid(m).into()
}

/// What happened to a package that was just sealed, for the screen to say in words:
/// handed to the postbox, left for the file, or the postbox refused it (the file still works).
pub async fn deliver(hub: &SharedHub, bytes: &[u8]) -> Value {
    let Some(Extension(h)) = hub else { return json!({ "route": "fileOnly" }) };
    match h.dispatch(bytes, &[links::COURTS]).await {
        Ok(Dispatched::Queued { package_id, to }) => {
            let hub = h.clone();
            tokio::spawn(async move {
                let _ = hub.sync().await;
            });
            json!({ "route": "queued", "packageId": package_id, "to": to })
        }
        Ok(Dispatched::FileOnly) => json!({ "route": "fileOnly" }),
        Err(e) => json!({ "route": "refused", "reason": e }),
    }
}

async fn status(Extension(h): Extension<Arc<Hub>>) -> Json<Status> {
    Json(h.status().await)
}

async fn check(State(s): State<AppState>, Extension(h): Extension<Arc<Hub>>) -> Result<Json<Status>, ApiError> {
    admin(&s)?;
    let _ = h.sync().await;
    Ok(Json(h.status().await))
}

#[derive(Deserialize)]
struct RetryInput {
    id: Option<String>,
}

async fn retry(State(s): State<AppState>, Extension(h): Extension<Arc<Hub>>, Json(i): Json<RetryInput>) -> Result<Json<Status>, ApiError> {
    admin(&s)?;
    h.retry(i.id.as_deref()).await.map_err(invalid)?;
    let _ = h.sync().await;
    Ok(Json(h.status().await))
}

async fn reopen(State(s): State<AppState>, Extension(h): Extension<Arc<Hub>>, Path(id): Path<String>) -> Result<Json<Status>, ApiError> {
    admin(&s)?;
    h.reopen(&id).await.map_err(invalid)?;
    let _ = h.sync().await;
    Ok(Json(h.status().await))
}

async fn connections(Extension(h): Extension<Arc<Hub>>) -> Result<Json<Value>, ApiError> {
    Ok(Json(h.connections().await.map_err(invalid)?))
}

/// Offers an invitation (already created, with its file) to a court registry through the postbox.
pub async fn send_invite(s: &AppState, hub: &SharedHub, link_id: &str, address: &str, bytes: &[u8]) -> Result<(), ApiError> {
    let Some(Extension(h)) = hub else { return Err(invalid("This computer needs a Pleadli licence for an office before it can use the postbox.".into())) };
    let address = address.trim().to_lowercase();
    h.introduce(&address).await.map_err(invalid)?;
    pleadli_node_core::hub::bind(&s.pool, links::COURTS, link_id, &address).await.map_err(DomainError::from)?;
    let id = pleadli_interchange::envelope::peek(bytes).map(|p| p.header.id).map_err(|e| invalid(e.to_string()))?;
    h.ship(&id, &address, pleadli_interchange::pairing::KIND_INVITE, bytes).await.map_err(invalid)?;
    let h = h.clone();
    tokio::spawn(async move {
        let _ = h.sync().await;
    });
    Ok(())
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(status))
        .route("/check", post(check))
        .route("/retry", post(retry))
        .route("/inbox/{id}/reopen", post(reopen))
        .route("/connections", get(connections))
}

static HUB: std::sync::OnceLock<Arc<Hub>> = std::sync::OnceLock::new();

/// The firm's one postbox driver for the life of the program. The office computer builds its routes more than once
/// (for its own window and for joined computers); they all share this one, so a package is never posted twice.
pub fn hub_for(state: &AppState) -> Option<Arc<Hub>> {
    let orchestra = state.orchestra.clone()?;
    Some(
        HUB.get_or_init(|| {
            let hub = Hub::new(pleadli_interchange::identity::IdentityKind::LawFirm, state.pool.clone(), orchestra, crate::domain::relay::FirmAdapter::new(state.pool.clone()));
            tauri::async_runtime::spawn(hub.clone().run());
            hub
        })
        .clone(),
    )
}
