//! LEGACY: the first-generation snapshot push, kept working until the tiered
//! exchange (docs/prisons/product-map/03 K, build phase 6) replaces it. It
//! over-discloses (whole prisoner rows) and must not be extended.
//!
//! The snapshot push protocol (spec: docs/specs/prisons/0001-head-office-
//! peer-sync-network/0003-sync-protocol-and-head-office-management.md).
//! A facility pushes its entire current Prisoner roster to Head Office,
//! which replaces whatever it had for that facility in one transaction.
//! There is no partial update logic and no conflict resolution: a facility
//! always sends everything it has, and the receiving `facility_id` is
//! always resolved from the caller's sync token, never from the payload.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::domain::audit::{self, AuditEntry};
use crate::domain::authz::Actor;
use crate::domain::facilities::{self, PeerSyncContext};
use crate::domain::prisoners::Prisoner;

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResponse {
    pub synced_count: usize,
    pub last_synced_at: i64,
}

/// The Head Office side of `/sync/prisoners`. One write transaction:
/// delete every row this facility previously sent, then insert the current
/// roster, then stamp `last_synced_at`. IIe exactly "whatever Head Office
/// holds for that facility is exactly what the payload says" — a real
/// snapshot, so a prisoner deleted at a facility is gone from Head Office's
/// copy on that facility's next successful sync (AC-1, AC-3). Row deletion
/// is safe because Head Office's copies are derived data with no other
/// domain rows referencing them (only the core Prisoner record syncs).
/// `facility_id` is always stamped from the resolved token's facility, never
/// from anything in the payload (which carries no facility identifier at
/// all).
pub async fn ingest_snapshot(
    pool: &SqlitePool,
    facility_id: &str,
    roster: Vec<Prisoner>,
) -> Result<SyncResponse, sqlx::Error> {
    let now = now_ms();
    let mut tx = crate::db::begin_write(pool).await?;

    sqlx::query("DELETE FROM prisoners WHERE facility_id = ?")
        .bind(facility_id)
        .execute(&mut *tx)
        .await?;

    for p in &roster {
        sqlx::query(
            "INSERT INTO prisoners (
                id, first_name, last_name, other_names, national_id, reference, status,
                admission_instrument_type, admission_authority, admitted_at, current_status,
                high_court_only_offence, current_location, date_of_birth, sex, education_level,
                nationality, offence, documents_pending, pending_document_type, notes,
                created_at, facility_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&p.id)
        .bind(&p.first_name)
        .bind(&p.last_name)
        .bind(&p.other_names)
        .bind(&p.national_id)
        .bind(&p.reference)
        .bind(&p.status)
        .bind(&p.admission_instrument_type)
        .bind(&p.admission_authority)
        .bind(p.admitted_at)
        .bind(&p.current_status)
        .bind(p.high_court_only_offence)
        .bind(&p.current_location)
        .bind(p.date_of_birth)
        .bind(&p.sex)
        .bind(&p.education_level)
        .bind(&p.nationality)
        .bind(&p.offence)
        .bind(p.documents_pending)
        .bind(&p.pending_document_type)
        .bind(&p.notes)
        .bind(p.created_at)
        .bind(facility_id)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query("UPDATE facilities SET last_synced_at = ? WHERE id = ?")
        .bind(now)
        .bind(facility_id)
        .execute(&mut *tx)
        .await?;

    audit::record(
        &mut tx,
        &Actor::system("network snapshot"),
        AuditEntry::new("network.snapshot_ingested", "facility", Some(facility_id))
            .after(&serde_json::json!({ "count": roster.len() })),
    )
    .await?;

    tx.commit().await?;

    Ok(SyncResponse { synced_count: roster.len(), last_synced_at: now })
}

/// What a peer's `sync_now` surfaces to the UI after a push attempt.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncRunResult {
    pub status: String,
    pub count: Option<i64>,
}

/// The peer side. Pushes the whole local `prisoners` table to this
/// installation's paired Head Office using the stored sync token, and
/// reflects the outcome in `peer_sync_config` so the Network & Sync tab can
/// show it. A token that is valid but unverified gets the distinct
/// `pending_verification` response (HTTP 200, not a failure); a revoked or
/// unknown token is a plain rejection. Skips cleanly when this installation
/// is not paired.
pub async fn push_snapshot(pool: &SqlitePool) -> Result<SyncRunResult, String> {
    let ctx: PeerSyncContext = facilities::get_peer_sync_context(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "This installation is not paired with a Head Office yet.".to_string())?;

    let roster: Vec<Prisoner> = sqlx::query_as::<_, Prisoner>("SELECT * FROM prisoners ORDER BY admitted_at")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/api/network/v1/legacy/snapshot", ctx.hostname.trim_end_matches('/'));
    let response = client
        .post(&url)
        .bearer_auth(&ctx.sync_token)
        .json(&roster)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await;
    // A push that never reached Head Office must not leave the last status
    // reading "ok": record it as offline, with the reason.
    let response = match response {
        Ok(response) => response,
        Err(e) => {
            let message = e.to_string();
            set_peer_status(pool, "offline", None, Some(message.clone())).await.map_err(|e| e.to_string())?;
            return Err(message);
        }
    };

    let status = response.status();
    let body = response.text().await.map_err(|e| e.to_string())?;

    if status == reqwest::StatusCode::UNAUTHORIZED {
        set_peer_status(pool, "rejected", None, Some("Head Office rejected this installation's sync token — it may be revoked, or this installation was never paired.".to_string()))
            .await
            .map_err(|e| e.to_string())?;
        return Ok(SyncRunResult { status: "rejected".to_string(), count: None });
    }

    if !status.is_success() {
        set_peer_status(pool, "error", None, Some(format!("Head Office responded {status}: {body}")))
            .await
            .map_err(|e| e.to_string())?;
        return Err(format!("Head Office responded {status}: {body}"));
    }

    let json: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    if json.get("status").and_then(|v| v.as_str()) == Some("pending_verification") {
        set_peer_status(pool, "pending_verification", None, None).await.map_err(|e| e.to_string())?;
        return Ok(SyncRunResult { status: "pending_verification".to_string(), count: None });
    }

    let count = json.get("syncedCount").and_then(|v| v.as_i64()).unwrap_or_else(|| roster.len() as i64);
    let last_synced_at = json.get("lastSyncedAt").and_then(|v| v.as_i64()).unwrap_or_else(now_ms);
    set_peer_status(pool, "ok", Some(last_synced_at), None).await.map_err(|e| e.to_string())?;
    if let Err(e) = super::peer::push_roster(pool).await {
        log::info!("roster push skipped: {e}");
    }

    Ok(SyncRunResult { status: "ok".to_string(), count: Some(count) })
}

async fn set_peer_status(
    pool: &SqlitePool,
    status: &str,
    last_synced_at: Option<i64>,
    last_error: Option<String>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE peer_sync_config
         SET last_sync_status = ?, last_synced_at = COALESCE(?, last_synced_at), last_error = ?
         WHERE id = 'default'",
    )
    .bind(status)
    .bind(last_synced_at)
    .bind(last_error)
    .execute(pool)
    .await?;
    Ok(())
}

#[derive(Debug)]
pub enum IngestError {
    Db(sqlx::Error),
    /// Unknown or revoked sync token. The endpoint's uniform failure
    /// contract (`{"error":"invalid"}`) treats these identically.
    Invalid,
}

impl From<sqlx::Error> for IngestError {
    fn from(e: sqlx::Error) -> Self {
        IngestError::Db(e)
    }
}

/// `/sync/prisoners`'s full server side (child 3, AC-1/AC-4): resolve the
/// facility from the presented Bearer token (server side only — the payload
/// carries no facility identifier), then hand off. Unverified-but-valid
/// tokens get `{"status":"pending_verification"}` (HTTP 200, not a
/// failure); unknown and revoked tokens both collapse into `Err(Invalid)`,
/// surfacing as the generic 401. Returns a serializable body directly so
/// the handler is a thin `map(Json)`.
pub async fn resolve_facility_and_ingest(
    pool: &SqlitePool,
    sync_token: &str,
    roster: Vec<Prisoner>,
) -> Result<serde_json::Value, IngestError> {
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT id, status FROM facilities WHERE sync_token_hash = ?",
    )
    .bind(facilities::hash_secret(sync_token))
    .fetch_optional(pool)
    .await?;

    let (facility_id, status) = match row {
        None => return Err(IngestError::Invalid),
        Some(row) => row,
    };

    match status.as_str() {
        "active" => {
            let confirmed = ingest_snapshot(pool, &facility_id, roster).await?;
            Ok(serde_json::json!({
                "syncedCount": confirmed.synced_count,
                "lastSyncedAt": confirmed.last_synced_at,
            }))
        }
        "pending_verification" => Ok(serde_json::json!({ "status": "pending_verification" })),
        _ => Err(IngestError::Invalid),
    }
}

/// Background sync (AC-2): every five minutes, if this installation is a
/// facility that has a pairing to push with, try a full snapshot push.
/// A facility works fully offline indefinitely; the push only happens while
/// there is internet, and this loop never blocks routine local work.
pub async fn background_loop(pool: SqlitePool) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(300));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    // Consume the immediate first tick so the first real attempt is five
    // minutes in, not at startup.
    interval.tick().await;

    loop {
        interval.tick().await;

        let is_head_office: Option<bool> = sqlx::query_scalar("SELECT is_head_office FROM hq_config WHERE id = 'default'")
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten();
        if is_head_office == Some(true) {
            continue;
        }

        if let Err(e) = super::peer::refresh_connection(&pool).await {
            log::info!("connection check skipped: {e:?}");
        }
        match push_snapshot(&pool).await {
            Ok(result) => log::info!("background sync: {}", result.status),
            Err(e) => log::info!("background sync skipped: {e}"),
        }
        if let Err(e) = crate::domain::policy_sync::pull_policy(&pool).await {
            log::info!("policy pull skipped: {e}");
        }
    }
}