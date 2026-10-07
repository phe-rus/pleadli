//! The criminal register: every criminal matter of the practice on one
//! screen, the way a court's criminal registry sees its cases (the client's
//! CTMS brief): stage, custody, days on remand, adjournments, next hearing.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use super::audit::{self, Entry};
use super::error::{check_timestamp, invalid, DomainError};
use pleadli_node_core::db::begin_write;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CriminalRow {
    pub id: String,
    pub title: String,
    pub our_ref: Option<String>,
    pub court_number: Option<String>,
    pub court_name: Option<String>,
    pub court_level: Option<String>,
    pub offence: Option<String>,
    pub stage: String,
    pub status: String,
    pub engagement: String,
    pub client_id: String,
    pub client_name: String,
    pub custody: Option<String>,
    pub custody_place: Option<String>,
    pub remanded_on: Option<i64>,
    pub committed_on: Option<i64>,
    pub adjournments: i64,
    pub next_hearing_at: Option<i64>,
    pub created_at: i64,
}

pub async fn register(pool: &SqlitePool) -> Result<Vec<CriminalRow>, sqlx::Error> {
    sqlx::query_as::<_, CriminalRow>(
        "SELECT m.id, m.title, m.our_ref, m.court_number, m.court_name, m.court_level, m.offence, m.stage, m.status, m.engagement,
                c.id AS client_id, c.name AS client_name, c.custody, c.custody_place, m.remanded_on, m.committed_on,
                (SELECT COUNT(*) FROM hearings h WHERE h.matter_id = m.id AND h.status = 'adjourned') AS adjournments,
                (SELECT MIN(h.at) FROM hearings h WHERE h.matter_id = m.id AND h.status = 'scheduled') AS next_hearing_at,
                m.created_at
         FROM matters m JOIN clients c ON c.id = m.client_id
         WHERE m.matter_type = 'criminal_defence'
         ORDER BY m.status = 'open' DESC, next_hearing_at IS NULL, next_hearing_at, m.created_at DESC",
    )
    .fetch_all(pool)
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustodyDates {
    pub remanded_on: Option<i64>,
    pub committed_on: Option<i64>,
}

/// Records the day the client was remanded on this charge and the day of committal.
pub async fn set_custody_dates(pool: &SqlitePool, id: &str, input: CustodyDates) -> Result<(), DomainError> {
    for day in [input.remanded_on, input.committed_on].into_iter().flatten() {
        check_timestamp(day, "custody date")?;
        if day > chrono::Utc::now().timestamp_millis() + 86_400_000 {
            return invalid("A custody date cannot be in the future.");
        }
    }
    if let (Some(r), Some(c)) = (input.remanded_on, input.committed_on) {
        if c < r {
            return invalid("Committal cannot come before the remand.");
        }
    }
    let mut tx = begin_write(pool).await?;
    let kind: Option<String> = sqlx::query_scalar("SELECT matter_type FROM matters WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    match kind.as_deref() {
        None => return Err(DomainError::NotFound("That matter was not found.".into())),
        Some("criminal_defence") => {}
        Some(_) => return invalid("Custody dates are kept on criminal matters only."),
    }
    sqlx::query("UPDATE matters SET remanded_on = ?, committed_on = ?, updated_at = ? WHERE id = ?")
        .bind(input.remanded_on)
        .bind(input.committed_on)
        .bind(chrono::Utc::now().timestamp_millis())
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("custody_dates_set").subject("matter", id).scope(id)).await?;
    tx.commit().await?;
    Ok(())
}
