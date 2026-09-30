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
    let mut conn = pool.acquire().await?;
    record(&mut conn, entry).await
}

pub async fn recent(pool: &SqlitePool, case_id: Option<&str>, limit: i64) -> Result<Vec<AuditEntry>, sqlx::Error> {
    chain::recent(pool, case_id, limit).await
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
