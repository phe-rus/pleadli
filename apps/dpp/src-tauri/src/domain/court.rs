//! A file in court: its hearings (dated events), its filings (what was lodged
//! where, with the receipt), and the Calendar that gathers every dated thing
//! the office must attend to.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::error::{clean, invalid, DomainError};

pub const HEARING_KINDS: &[&str] = &["mention", "plea", "bail", "hearing", "trial", "ruling", "judgment", "sentence", "other"];
const DAY_MS: i64 = 86_400_000;
/// The Threshold Test decision is reviewed within 14 days (ODPP Decision to
/// Charge Guidelines 2023; see workload.rs).
const THRESHOLD_REVIEW_DAYS: i64 = 14;

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Hearing {
    pub id: String,
    pub prosecution_file_id: String,
    pub court: String,
    pub kind: String,
    pub starts_at: i64,
    pub outcome: Option<String>,
    pub note: Option<String>,
    pub created_by: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HearingInput {
    pub prosecution_file_id: String,
    pub court: String,
    pub kind: String,
    pub starts_at: i64,
    pub outcome: Option<String>,
    pub note: Option<String>,
}

fn check_hearing(input: &HearingInput) -> Result<(), DomainError> {
    if input.court.trim().is_empty() {
        return invalid("Say which court.");
    }
    if !HEARING_KINDS.contains(&input.kind.as_str()) {
        return invalid("That is not a kind of hearing.");
    }
    if input.starts_at <= 0 {
        return invalid("The hearing needs a date.");
    }
    Ok(())
}

pub async fn hearings_for_file(pool: &SqlitePool, file_id: &str) -> Result<Vec<Hearing>, sqlx::Error> {
    sqlx::query_as("SELECT * FROM hearings WHERE prosecution_file_id = ? ORDER BY starts_at").bind(file_id).fetch_all(pool).await
}

pub async fn create_hearing(pool: &SqlitePool, input: HearingInput, actor: Option<&str>) -> Result<Hearing, DomainError> {
    check_hearing(&input)?;
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO hearings (id, prosecution_file_id, court, kind, starts_at, outcome, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&input.prosecution_file_id)
        .bind(input.court.trim())
        .bind(&input.kind)
        .bind(input.starts_at)
        .bind(clean(input.outcome))
        .bind(clean(input.note))
        .bind(actor)
        .bind(now())
        .execute(pool)
        .await?;
    Ok(sqlx::query_as("SELECT * FROM hearings WHERE id = ?").bind(&id).fetch_one(pool).await?)
}

pub async fn update_hearing(pool: &SqlitePool, id: &str, input: HearingInput) -> Result<Hearing, DomainError> {
    check_hearing(&input)?;
    let found = sqlx::query("UPDATE hearings SET court = ?, kind = ?, starts_at = ?, outcome = ?, note = ? WHERE id = ?")
        .bind(input.court.trim())
        .bind(&input.kind)
        .bind(input.starts_at)
        .bind(clean(input.outcome))
        .bind(clean(input.note))
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    if found == 0 {
        return Err(DomainError::NotFound("Hearing not found.".into()));
    }
    Ok(sqlx::query_as("SELECT * FROM hearings WHERE id = ?").bind(id).fetch_one(pool).await?)
}

pub async fn delete_hearing(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    sqlx::query("DELETE FROM hearings WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Filing {
    pub id: String,
    pub prosecution_file_id: String,
    pub what: String,
    pub court: String,
    pub filed_at: i64,
    pub receipt: Option<String>,
    pub document_id: Option<String>,
    pub note: Option<String>,
    pub created_by: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilingInput {
    pub prosecution_file_id: String,
    pub what: String,
    pub court: String,
    pub filed_at: i64,
    pub receipt: Option<String>,
    pub document_id: Option<String>,
    pub note: Option<String>,
}

pub async fn filings_for_file(pool: &SqlitePool, file_id: &str) -> Result<Vec<Filing>, sqlx::Error> {
    sqlx::query_as("SELECT * FROM filings WHERE prosecution_file_id = ? ORDER BY filed_at DESC").bind(file_id).fetch_all(pool).await
}

pub async fn create_filing(pool: &SqlitePool, input: FilingInput, actor: Option<&str>) -> Result<Filing, DomainError> {
    if input.what.trim().is_empty() {
        return invalid("Say what was filed.");
    }
    if input.court.trim().is_empty() {
        return invalid("Say which court.");
    }
    super::error::check_timestamp(input.filed_at, "The filing date")?;
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO filings (id, prosecution_file_id, what, court, filed_at, receipt, document_id, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&input.prosecution_file_id)
        .bind(input.what.trim())
        .bind(input.court.trim())
        .bind(input.filed_at)
        .bind(clean(input.receipt))
        .bind(clean(input.document_id))
        .bind(clean(input.note))
        .bind(actor)
        .bind(now())
        .execute(pool)
        .await?;
    Ok(sqlx::query_as("SELECT * FROM filings WHERE id = ?").bind(&id).fetch_one(pool).await?)
}

pub async fn delete_filing(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    sqlx::query("DELETE FROM filings WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}

/// One dated thing on the Calendar, whatever it comes from.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEntry {
    /// `hearing`, `task` or `threshold_review`.
    pub source: String,
    pub id: String,
    pub at: i64,
    /// The hearing kind, or the task's column.
    pub kind: Option<String>,
    pub title: String,
    pub detail: Option<String>,
    pub file_id: Option<String>,
    pub file_title: Option<String>,
    pub file_reference: Option<String>,
}

/// Everything dated between `from` and `to` (milliseconds).
pub async fn calendar(pool: &SqlitePool, from: i64, to: i64) -> Result<Vec<CalendarEntry>, sqlx::Error> {
    let mut entries: Vec<CalendarEntry> = sqlx::query_as(
        "SELECT 'hearing' AS source, h.id, h.starts_at AS at, h.kind, h.court AS title, h.outcome AS detail,
                f.id AS file_id, f.title AS file_title, COALESCE(f.odpp_registration_number, f.police_reference) AS file_reference
           FROM hearings h JOIN prosecution_files f ON f.id = h.prosecution_file_id
          WHERE h.starts_at BETWEEN ?1 AND ?2
         UNION ALL
         SELECT 'task', t.id, t.due_at, t.status, t.title, t.note,
                f.id, f.title, COALESCE(f.odpp_registration_number, f.police_reference)
           FROM tasks t LEFT JOIN prosecution_files f ON f.id = t.prosecution_file_id
          WHERE t.due_at BETWEEN ?1 AND ?2 AND t.proposed = 0",
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;

    let reviews: Vec<(String, String, Option<String>, i64)> = sqlx::query_as(
        "SELECT d.prosecution_file_id, f.title, COALESCE(f.odpp_registration_number, f.police_reference), d.decided_at
           FROM decisions d JOIN prosecution_files f ON f.id = d.prosecution_file_id
          WHERE d.decision_type = 'threshold_charge'
            AND d.id = (SELECT d2.id FROM decisions d2 WHERE d2.prosecution_file_id = d.prosecution_file_id
                         ORDER BY d2.decided_at DESC, d2.created_at DESC, d2.rowid DESC LIMIT 1)",
    )
    .fetch_all(pool)
    .await?;
    for (file_id, title, reference, decided_at) in reviews {
        let due = decided_at + THRESHOLD_REVIEW_DAYS * DAY_MS;
        if due >= from && due <= to {
            entries.push(CalendarEntry {
                source: "threshold_review".into(),
                id: format!("threshold:{file_id}"),
                at: due,
                kind: None,
                title: title.clone(),
                detail: None,
                file_id: Some(file_id),
                file_title: Some(title),
                file_reference: reference,
            });
        }
    }
    entries.sort_by_key(|e| e.at);
    Ok(entries)
}
