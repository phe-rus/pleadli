//! `/api/capture/**`: the two routes a phone uses to send photos to a
//! reception screen. They are authenticated only by the unguessable link
//! token, live on the same listener as the rest of the node API so they work
//! over the facility LAN without an enrolled device, and reveal nothing else.

use std::time::Duration;

use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use super::error::ApiError;
use super::guard::{Need, RouteTable};
use super::write;
use crate::domain::capture;
use crate::node::NodeRef;

const PAGE: &str = include_str!("capture_page.html");
const RATE_LIMIT: usize = 60;
const RATE_WINDOW: Duration = Duration::from_secs(60);

pub fn routes(node: NodeRef) -> RouteTable {
    RouteTable::new(node)
        .get("/api/capture/{token}", Need::CaptureToken, page)
        .post("/api/capture/{token}/photo", Need::CaptureToken, receive_photo)
}

fn refused() -> ApiError {
    ApiError::new(StatusCode::NOT_FOUND, "LINK_INVALID", "This link is not valid or has expired.")
}

async fn page(State(node): State<NodeRef>, Path(token): Path<String>) -> Response {
    let headers = [(header::CACHE_CONTROL, "no-store"), (header::REFERRER_POLICY, "no-referrer")];
    if !node.limiter.check("capture:any", RATE_LIMIT, RATE_WINDOW) || !capture::token_is_live(&node.pool, &token).await.unwrap_or(false) {
        let body = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><body style='font:16px system-ui;padding:2rem'><h1 style='font-size:1.2rem'>This link has expired</h1><p>Ask the reception officer for a new one.</p>";
        return (StatusCode::NOT_FOUND, headers, Html(body)).into_response();
    }
    (headers, Html(PAGE)).into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PhotoBody {
    view: String,
    data_url: String,
}

async fn receive_photo(State(node): State<NodeRef>, Path(token): Path<String>, Json(body): Json<PhotoBody>) -> Result<StatusCode, ApiError> {
    if !node.limiter.check("capture:any", RATE_LIMIT, RATE_WINDOW) || !node.limiter.check(&format!("capture:{}", &token.chars().take(12).collect::<String>()), 20, RATE_WINDOW) {
        return Err(ApiError::new(StatusCode::TOO_MANY_REQUESTS, "RATE_LIMITED", "Too many photos too quickly. Wait a moment."));
    }
    write(&node, |c| {
        Box::pin(async move { capture::submit_photo(c, &token, &body.view, &body.data_url).await.map_err(|e| match e {
            crate::domain::error::DomainError::NotFound(_) => refused(),
            other => other.into(),
        }) })
    })
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
