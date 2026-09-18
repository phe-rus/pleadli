//! Workstation devices (docs/prisons/product-map/04 I.3, build phase 1.3).
//!
//! A workstation enrols against a node with a one-time code shown on the node
//! and receives a random device token. Only the token's SHA-256 is stored, so
//! a copy of the node database holds no usable device credential. Revoking a
//! device makes its token useless on the next request.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand_core::{OsRng, RngCore};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::Actor;

const ENROLMENT_CODE_TTL_MS: i64 = 10 * 60 * 1000;

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn hash(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub label: String,
    pub enrolled_at: i64,
    pub last_seen_at: Option<i64>,
    pub revoked_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrolmentCode {
    pub code: String,
    pub expires_at: i64,
}

/// Shown on the node, typed or scanned on the workstation. Eight digits in
/// two groups, generated from the OS random source. Single use, ten minutes.
pub async fn create_enrolment_code(conn: &mut SqliteConnection, actor: &Actor, label: &str) -> Result<EnrolmentCode, sqlx::Error> {
    let raw = OsRng.next_u32() % 100_000_000;
    let code = format!("{:04}-{:04}", raw / 10_000, raw % 10_000);
    let expires_at = now_ms() + ENROLMENT_CODE_TTL_MS;
    let id = Uuid::new_v4().to_string();

    sqlx::query("INSERT INTO device_enrolment_codes (id, code_hash, label, created_by, expires_at) VALUES (?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(hash(&code))
        .bind(label)
        .bind(actor.officer_id.as_deref().unwrap_or(""))
        .bind(expires_at)
        .execute(&mut *conn)
        .await?;
    audit::record(conn, actor, AuditEntry::new("device.enrolment_code", "device_enrolment_code", Some(&id)).reason(label)).await?;
    Ok(EnrolmentCode { code, expires_at })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Enrolled {
    pub device_id: String,
    pub device_token: String,
}

/// Consumes a code and issues the device credential. Any failure (unknown,
/// used, expired) is the same `None`.
pub async fn enrol(pool: &SqlitePool, code: &str) -> Result<Option<Enrolled>, sqlx::Error> {
    let mut tx = crate::db::begin_write(pool).await?;
    let row: Option<(String, String, String, i64, Option<i64>)> = sqlx::query_as(
        "SELECT id, label, created_by, expires_at, used_at FROM device_enrolment_codes WHERE code_hash = ?",
    )
    .bind(hash(code.trim()))
    .fetch_optional(&mut *tx)
    .await?;

    let Some((code_id, label, created_by, expires_at, used_at)) = row else { return Ok(None) };
    if used_at.is_some() || expires_at < now_ms() {
        return Ok(None);
    }

    sqlx::query("UPDATE device_enrolment_codes SET used_at = ? WHERE id = ? AND used_at IS NULL")
        .bind(now_ms())
        .bind(&code_id)
        .execute(&mut *tx)
        .await?;

    let mut token_bytes = [0u8; 32];
    OsRng.fill_bytes(&mut token_bytes);
    let device_token = URL_SAFE_NO_PAD.encode(token_bytes);
    let device_id = Uuid::new_v4().to_string();

    sqlx::query("INSERT INTO devices (id, label, token_hash, enrolled_by, enrolled_at) VALUES (?, ?, ?, ?, ?)")
        .bind(&device_id)
        .bind(&label)
        .bind(hash(&device_token))
        .bind(&created_by)
        .bind(now_ms())
        .execute(&mut *tx)
        .await?;
    audit::record(
        &mut tx,
        &Actor::system("device enrolment"),
        AuditEntry::new("device.enrolled", "device", Some(&device_id)).reason(&label).authorised_by(&created_by),
    )
    .await?;
    tx.commit().await?;
    Ok(Some(Enrolled { device_id, device_token }))
}

/// The device a presented token belongs to, if it is enrolled and not revoked.
pub async fn validate(pool: &SqlitePool, token: &str) -> Result<Option<String>, sqlx::Error> {
    let row: Option<(String, Option<i64>)> = sqlx::query_as("SELECT id, last_seen_at FROM devices WHERE token_hash = ? AND revoked_at IS NULL")
        .bind(hash(token))
        .fetch_optional(pool)
        .await?;
    let Some((id, last_seen)) = row else { return Ok(None) };
    let now = now_ms();
    if last_seen.is_none_or(|t| now - t > 60_000) {
        sqlx::query("UPDATE devices SET last_seen_at = ? WHERE id = ?").bind(now).bind(&id).execute(pool).await?;
    }
    Ok(Some(id))
}

pub async fn list(pool: &SqlitePool) -> Result<Vec<Device>, sqlx::Error> {
    sqlx::query_as::<_, Device>("SELECT id, label, enrolled_at, last_seen_at, revoked_at FROM devices ORDER BY enrolled_at DESC")
        .fetch_all(pool)
        .await
}

/// Revoking a device also ends every session opened from it.
pub async fn revoke(conn: &mut SqliteConnection, actor: &Actor, id: &str) -> Result<(), sqlx::Error> {
    let changed = sqlx::query("UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
        .bind(now_ms())
        .bind(id)
        .execute(&mut *conn)
        .await?
        .rows_affected();
    if changed == 0 {
        return Err(sqlx::Error::RowNotFound);
    }
    sqlx::query("UPDATE sessions SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL")
        .bind(now_ms())
        .bind(id)
        .execute(&mut *conn)
        .await?;
    audit::record(conn, actor, AuditEntry::new("device.revoked", "device", Some(id))).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn an_enrolment_code_works_once_and_the_token_is_stored_hashed() {
        let pool = pool().await;
        let actor = Actor::officer("o1".into(), "B1".into(), "Admin".into(), "oic".into(), true, None);
        let mut tx = crate::db::begin_write(&pool).await.unwrap();
        let code = create_enrolment_code(&mut tx, &actor, "Registry PC").await.unwrap();
        tx.commit().await.unwrap();

        let enrolled = enrol(&pool, &code.code).await.unwrap().expect("first use succeeds");
        assert!(enrol(&pool, &code.code).await.unwrap().is_none(), "a code is single use");

        let stored: String = sqlx::query_scalar("SELECT token_hash FROM devices").fetch_one(&pool).await.unwrap();
        assert_ne!(stored, enrolled.device_token);
        assert_eq!(validate(&pool, &enrolled.device_token).await.unwrap().as_deref(), Some(enrolled.device_id.as_str()));
        assert!(validate(&pool, "nope").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn revoking_a_device_kills_its_token_and_sessions() {
        let pool = pool().await;
        let actor = Actor::officer("o1".into(), "B1".into(), "Admin".into(), "oic".into(), true, None);
        let mut tx = crate::db::begin_write(&pool).await.unwrap();
        let code = create_enrolment_code(&mut tx, &actor, "PC").await.unwrap();
        tx.commit().await.unwrap();
        let enrolled = enrol(&pool, &code.code).await.unwrap().unwrap();

        let mut tx = crate::db::begin_write(&pool).await.unwrap();
        revoke(&mut tx, &actor, &enrolled.device_id).await.unwrap();
        tx.commit().await.unwrap();
        assert!(validate(&pool, &enrolled.device_token).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn an_expired_code_is_refused() {
        let pool = pool().await;
        let actor = Actor::officer("o1".into(), "B1".into(), "Admin".into(), "oic".into(), true, None);
        let mut tx = crate::db::begin_write(&pool).await.unwrap();
        let code = create_enrolment_code(&mut tx, &actor, "PC").await.unwrap();
        tx.commit().await.unwrap();
        sqlx::query("UPDATE device_enrolment_codes SET expires_at = ?").bind(now_ms() - 1).execute(&pool).await.unwrap();
        assert!(enrol(&pool, &code.code).await.unwrap().is_none());
    }
}
