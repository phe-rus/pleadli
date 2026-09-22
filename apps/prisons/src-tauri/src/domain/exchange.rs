//! The exchange between a facility and Head Office, made visible.
//!
//! A connection that answers is not an exchange that works. Two records make
//! the difference honest, one on each side, and neither is a copy of anyone's
//! records:
//!
//! - **the facility's rounds** (`exchange_rounds`): every attempt to send what is
//!   waiting and take what Head Office has for it, with how it ended. From them
//!   the facility derives one exchange state (`idle`, `pending`, `in_progress`,
//!   `completed`, `failed`, `stalled`, `offline`) that never claims more than the
//!   last round showed;
//! - **Head Office's events** (`exchange_events`): what each facility did to it,
//!   as metadata only (which facility, when, what kind, taken or refused).
//!   Head Office cannot ask an unreachable facility how it is doing, so it also
//!   keeps what the facility last said about its own exchange.
//!
//! The facility works fully offline whatever any of this says. Nothing here
//! gates local work: a round that fails only records why.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::time::{now_ms, DAY_MS};

/// A round still open after this long was cut short (the app was closed).
const ROUND_ABANDONED_MS: i64 = 5 * 60 * 1000;
/// Rounds that failed in a row before the exchange is called stalled.
const STALL_AFTER_FAILURES: i64 = 3;
/// Or work waiting this long without a completed round.
const STALL_AFTER_MS: i64 = 30 * 60 * 1000;
const KEEP_ROUNDS: i64 = 300;
const KEEP_EVENTS_PER_FACILITY: i64 = 500;

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

/// What a manual "send now" tells the officer.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncRunResult {
    /// `ok` when the round completed, whether or not there was anything to send.
    pub status: String,
    /// How many things went across.
    pub count: Option<i64>,
}

/// The last outcome kept on the singleton `peer_sync_config` row, which the
/// older status readers still use.
pub(crate) async fn set_peer_status(pool: &SqlitePool, status: &str, last_synced_at: Option<i64>, last_error: Option<String>) -> Result<(), sqlx::Error> {
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

// ---------------------------------------------------------------------
// The facility's rounds
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Trigger {
    Scheduled,
    Manual,
    Startup,
}

impl Trigger {
    fn word(self) -> &'static str {
        match self {
            Trigger::Scheduled => "scheduled",
            Trigger::Manual => "manual",
            Trigger::Startup => "startup",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// Something was sent or received and Head Office took it.
    Completed,
    /// Head Office was reached and nothing was waiting.
    NothingToSend,
    /// Head Office answered but a part of the round did not go through.
    Failed,
    /// Head Office could not be reached at all.
    Unreachable,
    /// Head Office answered and refused this facility's credential.
    Refused,
    /// Head Office has not yet approved this facility.
    AwaitingApproval,
}

impl Outcome {
    fn word(self) -> &'static str {
        match self {
            Outcome::Completed => "completed",
            Outcome::NothingToSend => "nothing_to_send",
            Outcome::Failed => "failed",
            Outcome::Unreachable => "unreachable",
            Outcome::Refused => "refused",
            Outcome::AwaitingApproval => "awaiting_approval",
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct Counts {
    pub roster: i64,
    pub status: i64,
    pub returns: i64,
    pub policy: i64,
}

impl Counts {
    pub fn total(&self) -> i64 {
        self.roster + self.status + self.returns + self.policy
    }
}

/// Opens a round. Rounds an earlier run left open are closed as interrupted, so
/// a crash never leaves the exchange looking permanently in progress.
pub async fn begin_round(pool: &SqlitePool, trigger: Trigger) -> Result<String, sqlx::Error> {
    let now = now_ms();
    sqlx::query("UPDATE exchange_rounds SET finished_at = ?, outcome = 'failed', error = 'The round was interrupted before it finished.' WHERE finished_at IS NULL AND started_at < ?")
        .bind(now)
        .bind(now - ROUND_ABANDONED_MS)
        .execute(pool)
        .await?;
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO exchange_rounds (id, started_at, trigger) VALUES (?, ?, ?)").bind(&id).bind(now).bind(trigger.word()).execute(pool).await?;
    Ok(id)
}

pub async fn finish_round(pool: &SqlitePool, id: &str, outcome: Outcome, counts: Counts, error: Option<&str>) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE exchange_rounds SET finished_at = ?, outcome = ?, sent_roster = ?, sent_status = ?, sent_returns = ?, received_policy = ?, error = ? WHERE id = ?")
        .bind(now_ms())
        .bind(outcome.word())
        .bind(counts.roster)
        .bind(counts.status)
        .bind(counts.returns)
        .bind(counts.policy)
        .bind(error)
        .bind(id)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM exchange_rounds WHERE id NOT IN (SELECT id FROM exchange_rounds ORDER BY started_at DESC LIMIT ?)").bind(KEEP_ROUNDS).execute(pool).await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Round {
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub trigger: String,
    pub outcome: Option<String>,
    pub sent_roster: i64,
    pub sent_status: i64,
    pub sent_returns: i64,
    pub received_policy: i64,
    pub error: Option<String>,
}

/// The facility's exchange, in one value. See `state_from` for how it is read.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeStatus {
    /// `idle`, `pending`, `in_progress`, `completed`, `failed`, `stalled` or `offline`.
    pub state: String,
    /// When the last round that reached Head Office and went through ended.
    pub last_success_at: Option<i64>,
    pub last_attempt_at: Option<i64>,
    pub last_outcome: Option<String>,
    /// Rounds since the last success that did not go through.
    pub consecutive_failures: i64,
    /// When the failures began, once they amount to a stall.
    pub stalled_since: Option<i64>,
    pub recent: Vec<Round>,
}

fn is_success(outcome: &str) -> bool {
    matches!(outcome, "completed" | "nothing_to_send")
}

/// Reads the exchange state from the rounds, newest first. Pure, so every case
/// is testable with a fixed clock.
///
/// - a round still open (and not abandoned) is `in_progress`;
/// - the last round reaching nobody is `offline`, which is the network's
///   problem, not the exchange's;
/// - the last round succeeding is `completed`, or `pending` if work has
///   accumulated since;
/// - failures after a success are `failed`, and become `stalled` once they
///   repeat or work has been waiting too long: the link is up and nothing is
///   being delivered.
pub fn state_from(rounds: &[Round], pending: i64, now: i64) -> ExchangeStatus {
    let recent: Vec<Round> = rounds.iter().take(8).cloned().collect();
    let open = rounds.iter().find(|r| r.finished_at.is_none() && now - r.started_at <= ROUND_ABANDONED_MS);
    let finished: Vec<&Round> = rounds.iter().filter(|r| r.finished_at.is_some()).collect();
    let last = finished.first().copied();
    let last_success = finished.iter().find(|r| r.outcome.as_deref().is_some_and(is_success));
    let last_success_at = last_success.and_then(|r| r.finished_at);
    let since_success: Vec<&&Round> = finished.iter().take_while(|r| !r.outcome.as_deref().is_some_and(is_success)).collect();
    let failures = since_success.iter().filter(|r| matches!(r.outcome.as_deref(), Some("failed" | "refused"))).count() as i64;
    let first_failure_at = since_success.iter().filter(|r| matches!(r.outcome.as_deref(), Some("failed" | "refused"))).map(|r| r.started_at).min();

    let waited_too_long = pending > 0 && failures > 0 && now - last_success_at.unwrap_or(first_failure_at.unwrap_or(now)) > STALL_AFTER_MS;
    let stalled = failures >= STALL_AFTER_FAILURES || waited_too_long;

    let state = if open.is_some() {
        "in_progress"
    } else {
        match last.and_then(|r| r.outcome.as_deref()) {
            None => {
                if pending > 0 {
                    "pending"
                } else {
                    "idle"
                }
            }
            Some("unreachable") => "offline",
            Some("completed" | "nothing_to_send") => {
                if pending > 0 {
                    "pending"
                } else {
                    "completed"
                }
            }
            Some("awaiting_approval") => "pending",
            Some(_) => {
                if stalled {
                    "stalled"
                } else {
                    "failed"
                }
            }
        }
    };

    ExchangeStatus {
        state: state.to_string(),
        last_success_at,
        last_attempt_at: rounds.first().map(|r| r.started_at),
        last_outcome: last.and_then(|r| r.outcome.clone()),
        consecutive_failures: failures,
        stalled_since: if state == "stalled" { first_failure_at } else { None },
        recent,
    }
}

pub async fn status(pool: &SqlitePool, pending: i64) -> Result<ExchangeStatus, sqlx::Error> {
    let rounds: Vec<Round> = sqlx::query_as(
        "SELECT started_at, finished_at, trigger, outcome, sent_roster, sent_status, sent_returns, received_policy, error
         FROM exchange_rounds ORDER BY started_at DESC LIMIT 60",
    )
    .fetch_all(pool)
    .await?;
    Ok(state_from(&rounds, pending, now_ms()))
}

/// The same, ignoring a round that is open right now: what the facility tells
/// Head Office is the last thing that finished, not a round that is mid-way.
pub async fn status_finished(pool: &SqlitePool, pending: i64) -> Result<ExchangeStatus, sqlx::Error> {
    let rounds: Vec<Round> = sqlx::query_as(
        "SELECT started_at, finished_at, trigger, outcome, sent_roster, sent_status, sent_returns, received_policy, error
         FROM exchange_rounds WHERE finished_at IS NOT NULL ORDER BY started_at DESC LIMIT 60",
    )
    .fetch_all(pool)
    .await?;
    Ok(state_from(&rounds, pending, now_ms()))
}

// ---------------------------------------------------------------------
// Head Office's events
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Roster,
    Status,
    Return,
    Policy,
    Connection,
}

impl Kind {
    fn word(self) -> &'static str {
        match self {
            Kind::Roster => "roster",
            Kind::Status => "status",
            Kind::Return => "return",
            Kind::Policy => "policy",
            Kind::Connection => "connection",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Taken {
    Accepted,
    /// Delivered, and already held: a retry of something that had gone through.
    Duplicate,
    Refused,
}

/// Records what a facility did to Head Office. Metadata only. An accepted
/// event also counts as the facility having been heard from and having last
/// exchanged successfully.
pub async fn record_event(pool: &SqlitePool, facility_id: &str, kind: Kind, result: Taken, detail: Option<&str>, via: &str) {
    let now = now_ms();
    let result_word = match result {
        Taken::Accepted => "accepted",
        Taken::Duplicate => "duplicate",
        Taken::Refused => "refused",
    };
    let outcome = async {
        sqlx::query("INSERT INTO exchange_events (id, facility_id, at, kind, result, detail, via) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(Uuid::new_v4().to_string())
            .bind(facility_id)
            .bind(now)
            .bind(kind.word())
            .bind(result_word)
            .bind(detail.map(|d| d.chars().take(200).collect::<String>()))
            .bind(via)
            .execute(pool)
            .await?;
        if result != Taken::Refused && kind != Kind::Connection {
            sqlx::query("UPDATE facilities SET last_synced_at = ?1, last_contact_at = ?1 WHERE id = ?2").bind(now).bind(facility_id).execute(pool).await?;
        }
        sqlx::query("DELETE FROM exchange_events WHERE facility_id = ?1 AND id NOT IN (SELECT id FROM exchange_events WHERE facility_id = ?1 ORDER BY at DESC LIMIT ?2)")
            .bind(facility_id)
            .bind(KEEP_EVENTS_PER_FACILITY)
            .execute(pool)
            .await?;
        Ok::<(), sqlx::Error>(())
    }
    .await;
    if let Err(e) = outcome {
        // A log that cannot be written must never turn into a failed exchange.
        log::warn!("exchange event not recorded: {e}");
    }
}

/// The facility a sync token belongs to, whatever its status, so a refusal can
/// be attributed. `None` for a token nobody holds.
pub async fn facility_for_token(pool: &SqlitePool, token: &str) -> Option<String> {
    sqlx::query_scalar("SELECT id FROM facilities WHERE sync_token_hash = ?").bind(super::facilities::hash_secret(token)).fetch_optional(pool).await.ok().flatten()
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeEvent {
    pub id: String,
    pub facility_id: String,
    pub facility_name: String,
    pub at: i64,
    pub kind: String,
    pub result: String,
    pub detail: Option<String>,
    pub via: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HqView {
    /// Not an active facility: waiting to be approved, or revoked.
    NotActive,
    /// Active and never heard from.
    Never,
    /// Heard from, and delivering.
    Current,
    /// Heard from, but not lately.
    Stale,
    /// Not heard from for over a week.
    Silent,
    /// Heard from recently, and reporting that it cannot deliver, or being refused.
    Stalled,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FacilityExchange {
    pub facility_id: String,
    pub name: String,
    pub facility_number: String,
    pub region: String,
    /// The facility's own standing with Head Office: `active`,
    /// `pending_verification` or `revoked`.
    pub standing: String,
    pub view: HqView,
    pub last_contact_at: Option<i64>,
    /// When something last went through and was taken.
    pub last_success_at: Option<i64>,
    /// `lan`, `tunnel` or `unknown`: how the last event arrived.
    pub last_via: Option<String>,
    /// What the facility last said about its own exchange, and when it said it.
    pub reported_state: Option<String>,
    pub reported_pending: Option<i64>,
    pub reported_last_error: Option<String>,
    pub refused_last_day: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeOverview {
    pub facilities: Vec<FacilityExchange>,
    pub events: Vec<ExchangeEvent>,
}

#[derive(FromRow)]
struct FacilityRow {
    id: String,
    name: String,
    facility_number: String,
    region: String,
    status: String,
    last_contact_at: Option<i64>,
    reported_exchange_state: Option<String>,
    reported_pending: Option<i64>,
    reported_last_error: Option<String>,
    last_success_at: Option<i64>,
    last_via: Option<String>,
    refused_last_day: i64,
}

/// How Head Office reads one facility's exchange, from its own events and
/// contact, and from what the facility reported. Pure, for a fixed clock.
pub fn hq_view(standing: &str, last_contact_at: Option<i64>, reported: Option<&str>, refused_last_day: i64, last_success_at: Option<i64>, now: i64) -> HqView {
    if standing != "active" {
        return HqView::NotActive;
    }
    let Some(contact) = last_contact_at else { return HqView::Never };
    let age = now - contact;
    if age > 7 * DAY_MS {
        return HqView::Silent;
    }
    let says_stuck = matches!(reported, Some("stalled" | "failed"));
    let refused_without_success = refused_last_day > 0 && last_success_at.is_none_or(|at| now - at > DAY_MS);
    if age <= 2 * DAY_MS && (says_stuck || refused_without_success) {
        return HqView::Stalled;
    }
    if age > 2 * DAY_MS {
        return HqView::Stale;
    }
    HqView::Current
}

pub async fn overview(pool: &SqlitePool, events_limit: i64) -> Result<ExchangeOverview, sqlx::Error> {
    let now = now_ms();
    let rows: Vec<FacilityRow> = sqlx::query_as(
        "SELECT f.id, f.name, f.facility_number, f.region, f.status, f.last_contact_at,
                f.reported_exchange_state, f.reported_pending, f.reported_last_error,
                (SELECT MAX(at) FROM exchange_events e WHERE e.facility_id = f.id AND e.result IN ('accepted', 'duplicate') AND e.kind != 'connection') AS last_success_at,
                (SELECT via FROM exchange_events e WHERE e.facility_id = f.id ORDER BY at DESC LIMIT 1) AS last_via,
                (SELECT COUNT(*) FROM exchange_events e WHERE e.facility_id = f.id AND e.result = 'refused' AND e.at > ?1) AS refused_last_day
         FROM facilities f ORDER BY f.region, f.name",
    )
    .bind(now - DAY_MS)
    .fetch_all(pool)
    .await?;
    let facilities = rows
        .into_iter()
        .map(|r| FacilityExchange {
            view: hq_view(&r.status, r.last_contact_at, r.reported_exchange_state.as_deref(), r.refused_last_day, r.last_success_at, now),
            facility_id: r.id,
            name: r.name,
            facility_number: r.facility_number,
            region: r.region,
            standing: r.status,
            last_contact_at: r.last_contact_at,
            last_success_at: r.last_success_at,
            last_via: r.last_via,
            reported_state: r.reported_exchange_state,
            reported_pending: r.reported_pending,
            reported_last_error: r.reported_last_error,
            refused_last_day: r.refused_last_day,
        })
        .collect();
    let events = list_events(pool, None, events_limit).await?;
    Ok(ExchangeOverview { facilities, events })
}

pub async fn list_events(pool: &SqlitePool, facility_id: Option<&str>, limit: i64) -> Result<Vec<ExchangeEvent>, sqlx::Error> {
    sqlx::query_as(
        "SELECT e.id, e.facility_id, f.name AS facility_name, e.at, e.kind, e.result, e.detail, e.via
         FROM exchange_events e JOIN facilities f ON f.id = e.facility_id
         WHERE (?1 IS NULL OR e.facility_id = ?1) ORDER BY e.at DESC LIMIT ?2",
    )
    .bind(facility_id)
    .bind(limit.clamp(1, 500))
    .fetch_all(pool)
    .await
}

// ---------------------------------------------------------------------
// The background loop
// ---------------------------------------------------------------------

/// Background exchange: shortly after start, then every minute, if this
/// installation is a facility that is connected, send whatever is waiting. A
/// facility works fully offline indefinitely; this loop never blocks local work,
/// and an idle facility sends nothing.
pub async fn background_loop(pool: SqlitePool) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    // A saved connection is tried soon after start, so the state shown is
    // honest without waiting a minute.
    tokio::time::sleep(std::time::Duration::from_secs(8)).await;
    let mut trigger = Trigger::Startup;

    loop {
        let is_head_office: Option<bool> = sqlx::query_scalar("SELECT is_head_office FROM hq_config WHERE id = 'default'").fetch_optional(&pool).await.ok().flatten();
        if is_head_office != Some(true) {
            if let Err(e) = super::peer::refresh_connection(&pool).await {
                log::info!("connection check skipped: {e:?}");
            }
            match super::connectivity::exchange_with(&pool, false, trigger).await {
                Ok(result) => log::info!("background exchange: {}", result.status),
                Err(e) => log::info!("background exchange skipped: {e}"),
            }
        }
        trigger = Trigger::Scheduled;
        interval.tick().await;
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

    fn round(started: i64, outcome: Option<&str>) -> Round {
        Round {
            started_at: started,
            finished_at: outcome.map(|_| started + 1_000),
            trigger: "scheduled".into(),
            outcome: outcome.map(str::to_string),
            sent_roster: 0,
            sent_status: 0,
            sent_returns: 0,
            received_policy: 0,
            error: None,
        }
    }

    const NOW: i64 = 1_000_000_000;
    const MIN: i64 = 60_000;

    #[test]
    fn the_exchange_says_only_what_the_rounds_showed() {
        // Nothing has ever been tried.
        assert_eq!(state_from(&[], 0, NOW).state, "idle");
        assert_eq!(state_from(&[], 2, NOW).state, "pending");
        // A round is open right now.
        assert_eq!(state_from(&[round(NOW - 10_000, None)], 0, NOW).state, "in_progress");
        // ...but one left open long ago was cut short and is not in progress.
        assert_ne!(state_from(&[round(NOW - 20 * MIN, None)], 0, NOW).state, "in_progress");
        // The last round went through.
        let ok = [round(NOW - MIN, Some("completed"))];
        assert_eq!(state_from(&ok, 0, NOW).state, "completed");
        assert_eq!(state_from(&ok, 3, NOW).state, "pending", "work has built up since");
        assert_eq!(state_from(&[round(NOW - MIN, Some("nothing_to_send"))], 0, NOW).state, "completed");
        // Head Office could not be reached: the network's problem, not a stall.
        let offline = [round(NOW - MIN, Some("unreachable")), round(NOW - 2 * MIN, Some("unreachable")), round(NOW - 3 * MIN, Some("unreachable")), round(NOW - 4 * MIN, Some("unreachable"))];
        assert_eq!(state_from(&offline, 5, NOW).state, "offline");
        // Approval is not a failure.
        assert_eq!(state_from(&[round(NOW - MIN, Some("awaiting_approval"))], 0, NOW).state, "pending");
    }

    #[test]
    fn a_link_that_is_up_but_not_delivering_becomes_stalled() {
        let one = [round(NOW - MIN, Some("failed")), round(NOW - 10 * MIN, Some("completed"))];
        let first = state_from(&one, 2, NOW);
        assert_eq!((first.state.as_str(), first.consecutive_failures), ("failed", 1), "one failure is a failure, not a stall");
        assert!(first.stalled_since.is_none());

        let three = [round(NOW - MIN, Some("failed")), round(NOW - 2 * MIN, Some("refused")), round(NOW - 3 * MIN, Some("failed")), round(NOW - 10 * MIN, Some("completed"))];
        let stalled = state_from(&three, 2, NOW);
        assert_eq!(stalled.state, "stalled");
        assert_eq!(stalled.consecutive_failures, 3);
        assert_eq!(stalled.stalled_since, Some(NOW - 3 * MIN), "since the first round that failed");
        assert_eq!(stalled.last_success_at, Some(NOW - 10 * MIN + 1_000));

        // Work waiting past the limit with a failure in between is a stall too.
        let waiting = [round(NOW - MIN, Some("failed")), round(NOW - 90 * MIN, Some("completed"))];
        assert_eq!(state_from(&waiting, 4, NOW).state, "stalled");
        assert_eq!(state_from(&waiting, 0, NOW).state, "failed", "nothing waiting, so nothing is stuck");

        // A success clears it.
        let cleared = [round(NOW, Some("completed")), round(NOW - MIN, Some("failed")), round(NOW - 2 * MIN, Some("failed")), round(NOW - 3 * MIN, Some("failed"))];
        let now_ok = state_from(&cleared, 0, NOW + MIN);
        assert_eq!((now_ok.state.as_str(), now_ok.consecutive_failures), ("completed", 0));
    }

    #[tokio::test]
    async fn rounds_are_recorded_and_a_round_cut_short_is_closed() {
        let pool = pool().await;
        let id = begin_round(&pool, Trigger::Manual).await.unwrap();
        assert_eq!(status(&pool, 0).await.unwrap().state, "in_progress");
        finish_round(&pool, &id, Outcome::Completed, Counts { roster: 2, status: 1, returns: 0, policy: 1 }, None).await.unwrap();
        let done = status(&pool, 0).await.unwrap();
        assert_eq!((done.state.as_str(), done.recent[0].sent_roster, done.recent[0].trigger.as_str()), ("completed", 2, "manual"));

        // The app was closed mid-round long ago.
        sqlx::query("INSERT INTO exchange_rounds (id, started_at, trigger) VALUES ('cut', ?, 'scheduled')").bind(now_ms() - 10 * MIN).execute(&pool).await.unwrap();
        begin_round(&pool, Trigger::Scheduled).await.unwrap();
        let (outcome, error): (Option<String>, Option<String>) = sqlx::query_as("SELECT outcome, error FROM exchange_rounds WHERE id = 'cut'").fetch_one(&pool).await.unwrap();
        assert_eq!(outcome.as_deref(), Some("failed"));
        assert!(error.unwrap().contains("interrupted"));
    }

    async fn add_facility(pool: &SqlitePool, id: &str, status: &str, token: &str) {
        sqlx::query(
            "INSERT INTO facilities (id, name, facility_number, location, region, head_officer_name, status, verification_code_hash, verification_expires_at, verifying_officer_email, sync_token_hash)
             VALUES (?1, ?1, ?1, 'Kampala', 'Central', 'OIC', ?2, 'h', 0, 'a@example.org', ?3)",
        )
        .bind(id)
        .bind(status)
        .bind(super::super::facilities::hash_secret(token))
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn head_office_keeps_what_each_facility_did_and_only_as_metadata() {
        let pool = pool().await;
        add_facility(&pool, "fac", "active", "tok").await;
        assert_eq!(facility_for_token(&pool, "tok").await.as_deref(), Some("fac"));
        assert_eq!(facility_for_token(&pool, "nobody").await, None);

        record_event(&pool, "fac", Kind::Status, Taken::Accepted, None, "lan").await;
        record_event(&pool, "fac", Kind::Return, Taken::Refused, Some("The facility is not verified."), "lan").await;
        let events = list_events(&pool, Some("fac"), 10).await.unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!((events[0].kind.as_str(), events[0].result.as_str(), events[0].via.as_str()), ("return", "refused", "lan"));

        let (contact, synced): (Option<i64>, Option<i64>) = sqlx::query_as("SELECT last_contact_at, last_synced_at FROM facilities WHERE id = 'fac'").fetch_one(&pool).await.unwrap();
        assert!(contact.is_some() && synced.is_some(), "an accepted event is contact");

        let overview = overview(&pool, 10).await.unwrap();
        let fac = &overview.facilities[0];
        assert_eq!((fac.last_via.as_deref(), fac.refused_last_day), (Some("lan"), 1));
        assert!(fac.last_success_at.is_some());
    }

    #[test]
    fn head_office_reads_a_facility_from_what_it_holds() {
        let now = 100 * DAY_MS;
        assert_eq!(hq_view("pending_verification", None, None, 0, None, now), HqView::NotActive);
        assert_eq!(hq_view("revoked", Some(now), None, 0, None, now), HqView::NotActive);
        assert_eq!(hq_view("active", None, None, 0, None, now), HqView::Never);
        assert_eq!(hq_view("active", Some(now - 1000), Some("completed"), 0, Some(now - 1000), now), HqView::Current);
        assert_eq!(hq_view("active", Some(now - 3 * DAY_MS), None, 0, None, now), HqView::Stale);
        assert_eq!(hq_view("active", Some(now - 8 * DAY_MS), None, 0, None, now), HqView::Silent);
        // In contact and saying it cannot deliver: stalled, not fine.
        assert_eq!(hq_view("active", Some(now - 1000), Some("stalled"), 0, Some(now - 1000), now), HqView::Stalled);
        // In contact, being refused, and nothing has gone through today.
        assert_eq!(hq_view("active", Some(now - 1000), None, 3, None, now), HqView::Stalled);
        // A refusal beside a fresh success is noise, not a stall.
        assert_eq!(hq_view("active", Some(now - 1000), None, 1, Some(now - 1000), now), HqView::Current);
    }

    #[tokio::test]
    async fn the_scrub_migration_reduces_rows_head_office_already_holds_and_leaves_local_records() {
        // 0140 ran on every install that still held copies; it stays valid history.
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run_to(130, &pool).await.unwrap();
        add_facility(&pool, "fac-1", "active", "th").await;
        for (id, facility) in [("copy", Some("fac-1")), ("local", None)] {
            sqlx::query(
                "INSERT INTO prisoners (id, first_name, last_name, national_id, reference, notes, current_location, admission_instrument_type, admitted_at, date_of_birth, facility_id)
                 VALUES (?, 'Amina', 'Nakato', 'CM9000123', 'LZ/1', 'asthmatic', 'Block B', 'warrant', 1, 0, ?)",
            )
            .bind(id)
            .bind(facility)
            .execute(&pool)
            .await
            .unwrap();
        }
        sqlx::raw_sql(include_str!("../../migrations/0140_scrub_synced_prisoners.sql")).execute(&pool).await.unwrap();
        let copy: (String, Option<String>, Option<String>) = sqlx::query_as("SELECT first_name, national_id, notes FROM prisoners WHERE id = 'copy'").fetch_one(&pool).await.unwrap();
        assert_eq!((copy.0.as_str(), copy.1, copy.2), ("", None, None));
        let local: (String, Option<String>) = sqlx::query_as("SELECT first_name, national_id FROM prisoners WHERE id = 'local'").fetch_one(&pool).await.unwrap();
        assert_eq!((local.0.as_str(), local.1.as_deref()), ("Amina", Some("CM9000123")));

        // ...and the migration that retires the push removes the copies, never the local records.
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let left: Vec<String> = sqlx::query_scalar("SELECT id FROM prisoners ORDER BY id").fetch_all(&pool).await.unwrap();
        assert_eq!(left, ["local"]);
        let classes: Vec<String> = sqlx::query_scalar("SELECT class FROM sync_classes ORDER BY class").fetch_all(&pool).await.unwrap();
        assert!(!classes.contains(&"legacy_snapshot".to_string()));
        let triggers: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'sync_track_prisoner%'").fetch_one(&pool).await.unwrap();
        assert_eq!(triggers, 0, "nothing tracks prisoners for a push any more");
    }
}
