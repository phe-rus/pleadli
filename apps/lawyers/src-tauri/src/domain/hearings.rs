//! The advocate's diary of hearings. A hearing is scheduled and then closed as
//! attended (what happened is required), adjourned (a structured reason and
//! responsible party, the same words the court uses, and the next date if it was
//! fixed), missed (the advocate was not there) or cancelled. Nothing is closed by
//! silence. For a state-appointed matter, scheduling a trial hearing also makes
//! the certificate-of-trial-readiness task (`tasks`).

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{check_date, clean, invalid, DomainError};
use super::matters::require_open;
use super::tasks;
use pleadli_node_core::db::begin_write;

pub const PURPOSES: [&str; 8] = ["mention", "plea", "bail_application", "hearing", "ruling", "judgment", "sentencing", "other"];
pub const REASONS: [&str; 6] = ["witness_absent", "prisoner_not_produced", "file_incomplete", "counsel_absent", "court_not_sitting", "other"];
pub const RESPONSIBLE: [&str; 7] = ["prosecution", "defence", "court", "prisons", "police", "witness", "other"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Hearing {
    pub id: String,
    pub matter_id: String,
    pub at: i64,
    pub purpose: String,
    pub courtroom: Option<String>,
    pub status: String,
    pub outcome: Option<String>,
    pub adjourn_reason: Option<String>,
    pub adjourn_responsible: Option<String>,
    pub next_date: Option<i64>,
    pub note: Option<String>,
    pub closed_at: Option<i64>,
    pub created_at: i64,
}

/// A hearing in the diary, with the matter it belongs to.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DiaryRow {
    pub id: String,
    pub matter_id: String,
    pub at: i64,
    pub purpose: String,
    pub courtroom: Option<String>,
    pub status: String,
    pub outcome: Option<String>,
    pub matter_title: String,
    pub court_number: Option<String>,
    pub court_name: Option<String>,
    pub client_name: String,
    pub client_custody: Option<String>,
    pub engagement: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HearingInput {
    pub at: i64,
    pub purpose: String,
    pub courtroom: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdjournInput {
    pub reason: String,
    pub responsible: String,
    pub note: Option<String>,
    pub next_date: Option<i64>,
    pub next_purpose: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Adjourned {
    pub hearing: Hearing,
    pub next_hearing: Option<Hearing>,
}

const COLUMNS: &str = "id, matter_id, at, purpose, courtroom, status, outcome, adjourn_reason, adjourn_responsible, next_date, note, closed_at, created_at";

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Hearing>, sqlx::Error> {
    sqlx::query_as::<_, Hearing>(sqlx::AssertSqlSafe(format!("SELECT {COLUMNS} FROM hearings WHERE id = ?"))).bind(id).fetch_optional(pool).await
}

pub async fn list_for_matter(pool: &SqlitePool, matter_id: &str) -> Result<Vec<Hearing>, sqlx::Error> {
    sqlx::query_as::<_, Hearing>(sqlx::AssertSqlSafe(format!("SELECT {COLUMNS} FROM hearings WHERE matter_id = ? ORDER BY at DESC"))).bind(matter_id).fetch_all(pool).await
}

/// The hearings falling in `[from, to)`, earliest first, cancelled ones left out.
pub async fn diary(pool: &SqlitePool, from: i64, to: i64) -> Result<Vec<DiaryRow>, sqlx::Error> {
    sqlx::query_as::<_, DiaryRow>(
        "SELECT h.id, h.matter_id, h.at, h.purpose, h.courtroom, h.status, h.outcome, m.title AS matter_title, m.court_number, m.court_name,
            c.name AS client_name, c.custody AS client_custody, m.engagement
         FROM hearings h JOIN matters m ON m.id = h.matter_id JOIN clients c ON c.id = m.client_id
         WHERE h.at >= ? AND h.at < ? AND h.status <> 'cancelled'
         ORDER BY h.at, m.court_number",
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await
}

fn check_input(input: &HearingInput) -> Result<(), DomainError> {
    check_date(input.at, "The hearing date")?;
    if !PURPOSES.contains(&input.purpose.as_str()) {
        return invalid("That is not a purpose a hearing can have.");
    }
    Ok(())
}

async fn insert(conn: &mut sqlx::SqliteConnection, id: &str, matter_id: &str, input: &HearingInput, engagement: &str) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO hearings (id, matter_id, at, purpose, courtroom, note) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id)
        .bind(matter_id)
        .bind(input.at)
        .bind(&input.purpose)
        .bind(clean(input.courtroom.clone()))
        .bind(clean(input.note.clone()))
        .execute(&mut *conn)
        .await?;
    tasks::apply_hearing_rules(conn, matter_id, id, engagement, &input.purpose, input.at).await
}

pub async fn schedule(pool: &SqlitePool, matter_id: &str, input: HearingInput) -> Result<Hearing, DomainError> {
    check_input(&input)?;
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    let (engagement, _) = require_open(&mut tx, matter_id).await?;
    insert(&mut tx, &id, matter_id, &input, &engagement).await?;
    audit::record(&mut tx, Entry::new("hearing_scheduled").subject("hearing", &id).scope(matter_id).detail(&input.purpose)).await?;
    tx.commit().await?;
    Ok(get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// Only a hearing still to come can be moved; a closed one is a record.
async fn scheduled(conn: &mut sqlx::SqliteConnection, id: &str) -> Result<Hearing, DomainError> {
    let hearing = sqlx::query_as::<_, Hearing>(sqlx::AssertSqlSafe(format!("SELECT {COLUMNS} FROM hearings WHERE id = ?"))).bind(id).fetch_optional(&mut *conn).await?;
    let Some(hearing) = hearing else { return Err(DomainError::NotFound("Hearing not found.".to_string())) };
    if hearing.status != "scheduled" {
        return invalid("This hearing is already closed.");
    }
    Ok(hearing)
}

pub async fn reschedule(pool: &SqlitePool, id: &str, input: HearingInput) -> Result<Hearing, DomainError> {
    check_input(&input)?;
    let mut tx = begin_write(pool).await?;
    let hearing = scheduled(&mut tx, id).await?;
    sqlx::query("UPDATE hearings SET at = ?, purpose = ?, courtroom = ?, note = ? WHERE id = ?").bind(input.at).bind(&input.purpose).bind(clean(input.courtroom)).bind(clean(input.note)).bind(id).execute(&mut *tx).await?;
    // The readiness task follows the hearing: gone if it is no longer a trial
    // hearing, moved to the new day if it still is.
    tasks::drop_hearing_rule_tasks(&mut tx, id).await?;
    let engagement: String = sqlx::query_scalar("SELECT engagement FROM matters WHERE id = ?").bind(&hearing.matter_id).fetch_one(&mut *tx).await?;
    tasks::apply_hearing_rules(&mut tx, &hearing.matter_id, id, &engagement, &input.purpose, input.at).await?;
    audit::record(&mut tx, Entry::new("hearing_rescheduled").subject("hearing", id).scope(&hearing.matter_id)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

async fn close_as(pool: &SqlitePool, id: &str, status: &str, outcome: Option<String>, action: &str) -> Result<Hearing, DomainError> {
    let mut tx = begin_write(pool).await?;
    let hearing = scheduled(&mut tx, id).await?;
    sqlx::query("UPDATE hearings SET status = ?, outcome = ?, closed_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?").bind(status).bind(outcome).bind(id).execute(&mut *tx).await?;
    if status != "attended" {
        tasks::drop_hearing_rule_tasks(&mut tx, id).await?;
    }
    audit::record(&mut tx, Entry::new(action).subject("hearing", id).scope(&hearing.matter_id)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// The advocate attended. What was done is required.
pub async fn attend(pool: &SqlitePool, id: &str, outcome: &str) -> Result<Hearing, DomainError> {
    let outcome = outcome.trim();
    if outcome.is_empty() {
        return invalid("Record what was done at the hearing.");
    }
    close_as(pool, id, "attended", Some(outcome.to_string()), "hearing_attended").await
}

/// The advocate was not at the hearing. Recorded as it is, with a note.
pub async fn miss(pool: &SqlitePool, id: &str, note: Option<String>) -> Result<Hearing, DomainError> {
    close_as(pool, id, "missed", clean(note), "hearing_missed").await
}

pub async fn cancel(pool: &SqlitePool, id: &str, note: Option<String>) -> Result<Hearing, DomainError> {
    close_as(pool, id, "cancelled", clean(note), "hearing_cancelled").await
}

/// The hearing did not go ahead. The reason and who is responsible are fields;
/// `other` needs words; a next date fixed at the time schedules the next hearing.
pub async fn adjourn(pool: &SqlitePool, id: &str, input: AdjournInput) -> Result<Adjourned, DomainError> {
    if !REASONS.contains(&input.reason.as_str()) {
        return invalid("Choose why the hearing was adjourned.");
    }
    if !RESPONSIBLE.contains(&input.responsible.as_str()) {
        return invalid("Choose who is responsible for the adjournment.");
    }
    let note = clean(input.note.clone());
    if input.reason == "other" && note.is_none() {
        return invalid("Say in words why the hearing was adjourned.");
    }
    let mut tx = begin_write(pool).await?;
    let hearing = scheduled(&mut tx, id).await?;
    if let Some(next) = input.next_date {
        check_date(next, "The next date")?;
        if next <= hearing.at {
            return invalid("The next date must be after this hearing.");
        }
    }
    let next_purpose = input.next_purpose.clone().unwrap_or_else(|| hearing.purpose.clone());
    if !PURPOSES.contains(&next_purpose.as_str()) {
        return invalid("That is not a purpose a hearing can have.");
    }
    let engagement: String = sqlx::query_scalar("SELECT engagement FROM matters WHERE id = ?").bind(&hearing.matter_id).fetch_one(&mut *tx).await?;
    let next_id = match input.next_date {
        Some(next) => {
            let next_id = Uuid::new_v4().to_string();
            let next_input = HearingInput { at: next, purpose: next_purpose, courtroom: hearing.courtroom.clone(), note: None };
            insert(&mut tx, &next_id, &hearing.matter_id, &next_input, &engagement).await?;
            Some(next_id)
        }
        None => None,
    };
    sqlx::query("UPDATE hearings SET status = 'adjourned', adjourn_reason = ?, adjourn_responsible = ?, next_date = ?, outcome = ?, closed_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?")
        .bind(&input.reason)
        .bind(&input.responsible)
        .bind(input.next_date)
        .bind(&note)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tasks::drop_hearing_rule_tasks(&mut tx, id).await?;
    audit::record(&mut tx, Entry::new("hearing_adjourned").subject("hearing", id).scope(&hearing.matter_id).detail(format!("{} / {}", input.reason, input.responsible))).await?;
    tx.commit().await?;
    let closed = get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    let next_hearing = match next_id {
        Some(next_id) => get(pool, &next_id).await?,
        None => None,
    };
    Ok(Adjourned { hearing: closed, next_hearing })
}
