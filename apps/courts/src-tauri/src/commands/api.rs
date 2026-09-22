//! The desktop shell's only door into the application. The webview cannot
//! reach a socket in a release build because there is none: this command hands
//! the request straight to the same router the development listener serves.
//! There is no per-domain Tauri command to call around it; the few commands
//! beside this one exist only because they need the operating system (a file
//! dialog, opening a file in its own program).

use axum::body::Body;
use axum::http::{header, Method, Request};
use axum::Router;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tower::ServiceExt;

pub struct LocalApi(pub Router);

#[derive(Deserialize)]
pub struct ApiRequest {
    method: String,
    path: String,
    body: Option<Value>,
}

#[derive(Serialize)]
pub struct ApiResponse {
    status: u16,
    body: Value,
}

#[tauri::command]
pub async fn api_request(api: tauri::State<'_, LocalApi>, req: ApiRequest) -> Result<ApiResponse, String> {
    if !req.path.starts_with("/api/") || req.path.contains("..") {
        return Err("Not an API path.".to_string());
    }
    let method = Method::from_bytes(req.method.to_uppercase().as_bytes()).map_err(|_| "Bad method.".to_string())?;
    let body = match &req.body {
        Some(value) => Body::from(serde_json::to_vec(value).map_err(|e| e.to_string())?),
        None => Body::empty(),
    };
    let request = Request::builder()
        .method(method)
        .uri(&req.path)
        .header(header::CONTENT_TYPE, "application/json")
        .body(body)
        .map_err(|e| e.to_string())?;

    let response = api.0.clone().oneshot(request).await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let bytes = axum::body::to_bytes(response.into_body(), 64 * 1024 * 1024).await.map_err(|e| e.to_string())?;
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&bytes).to_string()))
    };
    Ok(ApiResponse { status, body })
}
