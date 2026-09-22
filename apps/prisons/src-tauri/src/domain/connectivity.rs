//! How this facility stands with Head Office, in one place: the single status
//! the shell, Settings and the inbox all read, what the facility shares and
//! how much of it is still waiting, and the exchange that sends it.
//!
//! The facility is complete without any of this. Nothing here gates local
//! work: a failed exchange only records why, and disconnecting removes the
//! link and nothing else.

use serde::Serialize;
use sqlx::{FromRow, SqliteConnection, SqlitePool};

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::error::DomainError;
use super::exchange::{self, Counts, ExchangeStatus, Outcome, SyncRunResult, Trigger};
use super::facilities::{self, PeerSyncConfig};
use super::time::now_ms;
use super::{estate, facility_profile, inbox, peer, policy_sync, returns};

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Pending {
    pub total: i64,
    pub roster: i64,
    /// Attested returns submitted and not yet acknowledged by Head Office.
    pub returns: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SyncClass {
    pub class: String,
    pub direction: String,
    pub enabled: bool,
    #[sqlx(skip)]
    pub label: String,
    #[sqlx(skip)]
    pub description: String,
    #[sqlx(skip)]
    pub pending: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectivityStatus {
    /// Where this facility stands with Head Office: `not_connected`,
    /// `awaiting_approval`, `rejected`, `revoked`, `paired` (approved, nothing
    /// exchanged yet), `connected`, `offline`, `needs_attention` (the last
    /// exchange failed), `stalled` (the link is up and nothing is being
    /// delivered) or `disconnected`.
    pub state: String,
    /// How the exchange itself is going, separately from whether a link exists.
    pub exchange: ExchangeStatus,
    /// Whether the certificate of a local-network Head Office is pinned.
    pub certificate_pinned: bool,
    pub head_office_address: Option<String>,
    pub facility_reference: Option<String>,
    pub last_exchange_at: Option<i64>,
    pub never_synced: bool,
    pub pending: Pending,
    /// `internet`, `local_network` or `none`. A plain word for the officer.
    pub transport: String,
    pub last_error: Option<String>,
    pub disconnected_at: Option<i64>,
    pub classes: Vec<SyncClass>,
}

fn describe(class: &str) -> (&'static str, &'static str) {
    match class {
        "roster" => ("Officer roster", "Names, badge numbers, roles and whether an account is active. Never passwords or PINs."),
        "status" => ("Population and capacity", "How many people are held here and the approved capacity, with the time it was counted. Counts only, no names."),
        "returns" => ("Attested returns", "A monthly return the officer in charge has attested, when the officer submits it. Counts only, no prisoner records."),
        "policy" => ("Head Office defaults", "Numbering and uniform defaults Head Office sets for its facilities. Received here, never sent."),
        _ => ("Other", ""),
    }
}

fn transport_of(address: &str) -> &'static str {
    let host = address.trim_start_matches("https://").trim_start_matches("http://");
    let host = host.split([':', '/']).next().unwrap_or(host);
    if host == "localhost" || host.starts_with("127.") || peer::is_private_host(host) {
        "local_network"
    } else {
        "internet"
    }
}

/// Reads the link state from the saved connection and how the exchange is going.
fn state_of(config: &PeerSyncConfig, disconnected: bool, exchange: &ExchangeStatus) -> &'static str {
    match config.connection_state.as_str() {
        "pending" => "awaiting_approval",
        "rejected" => "rejected",
        "revoked" => "revoked",
        "connected" => match config.last_sync_status.as_deref() {
            Some("pending_verification") => "awaiting_approval",
            _ => match exchange.state.as_str() {
                "offline" => "offline",
                "stalled" => "stalled",
                "failed" => "needs_attention",
                _ if exchange.last_success_at.is_none() => "paired",
                _ => "connected",
            },
        },
        _ if disconnected => "disconnected",
        _ => "not_connected",
    }
}

pub async fn pending(pool: &SqlitePool) -> Result<Pending, sqlx::Error> {
    let rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT o.class, COUNT(*) FROM sync_outbox o JOIN sync_classes c ON c.class = o.class AND c.enabled = 1 GROUP BY o.class",
    )
    .fetch_all(pool)
    .await?;
    let mut pending = Pending::default();
    for (class, count) in rows {
        match class.as_str() {
            "roster" => pending.roster = count,
            _ => {}
        }
    }
    if class_enabled(pool, "returns").await {
        pending.returns = sqlx::query_scalar("SELECT COUNT(*) FROM return_submissions WHERE acknowledged_at IS NULL").fetch_one(pool).await?;
    }
    pending.total = pending.roster + pending.returns;
    Ok(pending)
}

pub async fn status(pool: &SqlitePool) -> Result<ConnectivityStatus, sqlx::Error> {
    let config = facilities::get_peer_sync_config(pool).await?;
    let disconnected_at: Option<i64> = sqlx::query_scalar("SELECT disconnected_at FROM peer_sync_config WHERE id = 'default'").fetch_one(pool).await?;
    let pending = pending(pool).await?;
    let mut classes: Vec<SyncClass> = sqlx::query_as("SELECT class, direction, enabled FROM sync_classes ORDER BY direction DESC, class").fetch_all(pool).await?;
    for class in &mut classes {
        let (label, description) = describe(&class.class);
        class.label = label.to_string();
        class.description = description.to_string();
        class.pending = match class.class.as_str() {
            "roster" => pending.roster,
            "returns" => pending.returns,
            _ => 0,
        };
    }
    let exchange = exchange::status(pool, pending.total).await?;
    let state = state_of(&config, disconnected_at.is_some() && config.hq_hostname.is_none(), &exchange);
    let address = config.hq_hostname.clone();
    let pinned: Option<String> = sqlx::query_scalar("SELECT hq_fingerprint FROM peer_sync_config WHERE id = 'default'").fetch_one(pool).await?;
    Ok(ConnectivityStatus {
        state: state.to_string(),
        exchange,
        certificate_pinned: pinned.is_some(),
        transport: address.as_deref().map_or("none", transport_of).to_string(),
        head_office_address: address,
        facility_reference: facility_profile::get(pool).await?.facility_number,
        last_exchange_at: config.last_synced_at,
        never_synced: config.last_synced_at.is_none(),
        pending,
        last_error: config.last_error.clone(),
        disconnected_at,
        classes,
    })
}

pub async fn set_class_enabled(conn: &mut SqliteConnection, actor: &Actor, class: &str, enabled: bool) -> Result<(), DomainError> {
    let changed = sqlx::query("UPDATE sync_classes SET enabled = ?, updated_at = ?, updated_by = ? WHERE class = ?")
        .bind(enabled)
        .bind(now_ms())
        .bind(actor.officer_id.as_deref())
        .bind(class)
        .execute(&mut *conn)
        .await?
        .rows_affected();
    if changed == 0 {
        return Err(DomainError::NotFound("That kind of information"));
    }
    audit::record(conn, actor, AuditEntry::new("network.class_changed", "sync_class", Some(class)).after(&serde_json::json!({ "enabled": enabled }))).await?;
    Ok(())
}

pub async fn class_enabled(pool: &SqlitePool, class: &str) -> bool {
    sqlx::query_scalar::<_, bool>("SELECT enabled FROM sync_classes WHERE class = ?").bind(class).fetch_optional(pool).await.ok().flatten().unwrap_or(false)
}

/// Ends the link to Head Office. Everything local stays: records, officers,
/// audit, backups. What was waiting to be sent is dropped, because connecting
/// again begins with a full exchange.
pub async fn disconnect(conn: &mut SqliteConnection, actor: &Actor) -> Result<(), DomainError> {
    let state: Option<String> = sqlx::query_scalar("SELECT connection_state FROM peer_sync_config WHERE id = 'default'").fetch_one(&mut *conn).await?;
    if matches!(state.as_deref(), None | Some("none")) {
        return Err(DomainError::conflict("NOT_CONNECTED", "This facility is not connected to Head Office."));
    }
    sqlx::query(
        "UPDATE peer_sync_config
         SET hq_hostname = NULL, hq_fingerprint = NULL, facility_id = NULL, sync_token = NULL, connection_state = 'none', connection_request_id = NULL,
             last_sync_status = NULL, last_error = NULL, facility_display_name = NULL, requested_by_badge = NULL, requested_by_name = NULL,
             roster_pushed_at = NULL, roster_count = NULL, disconnected_at = ?
         WHERE id = 'default'",
    )
    .bind(now_ms())
    .execute(&mut *conn)
    .await?;
    sqlx::query("DELETE FROM sync_outbox").execute(&mut *conn).await?;
    sqlx::query("DELETE FROM exchange_rounds").execute(&mut *conn).await?;
    audit::record(conn, actor, AuditEntry::new("peer.disconnected", "peer_sync_config", Some("default"))).await?;
    inbox::notify(
        conn,
        inbox::Event {
            kind: "connection",
            origin: "local",
            source: "Head Office connection",
            subject: "Disconnected from Head Office",
            body: Some("Local prison work carries on as before. Head Office keeps its own record of this facility until it removes it."),
            route: Some("/settings?tab=network"),
            permission: Some(super::authz::perm::NODE_MANAGE),
        },
    )
    .await?;
    Ok(())
}

/// One round with Head Office, started by the officer or by the schedule. See
/// `exchange_with`.
pub async fn exchange(pool: &SqlitePool, force: bool) -> Result<SyncRunResult, String> {
    exchange_with(pool, force, if force { Trigger::Manual } else { Trigger::Scheduled }).await
}

/// One round with Head Office: reach it, send what is due and enabled, take
/// what it has for us, and record how it ended. Sends only when something
/// changed or the last exchange did not succeed, so an idle facility costs Head
/// Office nothing. `force` sends regardless (the officer asked).
///
/// The round is recorded whatever happens, and its outcome is what the
/// facility shows: reaching Head Office is not the same as being taken.
pub async fn exchange_with(pool: &SqlitePool, force: bool, trigger: Trigger) -> Result<SyncRunResult, String> {
    facilities::get_peer_sync_context(pool).await.map_err(|e| e.to_string())?.ok_or_else(|| "This installation is not connected to a Head Office.".to_string())?;

    let round = exchange::begin_round(pool, trigger).await.map_err(|e| e.to_string())?;
    let (outcome, counts, error) = run_round(pool, force).await;
    exchange::finish_round(pool, &round, outcome, counts, error.as_deref()).await.map_err(|e| e.to_string())?;

    match outcome {
        Outcome::Completed | Outcome::NothingToSend => {
            exchange::set_peer_status(pool, "ok", Some(now_ms()), None).await.map_err(|e| e.to_string())?;
            Ok(SyncRunResult { status: "ok".to_string(), count: Some(counts.total()) })
        }
        Outcome::AwaitingApproval => Ok(SyncRunResult { status: "pending_verification".to_string(), count: None }),
        Outcome::Unreachable => {
            exchange::set_peer_status(pool, "offline", None, error.clone()).await.map_err(|e| e.to_string())?;
            Err(error.unwrap_or_default())
        }
        Outcome::Refused | Outcome::Failed => {
            exchange::set_peer_status(pool, if outcome == Outcome::Refused { "rejected" } else { "error" }, None, error.clone()).await.map_err(|e| e.to_string())?;
            Err(error.unwrap_or_default())
        }
    }
}

/// Whether an error from Head Office means it did not accept this facility's
/// credential, as opposed to failing to carry the request out.
fn is_refusal(error: &str) -> bool {
    error.contains("401") || error.contains("did not accept")
}

async fn run_round(pool: &SqlitePool, force: bool) -> (Outcome, Counts, Option<String>) {
    let mut counts = Counts::default();
    if !peer::hq_reachable(pool).await {
        return (Outcome::Unreachable, counts, Some("Head Office cannot be reached. Work here carries on and the changes will be sent when it can.".to_string()));
    }

    let (config, waiting) = match (facilities::get_peer_sync_config(pool).await, pending(pool).await) {
        (Ok(config), Ok(waiting)) => (config, waiting),
        (Err(e), _) | (_, Err(e)) => return (Outcome::Failed, counts, Some(e.to_string())),
    };
    let due = force || config.last_synced_at.is_none() || config.last_sync_status.as_deref() != Some("ok");

    let mut errors: Vec<String> = Vec::new();
    fn note(result: Result<i64, String>, slot: &mut i64, errors: &mut Vec<String>) {
        match result {
            Ok(n) => *slot = n,
            Err(e) => errors.push(e),
        }
    }

    if class_enabled(pool, "roster").await && (due || waiting.roster > 0) {
        note(peer::push_roster(pool).await.map(|n| n as i64), &mut counts.roster, &mut errors);
    }
    if class_enabled(pool, "status").await {
        note(estate::push_status(pool).await.map(i64::from), &mut counts.status, &mut errors);
    }
    if class_enabled(pool, "returns").await && waiting.returns > 0 {
        match returns::send_queued(pool).await {
            Ok((acknowledged, failure)) => {
                counts.returns = acknowledged as i64;
                if let Some(failure) = failure {
                    errors.push(failure);
                }
            }
            Err(e) => errors.push(e),
        }
    }
    if class_enabled(pool, "policy").await {
        note(policy_sync::pull_policy(pool).await.map(|r| i64::from(r.numbering_applied) + r.uniforms_applied as i64), &mut counts.policy, &mut errors);
    }

    let Some(first) = errors.first().cloned() else {
        return (if counts.total() > 0 { Outcome::Completed } else { Outcome::NothingToSend }, counts, None);
    };
    if errors.iter().any(|e| is_refusal(e)) {
        return match peer::check_standing(pool).await.as_deref() {
            // Registered, and Head Office has not yet verified it: not a refusal.
            Some("pending_verification") => (Outcome::AwaitingApproval, counts, None),
            _ => (Outcome::Refused, counts, Some(first)),
        };
    }
    (Outcome::Failed, counts, Some(first))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::officers::{self, CreateOfficerInput, ProfileInput};
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    async fn admin(pool: &SqlitePool) -> Actor {
        let mut tx = pool.begin().await.unwrap();
        let o = officers::create_first_admin(&mut tx, "OIC-1", "OIC", "correct-horse").await.unwrap();
        tx.commit().await.unwrap();
        Actor::officer(o.id, o.badge_number, o.name, o.role, o.is_admin, None)
    }

    async fn add_officer(pool: &SqlitePool, actor: &Actor, badge: &str) {
        let mut tx = pool.begin().await.unwrap();
        officers::create_officer(&mut tx, actor, CreateOfficerInput { badge_number: badge.into(), name: badge.into(), password: "another-password".into(), role: "records".into(), profile: ProfileInput::default(), ..Default::default() }).await.unwrap();
        tx.commit().await.unwrap();
    }

    async fn pair(pool: &SqlitePool, http: &str) {
        sqlx::query("UPDATE peer_sync_config SET hq_hostname = ?, facility_id = 'fac-1', sync_token = 't', connection_state = 'connected' WHERE id = 'default'").bind(http).execute(pool).await.unwrap();
    }

    #[tokio::test]
    async fn the_status_says_plainly_where_the_facility_stands() {
        let pool = pool().await;
        assert_eq!(status(&pool).await.unwrap().state, "not_connected");

        pair(&pool, "https://hq.example.org").await;
        let paired = status(&pool).await.unwrap();
        assert_eq!((paired.state.as_str(), paired.transport.as_str(), paired.never_synced), ("paired", "internet", true), "approved, but nothing has been exchanged");

        async fn round(pool: &SqlitePool, outcome: &'static str, at: i64) {
            sqlx::query("INSERT INTO exchange_rounds (id, started_at, finished_at, trigger, outcome) VALUES (?, ?, ?, 'scheduled', ?)")
                .bind(uuid::Uuid::new_v4().to_string())
                .bind(at)
                .bind(at + 1)
                .bind(outcome)
                .execute(pool)
                .await
                .unwrap();
        }
        let now = now_ms();
        round(&pool, "completed", now - 40_000).await;
        assert_eq!(status(&pool).await.unwrap().state, "connected");
        round(&pool, "unreachable", now - 30_000).await;
        assert_eq!(status(&pool).await.unwrap().state, "offline");
        round(&pool, "failed", now - 20_000).await;
        assert_eq!(status(&pool).await.unwrap().state, "needs_attention", "reachable, and the last round did not go through");
        round(&pool, "refused", now - 10_000).await;
        round(&pool, "failed", now - 5_000).await;
        let stalled = status(&pool).await.unwrap();
        assert_eq!((stalled.state.as_str(), stalled.exchange.state.as_str()), ("stalled", "stalled"), "the link is up and nothing is delivered");

        sqlx::query("UPDATE peer_sync_config SET connection_state = 'revoked' WHERE id = 'default'").execute(&pool).await.unwrap();
        assert_eq!(status(&pool).await.unwrap().state, "revoked");
        sqlx::query("UPDATE peer_sync_config SET connection_state = 'pending', facility_id = NULL WHERE id = 'default'").execute(&pool).await.unwrap();
        assert_eq!(status(&pool).await.unwrap().state, "awaiting_approval");
    }

    #[test]
    fn transport_is_a_plain_word() {
        assert_eq!(transport_of("https://hq.example.org"), "internet");
        assert_eq!(transport_of("http://127.0.0.1:47923"), "local_network");
        assert_eq!(transport_of("http://192.168.1.20:47923"), "local_network");
        assert_eq!(transport_of("http://172.20.0.5"), "local_network");
        assert_eq!(transport_of("http://172.32.0.5"), "internet");
        assert_eq!(transport_of("https://100.115.92.26:47924"), "local_network", "carrier-grade NAT space is not public");
        assert_eq!(transport_of("https://100.128.0.1"), "internet");
        assert_eq!(transport_of("http://hq.local:1"), "local_network");
    }

    #[tokio::test]
    async fn changes_are_counted_as_pending_only_while_paired() {
        let pool = pool().await;
        let actor = admin(&pool).await;
        add_officer(&pool, &actor, "R-1").await;
        assert_eq!(pending(&pool).await.unwrap().total, 0, "an unconnected facility tracks nothing");

        pair(&pool, "https://hq.example.org").await;
        add_officer(&pool, &actor, "R-2").await;
        add_officer(&pool, &actor, "R-3").await;
        assert_eq!(pending(&pool).await.unwrap().roster, 2);
        // The same officer changing twice is still one change waiting.
        sqlx::query("UPDATE officers SET name = 'Renamed' WHERE badge_number = 'R-2'").execute(&pool).await.unwrap();
        sqlx::query("UPDATE officers SET name = 'Renamed again' WHERE badge_number = 'R-2'").execute(&pool).await.unwrap();
        assert_eq!(pending(&pool).await.unwrap().roster, 2);
        // A sign-in is not a roster change.
        sqlx::query("UPDATE officers SET failed_attempts = 0, locked_until = NULL").execute(&pool).await.unwrap();
        assert_eq!(pending(&pool).await.unwrap().roster, 2);
    }

    #[tokio::test]
    async fn a_switched_off_class_is_not_pending_and_the_switch_is_audited() {
        let pool = pool().await;
        let actor = admin(&pool).await;
        pair(&pool, "https://hq.example.org").await;
        add_officer(&pool, &actor, "R-1").await;
        assert_eq!(pending(&pool).await.unwrap().roster, 1);

        let mut tx = pool.begin().await.unwrap();
        set_class_enabled(&mut tx, &actor, "roster", false).await.unwrap();
        assert!(set_class_enabled(&mut tx, &actor, "nonsense", false).await.is_err());
        tx.commit().await.unwrap();
        assert_eq!(pending(&pool).await.unwrap().roster, 0);
        assert!(!class_enabled(&pool, "roster").await);
        let rows = audit::list(&pool, &audit::AuditFilter { entity_id: Some("roster".into()), ..Default::default() }).await.unwrap();
        assert_eq!(rows.iter().filter(|r| r.action == "network.class_changed").count(), 1);
    }

    #[tokio::test]
    async fn disconnecting_ends_the_link_and_keeps_everything_local() {
        let pool = pool().await;
        let actor = admin(&pool).await;
        let mut tx = pool.begin().await.unwrap();
        assert!(disconnect(&mut tx, &actor).await.is_err(), "there is nothing to disconnect from");
        drop(tx);

        pair(&pool, "https://hq.example.org").await;
        add_officer(&pool, &actor, "R-1").await;
        assert_eq!(pending(&pool).await.unwrap().total, 1);

        let mut tx = pool.begin().await.unwrap();
        disconnect(&mut tx, &actor).await.unwrap();
        tx.commit().await.unwrap();

        let after = status(&pool).await.unwrap();
        assert_eq!(after.state, "disconnected");
        assert!(after.head_office_address.is_none() && after.disconnected_at.is_some());
        assert_eq!(after.pending.total, 0);
        let officers: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM officers").fetch_one(&pool).await.unwrap();
        assert_eq!(officers, 2, "local accounts are untouched");
        let token: Option<String> = sqlx::query_scalar("SELECT sync_token FROM peer_sync_config").fetch_one(&pool).await.unwrap();
        assert!(token.is_none(), "the credential is gone");
        let audited: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_log WHERE action = 'peer.disconnected'").fetch_one(&pool).await.unwrap();
        assert_eq!(audited, 1);
    }
}
