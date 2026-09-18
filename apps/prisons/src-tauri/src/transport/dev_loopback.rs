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

async fn loopback_host_only(req: Request, next: Next) -> Response {
    let host_ok = req
        .headers()
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .is_some_and(|h| h == format!("127.0.0.1:{PORT}") || h == format!("localhost:{PORT}"));
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

    let listener = match tokio::net::TcpListener::bind(("127.0.0.1", PORT)).await {
        Ok(listener) => listener,
        Err(e) => {
            log::warn!("dev loopback could not bind 127.0.0.1:{PORT}: {e}");
            return;
        }
    };
    if let Err(e) = axum::serve(listener, app).await {
        log::warn!("dev loopback stopped: {e}");
    }
}
