//! A sitting is one appearance of a case before the court. It is scheduled and
//! then closed in exactly one of three ways: held, adjourned (with a structured
//! reason) or cancelled. The rules for that are here, not in the screen, so no
//! client can close a sitting by silence.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::cases::require_open_case;
use super::error::{check_date, clean, invalid, DomainError};
use pleadli_node_core::db::begin_write;

pub const PURPOSES: [&str; 8] = ["mention", "plea", "bail_application", "hearing", "ruling", "judgment", "sentencing", "other"];
pub const REASONS: [&str; 6] = ["witness_absent", "prisoner_not_produced", "file_incomplete", "counsel_absent", "court_not_sitting", "other"];
pub const RESPONSIBLE: [&str; 7] = ["prosecution", "defence", "court", "prisons", "police", "witness", "other"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Sitting {
    pub id: String,
    pub case_id: String,
    pub scheduled_at: i64,
    pub purpose: String,
    pub courtroom: Option<String>,
    pub status: String,
    pub outcome: Option<String>,
    pub closed_at: Option<i64>,
    pub note: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Adjournment {
    pub id: String,
    pub sitting_id: String,
    pub case_id: String,
    pub reason: String,
    pub responsible: String,
    pub note: Option<String>,
    pub next_date: Option<i64>,
    pub next_sitting_id: Option<String>,
    pub recorded_at: i64,
}

/// One line of a cause list: the sitting with the case it is for.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CauseListRow {
    pub id: String,
    pub case_id: String,
    pub scheduled_at: i64,
    pub purpose: String,
    pub courtroom: Option<String>,
    pub status: String,
    pub outcome: Option<String>,
    pub court_number: String,
    pub case_title: String,
    pub offence: Option<String>,
    pub accused: Option<String>,
    /// Someone in the case is held on remand, so the prison must produce them.
    pub has_remand: bool,
    /// How many times this case has been adjourned before.
    pub adjournments: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SittingInput {
    pub scheduled_at: i64,
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
    /// When the court fixed the next date at the time. Empty means the date is
    /// still to be fixed, which stays an open item.
    pub next_date: Option<i64>,
    /// Defaults to the purpose of the sitting being adjourned.
    pub next_purpose: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Adjourned {
    pub adjournment: Adjournment,
    pub next_sitting: Option<Sitting>,
}

const SITTING_COLUMNS: &str = "id, case_id, scheduled_at, purpose, courtroom, status, outcome, closed_at, note, created_at";

fn check_input(input: &SittingInput) -> Result<(), DomainError> {
    check_date(input.scheduled_at, "The sitting date")?;
    if !PURPOSES.contains(&input.purpose.as_str()) {
        return invalid("That is not a purpose a sitting can have.");
    }
    Ok(())
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Sitting>, sqlx::Error> {
    sqlx::query_as::<_, Sitting>(sqlx::AssertSqlSafe(format!("SELECT {SITTING_COLUMNS} FROM sittings WHERE id = ?"))).bind(id).fetch_optional(pool).await
}

pub async fn list_for_case(pool: &SqlitePool, case_id: &str) -> Result<Vec<Sitting>, sqlx::Error> {
    sqlx::query_as::<_, Sitting>(sqlx::AssertSqlSafe(format!("SELECT {SITTING_COLUMNS} FROM sittings WHERE case_id = ? ORDER BY scheduled_at DESC"))).bind(case_id).fetch_all(pool).await
}

pub async fn adjournments_for_case(pool: &SqlitePool, case_id: &str) -> Result<Vec<Adjournment>, sqlx::Error> {
    sqlx::query_as::<_, Adjournment>(
        "SELECT id, sitting_id, case_id, reason, responsible, note, next_date, next_sitting_id, recorded_at FROM adjournments WHERE case_id = ? ORDER BY recorded_at DESC",
    )
    .bind(case_id)
    .fetch_all(pool)
    .await
}

pub async fn schedule(pool: &SqlitePool, case_id: &str, input: SittingInput) -> Result<Sitting, DomainError> {
    check_input(&input)?;
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    require_open_case(&mut tx, case_id).await?;
    insert(&mut tx, &id, case_id, &input).await?;
    audit::record(&mut tx, Entry::new("sitting_scheduled").subject("sitting", &id).scope(case_id).detail(&input.purpose)).await?;
    tx.commit().await?;
    Ok(get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

async fn insert(conn: &mut sqlx::SqliteConnection, id: &str, case_id: &str, input: &SittingInput) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO sittings (id, case_id, scheduled_at, purpose, courtroom, note) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id)
        .bind(case_id)
        .bind(input.scheduled_at)
        .bind(&input.purpose)
        .bind(clean(input.courtroom.clone()))
        .bind(clean(input.note.clone()))
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// Only a sitting still to come can be moved; a closed one is a record.
async fn scheduled(conn: &mut sqlx::SqliteConnection, id: &str) -> Result<Sitting, DomainError> {
    let sitting = sqlx::query_as::<_, Sitting>(sqlx::AssertSqlSafe(format!("SELECT {SITTING_COLUMNS} FROM sittings WHERE id = ?"))).bind(id).fetch_optional(&mut *conn).await?;
    let Some(sitting) = sitting else { return Err(DomainError::NotFound("Sitting not found.".to_string())) };
    if sitting.status != "scheduled" {
        return invalid("This sitting is already closed.");
    }
    Ok(sitting)
}

pub async fn reschedule(pool: &SqlitePool, id: &str, input: SittingInput) -> Result<Sitting, DomainError> {
    check_input(&input)?;
    let mut tx = begin_write(pool).await?;
    let sitting = scheduled(&mut tx, id).await?;
    sqlx::query("UPDATE sittings SET scheduled_at = ?, purpose = ?, courtroom = ?, note = ? WHERE id = ?")
        .bind(input.scheduled_at)
        .bind(&input.purpose)
        .bind(clean(input.courtroom))
        .bind(clean(input.note))
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("sitting_rescheduled").subject("sitting", id).scope(&sitting.case_id)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// The sitting took place. What was done is required: a held sitting with
/// nothing recorded is the silence this product exists to end.
pub async fn hold(pool: &SqlitePool, id: &str, outcome: &str) -> Result<Sitting, DomainError> {
    let outcome = outcome.trim();
    if outcome.is_empty() {
        return invalid("Record what was done at the sitting.");
    }
    let mut tx = begin_write(pool).await?;
    let sitting = scheduled(&mut tx, id).await?;
    sqlx::query("UPDATE sittings SET status = 'held', outcome = ?, closed_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?")
        .bind(outcome)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("sitting_held").subject("sitting", id).scope(&sitting.case_id)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn cancel(pool: &SqlitePool, id: &str, note: Option<String>) -> Result<Sitting, DomainError> {
    let mut tx = begin_write(pool).await?;
    let sitting = scheduled(&mut tx, id).await?;
    sqlx::query("UPDATE sittings SET status = 'cancelled', outcome = ?, closed_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?")
        .bind(clean(note))
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("sitting_cancelled").subject("sitting", id).scope(&sitting.case_id)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// The sitting did not go ahead as planned. The reason and who is responsible
/// are required as fields, `other` needs words, and if the next date was fixed
/// the next sitting is scheduled in the same step.
pub async fn adjourn(pool: &SqlitePool, id: &str, input: AdjournInput) -> Result<Adjourned, DomainError> {
    if !REASONS.contains(&input.reason.as_str()) {
        return invalid("Choose why the sitting was adjourned.");
    }
    if !RESPONSIBLE.contains(&input.responsible.as_str()) {
        return invalid("Choose who is responsible for the adjournment.");
    }
    let note = clean(input.note.clone());
    if input.reason == "other" && note.is_none() {
        return invalid("Say in words why the sitting was adjourned.");
    }
    let mut tx = begin_write(pool).await?;
    let sitting = scheduled(&mut tx, id).await?;
    if let Some(next) = input.next_date {
        check_date(next, "The next date")?;
        if next <= sitting.scheduled_at {
            return invalid("The next date must be after this sitting.");
        }
    }
    let next_purpose = input.next_purpose.clone().unwrap_or_else(|| sitting.purpose.clone());
    if !PURPOSES.contains(&next_purpose.as_str()) {
        return invalid("That is not a purpose a sitting can have.");
    }

    let next_sitting_id = match input.next_date {
        Some(next) => {
            let next_id = Uuid::new_v4().to_string();
            let next_input = SittingInput { scheduled_at: next, purpose: next_purpose, courtroom: sitting.courtroom.clone(), note: None };
            insert(&mut tx, &next_id, &sitting.case_id, &next_input).await?;
            audit::record(&mut tx, Entry::new("sitting_scheduled").subject("sitting", &next_id).scope(&sitting.case_id).detail("from an adjournment")).await?;
            Some(next_id)
        }
        None => None,
    };
    let adjournment_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO adjournments (id, sitting_id, case_id, reason, responsible, note, next_date, next_sitting_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&adjournment_id)
        .bind(id)
        .bind(&sitting.case_id)
        .bind(&input.reason)
        .bind(&input.responsible)
        .bind(&note)
        .bind(input.next_date)
        .bind(&next_sitting_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE sittings SET status = 'adjourned', closed_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?").bind(id).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("sitting_adjourned").subject("sitting", id).scope(&sitting.case_id).detail(format!("{} / {}", input.reason, input.responsible))).await?;
    tx.commit().await?;

    let adjournment = sqlx::query_as::<_, Adjournment>(
        "SELECT id, sitting_id, case_id, reason, responsible, note, next_date, next_sitting_id, recorded_at FROM adjournments WHERE id = ?",
    )
    .bind(&adjournment_id)
    .fetch_one(pool)
    .await?;
    let next_sitting = match &next_sitting_id {
        Some(next_id) => get(pool, next_id).await?,
        None => None,
    };
    Ok(Adjourned { adjournment, next_sitting })
}

/// The sittings whose time falls in `[from, to)`, earliest first, cancelled ones
/// left out. The caller supplies the day's bounds, because a day is the
/// court's local day, not the database's.
pub async fn cause_list(pool: &SqlitePool, from: i64, to: i64) -> Result<Vec<CauseListRow>, sqlx::Error> {
    sqlx::query_as::<_, CauseListRow>(
        "SELECT s.id, s.case_id, s.scheduled_at, s.purpose, s.courtroom, s.status, s.outcome,
            c.court_number, c.title AS case_title, c.offence,
            (SELECT group_concat(p.name, '; ') FROM case_parties p WHERE p.case_id = c.id AND p.role = 'accused') AS accused,
            EXISTS (SELECT 1 FROM case_parties p WHERE p.case_id = c.id AND p.role = 'accused' AND p.custody = 'remanded') AS has_remand,
            (SELECT COUNT(*) FROM adjournments a WHERE a.case_id = c.id) AS adjournments
         FROM sittings s JOIN cases c ON c.id = s.case_id
         WHERE s.scheduled_at >= ? AND s.scheduled_at < ? AND s.status <> 'cancelled'
         ORDER BY s.scheduled_at, c.court_number",
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await
}
