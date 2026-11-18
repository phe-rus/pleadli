//! The Postbox, on the computer's side (docs/platform/RELAY-DESIGN.md): an
//! outbox that keeps a sealed package until pleadli.com has it, an inbox that
//! keeps what was collected until the app has dealt with it, and the calls
//! between them and the relay.
//!
//! This module never seals or opens anything. It moves opaque bytes that
//! `pleadli-interchange` already sealed, and it checks only their SHA-256, so a
//! flaw here cannot expose a case file. The relay is polled, never listened
//! to: no computer accepts a connection from outside.
//!
//! A package is removed from the relay only after this computer has stored it
//! (`collect`), so a crash between the two re-fetches it and loses nothing.

use std::time::Duration;

use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};

/// Copied into one migration of each application that uses the Postbox.
pub const TABLE_SQL: &str = "CREATE TABLE postbox_outbox (
    id TEXT PRIMARY KEY,
    to_address TEXT NOT NULL,
    kind TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    bytes BLOB NOT NULL,
    queued_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_try_at INTEGER NOT NULL,
    posted_at INTEGER,
    status TEXT NOT NULL DEFAULT 'queued',
    error TEXT
);

CREATE INDEX postbox_outbox_due ON postbox_outbox (status, next_try_at);

CREATE TABLE postbox_inbox (
    id TEXT PRIMARY KEY,
    from_address TEXT NOT NULL,
    kind TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    bytes BLOB NOT NULL,
    arrived_at INTEGER NOT NULL
);";

const SECOND: i64 = 1000;
const DAY: i64 = 24 * 60 * 60 * SECOND;
/// How long an unsent package is kept trying: the relay holds mail 30 days too.
const GIVE_UP_AFTER: i64 = 30 * DAY;
/// Per call, so one tick stays short on a slow line.
const POST_BATCH: i64 = 20;
const COLLECT_PAGES: usize = 5;

pub fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[derive(Debug)]
pub enum PostboxError {
    /// No answer: offline, a timeout, or the relay down. Always worth retrying.
    Offline(String),
    Api { status: u16, error: String, message: String },
    Db(String),
}

impl std::fmt::Display for PostboxError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PostboxError::Offline(e) => write!(f, "pleadli.com could not be reached: {e}"),
            PostboxError::Api { message, error, .. } if !message.is_empty() => write!(f, "{message} ({error})"),
            PostboxError::Api { status, error, .. } => write!(f, "pleadli.com answered {status} {error}"),
            PostboxError::Db(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for PostboxError {}

impl From<sqlx::Error> for PostboxError {
    fn from(e: sqlx::Error) -> Self {
        PostboxError::Db(e.to_string())
    }
}

/// What to do with a package after the relay's answer.
#[derive(Debug, PartialEq, Eq)]
pub enum Outcome {
    Done,
    /// Try again, after this many seconds if the relay said so, else by backoff.
    Retry(Option<i64>),
    /// Needs a person: not connected to that office, no licence. Kept, and
    /// released by `release_blocked` once it is sorted out.
    Blocked(String),
    /// Will never succeed as sent (too large, a bad label, an id clash).
    Failed(String),
}

/// The relay's status and error code, as a decision. A pure function so the
/// rules are tested without a network.
pub fn classify(status: u16, error: &str, retry_after_seconds: Option<i64>) -> Outcome {
    match status {
        200..=299 => Outcome::Done,
        429 => Outcome::Retry(Some(retry_after_seconds.unwrap_or(600).clamp(60, 6 * 3600))),
        408 | 500..=599 => Outcome::Retry(None),
        401 | 403 => Outcome::Blocked(error.to_string()),
        _ => Outcome::Failed(error.to_string()),
    }
}

/// Seconds to wait after this many failed attempts: 5 minutes, doubling, at most 6 hours.
pub fn backoff_seconds(attempts: i64) -> i64 {
    (300i64.saturating_mul(1i64 << attempts.clamp(0, 7))).min(6 * 3600)
}

/// A package that came in.
#[derive(Debug, Clone)]
pub struct Arrived {
    pub id: String,
    pub from: String,
    pub kind: String,
    pub sha256: String,
    pub bytes: Vec<u8>,
    pub arrived_at: i64,
}

/// A package that went out, with how far it got:
/// queued, posted, delivered, acked, blocked, failed or expired.
#[derive(Debug, Clone)]
pub struct Sent {
    pub id: String,
    pub to: String,
    pub kind: String,
    pub status: String,
    pub error: Option<String>,
    pub queued_at: i64,
    pub posted_at: Option<i64>,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Tick {
    pub posted: usize,
    pub collected: usize,
    pub refreshed: usize,
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub struct Postbox {
    pool: SqlitePool,
    http: reqwest::Client,
    base: String,
}

impl Postbox {
    /// `base` is the site, for example `https://pleadli.com`.
    pub fn new(pool: SqlitePool, base: &str) -> Postbox {
        let http = reqwest::Client::builder().connect_timeout(Duration::from_secs(15)).timeout(Duration::from_secs(120)).build().unwrap_or_default();
        Postbox { pool, http, base: base.trim_end_matches('/').to_string() }
    }

    fn url(&self, path: &str) -> String {
        format!("{}/api/orchestra/v1/relay/{path}", self.base)
    }

    // ---- outbox ----

    /// Keeps a sealed package to be posted. `id` is the package's own id, so
    /// queuing the same package twice is harmless. Returns its SHA-256.
    pub async fn queue(&self, id: &str, to: &str, kind: &str, bytes: &[u8]) -> Result<String, PostboxError> {
        let sha = sha256_hex(bytes);
        let t = now();
        sqlx::query("INSERT OR IGNORE INTO postbox_outbox (id, to_address, kind, sha256, bytes, queued_at, next_try_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(id)
            .bind(to)
            .bind(kind)
            .bind(&sha)
            .bind(bytes)
            .bind(t)
            .bind(t)
            .execute(&self.pool)
            .await?;
        Ok(sha)
    }

    /// What was sent lately and how far it got, newest first.
    pub async fn sent(&self) -> Result<Vec<Sent>, PostboxError> {
        let rows = sqlx::query("SELECT id, to_address, kind, status, error, queued_at, posted_at FROM postbox_outbox ORDER BY queued_at DESC LIMIT 200").fetch_all(&self.pool).await?;
        Ok(rows
            .iter()
            .map(|r| Sent {
                id: r.get("id"),
                to: r.get("to_address"),
                kind: r.get("kind"),
                status: r.get("status"),
                error: r.get("error"),
                queued_at: r.get("queued_at"),
                posted_at: r.get("posted_at"),
            })
            .collect())
    }

    /// Puts packages that were waiting on a person back in the queue: after a
    /// connection is approved, or a licence is activated. `to` limits it to one office.
    pub async fn release_blocked(&self, to: Option<&str>) -> Result<u64, PostboxError> {
        let q = match to {
            Some(_) => "UPDATE postbox_outbox SET status = 'queued', error = NULL, next_try_at = ? WHERE status = 'blocked' AND to_address = ?",
            None => "UPDATE postbox_outbox SET status = 'queued', error = NULL, next_try_at = ? WHERE status = 'blocked' AND ? IS NOT NULL",
        };
        Ok(sqlx::query(q).bind(now()).bind(to.unwrap_or("")).execute(&self.pool).await?.rows_affected())
    }

    /// Posts what is due. Stops quietly at the first sign of being offline.
    pub async fn flush(&self, token: &str) -> Result<usize, PostboxError> {
        let t = now();
        sqlx::query("UPDATE postbox_outbox SET status = 'expired', bytes = x'', error = 'not delivered within 30 days' WHERE status IN ('queued', 'blocked') AND queued_at < ?")
            .bind(t - GIVE_UP_AFTER)
            .execute(&self.pool)
            .await?;
        let due = sqlx::query("SELECT id, to_address, kind, sha256, bytes, attempts FROM postbox_outbox WHERE status = 'queued' AND next_try_at <= ? ORDER BY queued_at LIMIT ?")
            .bind(t)
            .bind(POST_BATCH)
            .fetch_all(&self.pool)
            .await?;
        let mut posted = 0;
        for row in due {
            let id: String = row.get("id");
            let attempts: i64 = row.get("attempts");
            let bytes: Vec<u8> = row.get("bytes");
            let sent = self
                .http
                .post(self.url("messages"))
                .bearer_auth(token)
                .header("x-pleadli-id", &id)
                .header("x-pleadli-to", row.get::<String, _>("to_address"))
                .header("x-pleadli-kind", row.get::<String, _>("kind"))
                .header("x-pleadli-sha256", row.get::<String, _>("sha256"))
                .body(bytes)
                .send()
                .await;
            let res = match sent {
                Ok(r) => r,
                Err(e) => {
                    self.schedule_retry(&id, attempts, None, &e.to_string()).await?;
                    return Err(PostboxError::Offline(e.to_string()));
                }
            };
            let status = res.status().as_u16();
            let body: Value = res.json().await.unwrap_or(Value::Null);
            let code = body.get("error").and_then(Value::as_str).unwrap_or("").to_string();
            let retry = body.get("retryAfterSeconds").and_then(Value::as_i64);
            match classify(status, &code, retry) {
                Outcome::Done => {
                    sqlx::query("UPDATE postbox_outbox SET status = 'posted', posted_at = ?, error = NULL, bytes = x'' WHERE id = ?").bind(now()).bind(&id).execute(&self.pool).await?;
                    posted += 1;
                }
                Outcome::Retry(after) => self.schedule_retry(&id, attempts, after, &code).await?,
                Outcome::Blocked(code) => {
                    sqlx::query("UPDATE postbox_outbox SET status = 'blocked', error = ? WHERE id = ?").bind(code).bind(&id).execute(&self.pool).await?;
                }
                Outcome::Failed(code) => {
                    sqlx::query("UPDATE postbox_outbox SET status = 'failed', error = ? WHERE id = ?").bind(code).bind(&id).execute(&self.pool).await?;
                }
            }
        }
        Ok(posted)
    }

    async fn schedule_retry(&self, id: &str, attempts: i64, after: Option<i64>, error: &str) -> Result<(), PostboxError> {
        let wait = after.unwrap_or_else(|| backoff_seconds(attempts));
        sqlx::query("UPDATE postbox_outbox SET attempts = attempts + 1, next_try_at = ?, error = ? WHERE id = ?")
            .bind(now() + wait * SECOND)
            .bind(error)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Asks the relay how far each posted package got (delivered, acknowledged,
    /// or expired) and records it. Packages are looked up 50 at a time.
    pub async fn refresh(&self, token: &str) -> Result<usize, PostboxError> {
        let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM postbox_outbox WHERE status IN ('posted', 'delivered') ORDER BY queued_at LIMIT 50").fetch_all(&self.pool).await?;
        if ids.is_empty() {
            return Ok(0);
        }
        let value = self.get_json(&format!("outbox?ids={}", ids.join(",")), token).await?;
        let mut changed = 0;
        for item in value.get("items").and_then(Value::as_array).into_iter().flatten() {
            let (Some(id), Some(status)) = (item.get("id").and_then(Value::as_str), item.get("status").and_then(Value::as_str)) else { continue };
            if matches!(status, "delivered" | "acked" | "expired") {
                changed += sqlx::query("UPDATE postbox_outbox SET status = ? WHERE id = ? AND status != ?").bind(status).bind(id).bind(status).execute(&self.pool).await?.rows_affected() as usize;
            }
        }
        Ok(changed)
    }

    // ---- inbox ----

    /// Fetches what is waiting at the relay, stores it here, then tells the
    /// relay it may delete its copy. A package whose bytes do not match the
    /// stated hash is not stored and not acknowledged.
    pub async fn collect(&self, token: &str) -> Result<usize, PostboxError> {
        let mut stored = 0;
        for _ in 0..COLLECT_PAGES {
            let page = self.get_json("inbox", token).await?;
            let items = page.get("items").and_then(Value::as_array).cloned().unwrap_or_default();
            for item in &items {
                let s = |k: &str| item.get(k).and_then(Value::as_str).unwrap_or("").to_string();
                let (id, from, kind, sha) = (s("id"), s("from"), s("kind"), s("sha256"));
                if id.is_empty() {
                    continue;
                }
                let res = self.http.get(self.url(&format!("messages/{id}"))).bearer_auth(token).send().await.map_err(|e| PostboxError::Offline(e.to_string()))?;
                if !res.status().is_success() {
                    continue;
                }
                let bytes = res.bytes().await.map_err(|e| PostboxError::Offline(e.to_string()))?;
                if sha256_hex(&bytes) != sha {
                    log::warn!("postbox: package {id} does not match its hash, left at the relay");
                    continue;
                }
                let inserted = sqlx::query("INSERT OR IGNORE INTO postbox_inbox (id, from_address, kind, sha256, bytes, arrived_at) VALUES (?, ?, ?, ?, ?, ?)")
                    .bind(&id)
                    .bind(&from)
                    .bind(&kind)
                    .bind(&sha)
                    .bind(bytes.as_ref())
                    .bind(now())
                    .execute(&self.pool)
                    .await?
                    .rows_affected();
                // Only now is it safe for the relay to forget its copy.
                self.http.post(self.url(&format!("messages/{id}/ack"))).bearer_auth(token).send().await.map_err(|e| PostboxError::Offline(e.to_string()))?;
                stored += inserted as usize;
            }
            if !page.get("more").and_then(Value::as_bool).unwrap_or(false) || items.is_empty() {
                break;
            }
        }
        Ok(stored)
    }

    /// Packages that arrived and are waiting for the app to open them.
    pub async fn unread(&self) -> Result<Vec<Arrived>, PostboxError> {
        let rows = sqlx::query("SELECT id, from_address, kind, sha256, bytes, arrived_at FROM postbox_inbox ORDER BY arrived_at").fetch_all(&self.pool).await?;
        Ok(rows
            .iter()
            .map(|r| Arrived { id: r.get("id"), from: r.get("from_address"), kind: r.get("kind"), sha256: r.get("sha256"), bytes: r.get("bytes"), arrived_at: r.get("arrived_at") })
            .collect())
    }

    /// The app has opened (or refused) this package and kept what it needs.
    pub async fn handled(&self, id: &str) -> Result<(), PostboxError> {
        sqlx::query("DELETE FROM postbox_inbox WHERE id = ?").bind(id).execute(&self.pool).await?;
        Ok(())
    }

    // ---- the whole round ----

    /// One round: post what is due, collect what is waiting, update progress.
    /// Called every ten to fifteen minutes by the app, only when it has a
    /// licence token. Each part runs even if an earlier one fails.
    pub async fn tick(&self, token: &str) -> Result<Tick, PostboxError> {
        let mut out = Tick::default();
        let mut first: Option<PostboxError> = None;
        match self.flush(token).await {
            Ok(n) => out.posted = n,
            Err(e) => first = Some(e),
        }
        match self.collect(token).await {
            Ok(n) => out.collected = n,
            Err(e) => first = first.or(Some(e)),
        }
        match self.refresh(token).await {
            Ok(n) => out.refreshed = n,
            Err(e) => first = first.or(Some(e)),
        }
        match first {
            Some(e) if out == Tick::default() => Err(e),
            _ => Ok(out),
        }
    }

    async fn get_json(&self, path: &str, token: &str) -> Result<Value, PostboxError> {
        let res = self.http.get(self.url(path)).bearer_auth(token).send().await.map_err(|e| PostboxError::Offline(e.to_string()))?;
        let status = res.status().as_u16();
        let value: Value = res.json().await.map_err(|e| PostboxError::Offline(e.to_string()))?;
        if status >= 400 {
            let s = |k: &str| value.get(k).and_then(Value::as_str).unwrap_or("").to_string();
            return Err(PostboxError::Api { status, error: s("error"), message: s("message") });
        }
        Ok(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn pool() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(TABLE_SQL).execute(&pool).await.unwrap();
        pool
    }

    #[test]
    fn the_relays_answers_become_decisions() {
        assert_eq!(classify(201, "", None), Outcome::Done);
        assert_eq!(classify(200, "", None), Outcome::Done);
        assert_eq!(classify(429, "slow_down", Some(600)), Outcome::Retry(Some(600)));
        assert_eq!(classify(429, "quota", None), Outcome::Retry(Some(600)));
        assert_eq!(classify(503, "", None), Outcome::Retry(None));
        assert_eq!(classify(403, "not_connected", None), Outcome::Blocked("not_connected".into()));
        assert_eq!(classify(403, "licence_needed", None), Outcome::Blocked("licence_needed".into()));
        assert_eq!(classify(401, "unauthorised", None), Outcome::Blocked("unauthorised".into()));
        assert_eq!(classify(413, "too_large", None), Outcome::Failed("too_large".into()));
        assert_eq!(classify(400, "hash_mismatch", None), Outcome::Failed("hash_mismatch".into()));
        assert_eq!(classify(409, "id_taken", None), Outcome::Failed("id_taken".into()));
    }

    #[test]
    fn waiting_grows_then_stops_at_six_hours() {
        assert_eq!(backoff_seconds(0), 300);
        assert_eq!(backoff_seconds(1), 600);
        assert_eq!(backoff_seconds(3), 2400);
        assert_eq!(backoff_seconds(6), 19_200);
        assert_eq!(backoff_seconds(7), 6 * 3600);
        assert_eq!(backoff_seconds(60), 6 * 3600);
        assert_eq!(backoff_seconds(-1), 300);
    }

    #[test]
    fn a_retry_after_from_the_relay_is_kept_within_sane_bounds() {
        assert_eq!(classify(429, "slow_down", Some(5)), Outcome::Retry(Some(60)));
        assert_eq!(classify(429, "slow_down", Some(999_999)), Outcome::Retry(Some(6 * 3600)));
    }

    #[tokio::test]
    async fn queuing_the_same_package_twice_keeps_one() {
        let pool = pool().await;
        let post = Postbox::new(pool.clone(), "https://example.invalid/");
        let a = post.queue("11111111-1111-4111-8111-111111111111", "ug.dpp.hoima.office", "referral", b"sealed").await.unwrap();
        let b = post.queue("11111111-1111-4111-8111-111111111111", "ug.dpp.hoima.office", "referral", b"sealed").await.unwrap();
        assert_eq!(a, b);
        assert_eq!(a, sha256_hex(b"sealed"));
        let sent = post.sent().await.unwrap();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].status, "queued");
        assert_eq!(sent[0].to, "ug.dpp.hoima.office");
        pool.close().await;
    }

    #[tokio::test]
    async fn blocked_mail_is_released_only_for_the_office_that_was_sorted_out() {
        let pool = pool().await;
        let post = Postbox::new(pool.clone(), "https://example.invalid");
        post.queue("a", "ug.dpp.one.office", "referral", b"1").await.unwrap();
        post.queue("b", "ug.dpp.two.office", "referral", b"2").await.unwrap();
        sqlx::query("UPDATE postbox_outbox SET status = 'blocked', error = 'not_connected'").execute(&pool).await.unwrap();
        assert_eq!(post.release_blocked(Some("ug.dpp.one.office")).await.unwrap(), 1);
        let sent = post.sent().await.unwrap();
        assert_eq!(sent.iter().find(|s| s.id == "a").unwrap().status, "queued");
        assert_eq!(sent.iter().find(|s| s.id == "b").unwrap().status, "blocked");
        assert_eq!(post.release_blocked(None).await.unwrap(), 1);
        pool.close().await;
    }

    #[tokio::test]
    async fn an_arrived_package_waits_until_the_app_says_it_is_handled() {
        let pool = pool().await;
        let post = Postbox::new(pool.clone(), "https://example.invalid");
        sqlx::query("INSERT INTO postbox_inbox (id, from_address, kind, sha256, bytes, arrived_at) VALUES ('m1', 'ug.police.x.y', 'referral', 'h', x'0102', 1)").execute(&pool).await.unwrap();
        let waiting = post.unread().await.unwrap();
        assert_eq!(waiting.len(), 1);
        assert_eq!(waiting[0].bytes, vec![1u8, 2]);
        post.handled("m1").await.unwrap();
        assert!(post.unread().await.unwrap().is_empty());
        pool.close().await;
    }
}
