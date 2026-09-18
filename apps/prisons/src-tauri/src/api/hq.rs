//! `/api/hq/**`: the Head Office domain. Head Office holds no prisoners of
//! its own, so nothing here operates a facility's records.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::{Extension, Json};
use serde::Deserialize;

use super::error::ApiError;
use super::guard::{Need, RouteTable};
use super::write;
use crate::domain::authz::{perm, Actor};
use crate::domain::cloudflare_tunnel::{self, CloudflareConfig, SaveCloudflareConfigInput};
use crate::domain::facilities::{self, Facility, PairingPayload};
use crate::node::NodeRef;

pub fn routes(node: NodeRef) -> RouteTable {
    use perm::*;
    RouteTable::new(node)
        .get("/api/hq/facilities", Need::Perm(HQ_ESTATE_READ), list_facilities)
        .post("/api/hq/facilities/pairing-code", Need::Perm(HQ_NETWORK_MANAGE), generate_pairing_code)
        .post("/api/hq/facilities/{id}/verify", Need::Perm(HQ_NETWORK_MANAGE), verify_facility)
        .post("/api/hq/facilities/{id}/resend-code", Need::Perm(HQ_NETWORK_MANAGE), resend_code)
        .post("/api/hq/facilities/{id}/revoke", Need::Perm(HQ_NETWORK_MANAGE), revoke_facility)
        .get("/api/hq/network/cloudflare", Need::Perm(HQ_NETWORK_MANAGE), get_cloudflare)
        .put("/api/hq/network/cloudflare", Need::Perm(HQ_NETWORK_MANAGE), save_cloudflare)
}

type Api<T> = Result<Json<T>, ApiError>;

async fn list_facilities(State(node): State<NodeRef>) -> Api<Vec<Facility>> {
    Ok(Json(facilities::list_facilities(&node.pool).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairingCodeBody {
    officer_email: String,
}

async fn generate_pairing_code(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Json(body): Json<PairingCodeBody>,
) -> Api<PairingPayload> {
    if !body.officer_email.contains('@') {
        return Err(ApiError::bad_request("Enter the email address of the officer who will verify this facility."));
    }
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(facilities::generate_pairing_code(c, &actor, body.officer_email.trim()).await?) })).await?))
}

#[derive(Deserialize)]
struct VerifyBody {
    code: String,
}

async fn verify_facility(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
    Json(body): Json<VerifyBody>,
) -> Api<Facility> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(facilities::verify_facility(c, &actor, &id, body.code.trim()).await?) })).await?))
}

async fn resend_code(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>) -> Api<Facility> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(facilities::resend_verification_code(c, &actor, &id).await?) })).await?))
}

async fn revoke_facility(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>) -> Api<Facility> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(facilities::revoke_facility(c, &actor, &id).await?) })).await?))
}

async fn get_cloudflare(State(node): State<NodeRef>) -> Api<Option<CloudflareConfig>> {
    Ok(Json(cloudflare_tunnel::get_config(&node.pool).await?))
}

async fn save_cloudflare(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Json(input): Json<SaveCloudflareConfigInput>,
) -> Result<StatusCode, ApiError> {
    write(&node, |c| Box::pin(async move { Ok(cloudflare_tunnel::save_config(c, &actor, input).await?) })).await?;
    Ok(StatusCode::NO_CONTENT)
}
