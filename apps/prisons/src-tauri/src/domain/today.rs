//! The working home (docs/prisons/product-map/08 1.3): who is held, what is
//! owed, what is in flight, and what has changed lately. Every figure answers
//! an operational question; documents and periodic returns belong to Reports.

use serde::Serialize;
use sqlx::SqlitePool;

use super::facility_profile::{self, FacilityProfile};
use super::legal;
use super::obligations::{self, Obligation};
use super::time::{now_ms, start_of_day, DAY_MS};

const WEEKS: i64 = 8;
const RECENT_DAYS: i64 = 30;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Population {
    pub held: i64,
    pub convicted: i64,
    pub unconvicted: i64,
    pub civil: i64,
    pub in_transit: i64,
    pub hospitalised: i64,
    pub capacity: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovementCounts {
    pub preparing: i64,
    pub in_transit: i64,
    pub awaiting_confirmation: i64,
    pub court_today: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekFlow {
    pub starts_at: i64,
    pub admitted: i64,
    pub discharged: i64,
}

/// What has changed over the last 30 days, and the last eight weeks of
/// admissions against discharges.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recent {
    pub admitted: i64,
    pub discharged: i64,
    pub transferred_out: i64,
    pub transferred_in: i64,
    pub weeks: Vec<WeekFlow>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Remand {
    pub past_threshold: i64,
    pub within_14_days: i64,
    pub longest_held_days: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CourtActivity {
    pub next_7_days: i64,
    pub awaiting_outcome: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Care {
    pub visits_today: i64,
    pub health_events_30_days: i64,
    pub open_requests: i64,
    pub oldest_open_request_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodayView {
    pub now: i64,
    pub facility: FacilityProfile,
    pub population: Population,
    pub movements: MovementCounts,
    pub recent: Recent,
    pub remand: Remand,
    pub court: CourtActivity,
    pub care: Care,
    pub obligations: Vec<Obligation>,
}

async fn count(pool: &SqlitePool, sql: &'static str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(sql).fetch_one(pool).await
}

pub async fn build(pool: &SqlitePool) -> Result<TodayView, sqlx::Error> {
    let now = now_ms();
    let facility = facility_profile::get(pool).await?;

    let population = Population {
        held: count(pool, "SELECT COUNT(*) FROM prisoners WHERE current_status = 'in_custody'").await?,
        convicted: count(pool, "SELECT COUNT(*) FROM prisoners WHERE current_status = 'in_custody' AND status = 'convicted'").await?,
        unconvicted: count(pool, "SELECT COUNT(*) FROM prisoners WHERE current_status = 'in_custody' AND status = 'unconvicted'").await?,
        civil: count(pool, "SELECT COUNT(*) FROM prisoners WHERE current_status = 'in_custody' AND status = 'civil'").await?,
        in_transit: count(pool, "SELECT COUNT(*) FROM prisoners WHERE current_status = 'in_transit'").await?,
        hospitalised: super::health_events::list_hospitalised(pool).await?.len() as i64,
        capacity: facility.approved_capacity,
    };

    let start = super::time::start_of_day(now);
    let court_today: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM court_productions WHERE state = 'scheduled' AND production_date >= ? AND production_date < ?")
        .bind(start)
        .bind(start + super::time::DAY_MS)
        .fetch_one(pool)
        .await?;
    let movements = MovementCounts {
        preparing: count(pool, "SELECT COUNT(*) FROM transfers WHERE direction = 'out' AND state = 'preparing'").await?,
        in_transit: count(pool, "SELECT COUNT(*) FROM transfers WHERE direction = 'out' AND state = 'in_transit'").await?,
        awaiting_confirmation: count(pool, "SELECT COUNT(*) FROM transfers WHERE direction = 'in' AND state = 'arrived'").await?,
        court_today,
    };

    let recent = recent(pool, now).await?;
    let (remand, court) = legal_picture(pool, start).await?;
    let care = care(pool, now, start).await?;

    let obligations = obligations::derive(pool, now).await?;
    Ok(TodayView { now, facility, population, movements, recent, remand, court, care, obligations })
}

async fn timestamps_since(pool: &SqlitePool, sql: &'static str, since: i64) -> Result<Vec<i64>, sqlx::Error> {
    sqlx::query_scalar(sql).bind(since).fetch_all(pool).await
}

async fn recent(pool: &SqlitePool, now: i64) -> Result<Recent, sqlx::Error> {
    let today = start_of_day(now);
    // Eight weeks ending at the end of today; week 0 is the oldest.
    let span_start = today + DAY_MS - WEEKS * 7 * DAY_MS;
    let admitted = timestamps_since(pool, "SELECT admitted_at FROM prisoners WHERE admitted_at >= ?", span_start).await?;
    // A correction after an erroneous release is a re-detention, not a discharge.
    let discharged = timestamps_since(
        pool,
        "SELECT released_at FROM releases WHERE released_at >= ? AND release_type <> 'erroneous_release_correction'",
        span_start,
    )
    .await?;

    let weeks = (0..WEEKS)
        .map(|k| {
            let starts_at = span_start + k * 7 * DAY_MS;
            let within = |t: &&i64| **t >= starts_at && **t < starts_at + 7 * DAY_MS;
            WeekFlow { starts_at, admitted: admitted.iter().filter(within).count() as i64, discharged: discharged.iter().filter(within).count() as i64 }
        })
        .collect();

    let since = today + DAY_MS - RECENT_DAYS * DAY_MS;
    let transferred = |sql: &'static str| async move { sqlx::query_scalar::<_, i64>(sql).bind(since).fetch_one(pool).await };
    Ok(Recent {
        admitted: admitted.iter().filter(|t| **t >= since).count() as i64,
        discharged: discharged.iter().filter(|t| **t >= since).count() as i64,
        transferred_out: transferred(
            "SELECT COUNT(*) FROM transfers WHERE direction = 'out' AND state IN ('in_transit', 'confirmed') AND transferred_at >= ?",
        )
        .await?,
        transferred_in: transferred(
            "SELECT COUNT(*) FROM transfers WHERE direction = 'in' AND state IN ('arrived', 'confirmed') AND transferred_at >= ?",
        )
        .await?,
        weeks,
    })
}

async fn legal_picture(pool: &SqlitePool, start_of_today: i64) -> Result<(Remand, CourtActivity), sqlx::Error> {
    let legal = legal::overview(pool).await?;
    let remand = Remand {
        past_threshold: legal.thresholds.iter().filter(|t| t.days_remaining < 0).count() as i64,
        within_14_days: legal.thresholds.iter().filter(|t| (0..=14).contains(&t.days_remaining)).count() as i64,
        longest_held_days: legal.thresholds.iter().map(|t| t.days_held).max(),
    };
    let court = CourtActivity {
        next_7_days: legal.diary.iter().filter(|d| d.production_date >= start_of_today && d.production_date < start_of_today + 7 * DAY_MS).count() as i64,
        awaiting_outcome: legal.diary.iter().filter(|d| d.production_date < start_of_today).count() as i64,
    };
    Ok((remand, court))
}

async fn care(pool: &SqlitePool, now: i64, start_of_today: i64) -> Result<Care, sqlx::Error> {
    let visits_today = sqlx::query_scalar(
        "SELECT COUNT(*) FROM visits WHERE visited_at >= ? AND visited_at < ? AND status NOT IN ('denied', 'cancelled', 'no_show')",
    )
    .bind(start_of_today)
    .bind(start_of_today + DAY_MS)
    .fetch_one(pool)
    .await?;
    let health_events_30_days = sqlx::query_scalar("SELECT COUNT(*) FROM health_events WHERE occurred_at >= ?")
        .bind(now - RECENT_DAYS * DAY_MS)
        .fetch_one(pool)
        .await?;
    let open_requests = count(pool, "SELECT COUNT(*) FROM requests WHERE resolved_at IS NULL").await?;
    let oldest_open_request_at = sqlx::query_scalar("SELECT MIN(raised_at) FROM requests WHERE resolved_at IS NULL").fetch_one(pool).await?;
    Ok(Care { visits_today, health_events_30_days, open_requests, oldest_open_request_at })
}
