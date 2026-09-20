//! `/api/prisons/documents/**`: issuing and verifying the facility's printed
//! documents. Printing itself happens on the officer's machine; the node only
//! decides the number and keeps the register.

use axum::extract::{Query, State};
use axum::{Extension, Json};
use serde::{Deserialize, Serialize};

use super::error::ApiError;
use super::guard::{Need, RouteTable};
use super::write;
use crate::domain::authz::{perm, Actor};
use crate::domain::documents::{self, IssuedDocument, VerifyInput};
use crate::node::NodeRef;

pub fn routes(node: NodeRef) -> RouteTable {
    RouteTable::new(node)
        .post("/api/prisons/documents/issue", Need::Perm(perm::DOCUMENT_WRITE), issue)
        .get("/api/prisons/documents/issued", Need::Perm(perm::DOCUMENT_READ), issued)
        .post("/api/prisons/documents/verify", Need::Perm(perm::DOCUMENT_READ), verify)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueBody {
    kind: String,
    record_id: String,
}

async fn issue(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(body): Json<IssueBody>) -> Result<Json<IssuedDocument>, ApiError> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(documents::issue(c, &actor, &body.kind, &body.record_id).await?) })).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssuedQuery {
    kind: String,
    record_id: String,
}

async fn issued(State(node): State<NodeRef>, Query(query): Query<IssuedQuery>) -> Result<Json<Option<IssuedDocument>>, ApiError> {
    Ok(Json(documents::find(&node.pool, &query.kind, &query.record_id).await?))
}

#[derive(Serialize)]
struct Verified {
    valid: bool,
    document: Option<IssuedDocument>,
}

async fn verify(State(node): State<NodeRef>, Json(input): Json<VerifyInput>) -> Result<Json<Verified>, ApiError> {
    let document = documents::verify(&node.pool, &input).await?;
    Ok(Json(Verified { valid: document.is_some(), document }))
}
