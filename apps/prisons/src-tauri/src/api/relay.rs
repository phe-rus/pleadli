//! `/api/prisons/relay/**`: the facility's postbox. Reading what was sent and received needs the court-orders
//! permission; changing who the facility writes to, checking now, or retrying needs the node-management one.

use axum::extract::{Path, State};
use axum::Json;
use pleadli_node_core::hub::{Dispatched, Status};
use serde::Deserialize;
use serde_json::{json, Value};

use super::error::ApiError;
use super::guard::{Need, RouteTable};
use crate::domain::authz::perm;
use crate::domain::error::DomainError;
use crate::domain::relay::COURTS;
use crate::node::NodeRef;

type Api<T> = Result<Json<T>, ApiError>;

pub fn routes(node: NodeRef) -> RouteTable {
    use perm::*;
    RouteTable::new(node)
        .get("/api/prisons/relay", Need::Perm(COURT_MANAGE), status)
        .post("/api/prisons/relay/check", Need::Perm(NODE_MANAGE), check)
        .post("/api/prisons/relay/retry", Need::Perm(NODE_MANAGE), retry)
        .post("/api/prisons/relay/inbox/{id}/reopen", Need::Perm(NODE_MANAGE), reopen)
        .get("/api/prisons/relay/connections", Need::Perm(NODE_MANAGE), connections)
}

fn no_licence() -> ApiError {
    DomainError::rejected(pleadli_node_core::hub::NO_LICENCE).into()
}

fn invalid(m: String) -> ApiError {
    DomainError::rejected(m).into()
}

/// What happened to a package that was just sealed, for the screen to say in words:
/// handed to the postbox, left for the file, or the postbox refused it (the file still works).
pub async fn deliver(node: &NodeRef, bytes: &[u8]) -> Value {
    let Some(h) = node.relay.get() else { return json!({ "route": "fileOnly" }) };
    match h.dispatch(bytes, &[COURTS]).await {
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

/// Offers a new invitation to a court registry through the postbox.
pub async fn send_invite(node: &NodeRef, link_id: &str, address: &str, bytes: &[u8]) -> Result<(), ApiError> {
    let h = node.relay.get().ok_or_else(no_licence)?;
    let address = address.trim().to_lowercase();
    h.introduce(&address).await.map_err(invalid)?;
    pleadli_node_core::hub::bind(&node.pool, COURTS, link_id, &address).await.map_err(DomainError::from)?;
    let id = pleadli_interchange::envelope::peek(bytes).map(|p| p.header.id).map_err(|e| invalid(e.to_string()))?;
    h.ship(&id, &address, pleadli_interchange::pairing::KIND_INVITE, bytes).await.map_err(invalid)?;
    let h = h.clone();
    tokio::spawn(async move {
        let _ = h.sync().await;
    });
    Ok(())
}

async fn status(State(node): State<NodeRef>) -> Api<Status> {
    Ok(Json(node.relay.get().ok_or_else(no_licence)?.status().await))
}

async fn check(State(node): State<NodeRef>) -> Api<Status> {
    let h = node.relay.get().ok_or_else(no_licence)?;
    let _ = h.sync().await;
    Ok(Json(h.status().await))
}

#[derive(Deserialize)]
struct RetryBody {
    id: Option<String>,
}

async fn retry(State(node): State<NodeRef>, Json(b): Json<RetryBody>) -> Api<Status> {
    let h = node.relay.get().ok_or_else(no_licence)?;
    h.retry(b.id.as_deref()).await.map_err(invalid)?;
    let _ = h.sync().await;
    Ok(Json(h.status().await))
}

async fn reopen(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<Status> {
    let h = node.relay.get().ok_or_else(no_licence)?;
    h.reopen(&id).await.map_err(invalid)?;
    let _ = h.sync().await;
    Ok(Json(h.status().await))
}

async fn connections(State(node): State<NodeRef>) -> Api<Value> {
    Ok(Json(node.relay.get().ok_or_else(no_licence)?.connections().await.map_err(invalid)?))
}
