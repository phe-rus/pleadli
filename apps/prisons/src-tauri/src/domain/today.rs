//! The working home (docs/prisons/product-map/08 1.3): who is held, what is
//! owed, what is in flight. Statistics and trends are not here; they belong
//! to Returns.

use serde::Serialize;
use sqlx::SqlitePool;

use super::facility_profile::{self, FacilityProfile};
use super::obligations::{self, Obligation};
use super::time::now_ms;

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
pub struct TodayView {
    pub now: i64,
    pub facility: FacilityProfile,
    pub population: Population,
    pub movements: MovementCounts,
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

    let obligations = obligations::derive(pool, now).await?;
    Ok(TodayView { now, facility, population, movements, obligations })
}
