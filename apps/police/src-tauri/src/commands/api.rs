//! The desktop shell's only door into the application. The webview cannot
//! reach a socket in a release build because there is none: this command hands
//! the request straight to the same router the development listener serves.
//! There is no per-domain Tauri command to call around it; the few commands
//! beside this one exist only because they need the operating system (a file
//! dialog, opening a file in its own program).
//!
//! The shell also holds the sign-in. The session token from a successful
//! sign-in is kept here, attached to every request, and removed from what the
//! window sees, so page code never handles it. The commands that need the
//! operating system check that someone is signed in (`SignedIn`).

use std::sync::Mutex;

use axum::body::Body;
use axum::http::{header, Method, Request};
use axum::Router;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tower::ServiceExt;

pub struct LocalApi(pub Router);

/// The officer signed in at this window, if any: their token, and whether they
/// are an administrator (as they were when they signed in).
#[derive(Default)]
pub struct LocalSession(pub Mutex<Option<(String, bool)>>);

impl LocalSession {
    fn token(&self) -> Option<String> {
        self.0.lock().ok().and_then(|t| t.as_ref().map(|(token, _)| token.clone()))
    }

    fn is_admin(&self) -> bool {
        self.0.lock().ok().is_some_and(|t| t.as_ref().is_some_and(|(_, admin)| *admin))
    }

    fn set(&self, session: Option<(String, bool)>) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = session;
        }
    }
}

/// A command argument that refuses the call unless an officer is signed in at
/// this window. Add it to every command that touches the operating system.
pub struct SignedIn;

impl<'de, R: tauri::Runtime> tauri::ipc::CommandArg<'de, R> for SignedIn {
    fn from_command(command: tauri::ipc::CommandItem<'de, R>) -> Result<Self, tauri::ipc::InvokeError> {
        let signed_in = command.message.state_ref().try_get::<LocalSession>().is_some_and(|session| session.token().is_some());
        if signed_in {
            Ok(SignedIn)
        } else {
            Err(tauri::ipc::InvokeError::from("Sign in to continue."))
        }
    }
}

/// Like `SignedIn`, and the officer must be an administrator.
pub struct AdminSignedIn;

impl<'de, R: tauri::Runtime> tauri::ipc::CommandArg<'de, R> for AdminSignedIn {
    fn from_command(command: tauri::ipc::CommandItem<'de, R>) -> Result<Self, tauri::ipc::InvokeError> {
        match command.message.state_ref().try_get::<LocalSession>() {
            Some(session) if session.token().is_none() => Err(tauri::ipc::InvokeError::from("Sign in to continue.")),
            Some(session) if !session.is_admin() => Err(tauri::ipc::InvokeError::from("Only an administrator can do that.")),
            Some(_) => Ok(AdminSignedIn),
            None => Err(tauri::ipc::InvokeError::from("Sign in to continue.")),
        }
    }
}

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

/// Paths whose success starts a session (the response carries the token).
fn starts_session(path: &str) -> bool {
    matches!(path, "/api/auth/sign-in" | "/api/system/onboarding/station" | "/api/system/onboarding/command")
}

#[tauri::command]
pub async fn api_request(
    api: tauri::State<'_, LocalApi>,
    session: tauri::State<'_, LocalSession>,
    req: ApiRequest,
) -> Result<ApiResponse, String> {
    if !req.path.starts_with("/api/") || req.path.contains("..") {
        return Err("Not an API path.".to_string());
    }
    let method = Method::from_bytes(req.method.to_uppercase().as_bytes()).map_err(|_| "Bad method.".to_string())?;
    let body = match &req.body {
        Some(value) => Body::from(serde_json::to_vec(value).map_err(|e| e.to_string())?),
        None => Body::empty(),
    };
    let path_only = req.path.split('?').next().unwrap_or(&req.path).to_string();
    let mut builder = Request::builder().method(method).uri(&req.path).header(header::CONTENT_TYPE, "application/json");
    if let Some(token) = session.token() {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    let request = builder.body(body).map_err(|e| e.to_string())?;

    let response = api.0.clone().oneshot(request).await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let bytes = axum::body::to_bytes(response.into_body(), 64 * 1024 * 1024).await.map_err(|e| e.to_string())?;
    let mut body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&bytes).to_string()))
    };

    if status == 200 && starts_session(&path_only) {
        // Keep the token here; the window is told who signed in, not the token.
        if let Some(token) = body.get("token").and_then(Value::as_str) {
            let admin = body.pointer("/officer/role").and_then(Value::as_str) == Some("admin");
            session.set(Some((token.to_string(), admin)));
        }
        if let Some(object) = body.as_object_mut() {
            object.remove("token");
        }
    } else if path_only == "/api/auth/sign-out" || status == 401 && path_only != "/api/auth/sign-in" {
        // Signed out, or the node says the session is over.
        session.set(None);
    }
    Ok(ApiResponse { status, body })
}
