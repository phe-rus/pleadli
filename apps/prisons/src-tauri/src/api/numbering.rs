//! Prisoner numbering and uniform colours: the facility's own scheme under
//! `/api/prisons/numbering` and the estate default under `/api/hq/estate-policy`.

use axum::extract::State;
use axum::http::StatusCode;
use axum::{Extension, Json};
use serde::Deserialize;

use super::error::ApiError;
use super::guard::{Need, RouteTable};
use super::write;
use crate::domain::authz::{perm, Actor};
use crate::domain::numbering::{self, EstatePolicy, NumberingInput, NumberingView, UniformInput};
use crate::domain::policy_sync;
use crate::node::NodeRef;

pub fn routes(node: NodeRef) -> RouteTable {
    use perm::*;
    RouteTable::new(node)
        .get("/api/prisons/numbering", Need::AnyPerm(&[PRISONER_READ, NODE_MANAGE]), get_numbering)
        .put("/api/prisons/numbering", Need::Perm(NODE_MANAGE), save_numbering)
        .put("/api/prisons/numbering/uniforms", Need::Perm(NODE_MANAGE), save_uniforms)
        .post("/api/prisons/numbering/fetch-defaults", Need::Perm(NODE_MANAGE), fetch_defaults)
        .get("/api/hq/estate-policy", Need::Perm(HQ_ESTATE_READ), get_estate)
        .put("/api/hq/estate-policy", Need::Perm(HQ_NETWORK_MANAGE), save_estate)
        .put("/api/hq/estate-policy/uniforms", Need::Perm(HQ_NETWORK_MANAGE), save_estate_uniforms)
}

type Api<T> = Result<Json<T>, ApiError>;

#[derive(Deserialize)]
struct UniformsBody {
    uniforms: Vec<UniformInput>,
}

async fn get_numbering(State(node): State<NodeRef>) -> Api<NumberingView> {
    Ok(Json(numbering::view(&node.pool).await?))
}

async fn save_numbering(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(input): Json<NumberingInput>) -> Api<NumberingView> {
    write(&node, |c| Box::pin(async move { Ok(numbering::save_config(c, &actor, input).await?) })).await?;
    Ok(Json(numbering::view(&node.pool).await?))
}

async fn save_uniforms(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(body): Json<UniformsBody>) -> Api<NumberingView> {
    write(&node, |c| Box::pin(async move { Ok(numbering::save_uniforms(c, &actor, body.uniforms).await?) })).await?;
    Ok(Json(numbering::view(&node.pool).await?))
}

async fn fetch_defaults(State(node): State<NodeRef>) -> Result<Json<policy_sync::PolicyPullResult>, ApiError> {
    policy_sync::pull_policy(&node.pool).await.map(Json).map_err(|message| {
        log::warn!("policy fetch: {message}");
        ApiError::new(StatusCode::BAD_GATEWAY, "POLICY_FETCH_FAILED", &message)
    })
}

async fn get_estate(State(node): State<NodeRef>) -> Api<EstatePolicy> {
    Ok(Json(numbering::get_estate_policy(&node.pool).await?))
}

async fn save_estate(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(input): Json<NumberingInput>) -> Api<EstatePolicy> {
    write(&node, |c| Box::pin(async move { Ok(numbering::save_estate_config(c, &actor, input).await?) })).await?;
    Ok(Json(numbering::get_estate_policy(&node.pool).await?))
}

async fn save_estate_uniforms(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(body): Json<UniformsBody>) -> Api<EstatePolicy> {
    write(&node, |c| Box::pin(async move { Ok(numbering::save_estate_uniforms(c, &actor, body.uniforms).await?) })).await?;
    Ok(Json(numbering::get_estate_policy(&node.pool).await?))
}
