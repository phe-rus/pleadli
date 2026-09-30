//! The practice in figures for a year (docs/lawyers/REVIEW-2026-09-30.md,
//! section 4.5): matters by kind and stage, hearings and how they went, the
//! deadline clocks, money billed and collected, pro bono hours and the
//! registers. Everything is counted from the records when asked, so the
//! figures cannot drift from them; nothing here is stored.

use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

use super::clocks;
use super::compliance;
use super::registers::{year_bounds, year_of};

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TypeCount {
    pub matter_type: String,
    pub open: i64,
    pub opened: i64,
    pub closed: i64,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StageCount {
    pub matter_type: String,
    pub stage: String,
    pub count: i64,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct KeyCount {
    pub key: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Clocks {
    pub overdue: i64,
    pub soon: i64,
    pub running: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Money {
    pub billed: i64,
    pub collected: i64,
    pub disbursed: i64,
    /// Held for clients today, whatever the year.
    pub held_for_clients: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Statistics {
    pub year: i32,
    /// Years with any record, newest first, for the year picker.
    pub years: Vec<i32>,
    pub by_type: Vec<TypeCount>,
    pub open_by_stage: Vec<StageCount>,
    pub opened_by_engagement: Vec<KeyCount>,
    /// Twelve counts, January first.
    pub opened_by_month: Vec<i64>,
    pub hearings_by_status: Vec<KeyCount>,
    pub adjournments_by_cause: Vec<KeyCount>,
    pub clocks: Clocks,
    pub money: Money,
    pub minutes_recorded: i64,
    pub pro_bono_minutes: i64,
    pub register_by_kind: Vec<KeyCount>,
}

/// Ledger sums, a reversal counting against what it reverses.
const SIGNED: &str = "CASE WHEN reverses IS NULL THEN amount ELSE -amount END";

pub async fn get(pool: &SqlitePool, year: i32) -> Result<Statistics, sqlx::Error> {
    let (from, to) = year_bounds(year);

    let by_type = sqlx::query_as::<_, TypeCount>(
        "SELECT matter_type,
            SUM(status = 'open') AS open,
            SUM(created_at >= ?1 AND created_at < ?2) AS opened,
            SUM(status = 'closed' AND closed_at >= ?1 AND closed_at < ?2) AS closed
         FROM matters GROUP BY matter_type ORDER BY open DESC, matter_type",
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;

    let open_by_stage = sqlx::query_as::<_, StageCount>(
        "SELECT matter_type, stage, COUNT(*) AS count FROM matters WHERE status = 'open' GROUP BY matter_type, stage ORDER BY matter_type, count DESC",
    )
    .fetch_all(pool)
    .await?;

    let opened_by_engagement = sqlx::query_as::<_, KeyCount>(
        "SELECT engagement AS key, COUNT(*) AS count FROM matters WHERE created_at >= ? AND created_at < ? GROUP BY engagement ORDER BY count DESC",
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;

    let created: Vec<i64> = sqlx::query_scalar("SELECT created_at FROM matters WHERE created_at >= ? AND created_at < ?").bind(from).bind(to).fetch_all(pool).await?;
    let mut opened_by_month = vec![0; 12];
    for at in created {
        if year_of(at) == year {
            let month = chrono::DateTime::from_timestamp_millis(at + 3 * 3_600_000).map(|d| chrono::Datelike::month0(&d) as usize).unwrap_or(0);
            opened_by_month[month] += 1;
        }
    }

    let hearings_by_status = sqlx::query_as::<_, KeyCount>(
        "SELECT status AS key, COUNT(*) AS count FROM hearings WHERE at >= ? AND at < ? GROUP BY status ORDER BY count DESC",
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;
    let adjournments_by_cause = sqlx::query_as::<_, KeyCount>(
        "SELECT COALESCE(adjourn_reason, 'other') AS key, COUNT(*) AS count FROM hearings WHERE status = 'adjourned' AND at >= ? AND at < ? GROUP BY key ORDER BY count DESC",
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;

    // The clocks are today's, not the year's: they are what needs doing now.
    let mut open_clocks = Clocks::default();
    for c in clocks::open_clocks(pool).await? {
        match c.clock.status {
            "overdue" => open_clocks.overdue += 1,
            "soon" => open_clocks.soon += 1,
            _ => open_clocks.running += 1,
        }
    }

    let billed: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(l.amount), 0) FROM fee_note_lines l JOIN fee_notes f ON f.id = l.fee_note_id
         WHERE f.status = 'issued' AND f.issued_on >= ? AND f.issued_on < ?",
    )
    .bind(from)
    .bind(to)
    .fetch_one(pool)
    .await?;
    let sum = |kinds: &'static str| {
        let sql = format!("SELECT COALESCE(SUM({SIGNED}), 0) FROM ledger_entries WHERE kind IN {kinds} AND on_day >= ? AND on_day < ?");
        sqlx::query_scalar::<_, i64>(sqlx::AssertSqlSafe(sql)).bind(from).bind(to).fetch_one(pool)
    };
    let collected = sum("('to_office', 'fee_received')").await?;
    let disbursed = sum("('disbursement')").await?;
    let held_for_clients: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT COALESCE(SUM(CASE WHEN kind = 'received' THEN 1 ELSE -1 END * ({SIGNED})), 0) FROM ledger_entries WHERE account = 'client'"
    )))
    .fetch_one(pool)
    .await?;

    let minutes_recorded: i64 =
        sqlx::query_scalar("SELECT COALESCE(SUM(minutes), 0) FROM time_entries WHERE worked_on >= ? AND worked_on < ?").bind(from).bind(to).fetch_one(pool).await?;
    let pro = compliance::get(pool, year).await?;
    let pro_bono_minutes = pro.advocates.iter().map(|a| a.pro_bono_minutes).sum::<i64>() + pro.other_pro_bono_minutes;

    let register_by_kind = sqlx::query_as::<_, KeyCount>(
        "SELECT register || ':' || kind AS key, COUNT(*) AS count FROM register_entries
         WHERE voided_at IS NULL AND on_day >= ? AND on_day < ? GROUP BY register, kind ORDER BY count DESC",
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;

    let first: Option<i64> = sqlx::query_scalar("SELECT MIN(created_at) FROM matters").fetch_one(pool).await?;
    let now_year = year_of(chrono::Utc::now().timestamp_millis());
    let first_year = first.map(year_of).unwrap_or(now_year).min(now_year);
    let years = (first_year..=now_year).rev().collect();

    Ok(Statistics {
        year,
        years,
        by_type,
        open_by_stage,
        opened_by_engagement,
        opened_by_month,
        hearings_by_status,
        adjournments_by_cause,
        clocks: open_clocks,
        money: Money { billed, collected, disbursed, held_for_clients },
        minutes_recorded,
        pro_bono_minutes,
        register_by_kind,
    })
}
