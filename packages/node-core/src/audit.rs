//! The audit trail, version 1: an append-only, hash-chained record of the events
//! that matter. Each entry's hash covers the entry before it and its own
//! content, so an entry cannot be altered or removed without the chain no
//! longer verifying, and the database itself refuses to update or delete a row
//! (`TABLE_SQL`). It records what happened and who was acting, never the content
//! of a record.
//!
//! This is the chain new applications start on. DPP and Prisons keep their own
//! older chains (different genesis, different preimage); their rows are real
//! data whose hashes must not change, so they move to this one only with a
//! migration of their own. What makes that later move possible is the `version`
//! stored on every row and mixed into every hash: a future format can sit in the
//! same table beside this one and each row is verified by its own rules.
//!
//! The preimage is length-prefixed (`len:value` per field), so no value, however
//! it is spelled, can be confused with the boundary between two fields.

use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqliteConnection, SqlitePool};

/// The format every row written by this module carries.
pub const VERSION: i64 = 1;

/// The table and its guards. An application puts this in one of its own
/// migrations (its test can assert the migration still contains it), so the
/// schema lives where every other schema of that application lives.
pub const TABLE_SQL: &str = "CREATE TABLE audit_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER NOT NULL DEFAULT 1,
    at INTEGER NOT NULL,
    actor TEXT,
    action TEXT NOT NULL,
    subject_type TEXT,
    subject_id TEXT,
    scope_id TEXT,
    detail TEXT,
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL
);

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'The audit trail is append-only.'); END;

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'The audit trail is append-only.'); END;";

fn genesis() -> String {
    format!("{:x}", Sha256::digest(b"pleadli-audit/v1/genesis"))
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub seq: i64,
    pub version: i64,
    pub at: i64,
    pub actor: Option<String>,
    pub action: String,
    pub subject_type: Option<String>,
    pub subject_id: Option<String>,
    /// The record an event belongs to as a whole (a case, a file), so one
    /// record's history can be read on its own.
    pub scope_id: Option<String>,
    pub detail: Option<String>,
    pub prev_hash: String,
    pub hash: String,
}

/// What an application says happened. The actor is given separately because
/// only the application knows who is using this installation.
pub struct Entry<'a> {
    pub action: &'a str,
    pub subject_type: Option<&'a str>,
    pub subject_id: Option<&'a str>,
    pub scope_id: Option<&'a str>,
    pub detail: Option<String>,
}

impl<'a> Entry<'a> {
    pub fn new(action: &'a str) -> Self {
        Entry { action, subject_type: None, subject_id: None, scope_id: None, detail: None }
    }
    pub fn subject(mut self, kind: &'a str, id: &'a str) -> Self {
        self.subject_type = Some(kind);
        self.subject_id = Some(id);
        self
    }
    pub fn scope(mut self, id: &'a str) -> Self {
        self.scope_id = Some(id);
        self
    }
    pub fn detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }
}

fn digest(prev: &str, e: &AuditEntry) -> String {
    let mut text = String::new();
    let mut field = |value: &str| {
        text.push_str(&value.len().to_string());
        text.push(':');
        text.push_str(value);
        text.push('|');
    };
    field("pleadli-audit");
    field(&e.version.to_string());
    field(prev);
    field(&e.seq.to_string());
    field(&e.at.to_string());
    field(e.actor.as_deref().unwrap_or(""));
    field(&e.action);
    field(e.subject_type.as_deref().unwrap_or(""));
    field(e.subject_id.as_deref().unwrap_or(""));
    field(e.scope_id.as_deref().unwrap_or(""));
    field(e.detail.as_deref().unwrap_or(""));
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

/// Appends an entry on the connection given, so it commits or rolls back with
/// the change it records.
pub async fn record(conn: &mut SqliteConnection, actor: Option<&str>, entry: Entry<'_>) -> Result<(), sqlx::Error> {
    let last: Option<(i64, String)> = sqlx::query_as("SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1").fetch_optional(&mut *conn).await?;
    let (seq, prev) = match last {
        Some((seq, hash)) => (seq + 1, hash),
        None => (1, genesis()),
    };
    let mut row = AuditEntry {
        seq,
        version: VERSION,
        at: chrono::Utc::now().timestamp_millis(),
        actor: actor.map(str::to_string),
        action: entry.action.to_string(),
        subject_type: entry.subject_type.map(str::to_string),
        subject_id: entry.subject_id.map(str::to_string),
        scope_id: entry.scope_id.map(str::to_string),
        detail: entry.detail,
        prev_hash: prev.clone(),
        hash: String::new(),
    };
    row.hash = digest(&prev, &row);
    sqlx::query(
        "INSERT INTO audit_log (seq, version, at, actor, action, subject_type, subject_id, scope_id, detail, prev_hash, hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(row.seq)
    .bind(row.version)
    .bind(row.at)
    .bind(&row.actor)
    .bind(&row.action)
    .bind(&row.subject_type)
    .bind(&row.subject_id)
    .bind(&row.scope_id)
    .bind(&row.detail)
    .bind(&row.prev_hash)
    .bind(&row.hash)
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// For an event with no transaction of its own.
pub async fn log(pool: &SqlitePool, actor: Option<&str>, entry: Entry<'_>) -> Result<(), sqlx::Error> {
    let mut conn = pool.acquire().await?;
    record(&mut conn, actor, entry).await
}

/// The newest entries first; with a scope, only that record's.
pub async fn recent(pool: &SqlitePool, scope_id: Option<&str>, limit: i64) -> Result<Vec<AuditEntry>, sqlx::Error> {
    let limit = limit.clamp(1, 500);
    match scope_id {
        Some(scope) => sqlx::query_as::<_, AuditEntry>("SELECT * FROM audit_log WHERE scope_id = ? ORDER BY seq DESC LIMIT ?").bind(scope).bind(limit).fetch_all(pool).await,
        None => sqlx::query_as::<_, AuditEntry>("SELECT * FROM audit_log ORDER BY seq DESC LIMIT ?").bind(limit).fetch_all(pool).await,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Verification {
    pub intact: bool,
    pub entries: i64,
    /// The first entry whose place in the chain does not hold.
    pub broken_at: Option<i64>,
}

/// Walks the whole chain and recomputes every hash. A row written in a format
/// this build does not know is reported as broken rather than trusted.
pub async fn verify(pool: &SqlitePool) -> Result<Verification, sqlx::Error> {
    let rows = sqlx::query_as::<_, AuditEntry>("SELECT * FROM audit_log ORDER BY seq ASC").fetch_all(pool).await?;
    let mut prev = genesis();
    let mut expected_seq = rows.first().map(|r| r.seq).unwrap_or(1);
    for row in &rows {
        if row.version != VERSION || row.seq != expected_seq || row.prev_hash != prev || digest(&prev, row) != row.hash {
            return Ok(Verification { intact: false, entries: rows.len() as i64, broken_at: Some(row.seq) });
        }
        prev = row.hash.clone();
        expected_seq += 1;
    }
    Ok(Verification { intact: true, entries: rows.len() as i64, broken_at: None })
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(TABLE_SQL).execute(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn an_empty_trail_is_intact() {
        let verdict = verify(&pool().await).await.unwrap();
        assert!(verdict.intact);
        assert_eq!(verdict.entries, 0);
    }

    #[tokio::test]
    async fn entries_chain_from_a_fixed_genesis_and_verify() {
        let pool = pool().await;
        log(&pool, Some("Hon. A"), Entry::new("case_opened").subject("case", "c1").scope("c1")).await.unwrap();
        log(&pool, None, Entry::new("order_issued").detail("ORD/2026/0001")).await.unwrap();
        let rows = recent(&pool, None, 10).await.unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[1].prev_hash, genesis());
        assert_eq!(rows[0].prev_hash, rows[1].hash);
        assert!(rows.iter().all(|r| r.version == VERSION));
        assert!(verify(&pool).await.unwrap().intact);
    }

    #[tokio::test]
    async fn a_records_history_can_be_read_on_its_own() {
        let pool = pool().await;
        log(&pool, None, Entry::new("a").scope("c1")).await.unwrap();
        log(&pool, None, Entry::new("b").scope("c2")).await.unwrap();
        log(&pool, None, Entry::new("c").scope("c1")).await.unwrap();
        let rows = recent(&pool, Some("c1"), 10).await.unwrap();
        assert_eq!(rows.iter().map(|r| r.action.as_str()).collect::<Vec<_>>(), ["c", "a"]);
    }

    #[tokio::test]
    async fn the_database_refuses_to_edit_or_remove_an_entry() {
        let pool = pool().await;
        log(&pool, None, Entry::new("first")).await.unwrap();
        assert!(sqlx::query("UPDATE audit_log SET action = 'other'").execute(&pool).await.is_err());
        assert!(sqlx::query("DELETE FROM audit_log").execute(&pool).await.is_err());
        assert!(verify(&pool).await.unwrap().intact);
    }

    #[tokio::test]
    async fn an_entry_changed_behind_the_triggers_breaks_the_chain_at_that_entry() {
        let pool = pool().await;
        for action in ["one", "two", "three"] {
            log(&pool, None, Entry::new(action).detail("x")).await.unwrap();
        }
        // Someone with the key drops the guard and rewrites history.
        sqlx::query("DROP TRIGGER audit_log_no_update").execute(&pool).await.unwrap();
        sqlx::query("UPDATE audit_log SET detail = 'changed' WHERE seq = 2").execute(&pool).await.unwrap();
        let verdict = verify(&pool).await.unwrap();
        assert!(!verdict.intact);
        assert_eq!(verdict.broken_at, Some(2));
    }

    #[tokio::test]
    async fn a_row_in_an_unknown_format_is_not_trusted() {
        let pool = pool().await;
        log(&pool, None, Entry::new("one")).await.unwrap();
        sqlx::query("DROP TRIGGER audit_log_no_update").execute(&pool).await.unwrap();
        sqlx::query("UPDATE audit_log SET version = 2").execute(&pool).await.unwrap();
        assert_eq!(verify(&pool).await.unwrap().broken_at, Some(1));
    }

    #[test]
    fn a_value_cannot_pass_for_the_boundary_between_two_fields() {
        let base = AuditEntry {
            seq: 1,
            version: 1,
            at: 1,
            actor: None,
            action: "ab".into(),
            subject_type: Some("c".into()),
            subject_id: None,
            scope_id: None,
            detail: None,
            prev_hash: String::new(),
            hash: String::new(),
        };
        let shifted = AuditEntry { action: "a".into(), subject_type: Some("bc".into()), ..base.clone() };
        assert_ne!(digest("p", &base), digest("p", &shifted));
    }
}
