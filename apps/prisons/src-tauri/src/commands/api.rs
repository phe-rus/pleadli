//! The desktop shell's only door into the node. The webview cannot open a
//! socket to the node in a release build because there is none: this command
//! hands the request straight to the same router the LAN listener uses, as
//! `Ingress::Local`, and every route is still guarded (sign-in, permission).
//! There is no per-domain Tauri command to call around it.

use std::collections::HashMap;

use axum::body::Body;
use axum::http::{header, Method, Request};
use axum::Router;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tower::ServiceExt;

use crate::api::guard::Ingress;
use crate::node::NodeRef;
use crate::transport::forward;

/// The router for this machine's own node, and the node itself when there is
/// one (there is none in recovery mode, which serves only the recovery router).
pub struct LocalApi {
    pub router: Router,
    pub node: Option<NodeRef>,
}

#[derive(Deserialize)]
pub struct ApiRequest {
    method: String,
    path: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    body: Option<Value>,
}

#[derive(Serialize)]
pub struct ApiResponse {
    status: u16,
    body: Value,
}

/// Only these headers cross from the webview. In particular the device header
/// is never accepted here: a local caller is the node's own machine.
const FORWARDED_HEADERS: &[&str] = &["authorization", "x-pleadli-api-level"];

#[tauri::command]
pub async fn api_request(api: tauri::State<'_, LocalApi>, req: ApiRequest) -> Result<ApiResponse, String> {
    if !req.path.starts_with("/api/") || req.path.contains("..") {
        return Err("Not an API path.".to_string());
    }
    let method = Method::from_bytes(req.method.to_uppercase().as_bytes()).map_err(|_| "Bad method.".to_string())?;

    // A workstation forwards everything to its facility node, except the few
    // routes about this machine's own connection.
    let remote = api.node.as_ref().and_then(|node| node.remote.read().unwrap().clone());
    if let Some(remote) = remote {
        let local_only = req.path.starts_with("/api/system/local/") || req.path == "/api/system/onboarding/connect";
        if !local_only {
            let authorization = req.headers.iter().find(|(k, _)| k.eq_ignore_ascii_case("authorization")).map(|(_, v)| v.as_str());
            let (status, body) = forward::forward(&remote, method.as_str(), &req.path, authorization, req.body.as_ref()).await;
            return Ok(ApiResponse { status, body });
        }
    }

    let mut builder = Request::builder().method(method).uri(&req.path).header(header::CONTENT_TYPE, "application/json");
    for (name, value) in &req.headers {
        if FORWARDED_HEADERS.contains(&name.to_lowercase().as_str()) {
            builder = builder.header(name.as_str(), value.as_str());
        }
    }
    let body = match &req.body {
        Some(value) => Body::from(serde_json::to_vec(value).map_err(|e| e.to_string())?),
        None => Body::empty(),
    };
    let mut request = builder.body(body).map_err(|e| e.to_string())?;
    request.extensions_mut().insert(Ingress::Local);

    let response = api.router.clone().oneshot(request).await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let bytes = axum::body::to_bytes(response.into_body(), 64 * 1024 * 1024).await.map_err(|e| e.to_string())?;
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&bytes).to_string()))
    };
    Ok(ApiResponse { status, body })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedFile {
    file_name: String,
    content_base64: String,
}

/// Opens the native file dialog and returns the chosen file's bytes. The
/// webview never names a path, so it cannot read an arbitrary file: only
/// what the officer picks.
#[tauri::command]
pub async fn pick_file(app: AppHandle) -> Result<Option<PickedFile>, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || app.dialog().file().blocking_pick_file())
        .await
        .map_err(|e| e.to_string())?;
    let Some(file) = picked else { return Ok(None) };
    let path = file.into_path().map_err(|e| e.to_string())?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("document").to_string();
    Ok(Some(PickedFile { file_name, content_base64: base64::engine::general_purpose::STANDARD.encode(bytes) }))
}

/// Restarts the application, used to finish a staged restore: the swap of the
/// database happens at startup, before it is opened.
#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}
