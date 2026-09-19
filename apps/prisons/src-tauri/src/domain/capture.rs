//! Phone capture sessions: a short-lived link a reception officer opens so a
//! phone or another device on the facility network can send the photos.
//! The link token is a random secret stored only as a hash. Photos wait in
//! the session until reception collects them, and are purged when the
//! session is closed or has expired.

use base64::Engine as _;
use rand_core::{OsRng, RngCore};
use serde::Serialize;
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::error::DomainError;
use super::facilities::hash_secret;
use super::nodeconfig;
use super::prisoner_photos::{check_view, decode_jpeg_data_url};
use super::time::now_ms;

pub const SESSION_TTL_MS: i64 = 15 * 60 * 1000;
pub const MAX_PHOTOS: i64 = 6;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedSession {
    pub session_id: String,
    pub url: String,
    pub qr_svg: String,
    pub expires_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArrivedPhoto {
    pub photo_id: String,
    pub view: String,
    pub created_at: i64,
    /// Left out for photos the caller already has (`known` ids).
    pub data_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    pub expires_at: i64,
    pub open: bool,
    pub photos: Vec<ArrivedPhoto>,
}

/// The address a phone on the facility network reaches this node at: the
/// first private IPv4 address of this machine. Serving must be switched on.
async fn lan_base(pool: &SqlitePool) -> Result<String, DomainError> {
    let config = nodeconfig::get(pool).await?;
    if config.node_mode != "node" {
        return Err(DomainError::conflict(
            "NOT_SERVING",
            "This computer is not serving other devices. Turn on serving workstations in Settings, Node and backups, to use a phone as a camera.",
        ));
    }
    let addresses: Vec<std::net::IpAddr> = local_ip_address::list_afinet_netifas()
        .map(|list| list.into_iter().map(|(_, ip)| ip).filter(|ip| ip.is_ipv4() && !ip.is_loopback()).collect())
        .unwrap_or_default();
    let ip = addresses
        .iter()
        .find(|ip| matches!(ip, std::net::IpAddr::V4(v4) if v4.is_private()))
        .or_else(|| addresses.first())
        .ok_or_else(|| DomainError::conflict("NO_NETWORK", "This computer has no network address a phone could reach."))?;
    Ok(format!("https://{ip}:{}", config.lan_port))
}

fn qr_svg(url: &str) -> String {
    use qrcode::render::svg;
    qrcode::QrCode::new(url.as_bytes())
        .map(|code| code.render::<svg::Color>().min_dimensions(180, 180).build())
        .unwrap_or_default()
}

pub async fn open_session(pool: &SqlitePool, conn: &mut SqliteConnection, actor: &Actor) -> Result<OpenedSession, DomainError> {
    let base = lan_base(pool).await?;
    let mut raw = [0u8; 24];
    OsRng.fill_bytes(&mut raw);
    let token = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(raw);
    let id = Uuid::new_v4().to_string();
    let now = now_ms();
    let expires_at = now + SESSION_TTL_MS;
    let created_by = actor.officer_id.clone().unwrap_or_default();

    purge_expired(conn, now).await?;
    sqlx::query("INSERT INTO capture_sessions (id, token_hash, created_by, created_at, expires_at, max_photos) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(hash_secret(&token))
        .bind(&created_by)
        .bind(now)
        .bind(expires_at)
        .bind(MAX_PHOTOS)
        .execute(&mut *conn)
        .await?;
    audit::record(conn, actor, AuditEntry::new("capture.session_opened", "capture_session", Some(&id))).await?;

    let url = format!("{base}/api/capture/{token}");
    Ok(OpenedSession { session_id: id, qr_svg: qr_svg(&url), url, expires_at })
}

async fn purge_expired(conn: &mut SqliteConnection, now: i64) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM capture_session_photos WHERE session_id IN (SELECT id FROM capture_sessions WHERE expires_at < ? OR closed_at IS NOT NULL)")
        .bind(now - SESSION_TTL_MS)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

#[derive(FromRow)]
struct SessionRow {
    expires_at: i64,
    closed_at: Option<i64>,
}

#[derive(FromRow)]
struct PhotoRow {
    id: String,
    view: String,
    created_at: i64,
    data: Vec<u8>,
}

pub async fn status(pool: &SqlitePool, actor: &Actor, session_id: &str, known: &[String]) -> Result<SessionStatus, DomainError> {
    let row: SessionRow = sqlx::query_as("SELECT expires_at, closed_at FROM capture_sessions WHERE id = ? AND created_by = ?")
        .bind(session_id)
        .bind(actor.officer_id.clone().unwrap_or_default())
        .fetch_optional(pool)
        .await?
        .ok_or(DomainError::NotFound("That capture session"))?;

    let rows: Vec<PhotoRow> = sqlx::query_as("SELECT id, view, created_at, data FROM capture_session_photos WHERE session_id = ? ORDER BY created_at")
        .bind(session_id)
        .fetch_all(pool)
        .await?;
    let engine = base64::engine::general_purpose::STANDARD;
    let photos = rows
        .into_iter()
        .map(|p| ArrivedPhoto {
            data_url: (!known.contains(&p.id)).then(|| format!("data:image/jpeg;base64,{}", engine.encode(&p.data))),
            photo_id: p.id,
            view: p.view,
            created_at: p.created_at,
        })
        .collect();
    Ok(SessionStatus { expires_at: row.expires_at, open: row.closed_at.is_none() && row.expires_at > now_ms(), photos })
}

pub async fn close_session(conn: &mut SqliteConnection, actor: &Actor, session_id: &str) -> Result<(), DomainError> {
    let done = sqlx::query("UPDATE capture_sessions SET closed_at = ? WHERE id = ? AND created_by = ? AND closed_at IS NULL")
        .bind(now_ms())
        .bind(session_id)
        .bind(actor.officer_id.clone().unwrap_or_default())
        .execute(&mut *conn)
        .await?;
    if done.rows_affected() > 0 {
        sqlx::query("DELETE FROM capture_session_photos WHERE session_id = ?").bind(session_id).execute(&mut *conn).await?;
        audit::record(conn, actor, AuditEntry::new("capture.session_closed", "capture_session", Some(session_id))).await?;
    }
    Ok(())
}

/// Whether a link token belongs to a session that is still open.
pub async fn token_is_live(pool: &SqlitePool, token: &str) -> Result<bool, sqlx::Error> {
    Ok(find_live(pool, token).await?.is_some())
}

async fn find_live(pool: &SqlitePool, token: &str) -> Result<Option<(String, i64)>, sqlx::Error> {
    sqlx::query_as("SELECT id, max_photos FROM capture_sessions WHERE token_hash = ? AND closed_at IS NULL AND expires_at > ?")
        .bind(hash_secret(token))
        .bind(now_ms())
        .fetch_optional(pool)
        .await
}

/// A phone sending one photo. The link token is the only credential, so
/// every failure is the same refusal.
pub async fn submit_photo(conn: &mut SqliteConnection, token: &str, view: &str, data_url: &str) -> Result<(), DomainError> {
    check_view(view)?;
    let bytes = decode_jpeg_data_url(data_url)?;
    let session: Option<(String, i64)> =
        sqlx::query_as("SELECT id, max_photos FROM capture_sessions WHERE token_hash = ? AND closed_at IS NULL AND expires_at > ?")
            .bind(hash_secret(token))
            .bind(now_ms())
            .fetch_optional(&mut *conn)
            .await?;
    let (session_id, max_photos) = session.ok_or(DomainError::NotFound("That link"))?;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM capture_session_photos WHERE session_id = ?").bind(&session_id).fetch_one(&mut *conn).await?;
    if count >= max_photos {
        return Err(DomainError::conflict("TOO_MANY_PHOTOS", "This link has already received the most photos it accepts."));
    }
    sqlx::query("INSERT INTO capture_session_photos (id, session_id, view, data, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(&session_id)
        .bind(view)
        .bind(bytes)
        .bind(now_ms())
        .execute(&mut *conn)
        .await?;
    audit::record(conn, &Actor::system("phone capture"), AuditEntry::new("capture.photo_received", "capture_session", Some(&session_id)).reason(view)).await?;
    Ok(())
}
