//! The audit trail. The chain itself is `packages/node-core` (`audit`); what is
//! this application's own is who is recorded as acting: the advocate
//! set up in Settings, or nobody until then.

use pleadli_node_core::audit as chain;
use sqlx::{SqliteConnection, SqlitePool};

pub use chain::{AuditEntry, Entry, Verification};

async fn actor(conn: &mut SqliteConnection) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar("SELECT name FROM advocate_profile WHERE id = 'default'").fetch_optional(&mut *conn).await
}

/// Appends an entry on the connection given, so it commits or rolls back with
/// the change it records.
pub async fn record(conn: &mut SqliteConnection, entry: Entry<'_>) -> Result<(), sqlx::Error> {
    let who = actor(conn).await?;
    chain::record(conn, who.as_deref(), entry).await
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
