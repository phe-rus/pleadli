//! Debug builds only: the node API on loopback, so the frontend can be
//! developed in an ordinary browser tab. Compiled out of release builds
//! entirely (see `transport/mod.rs`), and unlike the first-generation dev
//! server it is not a shortcut around anything: it is the same router, so
//! every route still requires a signed-in session and its permission.
//! Cross-origin access is limited to the dev server's own origin, and the
//! `Host` header must be loopback (DNS rebinding protection).

use axum::extract::Request;
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware::{from_fn, Next};
use axum::response::{IntoResponse, Response};
use axum::Extension;
use tower_http::cors::{Any, CorsLayer};

use crate::api;
use crate::api::guard::Ingress;
use crate::node::NodeRef;

pub const PORT: u16 = 47922;

/// Debug builds may redirect the loopback listener away from the default
/// port so a test node can run alongside a serving app without colliding.
/// Set `VITE_PLEADLI_DEV_PORT` before the process starts; the frontend's
/// `api()` reads the same variable (Vite only exposes `VITE_*`).
fn port() -> u16 {
    std::env::var("VITE_PLEADLI_DEV_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .filter(|p| *p != 0)
        .unwrap_or(PORT)
}

async fn loopback_host_only(req: Request, next: Next) -> Response {
    let port = port();
    let host_ok = req
        .headers()
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .is_some_and(|h| h == format!("127.0.0.1:{port}") || h == format!("localhost:{port}"));
    if !host_ok {
        return StatusCode::FORBIDDEN.into_response();
    }
    next.run(req).await
}

pub async fn serve(node: NodeRef) {
    serve_router(api::router(node)).await
}

pub async fn serve_router(router: axum::Router) {
    let origins = ["http://localhost:3005", "http://127.0.0.1:3005", "http://localhost:3001", "http://127.0.0.1:3001"]
        .map(|o| HeaderValue::from_static(o));
    let cors = CorsLayer::new()
        .allow_origin(origins)
        .allow_methods(Any)
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);

    let app = router
        .layer(Extension(Ingress::DevLoopback))
        .layer(from_fn(loopback_host_only))
        .layer(cors);

    let port = port();
    let listener = match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
        Ok(listener) => listener,
        Err(e) => {
            log::warn!("dev loopback could not bind 127.0.0.1:{port}: {e}");
            return;
        }
    };
    if let Err(e) = axum::serve(listener, app).await {
        log::warn!("dev loopback stopped: {e}");
    }
}
