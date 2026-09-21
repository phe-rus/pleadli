//! `/api/prisons/report-drafts/**`: composing a report. A draft is saved as
//! often as needed and issued once; issuing produces the numbered report that
//! `/api/prisons/reports/{id}` serves.

use axum::extract::{Path, State};
use axum::{Extension, Json};
use serde::Deserialize;
use serde_json::Value;

use super::error::ApiError;
use super::guard::{Need, RouteTable};
use super::write;
use crate::domain::authz::{perm, Actor};
use crate::domain::report_drafts::{self, Draft, DraftSummary};
use crate::domain::reports::GeneratedReport;
use crate::domain::error::DomainError;
use crate::node::NodeRef;

pub fn routes(node: NodeRef) -> RouteTable {
    use perm::*;
    RouteTable::new(node)
        .get("/api/prisons/report-drafts", Need::AnyPerm(&[REPORT_READ, HQ_REPORTS]), list)
        .post("/api/prisons/report-drafts", Need::Perm(REPORT_GENERATE), create)
        .get("/api/prisons/report-drafts/{id}", Need::AnyPerm(&[REPORT_READ, HQ_REPORTS]), get_one)
        .put("/api/prisons/report-drafts/{id}", Need::Perm(REPORT_GENERATE), update)
        .post("/api/prisons/report-drafts/{id}/issue", Need::Perm(REPORT_GENERATE), issue)
}

#[derive(Deserialize)]
struct SaveBody {
    title: String,
    blocks: Value,
}

async fn list(State(node): State<NodeRef>) -> Result<Json<Vec<DraftSummary>>, ApiError> {
    Ok(Json(report_drafts::list(&node.pool).await?))
}

async fn get_one(State(node): State<NodeRef>, Path(id): Path<String>) -> Result<Json<Draft>, ApiError> {
    Ok(Json(report_drafts::get(&node.pool, &id).await?.ok_or(DomainError::NotFound("That draft"))?))
}

async fn create(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(body): Json<SaveBody>) -> Result<Json<Draft>, ApiError> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(report_drafts::create(c, &actor, &body.title, &body.blocks).await?) })).await?))
}

async fn update(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>, Json(body): Json<SaveBody>) -> Result<Json<Draft>, ApiError> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(report_drafts::update(c, &actor, &id, &body.title, &body.blocks).await?) })).await?))
}

async fn issue(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>) -> Result<Json<GeneratedReport>, ApiError> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(report_drafts::issue(c, &actor, &id).await?) })).await?))
}
