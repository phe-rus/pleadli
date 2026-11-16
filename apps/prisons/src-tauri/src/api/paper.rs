//! `/api/prints/**`: the prison's papers, the same as every Pleadli app's.
//! Each printed paper's wording is recorded under the code printed on it
//! (node-core `paper`), so pleadli.com/verify can say it is genuine.

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::{Extension, Json};
use serde::Deserialize;

use pleadli_node_core::paper::{self, PaperInput, PaperPrint, Stamp};

use super::error::ApiError;
use super::guard::{Need, RouteTable};
use crate::domain::authz::{perm, Actor};
use crate::node::NodeRef;

pub fn routes(node: NodeRef) -> RouteTable {
    RouteTable::new(node)
        .post("/api/prints", Need::Perm(perm::DOCUMENT_WRITE), stamp)
        .get("/api/prints/last", Need::Perm(perm::DOCUMENT_READ), last)
        .get("/api/prints/history", Need::Perm(perm::DOCUMENT_READ), history)
        .get("/api/prints/verify", Need::Perm(perm::DOCUMENT_READ), verify)
        .get("/api/prints/library", Need::Perm(perm::DOCUMENT_READ), library)
        .get("/api/prints/ink", Need::Perm(perm::DOCUMENT_READ), get_ink)
        .put("/api/prints/ink", Need::Perm(perm::DOCUMENT_WRITE), put_ink)
}

fn failed(e: sqlx::Error) -> ApiError {
    e.into()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrintInput {
    entity_type: String,
    entity_id: String,
    reference: Option<String>,
    title: String,
    body: String,
}

/// A paper is leaving the prison: its wording is recorded under its code.
async fn stamp(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(input): Json<PrintInput>) -> Result<Json<Stamp>, ApiError> {
    if input.body.trim().is_empty() || input.body.len() > 2_000_000 {
        return Err(ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, "EMPTY_PAPER", "This paper has no wording to record."));
    }
    let input = PaperInput {
        entity_type: &input.entity_type,
        entity_id: &input.entity_id,
        reference: input.reference.as_deref(),
        title: &input.title,
        body: &input.body,
        printed_by: Some(&actor.name),
    };
    paper::stamp(&node.pool, input).await.map(Json).map_err(failed)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EntityQuery {
    entity_type: String,
    entity_id: String,
}

async fn last(State(node): State<NodeRef>, Query(q): Query<EntityQuery>) -> Result<Json<Option<PaperPrint>>, ApiError> {
    paper::last_print(&node.pool, &q.entity_type, &q.entity_id).await.map(Json).map_err(failed)
}

async fn history(State(node): State<NodeRef>, Query(q): Query<EntityQuery>) -> Result<Json<Vec<PaperPrint>>, ApiError> {
    paper::history(&node.pool, &q.entity_type, &q.entity_id).await.map(Json).map_err(failed)
}

#[derive(Deserialize)]
struct VerifyQuery {
    code: String,
}

async fn verify(State(node): State<NodeRef>, Query(q): Query<VerifyQuery>) -> Result<Json<Option<PaperPrint>>, ApiError> {
    paper::verify(&node.pool, &q.code).await.map(Json).map_err(failed)
}

/// Every paper the prison has printed, the latest version of each.
async fn library(State(node): State<NodeRef>) -> Result<Json<Vec<PaperPrint>>, ApiError> {
    paper::library(&node.pool, 1000).await.map(Json).map_err(failed)
}

async fn get_ink(State(node): State<NodeRef>, Query(q): Query<EntityQuery>) -> Result<Json<Option<String>>, ApiError> {
    paper::ink(&node.pool, &q.entity_type, &q.entity_id).await.map(Json).map_err(failed)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InkInput {
    entity_type: String,
    entity_id: String,
    ink: Option<String>,
}

/// Keeps (or clears) the handwriting on one paper, under the officer who wrote it.
async fn put_ink(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(input): Json<InkInput>) -> Result<StatusCode, ApiError> {
    if input.ink.as_ref().is_some_and(|i| i.len() > 4_000_000) {
        return Err(ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, "TOO_MUCH_INK", "There is too much writing on this paper to keep."));
    }
    paper::set_ink(&node.pool, &input.entity_type, &input.entity_id, input.ink.as_deref(), Some(actor.name.as_str())).await.map_err(failed)?;
    Ok(StatusCode::NO_CONTENT)
}
