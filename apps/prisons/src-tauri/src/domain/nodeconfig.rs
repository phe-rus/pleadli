//! How this machine relates to a facility: alone, as the node that serves
//! workstations on the LAN, or as one of those workstations
//! (docs/prisons/product-map/04 I.2, I.3), and the explicit state of every
//! connection it has (docs/prisons/product-map/03 L.2).

use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::{backup, tls};
use crate::node::{NodeRef, Remote};

pub const DEFAULT_LAN_PORT: i64 = 47921;

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[derive(Debug, Clone, FromRow)]
pub struct NodeConfig {
    pub node_mode: String,
    pub lan_port: i64,
    pub lan_bind: String,
    pub remote_node_url: Option<String>,
    pub remote_node_fingerprint: Option<String>,
    pub remote_device_token: Option<String>,
}

pub async fn get(pool: &SqlitePool) -> Result<NodeConfig, sqlx::Error> {
    let mut config = sqlx::query_as::<_, NodeConfig>(
        "SELECT node_mode, lan_port, lan_bind, remote_node_url, remote_node_fingerprint, remote_device_token
         FROM node_config WHERE id = 'default'",
    )
    .fetch_one(pool)
    .await?;
    config.remote_device_token = config.remote_device_token.map(|token| super::secrets::open(super::secrets::DEVICE_TOKEN, &token)).transpose()?;
    Ok(config)
}

/// Serving workstations is switched on and off here. Becoming a workstation
/// happens only through `connect_as_workstation`.
pub async fn set_serving(conn: &mut SqliteConnection, actor: &Actor, serve: bool, port: Option<i64>) -> Result<(), sqlx::Error> {
    let before: String = sqlx::query_scalar("SELECT node_mode FROM node_config WHERE id = 'default'").fetch_one(&mut *conn).await?;
    if before == "client" {
        return Err(sqlx::Error::Protocol("this machine is a workstation of another node".into()));
    }
    if serve {
        let policy = super::auth_policy::get_conn(conn).await?;
        if policy.mode == "badge_only" {
            return Err(sqlx::Error::Protocol("badge-only sign-in is on; change the sign-in policy before serving workstations".into()));
        }
    }
    let mode = if serve { "node" } else { "standalone" };
    let port = port.unwrap_or(DEFAULT_LAN_PORT).clamp(1024, 65535);
    sqlx::query("UPDATE node_config SET node_mode = ?, lan_port = ? WHERE id = 'default'")
        .bind(mode)
        .bind(port)
        .execute(&mut *conn)
        .await?;
    audit::record(
        conn,
        actor,
        AuditEntry::new("node.mode_changed", "node_config", Some("default"))
            .before(&serde_json::json!({ "nodeMode": before }))
            .after(&serde_json::json!({ "nodeMode": mode, "lanPort": port })),
    )
    .await
}

#[derive(Debug)]
pub enum ConnectError {
    /// The address, fingerprint or code is not in a usable form.
    Malformed(&'static str),
    /// The node could not be reached, or its certificate is not the one the
    /// fingerprint names.
    Unreachable(String),
    /// The node answered but refused the enrolment code.
    Refused,
    /// This installation already has a role or accounts and cannot become a
    /// workstation without a reinstall.
    NotFresh,
    Db(sqlx::Error),
}

impl From<sqlx::Error> for ConnectError {
    fn from(e: sqlx::Error) -> Self {
        ConnectError::Db(e)
    }
}

impl From<super::secrets::SecretError> for ConnectError {
    fn from(e: super::secrets::SecretError) -> Self {
        ConnectError::Db(e.into())
    }
}

fn base_url(address: &str) -> Result<String, ConnectError> {
    let trimmed = address.trim().trim_end_matches('/');
    let with_scheme = if trimmed.starts_with("https://") {
        trimmed.to_string()
    } else if trimmed.contains("://") {
        return Err(ConnectError::Malformed("The node address must use https."));
    } else {
        format!("https://{trimmed}")
    };
    let authority = with_scheme.trim_start_matches("https://");
    if authority.is_empty() || authority.contains('/') || authority.contains(' ') {
        return Err(ConnectError::Malformed("Enter the node address as host:port, for example 192.168.1.10:47921."));
    }
    Ok(if authority.contains(':') { with_scheme } else { format!("{with_scheme}:{DEFAULT_LAN_PORT}") })
}

/// Turns a fresh installation into a workstation of `address`. The node's
/// certificate must match `fingerprint` (given to the person enrolling, from
/// the node's own screen); nothing is trusted on first use.
pub async fn connect_as_workstation(node: &NodeRef, address: &str, fingerprint: &str, code: &str) -> Result<(), ConnectError> {
    let fingerprint_norm = tls::normalise_fingerprint(fingerprint);
    if fingerprint_norm.len() != 64 {
        return Err(ConnectError::Malformed("The fingerprint is 64 hexadecimal characters, as shown on the node."));
    }
    if code.trim().is_empty() {
        return Err(ConnectError::Malformed("Enter the enrolment code shown on the node."));
    }
    let base = base_url(address)?;

    let fresh: bool = sqlx::query_scalar(
        "SELECT (SELECT role FROM hq_config WHERE id = 'default') IS NULL AND (SELECT COUNT(*) FROM officers) = 0",
    )
    .fetch_one(&node.pool)
    .await?;
    if !fresh {
        return Err(ConnectError::NotFresh);
    }

    let client = tls::pinned_client(&fingerprint_norm, Duration::from_secs(15)).map_err(ConnectError::Unreachable)?;
    let response = client
        .post(format!("{base}/api/auth/devices/enrol"))
        .json(&serde_json::json!({ "code": code.trim() }))
        .send()
        .await
        .map_err(|e| ConnectError::Unreachable(e.to_string()))?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED || response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(ConnectError::Refused);
    }
    if !response.status().is_success() {
        return Err(ConnectError::Unreachable(format!("the node answered {}", response.status())));
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Enrolled {
        device_token: String,
    }
    let enrolled: Enrolled = response.json().await.map_err(|e| ConnectError::Unreachable(e.to_string()))?;

    let mut tx = crate::db::begin_write(&node.pool).await?;
    sqlx::query(
        "UPDATE node_config SET node_mode = 'client', remote_node_url = ?, remote_node_fingerprint = ?, remote_device_token = ? WHERE id = 'default'",
    )
    .bind(&base)
    .bind(&fingerprint_norm)
    .bind(super::secrets::seal(super::secrets::DEVICE_TOKEN, &enrolled.device_token)?)
    .execute(&mut *tx)
    .await?;
    audit::record(
        &mut tx,
        &Actor::system("workstation setup"),
        AuditEntry::new("node.connected_as_workstation", "node_config", Some("default")).after(&serde_json::json!({ "node": base })),
    )
    .await?;
    tx.commit().await?;

    *node.remote.write().unwrap() = Some(Arc::new(Remote { base, device_token: enrolled.device_token, client }));
    Ok(())
}

/// Forgets the node this machine was a workstation of.
pub async fn disconnect(node: &NodeRef) -> Result<(), sqlx::Error> {
    let mut tx = crate::db::begin_write(&node.pool).await?;
    sqlx::query(
        "UPDATE node_config SET node_mode = 'standalone', remote_node_url = NULL, remote_node_fingerprint = NULL, remote_device_token = NULL WHERE id = 'default'",
    )
    .execute(&mut *tx)
    .await?;
    audit::record(&mut tx, &Actor::system("workstation setup"), AuditEntry::new("node.disconnected_from_node", "node_config", Some("default"))).await?;
    tx.commit().await?;
    *node.remote.write().unwrap() = None;
    Ok(())
}

/// At startup: if this machine was set up as a workstation, rebuild its
/// pinned connection.
pub async fn load_remote(node: &NodeRef) {
    let Ok(config) = get(&node.pool).await else { return };
    if config.node_mode != "client" {
        return;
    }
    let (Some(base), Some(fingerprint), Some(token)) = (config.remote_node_url, config.remote_node_fingerprint, config.remote_device_token) else {
        return;
    };
    match tls::pinned_client(&fingerprint, Duration::from_secs(30)) {
        Ok(client) => *node.remote.write().unwrap() = Some(Arc::new(Remote { base, device_token: token, client })),
        Err(e) => log::error!("could not rebuild the workstation connection: {e}"),
    }
}

// ---------------------------------------------------------------------
// The explicit state of every connection
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkState {
    /// `standalone`, `node` (serves workstations) or `client` (a workstation).
    pub mode: String,
    pub lan_port: i64,
    /// Whether the LAN listener is accepting connections right now, not merely
    /// configured to.
    pub listening: bool,
    pub fingerprint: Option<String>,
    pub addresses: Vec<String>,
    pub active_devices: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadOfficeState {
    /// `unpaired`, `connected`, `behind`, `offline`, `pending_verification`,
    /// `rejected` or `degraded`. Never `connected` unless the last exchange
    /// actually succeeded recently.
    pub status: String,
    pub last_synced_at: Option<i64>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupState {
    pub configured: bool,
    pub last_backup_at: Option<i64>,
    /// No backup within twice the configured interval (or never, once set up).
    pub overdue: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub network: NetworkState,
    pub head_office: HeadOfficeState,
    pub backup: BackupState,
}

/// Head Office contact is fresh when the last successful exchange was within
/// three intervals of the five-minute schedule.
const FRESH_MS: i64 = 15 * 60 * 1000;

pub fn head_office_status(paired: bool, last_status: Option<&str>, last_synced_at: Option<i64>, now: i64) -> String {
    if !paired {
        return "unpaired".into();
    }
    match last_status {
        Some("ok") => match last_synced_at {
            Some(at) if now - at <= FRESH_MS => "connected",
            _ => "behind",
        },
        Some("pending_verification") => "pending_verification",
        Some("rejected") => "rejected",
        Some("offline") => "offline",
        Some("error") => "degraded",
        // Paired but nothing has been attempted yet.
        _ => "behind",
    }
    .into()
}

pub async fn environment(node: &NodeRef) -> Result<Environment, sqlx::Error> {
    let config = get(&node.pool).await?;
    let fingerprint = if config.node_mode == "node" { tls::load_or_create(&node.data_dir).ok().map(|c| c.fingerprint) } else { None };
    let active_devices: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM devices WHERE revoked_at IS NULL").fetch_one(&node.pool).await?;
    let addresses = if config.node_mode == "node" {
        local_ip_address::list_afinet_netifas()
            .map(|ifs| {
                ifs.into_iter()
                    .filter(|(_, ip)| ip.is_ipv4() && !ip.is_loopback())
                    .map(|(_, ip)| format!("{ip}:{}", config.lan_port))
                    .collect()
            })
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let peer = super::facilities::get_peer_sync_config(&node.pool).await?;
    let head_office = HeadOfficeState {
        status: head_office_status(peer.facility_id.is_some(), peer.last_sync_status.as_deref(), peer.last_synced_at, now_ms()),
        last_synced_at: peer.last_synced_at,
        last_error: peer.last_error,
    };

    let backup_config = backup::get_config(&node.pool, Path::new(&node.data_dir)).await?;
    let overdue = backup_config.configured
        && backup_config.last_backup_at.is_none_or(|at| now_ms() - at > 2 * backup_config.backup_interval_hours * 3_600_000);

    Ok(Environment {
        network: NetworkState {
            mode: config.node_mode,
            lan_port: config.lan_port,
            listening: node.lan_listening.load(Ordering::Relaxed),
            fingerprint,
            addresses,
            active_devices,
        },
        head_office,
        backup: BackupState { configured: backup_config.configured, last_backup_at: backup_config.last_backup_at, overdue },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn head_office_is_only_connected_after_a_recent_success() {
        let now = 10_000_000_000;
        assert_eq!(head_office_status(false, Some("ok"), Some(now), now), "unpaired");
        assert_eq!(head_office_status(true, Some("ok"), Some(now - 60_000), now), "connected");
        assert_eq!(head_office_status(true, Some("ok"), Some(now - 3_600_000), now), "behind", "an old success is not connected");
        assert_eq!(head_office_status(true, Some("ok"), None, now), "behind");
        assert_eq!(head_office_status(true, Some("offline"), Some(now - 1_000), now), "offline");
        assert_eq!(head_office_status(true, Some("error"), Some(now), now), "degraded");
        assert_eq!(head_office_status(true, Some("rejected"), None, now), "rejected");
        assert_eq!(head_office_status(true, None, None, now), "behind", "paired but never exchanged is not connected");
    }

    #[test]
    fn node_addresses_are_normalised() {
        assert_eq!(base_url("192.168.1.10:47921").ok().as_deref(), Some("https://192.168.1.10:47921"));
        assert_eq!(base_url("https://node.local").ok().as_deref(), Some("https://node.local:47921"));
        assert!(base_url("http://192.168.1.10:47921").is_err(), "plain http is refused");
        assert!(base_url("192.168.1.10/x").is_err());
        assert!(base_url("").is_err());
    }
}
