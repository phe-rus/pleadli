//! The administrator's view: backlog, adjournment causes, and returns, worked out
//! from the records of this court. It reports what was recorded and no more: a
//! sitting closed without a structured reason shows as it is, and no benchmark or
//! target is asserted (what the Judiciary expects of a court is not yet read).

use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

const DAY: i64 = 86_400_000;

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Count {
    pub key: String,
    pub count: i64,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CaseAdjournments {
    pub case_id: String,
    pub court_number: String,
    pub title: String,
    pub adjournments: i64,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SittingCounts {
    pub total: i64,
    pub scheduled: i64,
    pub held: i64,
    pub adjourned: i64,
    pub cancelled: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Returns {
    /// The period the figures cover, in milliseconds.
    pub from: i64,
    pub to: i64,
    pub sittings: SittingCounts,
    pub adjournments: i64,
    /// Adjournments with no next date fixed at the time.
    pub adjournments_without_date: i64,
    pub by_reason: Vec<Count>,
    pub by_responsible: Vec<Count>,
    /// Cases with the most adjournments in the period.
    pub most_adjourned: Vec<CaseAdjournments>,
    pub open_cases: i64,
    pub concluded_in_period: i64,
    /// Open cases by how long since registration.
    pub backlog: Vec<Count>,
    pub closed_sittings: i64,
    pub signed_records: i64,
    pub delivered_decisions: i64,
    pub reserved_drafts: i64,
    pub oldest_reserved_days: Option<i64>,
    pub not_produced: i64,
    pub recordings: i64,
}

/// Figures for sittings whose time falls in `[from, to)`. `now` is the clock.
pub async fn returns(pool: &SqlitePool, from: i64, to: i64, now: i64) -> Result<Returns, sqlx::Error> {
    let by_status: Vec<Count> = sqlx::query_as("SELECT status AS key, COUNT(*) AS count FROM sittings WHERE scheduled_at >= ? AND scheduled_at < ? GROUP BY status").bind(from).bind(to).fetch_all(pool).await?;
    let n = |status: &str| by_status.iter().find(|c| c.key == status).map(|c| c.count).unwrap_or(0);
    let sittings = SittingCounts { total: by_status.iter().map(|c| c.count).sum(), scheduled: n("scheduled"), held: n("held"), adjourned: n("adjourned"), cancelled: n("cancelled") };

    let in_period = "a.sitting_id IN (SELECT id FROM sittings WHERE scheduled_at >= ?1 AND scheduled_at < ?2)";
    let adjournments: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT COUNT(*) FROM adjournments a WHERE {in_period}"))).bind(from).bind(to).fetch_one(pool).await?;
    let without_date: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT COUNT(*) FROM adjournments a WHERE a.next_date IS NULL AND {in_period}"))).bind(from).bind(to).fetch_one(pool).await?;
    let by_reason: Vec<Count> = sqlx::query_as(sqlx::AssertSqlSafe(format!("SELECT a.reason AS key, COUNT(*) AS count FROM adjournments a WHERE {in_period} GROUP BY a.reason ORDER BY count DESC, key"))).bind(from).bind(to).fetch_all(pool).await?;
    let by_responsible: Vec<Count> = sqlx::query_as(sqlx::AssertSqlSafe(format!("SELECT a.responsible AS key, COUNT(*) AS count FROM adjournments a WHERE {in_period} GROUP BY a.responsible ORDER BY count DESC, key"))).bind(from).bind(to).fetch_all(pool).await?;
    let most_adjourned: Vec<CaseAdjournments> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT c.id AS case_id, c.court_number, c.title, COUNT(*) AS adjournments, c.status
         FROM adjournments a JOIN cases c ON c.id = a.case_id WHERE {in_period}
         GROUP BY c.id ORDER BY adjournments DESC, c.court_number LIMIT 10"
    )))
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;

    let open_cases: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cases WHERE status = 'open'").fetch_one(pool).await?;
    let concluded_in_period: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cases WHERE status = 'concluded' AND concluded_at >= ? AND concluded_at < ?").bind(from).bind(to).fetch_one(pool).await?;

    let ages: Vec<i64> = sqlx::query_scalar("SELECT COALESCE(registered_on, created_at) FROM cases WHERE status = 'open'").fetch_all(pool).await?;
    let mut buckets = [("Up to 30 days", 0_i64), ("31 to 90 days", 0), ("91 to 180 days", 0), ("181 to 365 days", 0), ("Over a year", 0)];
    for at in ages {
        let days = ((now - at) / DAY).max(0);
        let slot = match days {
            0..=30 => 0,
            31..=90 => 1,
            91..=180 => 2,
            181..=365 => 3,
            _ => 4,
        };
        buckets[slot].1 += 1;
    }
    let backlog = buckets.iter().map(|(label, count)| Count { key: label.to_string(), count: *count }).collect();

    let closed_sittings: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sittings WHERE status IN ('held', 'adjourned') AND scheduled_at >= ? AND scheduled_at < ?").bind(from).bind(to).fetch_one(pool).await?;
    let signed_records: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sittings WHERE record_signed_at IS NOT NULL AND scheduled_at >= ? AND scheduled_at < ?").bind(from).bind(to).fetch_one(pool).await?;
    let delivered_decisions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM rulings WHERE status = 'delivered' AND delivered_on >= ? AND delivered_on < ?").bind(from).bind(to).fetch_one(pool).await?;
    let reserved_drafts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM rulings WHERE status = 'draft' AND reserved_on IS NOT NULL").fetch_one(pool).await?;
    let oldest: Option<i64> = sqlx::query_scalar("SELECT MIN(reserved_on) FROM rulings WHERE status = 'draft' AND reserved_on IS NOT NULL").fetch_one(pool).await?;
    let not_produced: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM appearances a JOIN sittings s ON s.id = a.sitting_id WHERE a.attendance = 'not_produced' AND s.scheduled_at >= ? AND s.scheduled_at < ?").bind(from).bind(to).fetch_one(pool).await?;
    let recordings: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM recordings r JOIN sittings s ON s.id = r.sitting_id WHERE s.scheduled_at >= ? AND s.scheduled_at < ?").bind(from).bind(to).fetch_one(pool).await?;

    Ok(Returns {
        from,
        to,
        sittings,
        adjournments,
        adjournments_without_date: without_date,
        by_reason,
        by_responsible,
        most_adjourned,
        open_cases,
        concluded_in_period,
        backlog,
        closed_sittings,
        signed_records,
        delivered_decisions,
        reserved_drafts,
        oldest_reserved_days: oldest.map(|at| ((now - at) / DAY).max(0)),
        not_produced,
        recordings,
    })
}
