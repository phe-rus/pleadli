//! The Head Office estate view (docs/prisons/product/08 2.2): how recently
//! each facility was heard from, how full it is, whether its return is in, and
//! which need attention. Head Office holds no prisoner rows for this. A
//! connected facility sends a small status report of counts (tier T2), and
//! Head Office derives everything else from what it already holds.
//!
//! Two rules from the spec govern the shape. Every figure carries its own
//! as-of time, because Head Office only ever knows a facility as it was when
//! last heard from. And unknown is never zero: a facility that has not
//! reported has no occupancy, not an occupancy of nothing.
//!
//! The contact and return thresholds below are provisional policy. The spec
//! gives seven days of silence as its example and names no return deadline, so
//! both are constants to be confirmed with the Prison Service.


use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, Sqlite, SqlitePool};

use super::exchange::{self, IngestError};
use super::facilities;
use super::facility_profile;
use super::time::{add_calendar, eat_datetime, now_ms, DAY_MS};
use chrono::Datelike;

/// Heard from within this long: in contact.
const CONTACT_CURRENT_MS: i64 = 2 * DAY_MS;
/// Not heard from for longer than this: silent, and needs attention.
const CONTACT_SILENT_MS: i64 = 7 * DAY_MS;
/// A return for a closed month is awaited, and after this many days overdue.
const RETURN_GRACE_DAYS: i64 = 7;
/// A return counts as the month's if its period is within this of the month.
const PERIOD_TOLERANCE_MS: i64 = 3 * DAY_MS;
/// A facility sends its status again when it changed, or after this long.
const STATUS_REFRESH_MS: i64 = 10 * 60 * 1000;
/// Plausibility bound for a reported count; anything above is refused.
const MAX_COUNT: i64 = 1_000_000;

// ---------------------------------------------------------------------
// The facility's report
// ---------------------------------------------------------------------

/// What a facility says about itself: counts and its own clock, nothing else.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusReport {
    pub held: i64,
    pub convicted: i64,
    pub unconvicted: i64,
    pub civil: i64,
    pub in_transit: i64,
    /// `None` when the facility has not set its approved capacity.
    pub capacity: Option<i64>,
    pub app_version: String,
    /// The facility's clock when it counted.
    pub as_at: i64,
    /// How the facility says its own exchange with Head Office is going. Absent
    /// from older builds.
    #[serde(default)]
    pub exchange: Option<ExchangeReport>,
}

/// The facility's own account of its exchange: a state word, how much is
/// waiting, and the last thing that went wrong. No records, no names.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeReport {
    pub state: String,
    pub pending: i64,
    pub last_success_at: Option<i64>,
    pub last_error: Option<String>,
}

const REPORTABLE_STATES: [&str; 7] = ["idle", "pending", "in_progress", "completed", "failed", "stalled", "offline"];

pub async fn build_report(pool: &SqlitePool) -> Result<StatusReport, sqlx::Error> {
    let (held, convicted, unconvicted, civil): (i64, i64, i64, i64) = sqlx::query_as(
        "SELECT COUNT(*),
                COALESCE(SUM(status = 'convicted'), 0),
                COALESCE(SUM(status = 'unconvicted'), 0),
                COALESCE(SUM(status = 'civil'), 0)
         FROM prisoners WHERE current_status = 'in_custody' AND facility_id IS NULL",
    )
    .fetch_one(pool)
    .await?;
    let in_transit: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prisoners WHERE current_status = 'in_transit' AND facility_id IS NULL").fetch_one(pool).await?;
    let capacity = facility_profile::get(pool).await?.approved_capacity;
    let waiting = super::connectivity::pending(pool).await?.total;
    let finished = exchange::status_finished(pool, waiting).await?;
    let last_error = if matches!(finished.state.as_str(), "failed" | "stalled") {
        finished.recent.iter().find(|r| matches!(r.outcome.as_deref(), Some("failed" | "refused"))).and_then(|r| r.error.clone())
    } else {
        None
    };
    let exchange = Some(ExchangeReport { state: finished.state, pending: waiting, last_success_at: finished.last_success_at, last_error });
    Ok(StatusReport { held, convicted, unconvicted, civil, in_transit, capacity, app_version: env!("CARGO_PKG_VERSION").to_string(), as_at: now_ms(), exchange })
}

/// The report without its clock, so an unchanged facility hashes the same.
fn digest(report: &StatusReport) -> String {
    let stable = (
        report.held,
        report.convicted,
        report.unconvicted,
        report.civil,
        report.in_transit,
        report.capacity,
        &report.app_version,
        report.exchange.as_ref().map(|e| (e.state.clone(), e.pending)),
    );
    format!("{:x}", Sha256::digest(serde_json::to_string(&stable).unwrap_or_default().as_bytes()))
}

/// Sends the status report when it changed or is due. Returns whether it went.
/// An unreachable Head Office is an error the caller only logs: the report is
/// rebuilt fresh on the next round, so nothing is queued.
pub async fn push_status(pool: &SqlitePool) -> Result<bool, String> {
    let ctx = facilities::get_peer_sync_context(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "This installation is not connected to a Head Office yet.".to_string())?;
    let report = build_report(pool).await.map_err(|e| e.to_string())?;
    let now = now_ms();
    let (last_digest, pushed_at): (Option<String>, Option<i64>) =
        sqlx::query_as("SELECT status_digest, status_pushed_at FROM peer_sync_config WHERE id = 'default'").fetch_one(pool).await.map_err(|e| e.to_string())?;
    let fresh = pushed_at.is_some_and(|at| now - at < STATUS_REFRESH_MS);
    if fresh && last_digest.as_deref() == Some(digest(&report).as_str()) {
        return Ok(false);
    }

    let response = super::peer::hq_client(pool, 20)
        .await?
        .post(format!("{}/api/network/v1/status", ctx.hostname.trim_end_matches('/')))
        .bearer_auth(&ctx.sync_token)
        .json(&report)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Head Office responded {}", response.status()));
    }
    sqlx::query("UPDATE peer_sync_config SET status_digest = ?, status_pushed_at = ? WHERE id = 'default'")
        .bind(digest(&report))
        .bind(now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(true)
}

// ---------------------------------------------------------------------
// Head Office: taking a report and noting contact
// ---------------------------------------------------------------------

/// Notes that the facility was just heard from. Every authenticated call from
/// a facility is contact, whatever it carried.
pub async fn touch_contact<'e, E>(executor: E, facility_id: &str) -> Result<(), sqlx::Error>
where
    E: sqlx::Executor<'e, Database = Sqlite>,
{
    sqlx::query("UPDATE facilities SET last_contact_at = ? WHERE id = ?").bind(now_ms()).bind(facility_id).execute(executor).await?;
    Ok(())
}

fn plausible(report: &StatusReport) -> bool {
    let counts = [report.held, report.convicted, report.unconvicted, report.civil, report.in_transit];
    counts.iter().all(|n| (0..=MAX_COUNT).contains(n))
        && report.capacity.is_none_or(|c| (0..=MAX_COUNT).contains(&c))
        && report.convicted + report.unconvicted + report.civil <= report.held
        && report.app_version.len() <= 32
        && report.exchange.as_ref().is_none_or(|e| REPORTABLE_STATES.contains(&e.state.as_str()) && (0..=MAX_COUNT).contains(&e.pending))
}

/// Head Office side of `/api/network/v1/status`. The facility is resolved from
/// the token. A facility awaiting verification is told so and nothing is kept.
pub async fn receive_status(pool: &SqlitePool, sync_token: &str, report: StatusReport) -> Result<serde_json::Value, IngestError> {
    let row: Option<(String, String)> = sqlx::query_as("SELECT id, status FROM facilities WHERE sync_token_hash = ?")
        .bind(facilities::hash_secret(sync_token))
        .fetch_optional(pool)
        .await?;
    let (facility_id, status) = row.ok_or(IngestError::Invalid)?;
    match status.as_str() {
        "active" => {}
        "pending_verification" => return Ok(serde_json::json!({ "status": "pending_verification" })),
        _ => return Err(IngestError::Invalid),
    }
    if !plausible(&report) {
        return Err(IngestError::Invalid);
    }
    sqlx::query(
        "UPDATE facilities SET last_contact_at = ?, reported_held = ?, reported_convicted = ?, reported_unconvicted = ?, reported_civil = ?,
                reported_in_transit = ?, reported_capacity = ?, status_reported_at = ?, app_version = ?,
                reported_exchange_state = ?, reported_pending = ?, reported_last_success_at = ?, reported_last_error = ?
         WHERE id = ?",
    )
    .bind(now_ms())
    .bind(report.held)
    .bind(report.convicted)
    .bind(report.unconvicted)
    .bind(report.civil)
    .bind(report.in_transit)
    .bind(report.capacity)
    .bind(report.as_at)
    .bind(&report.app_version)
    .bind(report.exchange.as_ref().map(|e| e.state.clone()))
    .bind(report.exchange.as_ref().map(|e| e.pending))
    .bind(report.exchange.as_ref().and_then(|e| e.last_success_at))
    .bind(report.exchange.as_ref().and_then(|e| e.last_error.as_ref().map(|m| m.chars().take(200).collect::<String>())))
    .bind(&facility_id)
    .execute(pool)
    .await?;
    Ok(serde_json::json!({ "status": "ok" }))
}

// ---------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Contact {
    /// Heard from recently.
    Current,
    /// Heard from, but not lately.
    Stale,
    /// Not heard from for over a week.
    Silent,
    /// Active, and never heard from.
    Never,
    /// Not an active facility, so contact is not measured.
    NotApplicable,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReturnState {
    /// The last closed month's return is in.
    Received,
    /// The month has closed and the return is not in yet, within the grace period.
    Awaited,
    /// Past the grace period.
    Overdue,
    /// No return is expected yet, or the facility is not active.
    NotDue,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestReturn {
    pub id: String,
    pub reference: String,
    pub period_from: i64,
    pub period_to: i64,
    pub received_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EstateFacility {
    pub id: String,
    pub name: String,
    pub facility_number: String,
    pub location: String,
    pub region: String,
    pub status: String,
    pub contact: Contact,
    pub last_contact_at: Option<i64>,
    /// Everything below is as the facility last reported it, at
    /// `population_as_at`, and `None` where it never has.
    pub held: Option<i64>,
    pub unconvicted: Option<i64>,
    pub capacity: Option<i64>,
    pub occupancy_percent: Option<i64>,
    pub population_as_at: Option<i64>,
    pub latest_return: Option<LatestReturn>,
    pub return_state: ReturnState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EstateRegion {
    pub region: String,
    pub facilities: Vec<EstateFacility>,
    pub in_contact: i64,
    pub counted: i64,
    /// Held and capacity summed over only the facilities that reported both, and
    /// how many those are, so a region is never made to look emptier than it is.
    pub reporting: i64,
    pub held: Option<i64>,
    pub capacity: Option<i64>,
    pub occupancy_percent: Option<i64>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AttentionKind {
    Silent,
    NeverContacted,
    PendingVerification,
    ReturnOverdue,
    OverCapacity,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attention {
    pub kind: AttentionKind,
    pub facility_id: String,
    pub facility_name: String,
    /// When it began, where that is known: last contact, or the month awaited.
    pub since: Option<i64>,
    /// The figure behind it, where there is one (occupancy percent).
    pub figure: Option<i64>,
}

/// Something that reached Head Office or was decided here, taken from the
/// records themselves: a return received, a connection asked for, approved or
/// refused. Nothing is inferred, so a network that has done none of these has
/// no events.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct NetworkEvent {
    pub at: i64,
    /// return_received | connection_requested | connection_approved | connection_rejected
    pub kind: String,
    pub facility_id: String,
    pub facility_name: String,
    /// The return's reference, or the person who asked or decided.
    pub detail: Option<String>,
}

/// How many network events the estate view carries.
const EVENT_LIMIT: i64 = 8;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Estate {
    pub as_of: i64,
    /// The month a return is expected for now: the last one closed.
    pub return_period_from: i64,
    pub return_period_to: i64,
    pub regions: Vec<EstateRegion>,
    pub attention: Vec<Attention>,
    pub connection_requests_waiting: i64,
    /// Facilities whose connection has been revoked. They are left out of
    /// `regions`, so this is the only place they are counted.
    pub revoked: i64,
    pub events: Vec<NetworkEvent>,
}

async fn network_events(pool: &SqlitePool) -> Result<Vec<NetworkEvent>, sqlx::Error> {
    sqlx::query_as::<_, NetworkEvent>(
        "SELECT at, kind, facility_id, facility_name, detail FROM (
           SELECT r.received_at AS at, 'return_received' AS kind, r.facility_id AS facility_id, f.name AS facility_name, r.reference AS detail
             FROM received_returns r JOIN facilities f ON f.id = r.facility_id
           UNION ALL
           SELECT q.created_at, 'connection_requested', q.facility_id, f.name, q.requested_by_name
             FROM facility_connection_requests q JOIN facilities f ON f.id = q.facility_id
           UNION ALL
           SELECT q.decided_at, 'connection_approved', q.facility_id, f.name, q.decided_by_name
             FROM facility_connection_requests q JOIN facilities f ON f.id = q.facility_id
             WHERE q.status = 'approved' AND q.decided_at IS NOT NULL
           UNION ALL
           SELECT q.decided_at, 'connection_rejected', q.facility_id, f.name, q.decided_by_name
             FROM facility_connection_requests q JOIN facilities f ON f.id = q.facility_id
             WHERE q.status = 'rejected' AND q.decided_at IS NOT NULL
         )
         ORDER BY at DESC
         LIMIT ?",
    )
    .bind(EVENT_LIMIT)
    .fetch_all(pool)
    .await
}

#[derive(Debug, FromRow)]
struct FacilityRow {
    id: String,
    name: String,
    facility_number: String,
    location: String,
    region: String,
    status: String,
    last_contact_at: Option<i64>,
    reported_held: Option<i64>,
    reported_unconvicted: Option<i64>,
    reported_capacity: Option<i64>,
    status_reported_at: Option<i64>,
    created_at: i64,
}

#[derive(Debug, FromRow)]
struct ReturnRow {
    id: String,
    facility_id: String,
    reference: String,
    period_from: i64,
    period_to: i64,
    received_at: i64,
}

/// Midnight (EAT) starting the last closed calendar month, and the midnight
/// after it, relative to `now`.
fn last_closed_month(now: i64) -> (i64, i64) {
    let day = eat_datetime(now).day() as i64;
    let this_month = add_calendar(now, 0, 0, 1 - day);
    (add_calendar(this_month, 0, -1, 0), this_month)
}

fn contact_of(status: &str, last_contact_at: Option<i64>, now: i64) -> Contact {
    if status != "active" {
        return Contact::NotApplicable;
    }
    match last_contact_at {
        None => Contact::Never,
        Some(at) if now - at <= CONTACT_CURRENT_MS => Contact::Current,
        Some(at) if now - at <= CONTACT_SILENT_MS => Contact::Stale,
        Some(_) => Contact::Silent,
    }
}

/// `now` is a parameter so the view can be computed for any moment.
pub async fn estate(pool: &SqlitePool, now: i64) -> Result<Estate, sqlx::Error> {
    let facilities: Vec<FacilityRow> = sqlx::query_as(
        "SELECT id, name, facility_number, location, region, status, last_contact_at, reported_held, reported_unconvicted,
                reported_capacity, status_reported_at, created_at
         FROM facilities WHERE status <> 'revoked' ORDER BY region, name",
    )
    .fetch_all(pool)
    .await?;
    let returns: Vec<ReturnRow> =
        sqlx::query_as("SELECT id, facility_id, reference, period_from, period_to, received_at FROM received_returns ORDER BY period_to DESC, attested_at DESC")
            .fetch_all(pool)
            .await?;
    let waiting: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM facility_connection_requests WHERE status = 'pending'").fetch_one(pool).await?;
    let revoked: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM facilities WHERE status = 'revoked'").fetch_one(pool).await?;
    let events = network_events(pool).await?;

    let (month_from, month_to) = last_closed_month(now);
    let overdue_after = month_to + RETURN_GRACE_DAYS * DAY_MS;

    let mut attention: Vec<Attention> = Vec::new();
    let mut regions: Vec<EstateRegion> = Vec::new();

    for row in facilities {
        let contact = contact_of(&row.status, row.last_contact_at, now);
        let latest = returns.iter().find(|r| r.facility_id == row.id).map(|r| LatestReturn {
            id: r.id.clone(),
            reference: r.reference.clone(),
            period_from: r.period_from,
            period_to: r.period_to,
            received_at: r.received_at,
        });
        let covered = returns
            .iter()
            .any(|r| r.facility_id == row.id && r.period_from <= month_from + PERIOD_TOLERANCE_MS && r.period_to >= month_to - PERIOD_TOLERANCE_MS);
        let expected = row.status == "active" && row.created_at < month_to;
        let return_state = if !expected {
            ReturnState::NotDue
        } else if covered {
            ReturnState::Received
        } else if now >= overdue_after {
            ReturnState::Overdue
        } else {
            ReturnState::Awaited
        };

        // Occupancy needs both numbers, and a capacity of nothing is not one.
        let occupancy_percent = match (row.reported_held, row.reported_capacity) {
            (Some(held), Some(capacity)) if capacity > 0 => Some((held * 100 + capacity / 2) / capacity),
            _ => None,
        };

        match contact {
            Contact::Silent => attention.push(Attention { kind: AttentionKind::Silent, facility_id: row.id.clone(), facility_name: row.name.clone(), since: row.last_contact_at, figure: None }),
            Contact::Never => attention.push(Attention { kind: AttentionKind::NeverContacted, facility_id: row.id.clone(), facility_name: row.name.clone(), since: None, figure: None }),
            _ => {}
        }
        if row.status == "pending_verification" {
            attention.push(Attention { kind: AttentionKind::PendingVerification, facility_id: row.id.clone(), facility_name: row.name.clone(), since: None, figure: None });
        }
        if return_state == ReturnState::Overdue {
            attention.push(Attention { kind: AttentionKind::ReturnOverdue, facility_id: row.id.clone(), facility_name: row.name.clone(), since: Some(month_to), figure: None });
        }
        if let Some(percent) = occupancy_percent.filter(|p| *p > 100) {
            attention.push(Attention { kind: AttentionKind::OverCapacity, facility_id: row.id.clone(), facility_name: row.name.clone(), since: row.status_reported_at, figure: Some(percent) });
        }

        let facility = EstateFacility {
            id: row.id,
            name: row.name,
            facility_number: row.facility_number,
            location: row.location,
            region: row.region.clone(),
            status: row.status,
            contact,
            last_contact_at: row.last_contact_at,
            held: row.reported_held,
            unconvicted: row.reported_unconvicted,
            capacity: row.reported_capacity,
            occupancy_percent,
            population_as_at: row.status_reported_at,
            latest_return: latest,
            return_state,
        };
        match regions.last_mut().filter(|r| r.region == row.region) {
            Some(region) => region.facilities.push(facility),
            None => regions.push(EstateRegion {
                region: row.region,
                facilities: vec![facility],
                in_contact: 0,
                counted: 0,
                reporting: 0,
                held: None,
                capacity: None,
                occupancy_percent: None,
            }),
        }
    }

    for region in &mut regions {
        region.counted = region.facilities.iter().filter(|f| f.status == "active").count() as i64;
        region.in_contact = region.facilities.iter().filter(|f| matches!(f.contact, Contact::Current | Contact::Stale)).count() as i64;
        let reporting: Vec<(i64, i64)> = region
            .facilities
            .iter()
            .filter_map(|f| match (f.held, f.capacity) {
                (Some(h), Some(c)) if c > 0 => Some((h, c)),
                _ => None,
            })
            .collect();
        region.reporting = reporting.len() as i64;
        if !reporting.is_empty() {
            let held: i64 = reporting.iter().map(|(h, _)| h).sum();
            let capacity: i64 = reporting.iter().map(|(_, c)| c).sum();
            region.held = Some(held);
            region.capacity = Some(capacity);
            region.occupancy_percent = Some((held * 100 + capacity / 2) / capacity);
        }
    }

    let rank = |kind: &AttentionKind| match kind {
        AttentionKind::Silent | AttentionKind::NeverContacted => 0,
        AttentionKind::PendingVerification => 1,
        AttentionKind::ReturnOverdue => 2,
        AttentionKind::OverCapacity => 3,
    };
    attention.sort_by(|a, b| rank(&a.kind).cmp(&rank(&b.kind)).then_with(|| a.facility_name.cmp(&b.facility_name)));

    Ok(Estate { as_of: now, return_period_from: month_from, return_period_to: month_to, regions, attention, connection_requests_waiting: waiting, revoked, events })
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

    fn ms(year: i32, month: u32, day: u32) -> i64 {
        chrono::NaiveDate::from_ymd_opt(year, month, day).unwrap().and_hms_opt(12, 0, 0).unwrap().and_utc().timestamp_millis()
    }

    struct Seed<'a> {
        id: &'a str,
        region: &'a str,
        status: &'a str,
        contact: Option<i64>,
        held: Option<i64>,
        capacity: Option<i64>,
    }

    async fn add(pool: &SqlitePool, s: Seed<'_>) {
        sqlx::query(
            "INSERT INTO facilities (id, name, facility_number, location, region, head_officer_name, status, verification_code_hash, verification_expires_at, verifying_officer_email, sync_token_hash,
                                     created_at, last_contact_at, reported_held, reported_capacity, status_reported_at)
             VALUES (?1, ?1, ?1, 'Somewhere', ?2, 'OIC', ?3, 'h', 0, 'a@example.org', ?4, ?5, ?6, ?7, ?8, ?6)",
        )
        .bind(s.id)
        .bind(s.region)
        .bind(s.status)
        .bind(facilities::hash_secret(&format!("token-{}", s.id)))
        .bind(ms(2025, 1, 1))
        .bind(s.contact)
        .bind(s.held)
        .bind(s.capacity)
        .execute(pool)
        .await
        .unwrap();
    }

    fn report(held: i64) -> StatusReport {
        StatusReport { held, convicted: 1, unconvicted: held - 1, civil: 0, in_transit: 0, capacity: Some(100), app_version: "0.1.0".into(), as_at: 5, exchange: None }
    }

    #[test]
    fn the_expected_return_is_always_the_last_closed_month() {
        let (from, to) = last_closed_month(ms(2026, 3, 20));
        assert_eq!((eat_datetime(from).date_naive().to_string(), eat_datetime(to).date_naive().to_string()), ("2026-02-01".to_string(), "2026-03-01".to_string()));
        let (from, to) = last_closed_month(ms(2026, 1, 1));
        assert_eq!((eat_datetime(from).date_naive().to_string(), eat_datetime(to).date_naive().to_string()), ("2025-12-01".to_string(), "2026-01-01".to_string()));
    }

    #[tokio::test]
    async fn a_report_updates_the_facility_and_contact_and_only_from_a_verified_facility() {
        let pool = pool().await;
        add(&pool, Seed { id: "a", region: "Central", status: "active", contact: None, held: None, capacity: None }).await;
        add(&pool, Seed { id: "p", region: "Central", status: "pending_verification", contact: None, held: None, capacity: None }).await;

        assert_eq!(receive_status(&pool, "token-a", report(40)).await.unwrap()["status"], "ok");
        let (held, capacity, contact, as_at): (Option<i64>, Option<i64>, Option<i64>, Option<i64>) =
            sqlx::query_as("SELECT reported_held, reported_capacity, last_contact_at, status_reported_at FROM facilities WHERE id = 'a'").fetch_one(&pool).await.unwrap();
        assert_eq!((held, capacity, as_at), (Some(40), Some(100), Some(5)));
        assert!(contact.is_some_and(|c| now_ms() - c < 5_000), "a report is contact");

        assert_eq!(receive_status(&pool, "token-p", report(40)).await.unwrap()["status"], "pending_verification");
        let kept: Option<i64> = sqlx::query_scalar("SELECT reported_held FROM facilities WHERE id = 'p'").fetch_one(&pool).await.unwrap();
        assert_eq!(kept, None, "nothing is kept from an unverified facility");
        assert!(matches!(receive_status(&pool, "nope", report(40)).await, Err(IngestError::Invalid)));
    }

    #[tokio::test]
    async fn an_implausible_report_is_refused_and_changes_nothing() {
        let pool = pool().await;
        add(&pool, Seed { id: "a", region: "Central", status: "active", contact: None, held: Some(7), capacity: None }).await;
        let negative = StatusReport { held: -1, ..report(5) };
        let too_many_convicted = StatusReport { convicted: 9, ..report(5) };
        let absurd = StatusReport { held: MAX_COUNT + 1, ..report(5) };
        let bad_capacity = StatusReport { capacity: Some(-3), ..report(5) };
        for bad in [negative, too_many_convicted, absurd, bad_capacity] {
            assert!(matches!(receive_status(&pool, "token-a", bad).await, Err(IngestError::Invalid)));
        }
        let held: Option<i64> = sqlx::query_scalar("SELECT reported_held FROM facilities WHERE id = 'a'").fetch_one(&pool).await.unwrap();
        assert_eq!(held, Some(7));
    }

    #[tokio::test]
    async fn every_authenticated_call_counts_as_contact() {
        let pool = pool().await;
        add(&pool, Seed { id: "a", region: "Central", status: "active", contact: Some(1), held: None, capacity: None }).await;
        crate::domain::policy_sync::serve_policy(&pool, "token-a", crate::domain::policy_sync::PolicyReport { pattern: None, source: None, locked: None }).await.unwrap().unwrap();
        let contact: i64 = sqlx::query_scalar("SELECT last_contact_at FROM facilities WHERE id = 'a'").fetch_one(&pool).await.unwrap();
        assert!(now_ms() - contact < 5_000, "a policy pull is contact");
        sqlx::query("UPDATE facilities SET last_contact_at = 1").execute(&pool).await.unwrap();
        crate::domain::connection::ingest_roster(&pool, "token-a", vec![]).await.unwrap();
        let contact: i64 = sqlx::query_scalar("SELECT last_contact_at FROM facilities WHERE id = 'a'").fetch_one(&pool).await.unwrap();
        assert!(now_ms() - contact < 5_000, "a roster is contact");
    }

    #[tokio::test]
    async fn the_estate_says_what_is_known_and_never_turns_unknown_into_zero() {
        let pool = pool().await;
        let now = ms(2026, 3, 20);
        // Reported 120 held against 100, heard from an hour ago, February return in.
        add(&pool, Seed { id: "a-full", region: "Central", status: "active", contact: Some(now - 3_600_000), held: Some(120), capacity: Some(100) }).await;
        // Silent for ten days, never reported, no return: nothing is known of its numbers.
        add(&pool, Seed { id: "b-silent", region: "Central", status: "active", contact: Some(now - 10 * DAY_MS), held: None, capacity: None }).await;
        add(&pool, Seed { id: "c-pending", region: "Eastern", status: "pending_verification", contact: None, held: None, capacity: None }).await;
        add(&pool, Seed { id: "d-never", region: "Eastern", status: "active", contact: None, held: Some(10), capacity: None }).await;
        add(&pool, Seed { id: "e-revoked", region: "Eastern", status: "revoked", contact: None, held: None, capacity: None }).await;
        sqlx::query(
            "INSERT INTO received_returns (id, facility_id, reference, kind, title, period_from, period_to, template_version, content_json, content_hash, statement, attested_by_name, attested_at, received_at)
             VALUES ('r1', 'a-full', 'MR-2026-0001', 'monthly_return', 'Monthly return', ?, ?, 1, '{}', 'h', 's', 'OIC', ?, ?)",
        )
        .bind(ms(2026, 2, 1))
        .bind(ms(2026, 3, 1))
        .bind(ms(2026, 3, 3))
        .bind(ms(2026, 3, 3))
        .execute(&pool)
        .await
        .unwrap();

        let view = estate(&pool, now).await.unwrap();
        assert_eq!(view.regions.iter().map(|r| r.region.as_str()).collect::<Vec<_>>(), ["Central", "Eastern"]);
        let central = &view.regions[0];
        let by = |id: &str| central.facilities.iter().chain(view.regions[1].facilities.iter()).find(|f| f.id == id).unwrap();

        assert_eq!((by("a-full").contact.clone(), by("a-full").occupancy_percent, by("a-full").return_state.clone()), (Contact::Current, Some(120), ReturnState::Received));
        assert_eq!((by("b-silent").contact.clone(), by("b-silent").held, by("b-silent").occupancy_percent, by("b-silent").return_state.clone()), (Contact::Silent, None, None, ReturnState::Overdue));
        assert_eq!(by("d-never").contact, Contact::Never);
        assert_eq!(by("d-never").occupancy_percent, None, "held without a capacity is not an occupancy");
        assert_eq!(by("c-pending").contact, Contact::NotApplicable);
        assert!(view.regions[1].facilities.iter().all(|f| f.id != "e-revoked"), "a revoked facility is not part of the estate");

        // The region rolls up only what was reported, and says how much that was.
        assert_eq!((central.counted, central.in_contact, central.reporting), (2, 1, 1));
        assert_eq!((central.held, central.capacity, central.occupancy_percent), (Some(120), Some(100), Some(120)));
        assert_eq!(view.regions[1].occupancy_percent, None, "no facility there reported both numbers");
        assert_eq!(view.regions[1].held, None);

        let kinds: Vec<(&AttentionKind, &str)> = view.attention.iter().map(|a| (&a.kind, a.facility_id.as_str())).collect();
        assert_eq!(
            kinds,
            [
                (&AttentionKind::Silent, "b-silent"),
                (&AttentionKind::NeverContacted, "d-never"),
                (&AttentionKind::PendingVerification, "c-pending"),
                (&AttentionKind::ReturnOverdue, "b-silent"),
                (&AttentionKind::ReturnOverdue, "d-never"),
                (&AttentionKind::OverCapacity, "a-full"),
            ]
        );
        assert_eq!(view.attention.last().unwrap().figure, Some(120));
        assert_eq!(view.revoked, 1, "a revoked facility is left out of the regions but still counted");
    }

    #[tokio::test]
    async fn network_events_are_only_what_the_records_hold() {
        let pool = pool().await;
        let now = ms(2026, 3, 20);
        assert!(estate(&pool, now).await.unwrap().events.is_empty(), "a network that has done nothing has no events");

        add(&pool, Seed { id: "a", region: "Central", status: "active", contact: Some(now), held: None, capacity: None }).await;
        add(&pool, Seed { id: "b", region: "Central", status: "active", contact: Some(now), held: None, capacity: None }).await;
        for (n, (id, facility, status, decided)) in [("q1", "a", "approved", Some(ms(2026, 3, 2))), ("q2", "b", "rejected", Some(ms(2026, 3, 4))), ("q3", "b", "pending", None)].into_iter().enumerate() {
            sqlx::query(
                "INSERT INTO facility_connection_requests (id, facility_id, token_hash, requested_by_badge, requested_by_name, status, decided_by_name, decided_at, created_at)
                 VALUES (?, ?, 'h', 'B1', 'Asked By', ?, 'Decided By', ?, ?)",
            )
            .bind(id)
            .bind(facility)
            .bind(status)
            .bind(decided)
            .bind(ms(2026, 3, 1) + n as i64)
            .execute(&pool)
            .await
            .unwrap();
        }
        sqlx::query(
            "INSERT INTO received_returns (id, facility_id, reference, kind, title, period_from, period_to, template_version, content_json, content_hash, statement, attested_by_name, attested_at, received_at)
             VALUES ('r1', 'a', 'MR-2026-0001', 'monthly_return', 'Monthly return', ?, ?, 1, '{}', 'h', 's', 'OIC', ?, ?)",
        )
        .bind(ms(2026, 2, 1))
        .bind(ms(2026, 3, 1))
        .bind(ms(2026, 3, 3))
        .bind(ms(2026, 3, 3))
        .execute(&pool)
        .await
        .unwrap();

        let events = estate(&pool, now).await.unwrap().events;
        let seen: Vec<(&str, &str)> = events.iter().map(|e| (e.kind.as_str(), e.facility_id.as_str())).collect();
        assert_eq!(
            seen,
            [("connection_rejected", "b"), ("return_received", "a"), ("connection_approved", "a"), ("connection_requested", "b"), ("connection_requested", "b"), ("connection_requested", "a")],
            "newest first, one row per thing that happened, and a request still pending is only ever a request"
        );
        assert_eq!(events[1].detail.as_deref(), Some("MR-2026-0001"));
        assert_eq!(events[0].detail.as_deref(), Some("Decided By"));
    }

    #[tokio::test]
    async fn a_return_is_only_overdue_after_the_grace_period() {
        let pool = pool().await;
        add(&pool, Seed { id: "a", region: "Central", status: "active", contact: Some(ms(2026, 3, 3)), held: None, capacity: None }).await;
        let early = estate(&pool, ms(2026, 3, 3)).await.unwrap();
        assert_eq!(early.regions[0].facilities[0].return_state, ReturnState::Awaited);
        assert!(early.attention.is_empty(), "awaited is not yet attention");
        let late = estate(&pool, ms(2026, 3, 12)).await.unwrap();
        assert_eq!(late.regions[0].facilities[0].return_state, ReturnState::Overdue);
    }

    /// The real path: a facility reports over HTTP to a Head Office router, and
    /// does not repeat itself until something changes.
    #[tokio::test]
    async fn a_facility_reports_to_head_office_over_the_wire_and_only_when_it_changed() {
        let dir = std::env::temp_dir().join(format!("pleadli-estate-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let hq_pool = SqlitePoolOptions::new().max_connections(4).connect_with(crate::db::connect_options(&dir.join("hq.db"))).await.unwrap();
        sqlx::migrate!("./migrations").run(&hq_pool).await.unwrap();
        add(&hq_pool, Seed { id: "fac", region: "Central", status: "active", contact: None, held: None, capacity: None }).await;
        let hq_node = crate::node::Node::new(hq_pool.clone(), dir.join("vault"), dir.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, crate::api::network::router(hq_node)).await.unwrap() });

        let facility = pool().await;
        sqlx::query("UPDATE facility_profile SET approved_capacity = 50").execute(&facility).await.unwrap();
        sqlx::query("INSERT INTO prisoners (id, first_name, last_name, admission_instrument_type, admitted_at, status, current_status) VALUES ('p1', 'A', 'B', 'warrant', 1, 'unconvicted', 'in_custody')")
            .execute(&facility)
            .await
            .unwrap();
        sqlx::query("UPDATE peer_sync_config SET hq_hostname = ?, facility_id = 'fac', sync_token = 'token-fac', connection_state = 'connected' WHERE id = 'default'")
            .bind(format!("http://{address}"))
            .execute(&facility)
            .await
            .unwrap();

        assert!(push_status(&facility).await.unwrap(), "the first report goes");
        let (held, capacity, unconvicted): (Option<i64>, Option<i64>, Option<i64>) =
            sqlx::query_as("SELECT reported_held, reported_capacity, reported_unconvicted FROM facilities WHERE id = 'fac'").fetch_one(&hq_pool).await.unwrap();
        assert_eq!((held, capacity, unconvicted), (Some(1), Some(50), Some(1)));
        assert!(!push_status(&facility).await.unwrap(), "nothing changed, so nothing is sent");

        sqlx::query("INSERT INTO prisoners (id, first_name, last_name, admission_instrument_type, admitted_at, status, current_status) VALUES ('p2', 'C', 'D', 'warrant', 2, 'convicted', 'in_custody')")
            .execute(&facility)
            .await
            .unwrap();
        assert!(push_status(&facility).await.unwrap(), "a change is sent");
        let held: Option<i64> = sqlx::query_scalar("SELECT reported_held FROM facilities WHERE id = 'fac'").fetch_one(&hq_pool).await.unwrap();
        assert_eq!(held, Some(2));

        // Head Office unreachable: an error the caller logs, the facility carries on.
        sqlx::query("UPDATE peer_sync_config SET hq_hostname = 'http://127.0.0.1:1', status_pushed_at = NULL").execute(&facility).await.unwrap();
        assert!(push_status(&facility).await.is_err());
    }
}
