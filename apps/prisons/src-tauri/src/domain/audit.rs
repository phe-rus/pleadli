//! The audit trail (docs/prisons/product-map/05 M.5).
//!
//! `record` takes the caller's open connection, so an audit row commits or
//! rolls back together with the change it describes: a change cannot commit
//! without its audit entry. Rows are append-only (triggers in migration
//! 0021) and hash-chained: each row commits the previous row's hash, so any
//! edit or removal is detected by `verify_chain` from that point on.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::authz::Actor;

pub const GENESIS_HASH: &str = "genesis";

pub struct AuditEntry<'a> {
    pub action: &'a str,
    pub entity_type: &'a str,
    pub entity_id: Option<&'a str>,
    pub workflow_id: Option<&'a str>,
    pub reason: Option<&'a str>,
    /// The officer whose authority the action rests on when that differs
    /// from the performer (an OIC authorising an exception). Free of
    /// passwords: a badge number or officer id only.
    pub authorised_by: Option<&'a str>,
    pub before: Option<Value>,
    pub after: Option<Value>,
}

impl<'a> AuditEntry<'a> {
    pub fn new(action: &'a str, entity_type: &'a str, entity_id: Option<&'a str>) -> Self {
        AuditEntry { action, entity_type, entity_id, workflow_id: None, reason: None, authorised_by: None, before: None, after: None }
    }

    pub fn before<T: Serialize>(mut self, value: &T) -> Self {
        self.before = serde_json::to_value(value).ok();
        self
    }

    pub fn after<T: Serialize>(mut self, value: &T) -> Self {
        self.after = serde_json::to_value(value).ok();
        self
    }

    pub fn workflow(mut self, workflow_id: &'a str) -> Self {
        self.workflow_id = Some(workflow_id);
        self
    }

    pub fn reason(mut self, reason: &'a str) -> Self {
        self.reason = Some(reason);
        self
    }

    pub fn authorised_by(mut self, authoriser: &'a str) -> Self {
        self.authorised_by = Some(authoriser);
        self
    }
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn compute_hash(prev_hash: &str, fields: &[&str]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(prev_hash.as_bytes());
    for field in fields {
        hasher.update([0x1f]);
        hasher.update(field.as_bytes());
    }
    format!("{:x}", hasher.finalize())
}

/// Appends one audit row on the caller's connection. Must be called inside
/// the same (write) transaction as the change it records.
pub async fn record(conn: &mut SqliteConnection, actor: &Actor, entry: AuditEntry<'_>) -> Result<(), sqlx::Error> {
    let prev_hash: String = sqlx::query_scalar("SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1")
        .fetch_optional(&mut *conn)
        .await?
        .unwrap_or_else(|| GENESIS_HASH.to_string());

    let id = Uuid::new_v4().to_string();
    let at = now_ms();
    let at_text = at.to_string();
    let before_json = entry.before.as_ref().map(|v| v.to_string());
    let after_json = entry.after.as_ref().map(|v| v.to_string());

    let hash = compute_hash(
        &prev_hash,
        &[
            &id,
            &at_text,
            actor.officer_id.as_deref().unwrap_or(""),
            actor.badge_number.as_deref().unwrap_or(""),
            &actor.name,
            actor.device_id.as_deref().unwrap_or(""),
            entry.action,
            entry.entity_type,
            entry.entity_id.unwrap_or(""),
            entry.workflow_id.unwrap_or(""),
            entry.reason.unwrap_or(""),
            entry.authorised_by.unwrap_or(""),
            before_json.as_deref().unwrap_or(""),
            after_json.as_deref().unwrap_or(""),
        ],
    );

    sqlx::query(
        "INSERT INTO audit_log
            (id, at, actor_id, actor_badge, actor_name, device_id, action, entity_type, entity_id,
             workflow_id, reason, authorised_by, before_json, after_json, prev_hash, hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(at)
    .bind(&actor.officer_id)
    .bind(&actor.badge_number)
    .bind(&actor.name)
    .bind(&actor.device_id)
    .bind(entry.action)
    .bind(entry.entity_type)
    .bind(entry.entity_id)
    .bind(entry.workflow_id)
    .bind(entry.reason)
    .bind(entry.authorised_by)
    .bind(&before_json)
    .bind(&after_json)
    .bind(&prev_hash)
    .bind(&hash)
    .execute(&mut *conn)
    .await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AuditRow {
    pub seq: i64,
    pub id: String,
    pub at: i64,
    pub actor_id: Option<String>,
    pub actor_badge: Option<String>,
    pub actor_name: String,
    pub device_id: Option<String>,
    pub action: String,
    pub entity_type: String,
    pub entity_id: Option<String>,
    pub workflow_id: Option<String>,
    pub reason: Option<String>,
    pub authorised_by: Option<String>,
    pub before_json: Option<String>,
    pub after_json: Option<String>,
    pub prev_hash: String,
    pub hash: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditFilter {
    pub entity_type: Option<String>,
    pub entity_id: Option<String>,
    pub actor_id: Option<String>,
    pub limit: Option<i64>,
}

/// Newest first. Reading the audit trail needs `audit.read`, enforced by the
/// caller (`api/system.rs`).
pub async fn list(pool: &SqlitePool, filter: &AuditFilter) -> Result<Vec<AuditRow>, sqlx::Error> {
    let limit = filter.limit.unwrap_or(200).clamp(1, 1000);
    sqlx::query_as::<_, AuditRow>(
        "SELECT * FROM audit_log
         WHERE (?1 IS NULL OR entity_type = ?1)
           AND (?2 IS NULL OR entity_id = ?2)
           AND (?3 IS NULL OR actor_id = ?3)
         ORDER BY seq DESC LIMIT ?4",
    )
    .bind(&filter.entity_type)
    .bind(&filter.entity_id)
    .bind(&filter.actor_id)
    .bind(limit)
    .fetch_all(pool)
    .await
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChainStatus {
    pub ok: bool,
    pub checked: i64,
    pub first_bad_seq: Option<i64>,
    pub head_hash: String,
}

/// Recomputes the whole chain. `first_bad_seq` names the first row whose
/// stored hash or link does not match; rows before it are intact.
pub async fn verify_chain(pool: &SqlitePool) -> Result<ChainStatus, sqlx::Error> {
    let rows = sqlx::query_as::<_, AuditRow>("SELECT * FROM audit_log ORDER BY seq ASC").fetch_all(pool).await?;
    let mut prev = GENESIS_HASH.to_string();
    let mut checked = 0i64;
    for row in &rows {
        let at_text = row.at.to_string();
        let expected = compute_hash(
            &prev,
            &[
                &row.id,
                &at_text,
                row.actor_id.as_deref().unwrap_or(""),
                row.actor_badge.as_deref().unwrap_or(""),
                &row.actor_name,
                row.device_id.as_deref().unwrap_or(""),
                &row.action,
                &row.entity_type,
                row.entity_id.as_deref().unwrap_or(""),
                row.workflow_id.as_deref().unwrap_or(""),
                row.reason.as_deref().unwrap_or(""),
                row.authorised_by.as_deref().unwrap_or(""),
                row.before_json.as_deref().unwrap_or(""),
                row.after_json.as_deref().unwrap_or(""),
            ],
        );
        if row.prev_hash != prev || row.hash != expected {
            return Ok(ChainStatus { ok: false, checked, first_bad_seq: Some(row.seq), head_hash: prev });
        }
        prev = row.hash.clone();
        checked += 1;
    }
    Ok(ChainStatus { ok: true, checked, first_bad_seq: None, head_hash: prev })
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

    #[tokio::test]
    async fn chain_verifies_and_detects_tampering() {
        let pool = pool().await;
        let actor = Actor::system("test");
        let mut conn = pool.acquire().await.unwrap();
        for i in 0..3 {
            record(&mut conn, &actor, AuditEntry::new("test.action", "thing", Some(&format!("t{i}"))).after(&serde_json::json!({"n": i})))
                .await
                .unwrap();
        }
        drop(conn);

        let status = verify_chain(&pool).await.unwrap();
        assert!(status.ok);
        assert_eq!(status.checked, 3);

        // Triggers block ordinary edits...
        let blocked = sqlx::query("UPDATE audit_log SET actor_name = 'someone else' WHERE seq = 2").execute(&pool).await;
        assert!(blocked.is_err(), "audit_log must be append-only");

        // ...and even someone who drops the trigger is caught by the chain.
        sqlx::query("DROP TRIGGER audit_log_no_update").execute(&pool).await.unwrap();
        sqlx::query("UPDATE audit_log SET actor_name = 'someone else' WHERE seq = 2").execute(&pool).await.unwrap();
        let status = verify_chain(&pool).await.unwrap();
        assert!(!status.ok);
        assert_eq!(status.first_bad_seq, Some(2));
    }

    #[tokio::test]
    async fn audit_rolls_back_with_its_transaction() {
        let pool = pool().await;
        let actor = Actor::system("test");
        let mut tx = pool.begin().await.unwrap();
        record(&mut tx, &actor, AuditEntry::new("test.action", "thing", None)).await.unwrap();
        tx.rollback().await.unwrap();
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_log").fetch_one(&pool).await.unwrap();
        assert_eq!(count, 0, "an audit row must not outlive a rolled-back change");
    }
}
