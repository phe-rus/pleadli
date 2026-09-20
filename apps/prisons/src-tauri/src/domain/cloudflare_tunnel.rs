//! Head Office's own Cloudflare Tunnel provisioning, ported unchanged from
//! Police (`apps/police/src-tauri/src/domain/cloudflare_tunnel.rs`), which
//! already proved this exact provisioning flow. Exposes `hq_server.rs`
//! (spec: docs/specs/prisons/0001-head-office-peer-sync-network/0002-peer-registration-and-pairing.md)
//! at `<station_name>.<domain>` so facilities can reach it from anywhere.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use std::fmt;

use super::audit::{self, AuditEntry};
use super::authz::Actor;

const API_BASE: &str = "https://api.cloudflare.com/client/v4";

#[derive(Debug)]
pub enum CloudflareError {
    Db(sqlx::Error),
    Http(reqwest::Error),
    /// Cloudflare's own API returned `success: false` — carries whatever
    /// message it gave, since that's more useful to an officer than a
    /// generic "request failed".
    Api(String),
    NotConfigured,
}

impl fmt::Display for CloudflareError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CloudflareError::Db(e) => write!(f, "{e}"),
            CloudflareError::Http(e) => write!(f, "{e}"),
            CloudflareError::Api(msg) => write!(f, "Cloudflare API error: {msg}"),
            CloudflareError::NotConfigured => write!(f, "Cloudflare is not configured yet"),
        }
    }
}

impl From<sqlx::Error> for CloudflareError {
    fn from(e: sqlx::Error) -> Self {
        CloudflareError::Db(e)
    }
}

impl From<reqwest::Error> for CloudflareError {
    fn from(e: reqwest::Error) -> Self {
        CloudflareError::Http(e)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CloudflareConfig {
    pub account_id: String,
    pub domain: String,
    pub station_name: String,
}

#[derive(Debug, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SaveCloudflareConfigInput {
    pub api_token: String,
    pub account_id: String,
    pub domain: String,
    pub station_name: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TunnelState {
    pub tunnel_id: String,
    pub hostname: String,
}

pub async fn save_config(conn: &mut SqliteConnection, actor: &Actor, input: SaveCloudflareConfigInput) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO cloudflare_config (id, api_token, account_id, domain, station_name)
         VALUES ('default', ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
            api_token = excluded.api_token,
            account_id = excluded.account_id,
            domain = excluded.domain,
            station_name = excluded.station_name",
    )
    .bind(super::secrets::seal(super::secrets::CLOUDFLARE_API_TOKEN, &input.api_token)?)
    .bind(&input.account_id)
    .bind(&input.domain)
    .bind(&input.station_name)
    .execute(&mut *conn)
    .await?;
    // The API token is never written to the audit trail.
    audit::record(
        conn,
        actor,
        AuditEntry::new("network.cloudflare_config_saved", "cloudflare_config", Some("default")).after(&serde_json::json!({
            "accountId": input.account_id,
            "domain": input.domain,
            "stationName": input.station_name,
        })),
    )
    .await?;
    Ok(())
}

/// Never returns the stored API token to the frontend — this is the
/// only shape a Settings page needs to render "already configured".
pub async fn get_config(pool: &SqlitePool) -> Result<Option<CloudflareConfig>, sqlx::Error> {
    sqlx::query_as::<_, CloudflareConfig>(
        "SELECT account_id, domain, station_name FROM cloudflare_config WHERE id = 'default'",
    )
    .fetch_optional(pool)
    .await
}

async fn full_config(pool: &SqlitePool) -> Result<SaveCloudflareConfigInput, CloudflareError> {
    let mut config = sqlx::query_as::<_, SaveCloudflareConfigInput>(
        "SELECT api_token, account_id, domain, station_name FROM cloudflare_config WHERE id = 'default'",
    )
    .fetch_optional(pool)
    .await?
    .ok_or(CloudflareError::NotConfigured)?;
    config.api_token = super::secrets::open(super::secrets::CLOUDFLARE_API_TOKEN, &config.api_token).map_err(sqlx::Error::from)?;
    Ok(config)
}

pub async fn get_tunnel_state(pool: &SqlitePool) -> Result<Option<TunnelState>, sqlx::Error> {
    sqlx::query_as::<_, TunnelState>(
        "SELECT tunnel_id, hostname FROM cloudflare_tunnel_state WHERE id = 'default'",
    )
    .fetch_optional(pool)
    .await
}

/// The secret the connector runs with. Only the connector reads it; it is
/// never part of anything sent to the frontend.
pub async fn get_run_token(pool: &SqlitePool) -> Result<Option<String>, sqlx::Error> {
    let stored: Option<String> = sqlx::query_scalar("SELECT run_token FROM cloudflare_tunnel_state WHERE id = 'default'").fetch_optional(pool).await?;
    Ok(stored.map(|token| super::secrets::open(super::secrets::TUNNEL_RUN_TOKEN, &token)).transpose()?)
}

async fn save_tunnel_state(
    pool: &SqlitePool,
    tunnel_id: &str,
    hostname: &str,
    run_token: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO cloudflare_tunnel_state (id, tunnel_id, hostname, run_token)
         VALUES ('default', ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
            tunnel_id = excluded.tunnel_id, hostname = excluded.hostname, run_token = excluded.run_token",
    )
    .bind(tunnel_id)
    .bind(hostname)
    .bind(super::secrets::seal(super::secrets::TUNNEL_RUN_TOKEN, run_token)?)
    .execute(pool)
    .await?;
    Ok(())
}

#[derive(Deserialize)]
struct CfResponse<T> {
    success: bool,
    #[serde(default)]
    errors: Vec<CfErrorDetail>,
    result: Option<T>,
}

#[derive(Deserialize)]
struct CfErrorDetail {
    message: String,
}

fn extract<T>(response: CfResponse<T>) -> Result<T, CloudflareError> {
    if !response.success {
        let message = response.errors.into_iter().map(|e| e.message).collect::<Vec<_>>().join("; ");
        return Err(CloudflareError::Api(if message.is_empty() { "unknown error".to_string() } else { message }));
    }
    response.result.ok_or_else(|| CloudflareError::Api("empty result".to_string()))
}

#[derive(Deserialize)]
struct CfZone {
    id: String,
}

async fn find_zone_id(client: &reqwest::Client, token: &str, domain: &str) -> Result<String, CloudflareError> {
    let response: CfResponse<Vec<CfZone>> = client
        .get(format!("{API_BASE}/zones"))
        .bearer_auth(token)
        .query(&[("name", domain)])
        .send()
        .await?
        .json()
        .await?;
    let zones = extract(response)?;
    zones
        .into_iter()
        .next()
        .map(|z| z.id)
        .ok_or_else(|| CloudflareError::Api(format!("no Cloudflare zone found for domain {domain}")))
}

#[derive(Deserialize)]
struct CfTunnel {
    id: String,
}

async fn create_tunnel(client: &reqwest::Client, token: &str, account_id: &str, name: &str) -> Result<String, CloudflareError> {
    let response: CfResponse<CfTunnel> = client
        .post(format!("{API_BASE}/accounts/{account_id}/cfd_tunnel"))
        .bearer_auth(token)
        .json(&serde_json::json!({ "name": name, "config_src": "cloudflare" }))
        .send()
        .await?
        .json()
        .await?;
    Ok(extract(response)?.id)
}

async fn get_tunnel_token(client: &reqwest::Client, token: &str, account_id: &str, tunnel_id: &str) -> Result<String, CloudflareError> {
    let response: CfResponse<String> = client
        .get(format!("{API_BASE}/accounts/{account_id}/cfd_tunnel/{tunnel_id}/token"))
        .bearer_auth(token)
        .send()
        .await?
        .json()
        .await?;
    extract(response)
}

async fn set_ingress(
    client: &reqwest::Client,
    token: &str,
    account_id: &str,
    tunnel_id: &str,
    hostname: &str,
    local_port: u16,
) -> Result<(), CloudflareError> {
    let response: CfResponse<serde_json::Value> = client
        .put(format!("{API_BASE}/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations"))
        .bearer_auth(token)
        .json(&serde_json::json!({
            "config": {
                "ingress": [
                    { "hostname": hostname, "service": format!("http://localhost:{local_port}") },
                    { "service": "http_status:404" },
                ]
            }
        }))
        .send()
        .await?
        .json()
        .await?;
    extract(response)?;
    Ok(())
}

async fn create_dns_record(
    client: &reqwest::Client,
    token: &str,
    zone_id: &str,
    station_name: &str,
    tunnel_id: &str,
) -> Result<(), CloudflareError> {
    let response: CfResponse<serde_json::Value> = client
        .post(format!("{API_BASE}/zones/{zone_id}/dns_records"))
        .bearer_auth(token)
        .json(&serde_json::json!({
            "type": "CNAME",
            "name": station_name,
            "content": format!("{tunnel_id}.cfargotunnel.com"),
            "proxied": true,
        }))
        .send()
        .await?
        .json()
        .await?;
    // A CNAME that already exists (re-running provisioning) isn't a real
    // failure — Cloudflare returns success:false with an "already
    // exists" error in that case, which is fine to ignore here.
    if let Err(CloudflareError::Api(message)) = extract(response) {
        if !message.contains("already exists") {
            return Err(CloudflareError::Api(message));
        }
    }
    Ok(())
}

/// What provisioning hands back. The tunnel's run token is a secret: it is
/// stored in `cloudflare_tunnel_state` for the connector to read, and is never
/// part of a result that could be serialised to the frontend.
#[derive(Debug, Clone)]
pub struct ProvisionResult {
    pub hostname: String,
}

/// Creates (or reuses) a Cloudflare Tunnel for this station and points
/// `<station_name>.<domain>` at `hq_server.rs` running on `local_port`.
/// Safe to call again — an existing tunnel for this station is reused
/// rather than duplicated.
pub async fn provision(pool: &SqlitePool, local_port: u16) -> Result<ProvisionResult, CloudflareError> {
    let config = full_config(pool).await?;
    // Bounded: a stalled Cloudflare call must not hold the request open.
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(30)).build()?;
    let hostname = format!("{}.{}", config.station_name, config.domain);

    if let Some(existing) = get_tunnel_state(pool).await? {
        let run_token = get_tunnel_token(&client, &config.api_token, &config.account_id, &existing.tunnel_id).await?;
        set_ingress(&client, &config.api_token, &config.account_id, &existing.tunnel_id, &hostname, local_port).await?;
        save_tunnel_state(pool, &existing.tunnel_id, &hostname, &run_token).await?;
        return Ok(ProvisionResult { hostname });
    }

    let tunnel_id = create_tunnel(&client, &config.api_token, &config.account_id, &config.station_name).await?;
    let run_token = get_tunnel_token(&client, &config.api_token, &config.account_id, &tunnel_id).await?;
    set_ingress(&client, &config.api_token, &config.account_id, &tunnel_id, &hostname, local_port).await?;

    let zone_id = find_zone_id(&client, &config.api_token, &config.domain).await?;
    create_dns_record(&client, &config.api_token, &zone_id, &config.station_name, &tunnel_id).await?;

    save_tunnel_state(pool, &tunnel_id, &hostname, &run_token).await?;
    Ok(ProvisionResult { hostname })
}
