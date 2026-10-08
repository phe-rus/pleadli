//! Pleadli Orchestra, the apps' side (docs/platform/ORCHESTRA-API.md,
//! ORCHESTRA-PLAN.md section 3, ORCHESTRA-BACKUP.md).
//!
//! One `Orchestra` per running application. It keeps the 30-day trial and the
//! signed licence, says hello to pleadli.com every few hours, sends the
//! fingerprints of papers that leave the office (never their wording), and
//! backs the whole record up once a day to the institution's own storage.
//!
//! Nothing here ever locks a record. A trial or licence that ends changes what
//! the app *shows*; everything the officers keep keeps working. Being offline
//! is normal: every step waits for the next time there is internet.
//!
//! What it keeps lives in the application's own (encrypted) database, in the
//! tables of `TABLE_SQL`, which each application copies into a migration.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine as _;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use x25519_dalek::{PublicKey, StaticSecret};

use crate::backup;
use crate::snapshot::{self, Documents};
use crate::storage::{self, StorageEntry, Target};

/// Copied into one migration of each application that uses Orchestra.
pub const TABLE_SQL: &str = "CREATE TABLE orchestra_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE orchestra_papers (
    code TEXT PRIMARY KEY,
    sent_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT
);

CREATE TABLE orchestra_backups (
    id TEXT PRIMARY KEY,
    storage_id TEXT,
    storage_label TEXT,
    at INTEGER NOT NULL,
    size_bytes INTEGER,
    ok INTEGER NOT NULL,
    message TEXT,
    reported INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX orchestra_backups_at ON orchestra_backups (at);";

pub const DEFAULT_URL: &str = "https://pleadli.com";
/// Points a development copy at a local pleadli.com (`http://localhost:3000`).
pub const URL_ENV: &str = "PLEADLI_ORCHESTRA_URL";
/// Pleadli's offline root key, built in once it exists (build.rs).
const ROOT_PUBLIC_KEY: Option<&str> = option_env!("PLEADLI_ORCHESTRA_ROOT");

const DAY: i64 = 24 * 60 * 60 * 1000;
const HOUR: i64 = 60 * 60 * 1000;
const TRIAL_DAYS: i64 = 30;
const CONTACT_EVERY: i64 = 6 * HOUR;
const BACKUP_EVERY: i64 = DAY;
const BACKUP_RETRY: i64 = HOUR;
const TICK: Duration = Duration::from_secs(10 * 60);
const PAPER_ATTEMPTS: i64 = 5;

/// What an application tells Orchestra about itself.
pub struct App {
    /// `police | dpp | courts | lawyers | prisons`.
    pub application: &'static str,
    pub version: &'static str,
    /// Its name in the keystore (`keys::SERVICE`), where the first launch date is
    /// also kept so a reinstall does not start the trial again.
    pub keystore_service: &'static str,
    /// Which printed papers leave the office, as `(entity_type, kind)`: these
    /// are sent to pleadli.com/verify. Registers kept inside are not.
    pub paper_kinds: &'static [(&'static str, &'static str)],
    /// Tables a backup of this application must hold to be restored.
    pub required_tables: &'static [&'static str],
    /// The newest migration this build knows: a newer backup is refused.
    pub latest_migration: i64,
}

#[derive(Debug)]
pub enum OrchestraError {
    /// No internet, or pleadli.com did not answer.
    Offline(String),
    /// pleadli.com answered with an error (`error` is its code: unknown_key,
    /// seats_full, revoked, ...), and `message` says it in English.
    Api { status: u16, error: String, message: String },
    /// Something this computer needs first (`code` names it).
    Needs(&'static str),
    Storage(storage::StorageError),
    Backup(String),
    Db(sqlx::Error),
}

impl std::fmt::Display for OrchestraError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OrchestraError::Offline(m) => write!(f, "pleadli.com could not be reached: {m}"),
            OrchestraError::Api { message, .. } => write!(f, "{message}"),
            OrchestraError::Needs(what) => write!(f, "{what}"),
            OrchestraError::Storage(e) => write!(f, "{e}"),
            OrchestraError::Backup(m) => write!(f, "{m}"),
            OrchestraError::Db(e) => write!(f, "{e}"),
        }
    }
}

impl OrchestraError {
    /// A short code the app turns into its own words.
    pub fn code(&self) -> String {
        match self {
            OrchestraError::Offline(_) => "offline".into(),
            OrchestraError::Api { error, .. } => error.clone(),
            OrchestraError::Needs(what) => (*what).into(),
            OrchestraError::Storage(storage::StorageError::NotApproved) => "storage_not_approved".into(),
            OrchestraError::Storage(storage::StorageError::HostKey { .. }) => "storage_host_key".into(),
            OrchestraError::Storage(storage::StorageError::Denied(_)) => "storage_denied".into(),
            OrchestraError::Storage(storage::StorageError::Network(_)) => "storage_unreachable".into(),
            OrchestraError::Storage(_) => "storage_failed".into(),
            OrchestraError::Backup(_) => "backup_failed".into(),
            OrchestraError::Db(_) => "database".into(),
        }
    }
}

impl From<sqlx::Error> for OrchestraError {
    fn from(e: sqlx::Error) -> Self {
        OrchestraError::Db(e)
    }
}

/// A statement signed by Pleadli: the payload's bytes and their signature.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Signed {
    pub key: String,
    pub payload: String,
    pub signature: String,
    #[serde(default)]
    pub cert: Option<Box<Signed>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicencePayload {
    pub licence: String,
    pub institution: String,
    pub address: Option<String>,
    pub application: String,
    pub seats: i64,
    pub device: String,
    pub issued_at: i64,
    pub refresh_after: i64,
    pub valid_until: i64,
    pub expires_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Office {
    pub address: String,
    pub name: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Answer {
    state: String,
    trial: Option<TrialAnswer>,
    licence: Option<Signed>,
    #[serde(default)]
    offices: Vec<Office>,
    reason: Option<String>,
    token: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrialAnswer {
    started_at: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupConfig {
    computer: Option<String>,
    backup_key: Option<BackupKey>,
    #[serde(default)]
    storage: Vec<StorageEntryJson>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupKey {
    public_key: String,
    fingerprint: String,
}

/// `StorageEntry` as kept between contacts (serialisable both ways).
#[derive(Debug, Clone, Serialize, Deserialize)]
struct StorageEntryJson {
    id: String,
    label: String,
    kind: String,
    settings: Value,
    #[serde(default)]
    approved: bool,
    sealed: Option<String>,
}

impl From<&StorageEntryJson> for StorageEntry {
    fn from(e: &StorageEntryJson) -> Self {
        StorageEntry { id: e.id.clone(), label: e.label.clone(), kind: e.kind.clone(), settings: e.settings.clone(), approved: e.approved, sealed: e.sealed.clone() }
    }
}

// ---- what the app shows ----

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    /// `trial | trial_ended | licensed | licence_ended`.
    pub state: String,
    /// Why a licence ended: removed, revoked, suspended, expired.
    pub reason: Option<String>,
    pub trial_ends_at: i64,
    pub trial_days_left: i64,
    pub licence: Option<LicenceView>,
    pub last_contact_at: Option<i64>,
    pub last_error: Option<String>,
    /// The office papers are issued from, and the offices it may choose.
    pub office: Option<String>,
    pub offices: Vec<Office>,
    pub backup: BackupStatus,
    pub papers: PaperStatus,
    /// The first 12 characters of the hashed machine identifier, to read out to support.
    pub device: String,
    /// False when this build cannot check a licence's signature yet (no root key).
    pub can_verify: bool,
    pub restore_pending: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenceView {
    pub institution: String,
    pub address: Option<String>,
    pub seats: i64,
    pub expires_at: i64,
    pub valid_until: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupStatus {
    /// The recovery key's fingerprint, to compare with the printed phrase sheet.
    pub key_fingerprint: Option<String>,
    pub storage: Vec<StorageView>,
    pub last_ok_at: Option<i64>,
    pub history: Vec<BackupRun>,
    pub running: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageView {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub approved: bool,
    /// Where, without anything secret: bucket and endpoint, host and folder.
    pub place: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BackupRun {
    pub id: String,
    pub storage_id: Option<String>,
    pub storage_label: Option<String>,
    pub at: i64,
    pub size_bytes: Option<i64>,
    pub ok: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperStatus {
    pub waiting: i64,
    pub sent: i64,
    pub failed: i64,
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn place(e: &StorageEntryJson) -> String {
    let s = |k: &str| e.settings.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    match e.kind.as_str() {
        "s3" => format!("{}{} · {}", s("bucket"), if s("prefix").is_empty() { String::new() } else { format!("/{}", s("prefix")) }, s("endpoint").trim_start_matches("https://").trim_start_matches("http://")),
        "sftp" => format!("{}@{}{}", s("username"), s("host"), if s("path").is_empty() { String::new() } else { format!(":{}", s("path")) }),
        _ => s("path"),
    }
}

/// SHA-256 of the operating system's machine identifier, never the raw value.
/// Where there is none, this installation's own id stands in.
pub fn device_hash(data_dir: &std::path::Path) -> String {
    let raw = machine_uid::get().ok().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| {
        let file = data_dir.join("install.id");
        std::fs::read_to_string(&file).unwrap_or_else(|_| {
            let id = uuid::Uuid::new_v4().to_string();
            let _ = std::fs::write(&file, &id);
            id
        })
    });
    Sha256::digest(raw.trim().as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

fn b64_any(text: &str) -> Option<Vec<u8>> {
    URL_SAFE_NO_PAD.decode(text.trim_end_matches('=')).ok().or_else(|| STANDARD.decode(text).ok())
}

fn verify_with(key: &VerifyingKey, signed: &Signed) -> Option<Vec<u8>> {
    let payload = b64_any(&signed.payload)?;
    let sig: [u8; 64] = b64_any(&signed.signature)?.try_into().ok()?;
    key.verify_strict(&payload, &Signature::from_bytes(&sig)).ok()?;
    Some(payload)
}

fn key_from(text: &str) -> Option<VerifyingKey> {
    let bytes: [u8; 32] = b64_any(text.trim())?.try_into().ok()?;
    VerifyingKey::from_bytes(&bytes).ok()
}

/// The online key Pleadli signs licences with, as the root certifies it.
fn certified_key(root: &VerifyingKey, cert: &Signed) -> Option<VerifyingKey> {
    let payload: Value = serde_json::from_slice(&verify_with(root, cert)?).ok()?;
    if payload.get("kind")?.as_str()? != "pleadli.signing-key" {
        return None;
    }
    key_from(payload.get("publicKey")?.as_str()?)
}

/// Checks a signed licence and that it was issued to this computer. With the
/// root key built in, the certificate chain is checked; a development build
/// without one trusts the online key pleadli.com gave it (`dev_key`).
fn check_licence(signed: &Signed, device: &str, dev_key: Option<&str>) -> Option<LicencePayload> {
    let key = match ROOT_PUBLIC_KEY.and_then(key_from) {
        Some(root) => certified_key(&root, signed.cert.as_deref()?)?,
        None if cfg!(debug_assertions) => key_from(dev_key?)?,
        None => return None,
    };
    let payload: Value = serde_json::from_slice(&verify_with(&key, signed)?).ok()?;
    if payload.get("kind")?.as_str()? != "pleadli.licence" {
        return None;
    }
    let licence: LicencePayload = serde_json::from_value(payload).ok()?;
    (licence.device == device).then_some(licence)
}

pub struct Orchestra {
    app: App,
    pool: SqlitePool,
    data_dir: PathBuf,
    documents: Arc<dyn Documents>,
    base: String,
    device: String,
    http: reqwest::Client,
    /// One backup at a time.
    backing_up: tokio::sync::Mutex<()>,
    running: AtomicBool,
    country: std::sync::RwLock<Option<String>>,
}

impl Orchestra {
    pub fn new(app: App, pool: SqlitePool, data_dir: PathBuf, documents: Arc<dyn Documents>) -> Arc<Self> {
        let base = std::env::var(URL_ENV).ok().filter(|u| !u.trim().is_empty()).unwrap_or_else(|| DEFAULT_URL.into()).trim_end_matches('/').to_string();
        let device = device_hash(&data_dir);
        let http = reqwest::Client::builder().connect_timeout(Duration::from_secs(15)).timeout(Duration::from_secs(45)).build().unwrap_or_default();
        Arc::new(Orchestra { app, pool, data_dir, documents, base, device, http, backing_up: tokio::sync::Mutex::new(()), running: AtomicBool::new(false), country: std::sync::RwLock::new(None) })
    }

    /// The country this office is in (two letters), sent with each contact for Pleadli's figures.
    pub fn set_country(&self, country: Option<String>) {
        *self.country.write().unwrap() = country.map(|c| c.to_ascii_lowercase()).filter(|c| c.len() == 2);
    }

    // ---- kept state ----

    async fn get(&self, key: &str) -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar("SELECT value FROM orchestra_state WHERE key = ?").bind(key).fetch_optional(&self.pool).await
    }

    async fn set(&self, key: &str, value: &str) -> Result<(), sqlx::Error> {
        sqlx::query("INSERT INTO orchestra_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(key).bind(value).execute(&self.pool).await?;
        Ok(())
    }

    async fn unset(&self, key: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM orchestra_state WHERE key = ?").bind(key).execute(&self.pool).await?;
        Ok(())
    }

    async fn get_json<T: for<'de> Deserialize<'de>>(&self, key: &str) -> Option<T> {
        self.get(key).await.ok().flatten().and_then(|v| serde_json::from_str(&v).ok())
    }

    async fn get_i64(&self, key: &str) -> Option<i64> {
        self.get(key).await.ok().flatten().and_then(|v| v.parse().ok())
    }

    /// A database restored from another computer's backup carries that
    /// computer's token, seal key and licence. They are not this computer's:
    /// forget them, so it starts as itself (its own trial, activated again).
    async fn adopt_device(&self) -> Result<(), sqlx::Error> {
        let kept = self.get("device").await?;
        if kept.as_deref() == Some(self.device.as_str()) {
            return Ok(());
        }
        if kept.is_some() {
            for key in ["token", "seal_secret", "licence", "state", "reason", "backup_config", "offices", "office", "server_trial_started_at", "last_contact_at", "last_error", "backup_last_attempt_at", "dev_online_key"] {
                self.unset(key).await?;
            }
            log::info!("orchestra: database came from another computer; its licence and keys were set aside");
        }
        self.set("device", &self.device).await
    }

    /// This computer's seal key (ORCHESTRA-BACKUP.md), made once.
    async fn seal_key(&self) -> Result<StaticSecret, sqlx::Error> {
        if let Some(bytes) = self.get("seal_secret").await?.and_then(|v| URL_SAFE_NO_PAD.decode(v).ok()).and_then(|b| <[u8; 32]>::try_from(b).ok()) {
            return Ok(StaticSecret::from(bytes));
        }
        let secret = backup::new_seal_key();
        self.set("seal_secret", &URL_SAFE_NO_PAD.encode(secret.to_bytes())).await?;
        Ok(secret)
    }

    /// The first launch, kept in the database and in the keystore (which a
    /// reinstall does not clear); the earlier of the two counts.
    async fn local_trial_start(&self) -> Result<i64, sqlx::Error> {
        let in_db = self.get_i64("trial_started_at").await;
        let use_keystore = !cfg!(any(test, feature = "test-keys"));
        let entry = use_keystore.then(|| keyring::Entry::new(self.app.keystore_service, "orchestra-trial-start").ok()).flatten();
        let in_keystore = entry.as_ref().and_then(|e| e.get_password().ok()).and_then(|v| v.parse::<i64>().ok());
        let start = [in_db, in_keystore].into_iter().flatten().min().unwrap_or_else(now);
        if in_db != Some(start) {
            self.set("trial_started_at", &start.to_string()).await?;
        }
        if let (Some(entry), true) = (entry, in_keystore != Some(start)) {
            let _ = entry.set_password(&start.to_string());
        }
        Ok(start)
    }

    // ---- talking to pleadli.com ----

    fn body(&self, extra: Value, seal_key: Option<&StaticSecret>) -> Value {
        let mut body = json!({
            "device": self.device,
            "application": self.app.application,
            "version": self.app.version,
            "os": std::env::consts::OS,
        });
        if let Some(c) = self.country.read().unwrap().clone() {
            body["country"] = json!(c);
        }
        if let Some(k) = seal_key {
            body["sealKey"] = json!(backup::encode_key(&PublicKey::from(k)));
        }
        if let (Value::Object(b), Value::Object(e)) = (&mut body, extra) {
            b.extend(e);
        }
        body
    }

    async fn call(&self, method: reqwest::Method, path: &str, body: Option<Value>, token: Option<&str>) -> Result<Value, OrchestraError> {
        let mut req = self.http.request(method, format!("{}/api/orchestra/v1/{path}", self.base));
        if let Some(t) = token {
            req = req.bearer_auth(t);
        }
        if let Some(b) = body {
            req = req.json(&b);
        }
        let res = req.send().await.map_err(|e| OrchestraError::Offline(e.to_string()))?;
        let status = res.status().as_u16();
        let value: Value = res.json().await.map_err(|e| OrchestraError::Offline(e.to_string()))?;
        if status >= 400 {
            let s = |k: &str| value.get(k).and_then(Value::as_str).unwrap_or("").to_string();
            return Err(OrchestraError::Api { status, error: s("error"), message: s("message") });
        }
        Ok(value)
    }

    async fn post(&self, path: &str, extra: Value, token: Option<&str>, seal: Option<&StaticSecret>) -> Result<Value, OrchestraError> {
        self.call(reqwest::Method::POST, path, Some(self.body(extra, seal)), token).await
    }

    /// Keeps what pleadli.com answered about the trial and licence.
    async fn keep_answer(&self, answer: &Answer) -> Result<(), sqlx::Error> {
        self.set("state", &answer.state).await?;
        match &answer.reason {
            Some(r) => self.set("reason", r).await?,
            None => self.unset("reason").await?,
        }
        if let Some(t) = &answer.trial {
            self.set("server_trial_started_at", &t.started_at.to_string()).await?;
        }
        match &answer.licence {
            Some(l) => self.set("licence", &serde_json::to_string(l).unwrap_or_default()).await?,
            None => self.unset("licence").await?,
        }
        if answer.state == "licensed" {
            self.set("offices", &serde_json::to_string(&answer.offices).unwrap_or_default()).await?;
        }
        self.set("last_contact_at", &now().to_string()).await?;
        self.unset("last_error").await
    }

    /// Says hello: the trial on a computer with no licence, the heartbeat on one
    /// with a token. Then, when licensed, where backups go.
    pub async fn contact(&self) -> Result<(), OrchestraError> {
        let result = self.contact_inner().await;
        if let Err(e) = &result {
            let _ = self.set("last_error", &e.code()).await;
            let _ = self.set("last_attempt_at", &now().to_string()).await;
        }
        result
    }

    async fn contact_inner(&self) -> Result<(), OrchestraError> {
        self.adopt_device().await?;
        if ROOT_PUBLIC_KEY.is_none() && cfg!(debug_assertions) {
            // A development build checks licences with the key pleadli.com shows.
            if let Ok(k) = self.call(reqwest::Method::GET, "key", None, None).await {
                if let Some(pk) = k.get("publicKey").and_then(Value::as_str) {
                    self.set("dev_online_key", pk).await?;
                }
            }
        }
        let token = self.get("token").await?;
        let local = self.local_trial_start().await?;
        let answer: Answer = match &token {
            Some(t) => {
                let seal = self.seal_key().await?;
                serde_json::from_value(self.post("heartbeat", json!({}), Some(t), Some(&seal)).await?)
            }
            None => serde_json::from_value(self.post("trial", json!({ "localTrialStartedAt": local }), None, None).await?),
        }
        .map_err(|e| OrchestraError::Offline(e.to_string()))?;
        self.keep_answer(&answer).await?;
        if answer.state == "licensed" {
            self.fetch_backup_config().await?;
        }
        Ok(())
    }

    async fn fetch_backup_config(&self) -> Result<BackupConfig, OrchestraError> {
        let token = self.get("token").await?.ok_or(OrchestraError::Needs("licence_needed"))?;
        let config: BackupConfig = serde_json::from_value(self.post("backup/config", json!({}), Some(&token), None).await?).map_err(|e| OrchestraError::Offline(e.to_string()))?;
        self.set("backup_config", &serde_json::to_string(&config).unwrap_or_default()).await?;
        Ok(config)
    }

    /// The licence key typed once by an administrator.
    pub async fn activate(&self, key: &str) -> Result<Status, OrchestraError> {
        self.adopt_device().await?;
        let seal = self.seal_key().await?;
        let key = key.trim().to_ascii_uppercase();
        let answer: Answer = serde_json::from_value(self.post("activate", json!({ "key": key }), None, Some(&seal)).await?).map_err(|e| OrchestraError::Offline(e.to_string()))?;
        if let Some(token) = &answer.token {
            self.set("token", token).await?;
        }
        self.keep_answer(&answer).await?;
        if ROOT_PUBLIC_KEY.is_none() && cfg!(debug_assertions) {
            let _ = self.contact().await;
        } else if answer.state == "licensed" {
            let _ = self.fetch_backup_config().await;
        }
        self.status().await
    }

    /// Which office this computer issues papers for (one of the licence's offices).
    pub async fn set_office(&self, address: &str) -> Result<Status, OrchestraError> {
        let offices: Vec<Office> = self.get_json("offices").await.unwrap_or_default();
        if !offices.iter().any(|o| o.address == address) {
            return Err(OrchestraError::Needs("unknown_office"));
        }
        self.set("office", address).await?;
        // Papers that failed for the old office are tried again.
        sqlx::query("DELETE FROM orchestra_papers WHERE sent_at IS NULL").execute(&self.pool).await?;
        self.status().await
    }

    async fn licence(&self) -> Option<LicencePayload> {
        let signed: Signed = self.get_json("licence").await?;
        let dev_key = self.get("dev_online_key").await.ok().flatten();
        check_licence(&signed, &self.device, dev_key.as_deref()).filter(|l| l.valid_until > now() && l.application == self.app.application)
    }

    pub async fn status(&self) -> Result<Status, OrchestraError> {
        self.adopt_device().await?;
        let local = self.local_trial_start().await?;
        let server = self.get_i64("server_trial_started_at").await;
        let start = server.map_or(local, |s| s.min(local));
        let trial_ends_at = start + TRIAL_DAYS * DAY;
        let licence = self.licence().await;
        let kept_state = self.get("state").await?;
        let state = if licence.is_some() {
            "licensed".to_string()
        } else if kept_state.as_deref() == Some("licence_ended") || (kept_state.as_deref() == Some("licensed") && self.get("token").await?.is_some()) {
            // A licence held before and no longer valid: ended, not a trial again.
            "licence_ended".to_string()
        } else if trial_ends_at <= now() {
            "trial_ended".to_string()
        } else {
            "trial".to_string()
        };
        let config: BackupConfig = self.get_json("backup_config").await.unwrap_or_default();
        let offices: Vec<Office> = self.get_json("offices").await.unwrap_or_default();
        let office = self.get("office").await?.or_else(|| licence.as_ref().and_then(|l| l.address.clone()));
        let history: Vec<BackupRun> = sqlx::query_as("SELECT id, storage_id, storage_label, at, size_bytes, ok, message FROM orchestra_backups ORDER BY at DESC LIMIT 12").fetch_all(&self.pool).await?;
        let last_ok_at: Option<i64> = sqlx::query_scalar("SELECT MAX(at) FROM orchestra_backups WHERE ok = 1").fetch_one(&self.pool).await?;
        Ok(Status {
            reason: if state == "licence_ended" { self.get("reason").await? } else { None },
            state,
            trial_ends_at,
            trial_days_left: ((trial_ends_at - now()).max(0) + DAY - 1) / DAY,
            licence: licence.map(|l| LicenceView { institution: l.institution, address: l.address, seats: l.seats, expires_at: l.expires_at, valid_until: l.valid_until }),
            last_contact_at: self.get_i64("last_contact_at").await,
            last_error: self.get("last_error").await?,
            office,
            offices,
            backup: BackupStatus {
                key_fingerprint: config.backup_key.as_ref().map(|k| k.fingerprint.clone()),
                storage: config.storage.iter().map(|e| StorageView { id: e.id.clone(), label: e.label.clone(), kind: e.kind.clone(), approved: e.approved, place: place(e) }).collect(),
                last_ok_at,
                history,
                running: self.running.load(Ordering::SeqCst),
            },
            papers: self.paper_status().await?,
            device: self.device[..12].to_string(),
            can_verify: ROOT_PUBLIC_KEY.is_some() || cfg!(debug_assertions),
            restore_pending: snapshot::pending(&self.data_dir),
        })
    }

    // ---- papers to /verify ----

    /// The entity types of papers that leave the office, as a JSON array for `json_each`.
    fn kinds_json(&self) -> String {
        serde_json::to_string(&self.app.paper_kinds.iter().map(|(t, _)| *t).collect::<Vec<_>>()).unwrap_or_else(|_| "[]".into())
    }

    async fn paper_status(&self) -> Result<PaperStatus, sqlx::Error> {
        let waiting: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM paper_prints p LEFT JOIN orchestra_papers o ON o.code = p.code
             WHERE p.entity_type IN (SELECT value FROM json_each(?1)) AND o.sent_at IS NULL AND COALESCE(o.attempts, 0) < ?2",
        )
        .bind(self.kinds_json())
        .bind(PAPER_ATTEMPTS)
        .fetch_one(&self.pool)
        .await?;
        let sent: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM orchestra_papers WHERE sent_at IS NOT NULL").fetch_one(&self.pool).await?;
        let failed: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM orchestra_papers WHERE sent_at IS NULL AND attempts >= ?").bind(PAPER_ATTEMPTS).fetch_one(&self.pool).await?;
        Ok(PaperStatus { waiting, sent, failed })
    }

    /// Sends the fingerprint of each paper that left the office: its code, the
    /// hash of its wording, its kind, office and date. Never the wording.
    pub async fn send_papers(&self) -> Result<usize, OrchestraError> {
        let Some(licence) = self.licence().await else { return Ok(0) };
        let Some(token) = self.get("token").await? else { return Ok(0) };
        let Some(office) = self.get("office").await?.or(licence.address) else { return Ok(0) };
        let rows: Vec<(String, String, Option<String>, String, i64)> = sqlx::query_as(
            "SELECT p.code, p.entity_type, p.reference, p.body_sha256, p.printed_at FROM paper_prints p LEFT JOIN orchestra_papers o ON o.code = p.code
             WHERE p.entity_type IN (SELECT value FROM json_each(?1)) AND o.sent_at IS NULL AND COALESCE(o.attempts, 0) < ?2 ORDER BY p.printed_at LIMIT 200",
        )
        .bind(self.kinds_json())
        .bind(PAPER_ATTEMPTS)
        .fetch_all(&self.pool)
        .await?;
        let mut sent = 0;
        for (code, entity_type, reference, sha, printed_at) in rows {
            let kind = self.app.paper_kinds.iter().find(|(t, _)| *t == entity_type).map(|(_, k)| *k).unwrap_or("letter");
            // The reference is the office's own number (a CRB number); never a name.
            let reference = reference.filter(|r| !r.trim().is_empty()).unwrap_or_else(|| crate::paper::display(&code));
            let body = json!({ "code": code, "reference": reference.chars().take(80).collect::<String>(), "kind": kind, "office": office, "contentSha256": sha, "issuedAt": printed_at });
            match self.post("papers", body, Some(&token), None).await {
                Ok(_) => {
                    sqlx::query("INSERT INTO orchestra_papers (code, sent_at, attempts) VALUES (?, ?, 1) ON CONFLICT (code) DO UPDATE SET sent_at = excluded.sent_at, attempts = attempts + 1, error = NULL")
                        .bind(&code)
                        .bind(now())
                        .execute(&self.pool)
                        .await?;
                    sent += 1;
                }
                Err(OrchestraError::Offline(m)) => return Err(OrchestraError::Offline(m)),
                Err(e) => {
                    sqlx::query("INSERT INTO orchestra_papers (code, attempts, error) VALUES (?, 1, ?) ON CONFLICT (code) DO UPDATE SET attempts = attempts + 1, error = excluded.error")
                        .bind(&code)
                        .bind(e.code())
                        .execute(&self.pool)
                        .await?;
                    if matches!(&e, OrchestraError::Api { status: 401 | 403, .. }) {
                        return Err(e);
                    }
                }
            }
        }
        Ok(sent)
    }

    // ---- backups ----

    /// Locks the whole record (database and documents) to the institution's
    /// key and sends it to every storage this computer is approved for.
    pub async fn back_up_now(&self) -> Result<Vec<BackupRun>, OrchestraError> {
        let _guard = self.backing_up.try_lock().map_err(|_| OrchestraError::Needs("backup_running"))?;
        self.running.store(true, Ordering::SeqCst);
        let result = self.back_up().await;
        self.running.store(false, Ordering::SeqCst);
        if result.is_err() {
            let _ = self.set("backup_last_attempt_at", &now().to_string()).await;
        }
        result
    }

    async fn back_up(&self) -> Result<Vec<BackupRun>, OrchestraError> {
        let licence = self.licence().await.ok_or(OrchestraError::Needs("licence_needed"))?;
        // Fresh settings and seals: an administrator may have just approved this computer.
        let config = match self.fetch_backup_config().await {
            Ok(c) => c,
            Err(OrchestraError::Offline(_)) => self.get_json("backup_config").await.unwrap_or_default(),
            Err(e) => return Err(e),
        };
        let key = config.backup_key.as_ref().ok_or(OrchestraError::Needs("no_recovery_phrase"))?;
        let institution = backup::decode_key(&key.public_key).map_err(|_| OrchestraError::Backup("the institution key is not readable".into()))?;
        let computer = config.computer.clone().ok_or(OrchestraError::Needs("licence_needed"))?;
        let seal = self.seal_key().await?;
        let approved: Vec<&StorageEntryJson> = config.storage.iter().filter(|s| s.approved).collect();
        if approved.is_empty() {
            return Err(OrchestraError::Needs("no_storage"));
        }

        let work = self.data_dir.join("backup-work");
        std::fs::create_dir_all(&work).map_err(|e| OrchestraError::Backup(e.to_string()))?;
        let file = work.join(format!("{}.{}", uuid::Uuid::new_v4(), storage::EXTENSION));
        let out = std::io::BufWriter::new(std::fs::File::create(&file).map_err(|e| OrchestraError::Backup(e.to_string()))?);
        let written = snapshot::write(&self.pool, self.documents.as_ref(), &work, &institution, self.app.application, &computer, self.app.latest_migration, out).await;
        let (_, size) = match written {
            Ok(w) => w,
            Err(e) => {
                let _ = std::fs::remove_file(&file);
                return Err(OrchestraError::Backup(e.to_string()));
            }
        };
        let address = licence.address.clone().unwrap_or_else(|| "institution".into());
        let name = storage::object_name(&address, self.app.application, &computer, chrono::Utc::now());

        let mut runs = Vec::new();
        for entry in approved {
            let at = now();
            let result = match Target::open(&StorageEntry::from(entry), &seal, &computer) {
                Ok(target) => target.upload(&file, &name).await,
                Err(e) => Err(e),
            };
            let run = BackupRun {
                id: uuid::Uuid::new_v4().to_string(),
                storage_id: Some(entry.id.clone()),
                storage_label: Some(entry.label.clone()),
                at,
                size_bytes: Some(size as i64),
                ok: result.is_ok(),
                message: result.as_ref().err().map(|e| e.to_string().chars().take(280).collect()),
            };
            sqlx::query("INSERT INTO orchestra_backups (id, storage_id, storage_label, at, size_bytes, ok, message) VALUES (?, ?, ?, ?, ?, ?, ?)")
                .bind(&run.id)
                .bind(&run.storage_id)
                .bind(&run.storage_label)
                .bind(run.at)
                .bind(run.size_bytes)
                .bind(run.ok)
                .bind(&run.message)
                .execute(&self.pool)
                .await?;
            runs.push(run);
        }
        let _ = std::fs::remove_file(&file);
        self.set("backup_last_attempt_at", &now().to_string()).await?;
        let _ = self.report_backups().await;
        Ok(runs)
    }

    /// Tells pleadli.com when each backup ran, how large, whether it worked.
    async fn report_backups(&self) -> Result<(), OrchestraError> {
        let Some(token) = self.get("token").await? else { return Ok(()) };
        let rows: Vec<BackupRun> = sqlx::query_as("SELECT id, storage_id, storage_label, at, size_bytes, ok, message FROM orchestra_backups WHERE reported = 0 ORDER BY at LIMIT 50").fetch_all(&self.pool).await?;
        for run in rows {
            let mut body = json!({ "at": run.at, "ok": run.ok });
            if let Some(s) = &run.storage_id {
                body["storageId"] = json!(s);
            }
            if let Some(n) = run.size_bytes {
                body["sizeBytes"] = json!(n);
            }
            if let Some(m) = &run.message {
                body["message"] = json!(m);
            }
            self.post("backup/report", body, Some(&token), None).await?;
            sqlx::query("UPDATE orchestra_backups SET reported = 1 WHERE id = ?").bind(&run.id).execute(&self.pool).await?;
        }
        Ok(())
    }

    /// Writes and removes a small file on one storage, to show it works.
    pub async fn check_storage(&self, storage_id: &str) -> Result<(), OrchestraError> {
        let config = self.fetch_backup_config().await?;
        let entry = config.storage.iter().find(|s| s.id == storage_id).ok_or(OrchestraError::Needs("no_storage"))?;
        let computer = config.computer.clone().ok_or(OrchestraError::Needs("licence_needed"))?;
        let target = Target::open(&StorageEntry::from(entry), &self.seal_key().await?, &computer).map_err(OrchestraError::Storage)?;
        target.check(self.app.application, &computer).await.map_err(OrchestraError::Storage)
    }

    async fn backup_due(&self) -> bool {
        let config: BackupConfig = self.get_json("backup_config").await.unwrap_or_default();
        if config.backup_key.is_none() || !config.storage.iter().any(|s| s.approved) {
            return false;
        }
        let last_ok: Option<i64> = sqlx::query_scalar("SELECT MAX(at) FROM orchestra_backups WHERE ok = 1").fetch_one(&self.pool).await.ok().flatten();
        let last_try = self.get_i64("backup_last_attempt_at").await;
        last_ok.is_none_or(|t| now() - t >= BACKUP_EVERY) && last_try.is_none_or(|t| now() - t >= BACKUP_RETRY)
    }

    // ---- restore ----

    /// Opens a backup file with the recovery phrase and stages it; the next
    /// start puts it in place (`snapshot::apply_pending`).
    pub async fn stage_restore(&self, file: &std::path::Path, phrase: &str) -> Result<snapshot::Staged, snapshot::RestoreError> {
        let input = std::io::BufReader::new(std::fs::File::open(file)?);
        snapshot::stage(&self.data_dir, input, phrase, self.app.application, self.app.latest_migration, self.app.required_tables).await
    }

    pub fn cancel_restore(&self) -> std::io::Result<()> {
        snapshot::cancel(&self.data_dir)
    }

    // ---- the loop ----

    /// Runs for the life of the application: contact every few hours, papers
    /// and backup reports whenever there is internet, a backup once a day.
    pub async fn run(self: Arc<Self>) {
        tokio::time::sleep(Duration::from_secs(20)).await;
        loop {
            self.tick().await;
            tokio::time::sleep(TICK).await;
        }
    }

    async fn tick(&self) {
        let last = self.get_i64("last_contact_at").await.unwrap_or(0).max(self.get_i64("last_attempt_at").await.unwrap_or(0));
        if now() - last >= CONTACT_EVERY || self.get("last_error").await.ok().flatten().is_some() {
            match self.contact().await {
                Ok(()) => log::info!("orchestra: in touch with {}", self.base),
                Err(e) => {
                    log::info!("orchestra: {e}");
                    return;
                }
            }
        }
        if self.licence().await.is_none() {
            return;
        }
        if let Err(e) = self.send_papers().await {
            log::info!("orchestra papers: {e}");
        }
        let _ = self.report_backups().await;
        if self.backup_due().await {
            match self.back_up_now().await {
                Ok(runs) => log::info!("orchestra backup: {} of {} storage", runs.iter().filter(|r| r.ok).count(), runs.len()),
                Err(e) => log::warn!("orchestra backup: {e}"),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn signed(key: &SigningKey, payload: &Value) -> Signed {
        let bytes = serde_json::to_vec(payload).unwrap();
        Signed { key: "k".into(), payload: URL_SAFE_NO_PAD.encode(&bytes), signature: URL_SAFE_NO_PAD.encode(key.sign(&bytes).to_bytes()), cert: None }
    }

    fn licence(device: &str) -> Value {
        json!({"v": 1, "kind": "pleadli.licence", "licence": "l1", "institution": "Albertine Region", "address": "ug.police.albertine", "application": "police", "seats": 3, "device": device, "issuedAt": 1, "refreshAfter": 2, "validUntil": now() + DAY, "expiresAt": now() + 30 * DAY})
    }

    #[test]
    fn a_licence_is_checked_up_to_the_root() {
        let root = SigningKey::from_bytes(&[1u8; 32]);
        let online = SigningKey::from_bytes(&[2u8; 32]);
        let mut lic = signed(&online, &licence("dev1"));
        let cert = signed(&root, &json!({"v": 1, "kind": "pleadli.signing-key", "key": "k", "publicKey": STANDARD.encode(online.verifying_key().as_bytes()), "issuedAt": 1}));
        lic.cert = Some(Box::new(cert.clone()));
        let root_key = root.verifying_key();
        let online_key = certified_key(&root_key, &cert).unwrap();
        let payload: LicencePayload = serde_json::from_slice(&verify_with(&online_key, &lic).unwrap()).unwrap();
        assert_eq!(payload.address.as_deref(), Some("ug.police.albertine"));
        // A certificate signed by anyone else is refused.
        let forged = signed(&SigningKey::from_bytes(&[3u8; 32]), &json!({"kind": "pleadli.signing-key", "publicKey": STANDARD.encode(online.verifying_key().as_bytes())}));
        assert!(certified_key(&root_key, &forged).is_none());
        // Without a built-in root, a development build uses the key it was given.
        let dev = STANDARD.encode(online.verifying_key().as_bytes());
        if ROOT_PUBLIC_KEY.is_none() {
            assert!(check_licence(&lic, "dev1", Some(&dev)).is_some());
            assert!(check_licence(&lic, "another computer", Some(&dev)).is_none(), "a licence names its computer");
            let other = STANDARD.encode(SigningKey::from_bytes(&[9u8; 32]).verifying_key().as_bytes());
            assert!(check_licence(&lic, "dev1", Some(&other)).is_none());
        }
        // A changed payload no longer verifies.
        let mut changed = lic.clone();
        changed.payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&licence("dev2")).unwrap());
        assert!(verify_with(&online_key, &changed).is_none());
    }

    #[test]
    fn the_device_is_a_hash_never_the_identifier() {
        let d = std::env::temp_dir().join(format!("pleadli-orch-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&d).unwrap();
        let h = device_hash(&d);
        assert_eq!(h.len(), 64);
        assert!(h.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        assert_eq!(h, device_hash(&d), "stable");
        let _ = std::fs::remove_dir_all(&d);
    }
}
