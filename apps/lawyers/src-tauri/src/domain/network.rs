//! A firm on one network (docs/lawyers/REVIEW-2026-09-30.md, L6; D6).
//!
//! One office computer holds the practice and serves it on the local network
//! over TLS with its own self-signed certificate (`pleadli_node_core::lan`).
//! Another computer joins by typing the office's address and a one-time code
//! an administrator shows on the office screen. It is shown the office's
//! certificate fingerprint and compares it with the one on the office screen
//! before joining; from then on it trusts that certificate only. The office
//! gives it a device key, stored hashed, that it sends with every request.
//!
//! A joined computer (a terminal) keeps nothing of the practice: every call
//! its window makes is passed to the office (`api::forward`). If the office
//! cannot be reached, it says so; it never falls back to a local copy.

use std::net::{IpAddr, UdpSocket};
use std::sync::RwLock;
use std::time::Duration;

use base64::Engine as _;
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{invalid, DomainError};
use pleadli_node_core::lan;

/// The office listens here on every interface. Not the development port.
pub const LAN_PORT: u16 = 47940;
const CODE_MINUTES: i64 = 10;
const CODE_ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
pub const CERT_NAME: &str = "Pleadli Lawyers office";

/// What a terminal needs to reach its office.
#[derive(Debug, Clone)]
pub struct Link {
    pub address: String,
    pub fingerprint: String,
    pub device_key: String,
}

/// This computer's place in the firm, held in memory so every request can ask
/// it without reading the database.
#[derive(Default)]
pub struct Runtime {
    pub link: RwLock<Option<Link>>,
    pub mode: RwLock<String>,
}

impl Runtime {
    pub async fn load(pool: &SqlitePool) -> Result<Self, sqlx::Error> {
        let row = row(pool).await?;
        let rt = Runtime::default();
        rt.apply(&row);
        Ok(rt)
    }

    fn apply(&self, row: &NetworkRow) {
        *self.mode.write().unwrap() = row.mode.clone();
        *self.link.write().unwrap() = match (&row.mode[..], &row.office_address, &row.office_fingerprint, &row.device_key) {
            ("terminal", Some(address), Some(fingerprint), Some(key)) => {
                Some(Link { address: address.clone(), fingerprint: fingerprint.clone(), device_key: key.clone() })
            }
            _ => None,
        };
    }

    pub async fn reload(&self, pool: &SqlitePool) -> Result<(), sqlx::Error> {
        let row = row(pool).await?;
        self.apply(&row);
        Ok(())
    }

    pub fn link(&self) -> Option<Link> {
        self.link.read().unwrap().clone()
    }

    pub fn is_office(&self) -> bool {
        *self.mode.read().unwrap() == "office"
    }
}

#[derive(Debug, Clone, FromRow)]
struct NetworkRow {
    mode: String,
    office_address: Option<String>,
    office_fingerprint: Option<String>,
    office_name: Option<String>,
    device_key: Option<String>,
    joined_at: Option<i64>,
}

async fn row(pool: &SqlitePool) -> Result<NetworkRow, sqlx::Error> {
    sqlx::query_as("SELECT mode, office_address, office_fingerprint, office_name, device_key, joined_at FROM network WHERE id = 'this'").fetch_one(pool).await
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub name: String,
    pub paired_at: i64,
    pub paired_by: Option<String>,
    pub last_seen_at: Option<i64>,
    pub last_address: Option<String>,
    pub revoked_at: Option<i64>,
    pub revoked_by: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkStatus {
    pub mode: String,
    /// Office: where the others reach it, and the fingerprint they compare.
    pub addresses: Vec<String>,
    pub fingerprint: Option<String>,
    pub listening: bool,
    pub devices: Vec<Device>,
    /// Terminal: the office joined.
    pub office_address: Option<String>,
    pub office_name: Option<String>,
    pub office_fingerprint: Option<String>,
    pub joined_at: Option<i64>,
    pub reachable: Option<bool>,
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn sha(text: &str) -> String {
    Sha256::digest(text.as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

/// This computer's address on the local network: the interface a packet to a
/// private address would leave by. Nothing is sent.
pub fn lan_address() -> Option<IpAddr> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("10.254.254.254:1").ok()?;
    socket.local_addr().ok().map(|a| a.ip()).filter(|ip| !ip.is_loopback() && !ip.is_unspecified())
}

/// Only an address on a private network (or this computer) is joined: the
/// office is never reached across the internet this way.
pub fn is_private(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, ..] = v4.octets();
            v4.is_private() || v4.is_loopback() || v4.is_link_local() || (a == 100 && (64..128).contains(&b))
        }
        IpAddr::V6(v6) => v6.is_loopback() || (v6.segments()[0] & 0xfe00) == 0xfc00 || (v6.segments()[0] & 0xffc0) == 0xfe80,
    }
}

/// "192.168.1.20" or "192.168.1.20:47940" -> "192.168.1.20:47940".
pub fn parse_address(text: &str) -> Result<String, DomainError> {
    let text = text.trim().trim_start_matches("https://").trim_end_matches('/');
    let (host, port) = match text.rsplit_once(':') {
        Some((h, p)) if !h.contains(':') || h.starts_with('[') => (h.trim_matches(|c| c == '[' || c == ']'), p.parse::<u16>().map_err(|_| DomainError::Invalid("That port is not a number.".into()))?),
        _ => (text.trim_matches(|c| c == '[' || c == ']'), LAN_PORT),
    };
    let ip: IpAddr = host.parse().map_err(|_| DomainError::Invalid("Type the office computer's address as it is shown on its screen, for example 192.168.1.20.".into()))?;
    if !is_private(&ip) {
        return invalid("That address is not on a local network. Join the office computer on the office network.");
    }
    Ok(match ip {
        IpAddr::V4(_) => format!("{ip}:{port}"),
        IpAddr::V6(_) => format!("[{ip}]:{port}"),
    })
}

/// "ab7k-9mqp" -> "AB7K9MQP": what a person types is compared without case or dashes.
fn normalise_code(code: &str) -> String {
    code.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_ascii_uppercase()
}

// ---- The office ---------------------------------------------------------------

pub async fn status(pool: &SqlitePool, fingerprint: Option<String>, listening: bool) -> Result<NetworkStatus, sqlx::Error> {
    let r = row(pool).await?;
    let devices = if r.mode == "office" { list_devices(pool).await? } else { Vec::new() };
    let addresses = if r.mode == "office" { lan_address().map(|ip| vec![format!("{ip}:{LAN_PORT}")]).unwrap_or_default() } else { Vec::new() };
    Ok(NetworkStatus {
        mode: r.mode.clone(),
        addresses,
        fingerprint: if r.mode == "office" { fingerprint } else { None },
        listening,
        devices,
        office_address: r.office_address,
        office_name: r.office_name,
        office_fingerprint: r.office_fingerprint,
        joined_at: r.joined_at,
        reachable: None,
    })
}

/// Turns this computer into the office, or back. Turning it off leaves every
/// joined computer's record in place; they cannot reach it until it is on.
pub async fn set_office(pool: &SqlitePool, rt: &Runtime, on: bool) -> Result<(), DomainError> {
    let current = row(pool).await?;
    if current.mode == "terminal" {
        return invalid("This computer works on another office computer's practice. Leave it first.");
    }
    let mode = if on { "office" } else { "standalone" };
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    sqlx::query("UPDATE network SET mode = ?, updated_at = ? WHERE id = 'this'").bind(mode).bind(now()).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new(if on { "office_on" } else { "office_off" })).await?;
    tx.commit().await?;
    rt.reload(pool).await?;
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingCode {
    pub code: String,
    pub expires_at: i64,
}

pub async fn new_pairing_code(pool: &SqlitePool, by: &str) -> Result<PairingCode, DomainError> {
    let mut bytes = [0u8; 8];
    OsRng.fill_bytes(&mut bytes);
    let raw: String = bytes.iter().map(|b| CODE_ALPHABET[*b as usize % CODE_ALPHABET.len()] as char).collect();
    let code = format!("{}-{}", &raw[..4], &raw[4..]);
    let expires_at = now() + CODE_MINUTES * 60_000;
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    // One code at a time: a new one replaces any still waiting.
    sqlx::query("DELETE FROM pairing_codes WHERE used_at IS NULL").execute(&mut *tx).await?;
    sqlx::query("INSERT INTO pairing_codes (code_hash, created_at, expires_at, created_by) VALUES (?, ?, ?, ?)").bind(sha(&normalise_code(&code))).bind(now()).bind(expires_at).bind(by).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("pairing_code_shown")).await?;
    tx.commit().await?;
    Ok(PairingCode { code, expires_at })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairInput {
    pub code: String,
    pub device_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Paired {
    pub device_id: String,
    pub device_key: String,
    pub office_name: Option<String>,
}

/// On the office, for a computer asking to join with a code.
pub async fn pair(pool: &SqlitePool, input: PairInput, from: Option<String>) -> Result<Paired, DomainError> {
    let name = input.device_name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return invalid("Give this computer a name the office will recognise, for example \"Reception\".");
    }
    let hash = sha(&normalise_code(&input.code));
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    let found: Option<i64> = sqlx::query_scalar("SELECT expires_at FROM pairing_codes WHERE code_hash = ? AND used_at IS NULL").bind(&hash).fetch_optional(&mut *tx).await?;
    match found {
        Some(expires) if expires > now() => {}
        _ => return Err(DomainError::Forbidden("That code is not right or has expired. Ask for a new one on the office computer.".into())),
    }
    sqlx::query("UPDATE pairing_codes SET used_at = ? WHERE code_hash = ?").bind(now()).bind(&hash).execute(&mut *tx).await?;
    let mut key_bytes = [0u8; 32];
    OsRng.fill_bytes(&mut key_bytes);
    let key = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(key_bytes);
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO devices (id, name, key_hash, paired_at, last_seen_at, last_address) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(name)
        .bind(sha(&key))
        .bind(now())
        .bind(now())
        .bind(&from)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("device_joined").subject("device", &id).detail(name.to_string())).await?;
    tx.commit().await?;
    let office_name: Option<String> = sqlx::query_scalar("SELECT office_name FROM installation WHERE id = 'this'").fetch_optional(pool).await?;
    Ok(Paired { device_id: id, device_key: key, office_name })
}

/// Which joined computer a key belongs to, if it is still allowed.
pub async fn device_for_key(pool: &SqlitePool, key: &str, from: Option<String>) -> Result<Option<String>, sqlx::Error> {
    let found: Option<(String, Option<i64>)> = sqlx::query_as("SELECT id, last_seen_at FROM devices WHERE key_hash = ? AND revoked_at IS NULL").bind(sha(key)).fetch_optional(pool).await?;
    let Some((id, seen)) = found else { return Ok(None) };
    // "Last seen" to the minute is enough, and saves a write on every request.
    if seen.is_none_or(|s| now() - s > 60_000) {
        sqlx::query("UPDATE devices SET last_seen_at = ?, last_address = COALESCE(?, last_address) WHERE id = ?").bind(now()).bind(from).bind(&id).execute(pool).await?;
    }
    Ok(Some(id))
}

pub async fn list_devices(pool: &SqlitePool) -> Result<Vec<Device>, sqlx::Error> {
    sqlx::query_as("SELECT id, name, paired_at, paired_by, last_seen_at, last_address, revoked_at, revoked_by FROM devices ORDER BY revoked_at IS NOT NULL, paired_at DESC").fetch_all(pool).await
}

pub async fn revoke(pool: &SqlitePool, id: &str, by: &str) -> Result<(), DomainError> {
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    let done = sqlx::query("UPDATE devices SET revoked_at = ?, revoked_by = ? WHERE id = ? AND revoked_at IS NULL").bind(now()).bind(by).bind(id).execute(&mut *tx).await?;
    if done.rows_affected() == 0 {
        return Err(DomainError::NotFound("No such computer, or it was already removed.".into()));
    }
    audit::record(&mut tx, Entry::new("device_removed").subject("device", id)).await?;
    tx.commit().await?;
    Ok(())
}

// ---- A computer joining an office ----------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hello {
    pub product: String,
    pub office_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Probe {
    pub address: String,
    pub fingerprint: String,
    pub office_name: Option<String>,
}

const UNREACHABLE: &str = "The office computer did not answer at that address. Check that Pleadli Lawyers is open on it, that it is the office computer, and that both computers are on the same network.";

/// Looks at the office before joining: which certificate it presents, and its
/// name. Proves nothing yet; the person compares the fingerprint with the one
/// on the office screen.
pub async fn probe(address: &str) -> Result<Probe, DomainError> {
    let address = parse_address(address)?;
    let (client, seen) = lan::capture_client(Duration::from_secs(6)).map_err(DomainError::Invalid)?;
    let hello: Hello = client
        .get(format!("https://{address}/api/network/hello"))
        .send()
        .await
        .map_err(|_| DomainError::Invalid(UNREACHABLE.into()))?
        .json()
        .await
        .map_err(|_| DomainError::Invalid("Something answered at that address, but it is not a Pleadli Lawyers office computer.".into()))?;
    if hello.product != "pleadli-lawyers" {
        return invalid("Something answered at that address, but it is not a Pleadli Lawyers office computer.");
    }
    let fingerprint = seen.lock().unwrap().clone().ok_or_else(|| DomainError::Invalid(UNREACHABLE.into()))?;
    Ok(Probe { address, fingerprint, office_name: hello.office_name })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinInput {
    pub address: String,
    /// The fingerprint the person was shown and confirmed.
    pub fingerprint: String,
    pub code: String,
    pub device_name: String,
}

/// Joins the office. Only a computer that has not been set up with its own
/// practice joins: its window then shows the office's.
pub async fn join(pool: &SqlitePool, rt: &Runtime, installed: bool, input: JoinInput) -> Result<(), DomainError> {
    if installed {
        return invalid("This computer already holds its own practice. A computer that joins an office must be a new installation.");
    }
    if row(pool).await?.mode == "terminal" {
        return invalid("This computer is already joined to an office. Leave it first.");
    }
    let address = parse_address(&input.address)?;
    let fingerprint = lan::normalise_fingerprint(&input.fingerprint);
    if fingerprint.len() != 64 {
        return invalid("That fingerprint is not complete.");
    }
    let client = lan::pinned_client(&fingerprint, Duration::from_secs(10)).map_err(DomainError::Invalid)?;
    let response = client
        .post(format!("https://{address}/api/network/pair"))
        .json(&serde_json::json!({ "code": input.code, "deviceName": input.device_name }))
        .send()
        .await
        .map_err(|e| {
            if e.to_string().contains("fingerprint") || format!("{e:?}").contains("does not match") {
                DomainError::Forbidden("The office computer's certificate is not the one you confirmed. Do not join; ask whoever looks after the office computer.".into())
            } else {
                DomainError::Invalid(UNREACHABLE.into())
            }
        })?;
    if !response.status().is_success() {
        let body: serde_json::Value = response.json().await.unwrap_or_default();
        let message = body["message"].as_str().unwrap_or("The office computer refused to let this computer join.").to_string();
        return Err(DomainError::Forbidden(message));
    }
    let paired: Paired = response.json().await.map_err(|_| DomainError::Invalid(UNREACHABLE.into()))?;
    sqlx::query(
        "UPDATE network SET mode = 'terminal', office_address = ?, office_fingerprint = ?, office_name = ?, device_id = ?, device_key = ?, joined_at = ?, updated_at = ? WHERE id = 'this'",
    )
    .bind(&address)
    .bind(&fingerprint)
    .bind(&paired.office_name)
    .bind(&paired.device_id)
    .bind(&paired.device_key)
    .bind(now())
    .bind(now())
    .execute(pool)
    .await?;
    rt.reload(pool).await?;
    Ok(())
}

/// Stops working on the office's practice. The office still lists this
/// computer until an administrator removes it there.
pub async fn leave(pool: &SqlitePool, rt: &Runtime) -> Result<(), DomainError> {
    sqlx::query(
        "UPDATE network SET mode = 'standalone', office_address = NULL, office_fingerprint = NULL, office_name = NULL, device_id = NULL, device_key = NULL, joined_at = NULL, updated_at = ? WHERE id = 'this' AND mode = 'terminal'",
    )
    .bind(now())
    .execute(pool)
    .await?;
    rt.reload(pool).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn addresses_are_private_and_get_the_office_port() {
        assert_eq!(parse_address("192.168.1.20").unwrap(), "192.168.1.20:47940");
        assert_eq!(parse_address(" https://10.0.0.5:5000/ ").unwrap(), "10.0.0.5:5000");
        assert_eq!(parse_address("127.0.0.1:47941").unwrap(), "127.0.0.1:47941");
        assert!(parse_address("8.8.8.8").is_err(), "not across the internet");
        assert!(parse_address("office.example.com").is_err());
    }

    #[test]
    fn codes_compare_without_case_or_dashes() {
        assert_eq!(normalise_code("ab7k-9mqp"), "AB7K9MQP");
    }
}
