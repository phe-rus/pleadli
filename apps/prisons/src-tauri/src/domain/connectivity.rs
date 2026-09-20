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
use super::facilities::{self, PeerSyncConfig};
use super::sync::SyncRunResult;
use super::time::now_ms;
use super::{estate, facility_profile, inbox, peer, policy_sync, returns, sync};

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Pending {
    pub total: i64,
    pub roster: i64,
    pub records: i64,
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
    /// `not_connected`, `awaiting_approval`, `rejected`, `connected`,
    /// `offline`, `needs_attention` or `disconnected`.
    pub state: String,
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
        "legacy_snapshot" => (
            "Prisoner counts (first generation)",
            "One line per person held here for Head Office's population figures: status, sex, year of birth, nationality, education, offence and where held. No name, national ID, file reference, location or notes. It is being replaced by a narrower exchange.",
        ),
        "status" => ("Population and capacity", "How many people are held here and the approved capacity, with the time it was counted. Counts only, no names."),
        "returns" => ("Attested returns", "A monthly return the officer in charge has attested, when the officer submits it. Counts only, no prisoner records."),
        "policy" => ("Head Office defaults", "Numbering and uniform defaults Head Office sets for its facilities. Received here, never sent."),
        _ => ("Other", ""),
    }
}

fn transport_of(address: &str) -> &'static str {
    let host = address.trim_start_matches("https://").trim_start_matches("http://");
    let host = host.split([':', '/']).next().unwrap_or(host);
    let private = host == "localhost"
        || host.ends_with(".local")
        || host.starts_with("127.")
        || host.starts_with("10.")
        || host.starts_with("192.168.")
        || host.split('.').next() == Some("172") && host.split('.').nth(1).and_then(|n| n.parse::<u8>().ok()).is_some_and(|n| (16..=31).contains(&n));
    if private {
        "local_network"
    } else {
        "internet"
    }
}

fn state_of(config: &PeerSyncConfig, disconnected: bool) -> &'static str {
    match config.connection_state.as_str() {
        "pending" => "awaiting_approval",
        "rejected" => "rejected",
        "connected" => match config.last_sync_status.as_deref() {
            Some("offline") => "offline",
            Some("error") | Some("rejected") => "needs_attention",
            Some("pending_verification") => "awaiting_approval",
            _ => "connected",
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
            "legacy_snapshot" => pending.records = count,
            _ => {}
        }
    }
    if class_enabled(pool, "returns").await {
        pending.returns = sqlx::query_scalar("SELECT COUNT(*) FROM return_submissions WHERE acknowledged_at IS NULL").fetch_one(pool).await?;
    }
    pending.total = pending.roster + pending.records + pending.returns;
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
            "legacy_snapshot" => pending.records,
            "returns" => pending.returns,
            _ => 0,
        };
    }
    let state = state_of(&config, disconnected_at.is_some() && config.hq_hostname.is_none());
    let address = config.hq_hostname.clone();
    Ok(ConnectivityStatus {
        state: state.to_string(),
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
         SET hq_hostname = NULL, facility_id = NULL, sync_token = NULL, connection_state = 'none', connection_request_id = NULL,
             last_sync_status = NULL, last_error = NULL, facility_display_name = NULL, requested_by_badge = NULL, requested_by_name = NULL,
             roster_pushed_at = NULL, roster_count = NULL, disconnected_at = ?
         WHERE id = 'default'",
    )
    .bind(now_ms())
    .execute(&mut *conn)
    .await?;
    sqlx::query("DELETE FROM sync_outbox").execute(&mut *conn).await?;
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

/// One round with Head Office: reach it, send what is due and enabled, take
/// what it has for us. Sends only when something changed or the last exchange
/// did not succeed, so an idle facility costs Head Office nothing.
/// `force` sends regardless (the officer asked).
pub async fn exchange(pool: &SqlitePool, force: bool) -> Result<SyncRunResult, String> {
    facilities::get_peer_sync_context(pool).await.map_err(|e| e.to_string())?.ok_or_else(|| "This installation is not connected to a Head Office.".to_string())?;

    if !peer::hq_reachable(pool).await {
        let message = "Head Office cannot be reached. Work here carries on and the changes will be sent when it can.";
        sync::set_peer_status(pool, "offline", None, Some(message.to_string())).await.map_err(|e| e.to_string())?;
        return Err(message.to_string());
    }

    let config = facilities::get_peer_sync_config(pool).await.map_err(|e| e.to_string())?;
    let waiting = pending(pool).await.map_err(|e| e.to_string())?;
    let due = force || config.last_synced_at.is_none() || config.last_sync_status.as_deref() != Some("ok");

    let mut result = SyncRunResult { status: "unchanged".to_string(), count: None };
    if class_enabled(pool, "legacy_snapshot").await && (due || waiting.records > 0) {
        result = sync::push_snapshot(pool).await?;
    } else if class_enabled(pool, "roster").await && (due || waiting.roster > 0) {
        peer::push_roster(pool).await?;
        result.status = "ok".to_string();
    }
    if class_enabled(pool, "status").await {
        if let Err(e) = estate::push_status(pool).await {
            log::info!("status not sent: {e}");
        }
    }
    if class_enabled(pool, "returns").await && waiting.returns > 0 {
        match returns::send_queued(pool).await {
            Ok(sent) if sent > 0 => result.status = "ok".to_string(),
            Ok(_) => {}
            Err(e) => log::info!("returns not sent: {e}"),
        }
    }
    if class_enabled(pool, "policy").await {
        if let Err(e) = policy_sync::pull_policy(pool).await {
            log::info!("policy pull skipped: {e}");
        }
    }
    Ok(result)
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
        let connected = status(&pool).await.unwrap();
        assert_eq!((connected.state.as_str(), connected.transport.as_str(), connected.never_synced), ("connected", "internet", true));

        sqlx::query("UPDATE peer_sync_config SET last_sync_status = 'offline', last_error = 'no route' WHERE id = 'default'").execute(&pool).await.unwrap();
        assert_eq!(status(&pool).await.unwrap().state, "offline");
        sqlx::query("UPDATE peer_sync_config SET last_sync_status = 'error' WHERE id = 'default'").execute(&pool).await.unwrap();
        assert_eq!(status(&pool).await.unwrap().state, "needs_attention");
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
