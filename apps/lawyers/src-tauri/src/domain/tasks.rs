//! Tasks and the dates the state-funded scheme puts on an appointed advocate.
//!
//! The Judicature (Legal Representation at the Expense of the State) Rules, 2022,
//! Rule 13 (read in primary text in docs/lawyers/RESEARCH.md, section 4), require
//! an appointed advocate to meet the accused and confirm the meeting to the court
//! in writing within 2 working days, and to submit a certificate of trial
//! readiness, completed jointly with the prosecutor, within 5 working days before
//! the hearing. This module turns those two duties into tasks with due days when
//! a matter is state-appointed, so they are not left to memory.
//!
//! Working days here are Monday to Friday. Public holidays are NOT excluded (no
//! list of them is held), so a due day can fall a day or more later than the
//! Rules would count when a holiday intervenes; the screens say so. From which
//! day the 2 working days run is read as the day of appointment; the Rules'
//! wording should be checked before anyone relies on the exact day.

use chrono::{Datelike, Duration, FixedOffset, NaiveDate, Weekday};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::error::{check_date, clean, invalid, DomainError};
use pleadli_node_core::db::begin_write;

/// East Africa Time, UTC+3, which Uganda keeps all year.
fn eat() -> FixedOffset {
    FixedOffset::east_opt(3 * 3600).expect("a valid offset")
}

fn eat_date(ms: i64) -> Option<NaiveDate> {
    chrono::DateTime::from_timestamp_millis(ms).map(|t| t.with_timezone(&eat()).date_naive())
}

/// The start of a local day, as milliseconds.
pub fn day_start(date: NaiveDate) -> i64 {
    date.and_hms_opt(0, 0, 0).expect("midnight").and_utc().timestamp_millis() - 3 * 3600 * 1000
}

/// `n` working days after `from` (before it if `n` is negative), as the start of
/// that local day. Saturdays and Sundays are skipped; holidays are not.
pub fn add_working_days(from: i64, n: i64) -> i64 {
    let Some(mut date) = eat_date(from) else { return from };
    let step = if n >= 0 { 1 } else { -1 };
    let mut left = n.abs();
    while left > 0 {
        date = date + Duration::days(step);
        if !matches!(date.weekday(), Weekday::Sat | Weekday::Sun) {
            left -= 1;
        }
    }
    day_start(date)
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub matter_id: Option<String>,
    pub hearing_id: Option<String>,
    pub title: String,
    pub detail: Option<String>,
    pub due_on: Option<i64>,
    pub done_at: Option<i64>,
    pub source: String,
    pub rule_key: Option<String>,
    pub created_at: i64,
    pub matter_title: Option<String>,
    pub court_number: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub matter_id: Option<String>,
    pub title: String,
    pub detail: Option<String>,
    pub due_on: Option<i64>,
}

const SELECT: &str = "SELECT t.id, t.matter_id, t.hearing_id, t.title, t.detail, t.due_on, t.done_at, t.source, t.rule_key, t.created_at,
        m.title AS matter_title, m.court_number
    FROM tasks t LEFT JOIN matters m ON m.id = t.matter_id";

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Task>, sqlx::Error> {
    sqlx::query_as::<_, Task>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE t.id = ?"))).bind(id).fetch_optional(pool).await
}

/// `view` is `open`, `done` or empty for all; `matter_id` empty for every matter.
/// Open tasks come earliest-due first, those with no due day last.
pub async fn list(pool: &SqlitePool, view: &str, matter_id: &str, limit: i64) -> Result<Vec<Task>, sqlx::Error> {
    let filter = match view {
        "open" => "AND t.done_at IS NULL",
        "done" => "AND t.done_at IS NOT NULL",
        _ => "",
    };
    sqlx::query_as::<_, Task>(sqlx::AssertSqlSafe(format!(
        "{SELECT} WHERE (?1 = '' OR t.matter_id = ?1) {filter}
         ORDER BY t.done_at IS NOT NULL, t.due_on IS NULL, t.due_on, t.created_at LIMIT ?2"
    )))
    .bind(matter_id)
    .bind(limit.clamp(1, 500))
    .fetch_all(pool)
    .await
}

pub async fn create(pool: &SqlitePool, input: TaskInput) -> Result<Task, DomainError> {
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return invalid("A task needs a title.");
    }
    if let Some(day) = input.due_on {
        check_date(day, "The due day")?;
    }
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    if let Some(matter_id) = &input.matter_id {
        let known: Option<String> = sqlx::query_scalar("SELECT id FROM matters WHERE id = ?").bind(matter_id).fetch_optional(&mut *tx).await?;
        if known.is_none() {
            return Err(DomainError::NotFound("Matter not found.".to_string()));
        }
    }
    sqlx::query("INSERT INTO tasks (id, matter_id, title, detail, due_on) VALUES (?, ?, ?, ?, ?)").bind(&id).bind(&input.matter_id).bind(&title).bind(clean(input.detail)).bind(input.due_on).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn update(pool: &SqlitePool, id: &str, input: TaskInput) -> Result<Task, DomainError> {
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return invalid("A task needs a title.");
    }
    if let Some(day) = input.due_on {
        check_date(day, "The due day")?;
    }
    let mut tx = begin_write(pool).await?;
    let source: Option<String> = sqlx::query_scalar("SELECT source FROM tasks WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    match source.as_deref() {
        None => return Err(DomainError::NotFound("Task not found.".to_string())),
        Some("state_rule") => return invalid("This task comes from the state-funded scheme's rules. Its day follows the appointment or the hearing, so it is not edited here."),
        Some(_) => {}
    }
    sqlx::query("UPDATE tasks SET title = ?, detail = ?, due_on = ? WHERE id = ?").bind(&title).bind(clean(input.detail)).bind(input.due_on).bind(id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn set_done(pool: &SqlitePool, id: &str, done: bool) -> Result<Task, DomainError> {
    let mut tx = begin_write(pool).await?;
    let done_at = if done { Some(chrono::Utc::now().timestamp_millis()) } else { None };
    let result = sqlx::query("UPDATE tasks SET done_at = ? WHERE id = ?").bind(done_at).bind(id).execute(&mut *tx).await?;
    if result.rows_affected() == 0 {
        return Err(DomainError::NotFound("Task not found.".to_string()));
    }
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn remove(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let mut tx = begin_write(pool).await?;
    let source: Option<String> = sqlx::query_scalar("SELECT source FROM tasks WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    match source.as_deref() {
        None => return Err(DomainError::NotFound("Task not found.".to_string())),
        Some("state_rule") => return invalid("A duty from the state-funded scheme's rules is completed, not removed."),
        Some(_) => {}
    }
    sqlx::query("DELETE FROM tasks WHERE id = ?").bind(id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

/// Makes the task a rule calls for, once (the unique index on the matter and the
/// rule's key means a second call changes only the day, if it is not done).
pub(super) async fn ensure_rule_task(conn: &mut SqliteConnection, matter_id: &str, hearing_id: Option<&str>, rule_key: &str, title: &str, detail: &str, due_on: i64) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO tasks (id, matter_id, hearing_id, title, detail, due_on, source, rule_key) VALUES (?, ?, ?, ?, ?, ?, 'state_rule', ?)
         ON CONFLICT(matter_id, rule_key) WHERE rule_key IS NOT NULL DO UPDATE SET due_on = excluded.due_on WHERE tasks.done_at IS NULL",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(matter_id)
    .bind(hearing_id)
    .bind(title)
    .bind(detail)
    .bind(due_on)
    .bind(rule_key)
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// A rule task tied to a hearing that will not now go ahead as listed.
pub(super) async fn drop_hearing_rule_tasks(conn: &mut SqliteConnection, hearing_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM tasks WHERE hearing_id = ? AND source = 'state_rule' AND done_at IS NULL").bind(hearing_id).execute(&mut *conn).await?;
    Ok(())
}

/// Puts the rule tasks a matter needs in place for its engagement: the meeting
/// confirmation for a state appointment, gone if it is no longer one.
pub(super) async fn apply_engagement_rules(conn: &mut SqliteConnection, matter_id: &str, engagement: &str, appointed_on: Option<i64>) -> Result<(), sqlx::Error> {
    if engagement == "state_appointed" {
        if let Some(on) = appointed_on {
            ensure_rule_task(
                conn,
                matter_id,
                None,
                "confirm_meeting",
                "Confirm to the court in writing that you have met the accused",
                "State-funded representation: meet the accused to advise them and confirm the meeting to the court in writing within 2 working days. Weekends are skipped; public holidays are not.",
                add_working_days(on, 2),
            )
            .await?;
        }
    } else {
        sqlx::query("DELETE FROM tasks WHERE matter_id = ? AND source = 'state_rule' AND done_at IS NULL AND hearing_id IS NULL").bind(matter_id).execute(&mut *conn).await?;
    }
    Ok(())
}

/// The certificate of trial readiness for a trial hearing of a state-appointed
/// matter, due 5 working days before it.
pub(super) async fn apply_hearing_rules(conn: &mut SqliteConnection, matter_id: &str, hearing_id: &str, engagement: &str, purpose: &str, at: i64) -> Result<(), sqlx::Error> {
    if engagement == "state_appointed" && purpose == "hearing" {
        ensure_rule_task(
            conn,
            matter_id,
            Some(hearing_id),
            &format!("trial_readiness:{hearing_id}"),
            "Certificate of trial readiness, with the prosecutor",
            "State-funded representation: the certificate is completed jointly with the prosecutor and submitted within 5 working days before the hearing. Weekends are skipped; public holidays are not.",
            add_working_days(at, -5),
        )
        .await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(y: i32, m: u32, d: u32) -> i64 {
        day_start(NaiveDate::from_ymd_opt(y, m, d).unwrap())
    }

    #[test]
    fn working_days_skip_the_weekend_in_both_directions() {
        // 18 September 2026 is a Friday, 21 September a Monday.
        assert_eq!(add_working_days(day(2026, 9, 18), 2), day(2026, 9, 22), "two working days after a Friday is the Tuesday");
        assert_eq!(add_working_days(day(2026, 9, 21), 2), day(2026, 9, 23));
        assert_eq!(add_working_days(day(2026, 9, 21), -5), day(2026, 9, 14), "five working days before a Monday is the Monday a week earlier");
        assert_eq!(add_working_days(day(2026, 9, 23), -5), day(2026, 9, 16));
        assert_eq!(add_working_days(day(2026, 9, 21), 0), day(2026, 9, 21));
    }

    #[test]
    fn a_time_late_in_the_evening_is_the_same_local_day() {
        // 23:30 East Africa Time on Friday 18 September is still that Friday.
        let late_friday = day(2026, 9, 18) + 23 * 3_600_000 + 30 * 60_000;
        assert_eq!(add_working_days(late_friday, 1), day(2026, 9, 21));
    }
}
