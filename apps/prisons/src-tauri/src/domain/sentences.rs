//! Sentence and the statutory clocks (docs/prisons/product-map/02 F2.3, W2).
//!
//! What is computed here, and its evidence:
//! * Mandatory bail, Art. 23(6): 60 days (offence triable by the High Court
//!   and a subordinate court) or 180 days (High Court only) on remand. [P]
//!   Not the Prisons Act's own unreformed 120/360.
//! * Remission, s.84: a convicted prisoner serving over one month may earn
//!   remission of one third of the sentence, credited in full at admission
//!   and forfeitable under s.85. [P]
//! * Parole window, s.89: a sentence of 3 or more years, within 6 months of
//!   the release date. [P]
//! * Periodic review, s.88: life or a term over 7 years, at the end of every
//!   four years of imprisonment. [P]
//!
//! Edge cases (fractions of a day, life with a pending Minister's order,
//! how forfeiture is applied in practice) are NEEDS RESEARCH (R-05). Every
//! date shown to an officer is labelled computed and to be checked against
//! the warrant.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::error::DomainError;
use super::prisoners::Prisoner;
use super::time::{add_calendar, now_ms, whole_years_between, DAY_MS};

pub const REMISSION_MIN_LENGTH_DAYS: i64 = 30;
pub const PAROLE_WINDOW_MONTHS: i64 = 6;
pub const S88_CYCLE_YEARS: i64 = 4;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Sentence {
    pub id: String,
    pub prisoner_id: String,
    pub instrument_id: Option<String>,
    pub term_years: i64,
    pub term_months: i64,
    pub term_days: i64,
    pub is_life: bool,
    pub starts_on: i64,
    pub remission_forfeited_days: i64,
    pub superseded_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SentenceEntry {
    pub term_years: i64,
    pub term_months: i64,
    pub term_days: i64,
    pub is_life: bool,
    pub starts_on: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSentenceInput {
    pub prisoner_id: String,
    pub instrument_id: Option<String>,
    pub term_years: i64,
    pub term_months: i64,
    pub term_days: i64,
    pub is_life: bool,
    pub starts_on: i64,
    pub remission_forfeited_days: i64,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Clocks {
    pub days_held: i64,
    pub mandatory_bail_on: Option<i64>,
    pub sentence_ends_on: Option<i64>,
    pub remission_days: Option<i64>,
    pub release_due_on: Option<i64>,
    pub parole_window_opens_on: Option<i64>,
    pub is_life: bool,
    pub reviewable: bool,
}

pub async fn active_for(pool: &SqlitePool, prisoner_id: &str) -> Result<Option<Sentence>, sqlx::Error> {
    sqlx::query_as::<_, Sentence>("SELECT * FROM sentences WHERE prisoner_id = ? AND superseded_at IS NULL")
        .bind(prisoner_id)
        .fetch_optional(pool)
        .await
}

pub async fn list_active(pool: &SqlitePool) -> Result<Vec<Sentence>, sqlx::Error> {
    sqlx::query_as::<_, Sentence>("SELECT * FROM sentences WHERE superseded_at IS NULL").fetch_all(pool).await
}

pub async fn active_for_conn(conn: &mut SqliteConnection, prisoner_id: &str) -> Result<Option<Sentence>, sqlx::Error> {
    sqlx::query_as::<_, Sentence>("SELECT * FROM sentences WHERE prisoner_id = ? AND superseded_at IS NULL")
        .bind(prisoner_id)
        .fetch_optional(&mut *conn)
        .await
}

pub fn compute_clocks(prisoner: &Prisoner, sentence: Option<&Sentence>, now: i64) -> Clocks {
    let mut clocks = Clocks { days_held: ((now - prisoner.admitted_at) / DAY_MS).max(0), ..Clocks::default() };

    if prisoner.status == "unconvicted" {
        let days = if prisoner.high_court_only_offence { 180 } else { 60 };
        clocks.mandatory_bail_on = Some(add_calendar(prisoner.admitted_at, 0, 0, days));
    }

    let Some(sentence) = sentence else { return clocks };
    clocks.is_life = sentence.is_life;

    if sentence.is_life {
        clocks.reviewable = true;
        return clocks;
    }

    let ends = add_calendar(sentence.starts_on, sentence.term_years, sentence.term_months, sentence.term_days);
    let length_days = (ends - sentence.starts_on) / DAY_MS;
    let remission = if length_days > REMISSION_MIN_LENGTH_DAYS { length_days / 3 } else { 0 };
    let release_due = (ends - remission * DAY_MS + sentence.remission_forfeited_days * DAY_MS).clamp(sentence.starts_on, ends);

    clocks.sentence_ends_on = Some(ends);
    clocks.remission_days = Some(remission);
    clocks.release_due_on = Some(release_due);

    if ends >= add_calendar(sentence.starts_on, 3, 0, 0) {
        clocks.parole_window_opens_on = Some(add_calendar(release_due, 0, -PAROLE_WINDOW_MONTHS, 0));
    }
    clocks.reviewable = ends > add_calendar(sentence.starts_on, 7, 0, 0);
    clocks
}

/// The date of the k-th four-yearly review mark (k >= 1).
pub fn review_mark(sentence: &Sentence, k: i64) -> i64 {
    add_calendar(sentence.starts_on, S88_CYCLE_YEARS * k, 0, 0)
}

/// How many four-year marks have already passed.
pub fn review_marks_passed(sentence: &Sentence, now: i64) -> i64 {
    whole_years_between(sentence.starts_on, now) / S88_CYCLE_YEARS
}

/// Records a sentence, superseding any earlier one. Setting a sentence is
/// what makes a prisoner convicted, so the legal status follows it.
pub async fn set_sentence(conn: &mut SqliteConnection, actor: &Actor, input: SetSentenceInput) -> Result<Sentence, DomainError> {
    if !input.is_life && input.term_years + input.term_months + input.term_days <= 0 {
        return Err(DomainError::rejected("Enter the term of the sentence, or mark it as life."));
    }
    if input.term_years < 0 || input.term_months < 0 || input.term_days < 0 || input.remission_forfeited_days < 0 {
        return Err(DomainError::rejected("A sentence term cannot be negative."));
    }

    let previous = active_for_conn(conn, &input.prisoner_id).await?;
    if previous.is_some() && input.reason.as_deref().unwrap_or("").trim().is_empty() {
        return Err(DomainError::rejected("A reason is required to change a recorded sentence."));
    }
    if let Some(prev) = &previous {
        sqlx::query("UPDATE sentences SET superseded_at = ? WHERE id = ?").bind(now_ms()).bind(&prev.id).execute(&mut *conn).await?;
    }

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO sentences
            (id, prisoner_id, instrument_id, term_years, term_months, term_days, is_life, starts_on, remission_forfeited_days)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prisoner_id)
    .bind(&input.instrument_id)
    .bind(input.term_years)
    .bind(input.term_months)
    .bind(input.term_days)
    .bind(input.is_life)
    .bind(input.starts_on)
    .bind(input.remission_forfeited_days)
    .execute(&mut *conn)
    .await?;

    let status: String = sqlx::query_scalar("SELECT status FROM prisoners WHERE id = ?").bind(&input.prisoner_id).fetch_one(&mut *conn).await?;
    if status != "convicted" {
        sqlx::query("UPDATE prisoners SET status = 'convicted' WHERE id = ?").bind(&input.prisoner_id).execute(&mut *conn).await?;
        audit::record(
            conn,
            actor,
            AuditEntry::new("custody.legal_status_changed", "prisoner", Some(&input.prisoner_id))
                .before(&serde_json::json!({ "status": status }))
                .after(&serde_json::json!({ "status": "convicted" }))
                .reason("sentence recorded"),
        )
        .await?;
    }

    let sentence = sqlx::query_as::<_, Sentence>("SELECT * FROM sentences WHERE id = ?").bind(&id).fetch_one(&mut *conn).await?;
    let mut entry = AuditEntry::new("custody.sentence_set", "sentence", Some(&id)).after(&sentence);
    if let Some(prev) = &previous {
        entry = entry.before(prev);
    }
    if let Some(reason) = input.reason.as_deref().filter(|r| !r.trim().is_empty()) {
        entry = entry.reason(reason);
    }
    audit::record(conn, actor, entry).await?;
    Ok(sentence)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Utc};

    fn day(y: i32, m: u32, d: u32) -> i64 {
        // midnight EAT
        Utc.with_ymd_and_hms(y, m, d, 0, 0, 0).unwrap().timestamp_millis() - 3 * 3_600_000
    }

    fn prisoner(status: &str, admitted_at: i64, high_court_only: bool) -> Prisoner {
        Prisoner {
            id: "p".into(),
            episode_id: None,
            first_name: "A".into(),
            last_name: "B".into(),
            other_names: None,
            national_id: None,
            reference: None,
            status: status.into(),
            admission_instrument_type: "remand_warrant".into(),
            admission_authority: None,
            admitted_at,
            current_status: "in_custody".into(),
            high_court_only_offence: high_court_only,
            current_location: None,
            date_of_birth: None,
            sex: None,
            education_level: None,
            nationality: None,
            offence: None,
            documents_pending: false,
            pending_document_type: None,
            notes: None,
            created_at: admitted_at,
        }
    }

    fn sentence(years: i64, months: i64, days: i64, starts_on: i64) -> Sentence {
        Sentence {
            id: "s".into(),
            prisoner_id: "p".into(),
            instrument_id: None,
            term_years: years,
            term_months: months,
            term_days: days,
            is_life: false,
            starts_on,
            remission_forfeited_days: 0,
            superseded_at: None,
            created_at: starts_on,
        }
    }

    #[test]
    fn mandatory_bail_uses_the_constitutional_thresholds() {
        let admitted = day(2026, 1, 1);
        let both = compute_clocks(&prisoner("unconvicted", admitted, false), None, admitted);
        let high = compute_clocks(&prisoner("unconvicted", admitted, true), None, admitted);
        assert_eq!(both.mandatory_bail_on, Some(day(2026, 3, 2)));
        assert_eq!(high.mandatory_bail_on, Some(day(2026, 6, 30)));
    }

    #[test]
    fn one_third_remission_brings_the_release_date_forward() {
        let start = day(2026, 1, 1);
        let clocks = compute_clocks(&prisoner("convicted", start, false), Some(&sentence(3, 0, 0, start)), start);
        assert_eq!(clocks.sentence_ends_on, Some(day(2029, 1, 1)));
        let remission = clocks.remission_days.unwrap();
        assert_eq!(remission, 365 * 3 / 3 + 0); // 1096 days / 3
        assert!(clocks.release_due_on.unwrap() < clocks.sentence_ends_on.unwrap());
        assert!(clocks.parole_window_opens_on.is_some(), "3 years qualifies for the parole window");
        assert!(!clocks.reviewable, "3 years is not over 7");
    }

    #[test]
    fn a_sentence_of_a_month_or_less_earns_no_remission() {
        let start = day(2026, 1, 1);
        let clocks = compute_clocks(&prisoner("convicted", start, false), Some(&sentence(0, 0, 30, start)), start);
        assert_eq!(clocks.remission_days, Some(0));
        assert_eq!(clocks.release_due_on, clocks.sentence_ends_on);
    }
}
