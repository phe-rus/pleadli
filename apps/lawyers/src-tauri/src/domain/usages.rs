//! What the practice does (docs/lawyers/REVIEW-2026-09-30.md, section 4.2).
//! Chosen at setup and changed in Settings. The app shows only the tools of the
//! usages switched on; switching one off hides it and deletes nothing, so the
//! matters it made stay readable.

use serde::Deserialize;
use sqlx::{SqliteConnection, SqlitePool};

use super::audit::{self, Entry};
use super::error::{invalid, DomainError};

pub const USAGES: [&str; 12] = [
    "civil", "criminal", "appeals", "land", "companies", "family", "employment", "advisory", "government", "legal_aid", "oaths", "prosecution",
];

#[derive(Debug, Deserialize)]
pub struct UsagesInput {
    pub usages: Vec<String>,
}

pub async fn list(pool: &SqlitePool) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar("SELECT usage FROM usages ORDER BY enabled_at, usage").fetch_all(pool).await
}

/// The set is checked here: known ids, no repeats, at least one.
pub fn check(usages: &[String]) -> Result<(), DomainError> {
    if usages.is_empty() {
        return invalid("Choose at least one kind of work.");
    }
    for (i, usage) in usages.iter().enumerate() {
        if !USAGES.contains(&usage.as_str()) {
            return invalid("That kind of work is not known.");
        }
        if usages[..i].contains(usage) {
            return invalid("A kind of work is listed twice.");
        }
    }
    Ok(())
}

/// Replaces the set inside a transaction the caller owns. Usages kept keep
/// their original date.
pub async fn replace(conn: &mut SqliteConnection, usages: &[String]) -> Result<(), DomainError> {
    check(usages)?;
    let now = chrono::Utc::now().timestamp_millis();
    let current: Vec<String> = sqlx::query_scalar("SELECT usage FROM usages").fetch_all(&mut *conn).await?;
    for old in current.iter().filter(|u| !usages.contains(u)) {
        sqlx::query("DELETE FROM usages WHERE usage = ?").bind(old).execute(&mut *conn).await?;
    }
    for usage in usages.iter().filter(|u| !current.contains(u)) {
        sqlx::query("INSERT INTO usages (usage, enabled_at) VALUES (?, ?)").bind(usage).bind(now).execute(&mut *conn).await?;
    }
    Ok(())
}

pub async fn set(pool: &SqlitePool, usages: Vec<String>) -> Result<Vec<String>, DomainError> {
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    replace(&mut tx, &usages).await?;
    audit::record(&mut tx, Entry::new("usages_changed").detail(usages.join(", "))).await?;
    tx.commit().await?;
    Ok(list(pool).await?)
}
