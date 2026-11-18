//! `/api/prisons/court/**`: court orders arriving as files (docs/interchange/
//! court-prison.md). Files travel as base64; the window's own dialogs choose
//! where they come from and go to. Every route names its permission.

use axum::extract::{Path, State};
use axum::{Extension, Json};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};

use super::error::ApiError;
use super::guard::{Need, RouteTable};
use super::write;
use crate::domain::authz::{perm, Actor};
use crate::domain::court_orders::{self, CourtLink, FacilityIdentity, Imported, IncomingOrder};
use crate::domain::error::DomainError;
use crate::node::NodeRef;

type Api<T> = Result<Json<T>, ApiError>;

pub fn routes(node: NodeRef) -> RouteTable {
    use perm::*;
    RouteTable::new(node)
        .get("/api/prisons/court/identity", Need::Perm(COURT_MANAGE), get_identity)
        .post("/api/prisons/court/identity", Need::Perm(NODE_MANAGE), create_identity)
        .get("/api/prisons/court/links", Need::Perm(COURT_MANAGE), list_links)
        .post("/api/prisons/court/links", Need::Perm(NODE_MANAGE), create_invite)
        .post("/api/prisons/court/links/{id}/trust", Need::Perm(NODE_MANAGE), trust_link)
        .post("/api/prisons/court/import", Need::Perm(COURT_MANAGE), import_package)
        .get("/api/prisons/court/orders", Need::Perm(COURT_MANAGE), list_orders)
        .post("/api/prisons/court/orders/{id}/record", Need::Perm(CUSTODY_EDIT), record_order)
        .post("/api/prisons/court/orders/{id}/return", Need::Perm(COURT_MANAGE), return_order)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WithFile<T: Serialize> {
    #[serde(flatten)]
    value: T,
    file: String,
    name: String,
}

fn decode(file: &str) -> Result<Vec<u8>, ApiError> {
    B64.decode(file).map_err(|_| DomainError::rejected("That is not a package file.").into())
}

async fn get_identity(State(node): State<NodeRef>) -> Api<Option<FacilityIdentity>> {
    let mut c = node.pool.acquire().await?;
    Ok(Json(court_orders::get_identity(&mut c).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdentityBody {
    name: String,
    jurisdiction: Option<String>,
}

async fn create_identity(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(b): Json<IdentityBody>) -> Api<FacilityIdentity> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(court_orders::create_identity(c, &actor, &b.name, b.jurisdiction.as_deref()).await?) })).await?))
}

async fn list_links(State(node): State<NodeRef>) -> Api<Vec<CourtLink>> {
    let mut c = node.pool.acquire().await?;
    Ok(Json(court_orders::list_links(&mut c).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InviteBody {
    intended_court: String,
    valid_days: i64,
}

async fn create_invite(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(b): Json<InviteBody>) -> Api<WithFile<CourtLink>> {
    let (link, bytes) = write(&node, |c| Box::pin(async move { Ok(court_orders::create_invite(c, &actor, &b.intended_court, b.valid_days).await?) })).await?;
    Ok(Json(WithFile { value: link, file: B64.encode(bytes), name: "prison-invitation.pxpkg".into() }))
}

#[derive(Deserialize)]
struct TrustBody {
    fingerprint: String,
}

async fn trust_link(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>, Json(b): Json<TrustBody>) -> Api<WithFile<CourtLink>> {
    let (link, bytes) = write(&node, |c| Box::pin(async move { Ok(court_orders::trust_link(c, &actor, &id, &b.fingerprint).await?) })).await?;
    Ok(Json(WithFile { value: link, file: B64.encode(bytes), name: "prison-confirmation.pxpkg".into() }))
}

#[derive(Deserialize)]
struct FileBody {
    file: String,
}

async fn import_package(State(node): State<NodeRef>, Json(b): Json<FileBody>) -> Api<Imported> {
    let bytes = decode(&b.file)?;
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(court_orders::import_package(c, &bytes).await?) })).await?))
}

async fn list_orders(State(node): State<NodeRef>) -> Api<Vec<IncomingOrder>> {
    let mut c = node.pool.acquire().await?;
    Ok(Json(court_orders::list_incoming(&mut c).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecordBody {
    prisoner_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Recorded {
    instrument_id: String,
}

async fn record_order(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>, Json(b): Json<RecordBody>) -> Api<WithFile<Recorded>> {
    let (instrument_id, bytes) = write(&node, |c| Box::pin(async move { Ok(court_orders::record_order(c, &actor, &id, &b.prisoner_id).await?) })).await?;
    Ok(Json(WithFile { value: Recorded { instrument_id }, file: B64.encode(bytes), name: "custody-receipt.pxpkg".into() }))
}

#[derive(Deserialize)]
struct ReturnBody {
    reason: String,
}

#[derive(Serialize)]
struct Returned {}

async fn return_order(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>, Json(b): Json<ReturnBody>) -> Api<WithFile<Returned>> {
    let bytes = write(&node, |c| Box::pin(async move { Ok(court_orders::return_order(c, &actor, &id, &b.reason).await?) })).await?;
    Ok(Json(WithFile { value: Returned {}, file: B64.encode(bytes), name: "custody-receipt.pxpkg".into() }))
}
