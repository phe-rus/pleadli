//! The audit trail. The chain itself is `packages/node-core` (`audit`); what is
//! this application's own is who is recorded as acting: the person signed in
//! on the computer the request came from (`request.rs`), or nobody before
//! setup.

use pleadli_node_core::audit as chain;
use sqlx::{SqliteConnection, SqlitePool};

pub use chain::{AuditEntry, Entry, Verification};


/// Appends an entry on the connection given, so it commits or rolls back with
/// the change it records.
pub async fn record(conn: &mut SqliteConnection, entry: Entry<'_>) -> Result<(), sqlx::Error> {
    let who = super::request::actor().map(|a| a.name);
    chain::record(conn, who.as_deref(), entry).await
}

/// Appends an entry on its own, for events that change nothing else (a
/// sign-in, a refused attempt).
pub async fn log(pool: &SqlitePool, entry: Entry<'_>) -> Result<(), sqlx::Error> {
    // Read the last hash, then append: one write lock, so two events at once cannot take the same place.
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    record(&mut tx, entry).await?;
    tx.commit().await
}

/// The trail as the person asking may read it: what was done to a restricted matter, or to anything under it, is left
/// out for anyone not listed for it (the chain itself stays whole, and `verify` still walks every entry).
pub async fn recent(pool: &SqlitePool, case_id: Option<&str>, limit: i64) -> Result<Vec<AuditEntry>, sqlx::Error> {
    let want = limit.clamp(1, 500) as usize;
    if let Some(id) = case_id {
        if super::access::record_hidden(pool, "matter", id).await? {
            return Ok(Vec::new());
        }
    }
    let hidden = super::access::hidden_matters(pool).await?;
    if hidden.is_empty() {
        return chain::recent(pool, case_id, want as i64).await;
    }
    let mut kept = Vec::new();
    let mut known: std::collections::HashMap<(String, String), bool> = std::collections::HashMap::new();
    for entry in chain::recent(pool, case_id, 500).await? {
        if entry.scope_id.as_ref().is_some_and(|s| hidden.contains(s)) {
            continue;
        }
        if let (Some(kind), Some(id)) = (&entry.subject_type, &entry.subject_id) {
            let key = (kind.clone(), id.clone());
            let gone = match known.get(&key) {
                Some(v) => *v,
                None => {
                    let v = super::access::record_hidden(pool, kind, id).await?;
                    known.insert(key, v);
                    v
                }
            };
            if gone {
                continue;
            }
        }
        kept.push(entry);
        if kept.len() == want {
            break;
        }
    }
    Ok(kept)
}

pub async fn verify(pool: &SqlitePool) -> Result<Verification, sqlx::Error> {
    chain::verify(pool).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The migration is the crate's schema, word for word, so this application
    /// and every other one on the chain have the same table and guards.
    #[test]
    fn the_migration_holds_the_crates_table_verbatim() {
        let migration = include_str!("../../migrations/0002_audit_log.sql");
        assert!(migration.contains(chain::TABLE_SQL));
    }
}
