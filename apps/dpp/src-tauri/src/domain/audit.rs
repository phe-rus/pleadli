//! The audit trail: an append-only, hash-chained record of the events that
//! matter. Each entry's hash covers the previous entry's hash and its own
//! content, so an entry cannot be altered or removed without the chain no longer
//! verifying, and the database refuses to update or delete a row (migration
//! 0018). It records what happened and who was acting, never the content of a
//! record.

use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqliteConnection, SqlitePool};

const GENESIS: &str = "0000000000000000000000000000000000000000000000000000000000000000";

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub seq: i64,
    pub at: i64,
    pub actor: Option<String>,
    pub action: String,
    pub subject_type: Option<String>,
    pub subject_id: Option<String>,
    pub file_id: Option<String>,
    pub detail: Option<String>,
    pub prev_hash: String,
    pub hash: String,
}

pub struct Entry<'a> {
    pub action: &'a str,
    pub subject_type: Option<&'a str>,
    pub subject_id: Option<&'a str>,
    pub file_id: Option<&'a str>,
    pub detail: Option<String>,
}

impl<'a> Entry<'a> {
    pub fn new(action: &'a str) -> Self {
        Entry { action, subject_type: None, subject_id: None, file_id: None, detail: None }
    }
    pub fn subject(mut self, kind: &'a str, id: &'a str) -> Self {
        self.subject_type = Some(kind);
        self.subject_id = Some(id);
        self
    }
    pub fn file(mut self, id: &'a str) -> Self {
        self.file_id = Some(id);
        self
    }
    pub fn detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }
}

fn digest(prev: &str, e: &AuditEntry) -> String {
    let text = format!(
        "{prev}|{}|{}|{}|{}|{}|{}|{}|{}",
        e.seq,
        e.at,
        e.actor.as_deref().unwrap_or(""),
        e.action,
        e.subject_type.as_deref().unwrap_or(""),
        e.subject_id.as_deref().unwrap_or(""),
        e.file_id.as_deref().unwrap_or(""),
        e.detail.as_deref().unwrap_or("")
    );
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

/// Appends an entry on the connection given, so it commits or rolls back with
/// the change it records.
pub async fn record(conn: &mut SqliteConnection, entry: Entry<'_>) -> Result<(), sqlx::Error> {
    let last: Option<(i64, String)> = sqlx::query_as("SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1").fetch_optional(&mut *conn).await?;
    let (seq, prev) = match last {
        Some((seq, hash)) => (seq + 1, hash),
        None => (1, GENESIS.to_string()),
    };
    let actor: Option<String> = sqlx::query_scalar("SELECT name FROM prosecutor_profile WHERE id = 'default'").fetch_optional(&mut *conn).await?;
    let mut row = AuditEntry {
        seq,
        at: chrono::Utc::now().timestamp_millis(),
        actor,
        action: entry.action.to_string(),
        subject_type: entry.subject_type.map(str::to_string),
        subject_id: entry.subject_id.map(str::to_string),
        file_id: entry.file_id.map(str::to_string),
        detail: entry.detail,
        prev_hash: prev.clone(),
        hash: String::new(),
    };
    row.hash = digest(&prev, &row);
    sqlx::query(
        "INSERT INTO audit_log (seq, at, actor, action, subject_type, subject_id, file_id, detail, prev_hash, hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(row.seq)
    .bind(row.at)
    .bind(&row.actor)
    .bind(&row.action)
    .bind(&row.subject_type)
    .bind(&row.subject_id)
    .bind(&row.file_id)
    .bind(&row.detail)
    .bind(&row.prev_hash)
    .bind(&row.hash)
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// For an event with no transaction of its own.
pub async fn log(pool: &SqlitePool, entry: Entry<'_>) -> Result<(), sqlx::Error> {
    let mut conn = pool.acquire().await?;
    record(&mut conn, entry).await
}

pub async fn recent(pool: &SqlitePool, limit: i64) -> Result<Vec<AuditEntry>, sqlx::Error> {
    sqlx::query_as::<_, AuditEntry>("SELECT * FROM audit_log ORDER BY seq DESC LIMIT ?").bind(limit.clamp(1, 500)).fetch_all(pool).await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Verification {
    pub intact: bool,
    pub entries: i64,
    /// The first entry whose place in the chain does not hold.
    pub broken_at: Option<i64>,
}

/// Walks the whole chain and recomputes every hash.
pub async fn verify(pool: &SqlitePool) -> Result<Verification, sqlx::Error> {
    let rows = sqlx::query_as::<_, AuditEntry>("SELECT * FROM audit_log ORDER BY seq ASC").fetch_all(pool).await?;
    let mut prev = GENESIS.to_string();
    let mut expected_seq = rows.first().map(|r| r.seq).unwrap_or(1);
    for row in &rows {
        if row.seq != expected_seq || row.prev_hash != prev || digest(&prev, row) != row.hash {
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
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn the_database_refuses_to_edit_or_remove_an_entry() {
        let pool = pool().await;
        log(&pool, Entry::new("first")).await.unwrap();
        assert!(sqlx::query("UPDATE audit_log SET action = 'other'").execute(&pool).await.is_err());
        assert!(sqlx::query("DELETE FROM audit_log").execute(&pool).await.is_err());
        assert!(verify(&pool).await.unwrap().intact);
    }

    #[tokio::test]
    async fn an_entry_changed_behind_the_triggers_breaks_the_chain_at_that_entry() {
        let pool = pool().await;
        for action in ["one", "two", "three"] {
            log(&pool, Entry::new(action).detail("x")).await.unwrap();
        }
        assert_eq!(verify(&pool).await.unwrap().entries, 3);
        // Someone with the key drops the guard and rewrites history.
        sqlx::query("DROP TRIGGER audit_log_no_update").execute(&pool).await.unwrap();
        sqlx::query("UPDATE audit_log SET detail = 'changed' WHERE seq = 2").execute(&pool).await.unwrap();
        let verdict = verify(&pool).await.unwrap();
        assert!(!verdict.intact);
        assert_eq!(verdict.broken_at, Some(2));
    }
}
