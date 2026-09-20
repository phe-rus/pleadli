//! LEGACY: the first-generation snapshot push, kept working until the tiered
//! exchange (docs/prisons/product-map/03 K, build phase 6) replaces it. It is
//! limited to `SnapshotRow`: the columns Head Office's statistics read, and no
//! name, national ID, file reference, location or note (SECURITY.md X4). It
//! must not be extended; anything more goes through the tiered exchange.
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
use sqlx::FromRow;

/// What one prisoner looks like to Head Office. Head Office counts people (by
/// status, sex, age band, nationality, education, offence type, where held),
/// so it receives exactly the columns those counts read. Identity and free
/// text never leave the facility on this path.
///
/// Both ends use this type. The sender selects only these columns, and the
/// receiver deserializes into it, so a facility running the older build that
/// still sends whole rows has the extra fields dropped on arrival.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotRow {
    pub id: String,
    pub status: String,
    pub admission_instrument_type: String,
    pub admitted_at: i64,
    pub current_status: String,
    pub high_court_only_offence: bool,
    /// Held to the year only (see `birth_year_only`): the age bands need no more.
    pub date_of_birth: Option<i64>,
    pub sex: Option<String>,
    pub education_level: Option<String>,
    pub nationality: Option<String>,
    pub offence: Option<String>,
    pub created_at: i64,
}

const SNAPSHOT_COLUMNS: &str = "id, status, admission_instrument_type, admitted_at, current_status, high_court_only_offence, date_of_birth, sex, education_level, nationality, offence, created_at";

/// A birth date reduced to 1 July of its year. The statistics use five-year
/// style age bands, so this can move a person across a band edge by at most
/// half a year, and in exchange Head Office never holds a full birth date.
fn birth_year_only(ms: i64) -> Option<i64> {
    use chrono::Datelike;
    let year = chrono::DateTime::from_timestamp_millis(ms)?.year();
    Some(chrono::NaiveDate::from_ymd_opt(year, 7, 1)?.and_hms_opt(0, 0, 0)?.and_utc().timestamp_millis())
}

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
    roster: Vec<SnapshotRow>,
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
                id, first_name, last_name, status,
                admission_instrument_type, admitted_at, current_status,
                high_court_only_offence, date_of_birth, sex, education_level,
                nationality, offence, created_at, facility_id
             ) VALUES (?, '', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&p.id)
        .bind(&p.status)
        .bind(&p.admission_instrument_type)
        .bind(p.admitted_at)
        .bind(&p.current_status)
        .bind(p.high_court_only_offence)
        // Coarsened here too: a sender is not trusted to have done it.
        .bind(p.date_of_birth.and_then(birth_year_only))
        .bind(&p.sex)
        .bind(&p.education_level)
        .bind(&p.nationality)
        .bind(&p.offence)
        .bind(p.created_at)
        .bind(facility_id)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query("UPDATE facilities SET last_synced_at = ?1, last_contact_at = ?1 WHERE id = ?2")
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

    // Anything that changes after this instant stays pending for the next push.
    let started = now_ms();
    let mut roster: Vec<SnapshotRow> = sqlx::query_as::<_, SnapshotRow>(sqlx::AssertSqlSafe(format!("SELECT {SNAPSHOT_COLUMNS} FROM prisoners ORDER BY admitted_at")))
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    for row in &mut roster {
        row.date_of_birth = row.date_of_birth.and_then(birth_year_only);
    }

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
    sqlx::query("DELETE FROM sync_outbox WHERE class = 'legacy_snapshot' AND changed_at <= ?").bind(started).execute(pool).await.map_err(|e| e.to_string())?;
    if super::connectivity::class_enabled(pool, "roster").await {
        if let Err(e) = super::peer::push_roster(pool).await {
            log::info!("roster push skipped: {e}");
        }
    }

    Ok(SyncRunResult { status: "ok".to_string(), count: Some(count) })
}

pub(crate) async fn set_peer_status(
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
    roster: Vec<SnapshotRow>,
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

/// Background exchange: every minute, if this installation is a facility that
/// is connected, see whether Head Office can be reached and send whatever is
/// waiting. A facility works fully offline indefinitely; this loop never
/// blocks local work, and an idle facility sends nothing.
pub async fn background_loop(pool: SqlitePool) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    // The first real attempt is a minute in, not at startup.
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
        match super::connectivity::exchange(&pool, false).await {
            Ok(result) => log::info!("background exchange: {}", result.status),
            Err(e) => log::info!("background exchange skipped: {e}"),
        }
    }
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

    async fn add_facility(pool: &SqlitePool) {
        sqlx::query(
            "INSERT INTO facilities (id, name, facility_number, location, region, head_officer_name, status, verification_code_hash, verification_expires_at, verifying_officer_email, sync_token_hash)
             VALUES ('fac-1', 'Luzira', 'F-1', 'Kampala', 'Central', 'OIC', 'active', 'h', 0, 'a@example.org', 'th')",
        )
        .execute(pool)
        .await
        .unwrap();
    }

    fn ms(year: i32, month: u32, day: u32) -> i64 {
        chrono::NaiveDate::from_ymd_opt(year, month, day).unwrap().and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp_millis()
    }

    #[test]
    fn the_snapshot_row_has_exactly_the_fields_head_office_counts() {
        let row = SnapshotRow {
            id: "p".into(), status: "convicted".into(), admission_instrument_type: "warrant".into(), admitted_at: 1, current_status: "in_custody".into(),
            high_court_only_offence: false, date_of_birth: Some(1), sex: None, education_level: None, nationality: None, offence: None, created_at: 1,
        };
        let json = serde_json::to_value(&row).unwrap();
        let mut keys: Vec<&str> = json.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            ["admissionInstrumentType", "admittedAt", "createdAt", "currentStatus", "dateOfBirth", "educationLevel", "highCourtOnlyOffence", "id", "nationality", "offence", "sex", "status"]
        );
    }

    #[tokio::test]
    async fn a_facility_sending_whole_rows_still_gives_head_office_only_the_counts() {
        let pool = pool().await;
        add_facility(&pool).await;
        // What a facility on the older build sends: the full record.
        let payload = serde_json::json!([{
            "id": "p1", "firstName": "Amina", "lastName": "Nakato", "otherNames": "Grace", "nationalId": "CM9000123",
            "reference": "LZ/2026/0001", "status": "unconvicted", "admissionInstrumentType": "warrant", "admissionAuthority": "Buganda Road Court",
            "admittedAt": ms(2026, 1, 5), "currentStatus": "in_custody", "highCourtOnlyOffence": false, "currentLocation": "Block B cell 4",
            "dateOfBirth": ms(1996, 11, 30), "sex": "female", "educationLevel": "secondary", "nationality": "Ugandan", "offence": "theft",
            "documentsPending": true, "pendingDocumentType": "warrant", "notes": "asthmatic, see clinic", "createdAt": ms(2026, 1, 5)
        }]);
        let roster: Vec<SnapshotRow> = serde_json::from_value(payload).unwrap();
        ingest_snapshot(&pool, "fac-1", roster).await.unwrap();

        let (first, last, other, national, reference, location, authority, pending_type, notes, dob, sex, nationality, offence): (
            String, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<i64>, Option<String>, Option<String>, Option<String>,
        ) = sqlx::query_as(
            "SELECT first_name, last_name, other_names, national_id, reference, current_location, admission_authority, pending_document_type, notes, date_of_birth, sex, nationality, offence FROM prisoners WHERE id = 'p1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!((first.as_str(), last.as_str()), ("", ""));
        assert!(other.is_none() && national.is_none() && reference.is_none() && location.is_none() && authority.is_none() && pending_type.is_none() && notes.is_none());
        assert_eq!(dob, Some(ms(1996, 7, 1)), "birth date is held to the year");
        assert_eq!((sex.as_deref(), nationality.as_deref(), offence.as_deref()), (Some("female"), Some("Ugandan"), Some("theft")));
    }

    #[tokio::test]
    async fn the_push_reads_only_the_listed_columns_and_coarsens_birth_dates() {
        let pool = pool().await;
        sqlx::query(
            "INSERT INTO prisoners (id, first_name, last_name, national_id, notes, admission_instrument_type, admitted_at, date_of_birth, sex)
             VALUES ('p1', 'Amina', 'Nakato', 'CM9000123', 'asthmatic', 'warrant', ?, ?, 'female')",
        )
        .bind(ms(2026, 1, 5))
        .bind(ms(1996, 11, 30))
        .execute(&pool)
        .await
        .unwrap();
        let mut roster: Vec<SnapshotRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!("SELECT {SNAPSHOT_COLUMNS} FROM prisoners"))).fetch_all(&pool).await.unwrap();
        for row in &mut roster {
            row.date_of_birth = row.date_of_birth.and_then(birth_year_only);
        }
        let wire = serde_json::to_string(&roster).unwrap();
        for private in ["Amina", "Nakato", "CM9000123", "asthmatic"] {
            assert!(!wire.contains(private), "{private} would leave the facility");
        }
        assert_eq!(roster[0].date_of_birth, Some(ms(1996, 7, 1)));
    }

    #[tokio::test]
    async fn the_scrub_migration_reduces_rows_head_office_already_holds_and_leaves_local_records() {
        let pool = pool().await;
        add_facility(&pool).await;
        for (id, facility) in [("copy", Some("fac-1")), ("local", None)] {
            sqlx::query(
                "INSERT INTO prisoners (id, first_name, last_name, national_id, reference, notes, current_location, admission_instrument_type, admitted_at, date_of_birth, facility_id)
                 VALUES (?, 'Amina', 'Nakato', 'CM9000123', 'LZ/1', 'asthmatic', 'Block B', 'warrant', 1, ?, ?)",
            )
            .bind(id)
            .bind(ms(1996, 11, 30))
            .bind(facility)
            .execute(&pool)
            .await
            .unwrap();
        }
        sqlx::raw_sql(include_str!("../../migrations/0140_scrub_synced_prisoners.sql")).execute(&pool).await.unwrap();

        let copy: (String, Option<String>, Option<String>, Option<i64>) =
            sqlx::query_as("SELECT first_name, national_id, notes, date_of_birth FROM prisoners WHERE id = 'copy'").fetch_one(&pool).await.unwrap();
        assert_eq!((copy.0.as_str(), copy.1, copy.2, copy.3), ("", None, None, Some(ms(1996, 7, 1))));
        let local: (String, Option<String>, Option<String>, Option<i64>) =
            sqlx::query_as("SELECT first_name, national_id, notes, date_of_birth FROM prisoners WHERE id = 'local'").fetch_one(&pool).await.unwrap();
        assert_eq!((local.0.as_str(), local.1.as_deref(), local.2.as_deref(), local.3), ("Amina", Some("CM9000123"), Some("asthmatic"), Some(ms(1996, 11, 30))));
    }
}
