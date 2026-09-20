//! `/api/prisons/inbox/**`: the inbox. Any signed-in officer reads the items
//! they may see; the node filters by permission, so an item an officer may not
//! see does not exist for them.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::{Extension, Json};
use serde::{Deserialize, Serialize};

use super::error::ApiError;
use super::guard::{Need, RouteTable};
use super::write;
use crate::domain::authz::{perm, Actor};
use crate::domain::inbox::{self, InboxDetail, InboxRow, ManualInput};
use crate::node::NodeRef;

pub fn routes(node: NodeRef) -> RouteTable {
    RouteTable::new(node)
        .get("/api/prisons/inbox", Need::Session, list)
        .post("/api/prisons/inbox", Need::Perm(perm::PRISONER_READ), record)
        .get("/api/prisons/inbox/unread-count", Need::Session, unread_count)
        .get("/api/prisons/inbox/{id}", Need::Session, get_one)
        .post("/api/prisons/inbox/{id}/read", Need::Session, mark_read)
        .post("/api/prisons/inbox/{id}/status", Need::Session, set_status)
}

type Api<T> = Result<Json<T>, ApiError>;

async fn list(State(node): State<NodeRef>, Extension(actor): Extension<Actor>) -> Api<Vec<InboxRow>> {
    Ok(Json(inbox::list(&node.pool, &actor).await?))
}

#[derive(Serialize)]
struct Count {
    unread: i64,
}

async fn unread_count(State(node): State<NodeRef>, Extension(actor): Extension<Actor>) -> Api<Count> {
    Ok(Json(Count { unread: inbox::unread_count(&node.pool, &actor).await? }))
}

async fn get_one(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>) -> Api<InboxDetail> {
    inbox::get(&node.pool, &actor, &id).await?.map(Json).ok_or_else(|| ApiError::not_found("That inbox item"))
}

async fn mark_read(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    write(&node, |c| Box::pin(async move { Ok(inbox::mark_read(c, &actor, &id).await?) })).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct StatusBody {
    status: String,
    note: Option<String>,
}

async fn set_status(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
    Json(body): Json<StatusBody>,
) -> Result<StatusCode, ApiError> {
    write(&node, |c| Box::pin(async move { Ok(inbox::set_status(c, &actor, &id, &body.status, body.note.as_deref()).await?) })).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
struct Recorded {
    id: String,
}

async fn record(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(input): Json<ManualInput>) -> Api<Recorded> {
    let id = write(&node, |c| Box::pin(async move { Ok(inbox::record_manual(c, &actor, input).await?) })).await?;
    Ok(Json(Recorded { id }))
}
