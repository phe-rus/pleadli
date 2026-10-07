//! Taking a person's identification photographs with a phone, for a computer
//! with no camera of its own (Apple's Continuity Camera, done over the
//! station's own network). The desk opens a short-lived link for one person;
//! the phone scans it, takes each pose with its own camera, and every picture
//! is filed on that person at once, so the desk sees it arrive.
//!
//! The listener starts the first time a link is opened and stays up for the
//! life of the app. A link is a long random token, works for one person only,
//! and expires after ten minutes or when the desk closes it.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use sqlx::SqlitePool;

use crate::domain::people;

/// The port phones reach the station on for photos (beside the remote
/// access port), or any free port if it is taken.
pub const PORT: u16 = 47830;
const LIFETIME: Duration = Duration::from_secs(10 * 60);
const PAGE: &str = include_str!("phone_capture.html");

struct Link {
    person_id: String,
    expires: Instant,
}

#[derive(Clone)]
struct Shared {
    pool: SqlitePool,
    vault_root: PathBuf,
}

static LINKS: OnceLock<Mutex<HashMap<String, Link>>> = OnceLock::new();
static LISTENING: OnceLock<u16> = OnceLock::new();

fn links() -> &'static Mutex<HashMap<String, Link>> {
    LINKS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn live_person(token: &str) -> Option<String> {
    let mut map = links().lock().ok()?;
    map.retain(|_, link| link.expires > Instant::now());
    map.get(token).map(|link| link.person_id.clone())
}

/// What the desk shows: the address to scan, as text and as a QR code.
pub struct OpenedLink {
    pub token: String,
    pub url: String,
    pub qr_svg: String,
    pub expires_in_secs: u64,
}

/// Opens a link for one person, starting the listener if it is not running.
pub async fn open(pool: SqlitePool, vault_root: PathBuf, person_id: &str) -> Result<OpenedLink, String> {
    let address = local_ip_address::local_ip().map_err(|_| "This computer is not on a network a phone can reach.".to_string())?;
    let port = match LISTENING.get() {
        Some(port) => *port,
        None => {
            let listener = match tokio::net::TcpListener::bind(("0.0.0.0", PORT)).await {
                Ok(l) => l,
                Err(_) => tokio::net::TcpListener::bind(("0.0.0.0", 0)).await.map_err(|e| e.to_string())?,
            };
            let port = listener.local_addr().map_err(|e| e.to_string())?.port();
            let router = Router::new()
                .route("/p/{token}", get(page))
                .route("/p/{token}/photo", post(receive))
                .with_state(Shared { pool, vault_root });
            tokio::spawn(async move {
                let _ = axum::serve(listener, router).await;
            });
            *LISTENING.get_or_init(|| port)
        }
    };
    let token = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
    links()
        .lock()
        .map_err(|_| "busy".to_string())?
        .insert(token.clone(), Link { person_id: person_id.to_string(), expires: Instant::now() + LIFETIME });
    let url = format!("http://{address}:{port}/p/{token}");
    let qr_svg = qrcode::QrCode::new(url.as_bytes())
        .map_err(|e| e.to_string())?
        .render::<qrcode::render::svg::Color>()
        .quiet_zone(false)
        .build();
    Ok(OpenedLink { token, url, qr_svg, expires_in_secs: LIFETIME.as_secs() })
}

/// Ends a link before it expires (the desk closed the window).
pub fn close(token: &str) {
    if let Ok(mut map) = links().lock() {
        map.remove(token);
    }
}

async fn page(Path(token): Path<String>) -> Response {
    let headers = [(header::CACHE_CONTROL, "no-store"), (header::REFERRER_POLICY, "no-referrer")];
    if live_person(&token).is_none() {
        let body = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><body style='font:17px -apple-system,system-ui;padding:2rem;color:#111'><h1 style='font-size:1.3rem'>This link has ended</h1><p>Ask the officer at the desk for a new one.</p>";
        return (StatusCode::NOT_FOUND, headers, Html(body)).into_response();
    }
    (headers, Html(PAGE)).into_response()
}

#[derive(Deserialize)]
struct Photo {
    angle: String,
    data: String,
}

async fn receive(State(shared): State<Shared>, Path(token): Path<String>, Json(photo): Json<Photo>) -> Result<StatusCode, (StatusCode, String)> {
    let person_id = live_person(&token).ok_or((StatusCode::NOT_FOUND, "This link has ended.".to_string()))?;
    if !people::PHOTO_ANGLES.contains(&photo.angle.as_str()) {
        return Err((StatusCode::BAD_REQUEST, "Unknown pose.".to_string()));
    }
    use base64::Engine;
    let raw = photo.data.split_once(',').map(|(_, b)| b).unwrap_or(&photo.data);
    let bytes = base64::engine::general_purpose::STANDARD.decode(raw).map_err(|_| (StatusCode::BAD_REQUEST, "That picture could not be read.".to_string()))?;
    if bytes.len() > 15_000_000 {
        return Err((StatusCode::PAYLOAD_TOO_LARGE, "That picture is too large.".to_string()));
    }
    people::set_photo(&shared.pool, &shared.vault_root, &person_id, &photo.angle, &format!("{}.jpg", photo.angle), &bytes)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(StatusCode::NO_CONTENT)
}
