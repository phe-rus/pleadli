//! The working home (docs/prisons/product/08 1.3): who is held, what is
//! owed, what is in flight, and what has changed lately. Every figure answers
//! an operational question; documents and periodic returns belong to Reports.

use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

use super::facility_profile::{self, FacilityProfile};
use super::legal;
use super::obligations::{self, Obligation};
use super::time::{now_ms, start_of_day, DAY_MS};

const WEEKS: i64 = 8;
const RECENT_DAYS: i64 = 30;
/// How many events the recent-activity feed carries.
const EVENT_LIMIT: i64 = 12;

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
    /// Productions dated today that are still scheduled, with no outcome yet.
    pub court_today: i64,
    /// Productions dated today whose outcome has been recorded.
    pub court_done_today: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekFlow {
    pub starts_at: i64,
    pub admitted: i64,
    pub discharged: i64,
}

/// What has happened so far today. An admission here is a new reception: a
/// person who arrives by transfer is counted as `transferred_in`, not twice.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayCounts {
    pub admitted: i64,
    pub discharged: i64,
    pub transferred_out: i64,
    pub transferred_in: i64,
}

/// One thing that happened, for the recent-activity feed. Every row comes from
/// a real record; `detail` is that record's own type or state, never prose.
#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RecentEvent {
    pub at: i64,
    /// admitted | discharged | transfer_out | transfer_in | court | visit |
    /// request_raised | request_resolved | health
    pub kind: String,
    pub prisoner_id: Option<String>,
    pub prisoner_name: Option<String>,
    /// The release type, the other prison, the court state, the visit type,
    /// the request category or the health event type.
    pub detail: Option<String>,
}

/// What has changed over the last 30 days, the most recent events behind it,
/// and the last eight weeks of admissions against discharges.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recent {
    pub admitted: i64,
    pub discharged: i64,
    pub transferred_out: i64,
    pub transferred_in: i64,
    pub events: Vec<RecentEvent>,
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
    pub visits_completed_today: i64,
    /// Visit requests still waiting for a decision, whatever day they are for.
    pub visits_awaiting_decision: i64,
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
    pub day: DayCounts,
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
    let court_done_today: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM court_productions WHERE state IN ('produced', 'not_produced') AND production_date >= ? AND production_date < ?")
            .bind(start)
            .bind(start + super::time::DAY_MS)
            .fetch_one(pool)
            .await?;
    let movements = MovementCounts {
        preparing: count(pool, "SELECT COUNT(*) FROM transfers WHERE direction = 'out' AND state = 'preparing'").await?,
        in_transit: count(pool, "SELECT COUNT(*) FROM transfers WHERE direction = 'out' AND state = 'in_transit'").await?,
        awaiting_confirmation: count(pool, "SELECT COUNT(*) FROM transfers WHERE direction = 'in' AND state = 'arrived'").await?,
        court_today,
        court_done_today,
    };
    let day = day_counts(pool, start).await?;

    let recent = recent(pool, now).await?;
    let (remand, court) = legal_picture(pool, start).await?;
    let care = care(pool, now, start).await?;

    let obligations = obligations::derive(pool, now).await?;
    Ok(TodayView { now, facility, population, movements, day, recent, remand, court, care, obligations })
}

async fn timestamps_since(pool: &SqlitePool, sql: &'static str, since: i64) -> Result<Vec<i64>, sqlx::Error> {
    sqlx::query_scalar(sql).bind(since).fetch_all(pool).await
}

/// Counts for the day starting at `start`. People who arrive by transfer are a
/// transfer, not an admission, so they are left out of `admitted`.
async fn day_counts(pool: &SqlitePool, start: i64) -> Result<DayCounts, sqlx::Error> {
    let end = start + DAY_MS;
    let between = |sql: &'static str| async move { sqlx::query_scalar::<_, i64>(sql).bind(start).bind(end).fetch_one(pool).await };
    Ok(DayCounts {
        admitted: between(
            "SELECT COUNT(*) FROM prisoners WHERE admitted_at >= ?1 AND admitted_at < ?2
               AND id NOT IN (SELECT prisoner_id FROM transfers WHERE direction = 'in' AND prisoner_id IS NOT NULL)",
        )
        .await?,
        discharged: between("SELECT COUNT(*) FROM releases WHERE released_at >= ?1 AND released_at < ?2 AND release_type <> 'erroneous_release_correction'").await?,
        transferred_out: between(
            "SELECT COUNT(*) FROM transfers WHERE direction = 'out' AND state IN ('in_transit', 'confirmed') AND transferred_at >= ?1 AND transferred_at < ?2",
        )
        .await?,
        transferred_in: between(
            "SELECT COUNT(*) FROM transfers WHERE direction = 'in' AND state IN ('arrived', 'confirmed') AND transferred_at >= ?1 AND transferred_at < ?2",
        )
        .await?,
    })
}

/// The latest events across the records, newest first, one row per event.
async fn recent_events(pool: &SqlitePool, since: i64, now: i64) -> Result<Vec<RecentEvent>, sqlx::Error> {
    sqlx::query_as::<_, RecentEvent>(
        "SELECT e.at AS at, e.kind AS kind, e.prisoner_id AS prisoner_id,
                COALESCE(p.last_name || ', ' || p.first_name, e.person_name) AS prisoner_name,
                e.detail AS detail
         FROM (
           SELECT admitted_at AS at, 'admitted' AS kind, id AS prisoner_id, NULL AS detail, NULL AS person_name
             FROM prisoners
             WHERE admitted_at >= ?1 AND admitted_at <= ?2
               AND id NOT IN (SELECT prisoner_id FROM transfers WHERE direction = 'in' AND prisoner_id IS NOT NULL)
           UNION ALL
           SELECT released_at, 'discharged', prisoner_id, release_type, NULL FROM releases
             WHERE released_at >= ?1 AND released_at <= ?2 AND release_type <> 'erroneous_release_correction'
           UNION ALL
           SELECT transferred_at, 'transfer_out', prisoner_id, other_prison_name, person_name FROM transfers
             WHERE direction = 'out' AND state IN ('in_transit', 'confirmed') AND transferred_at >= ?1 AND transferred_at <= ?2
           UNION ALL
           SELECT transferred_at, 'transfer_in', prisoner_id, other_prison_name, person_name FROM transfers
             WHERE direction = 'in' AND state IN ('arrived', 'confirmed') AND transferred_at >= ?1 AND transferred_at <= ?2
           UNION ALL
           SELECT production_date, 'court', prisoner_id, state, NULL FROM court_productions
             WHERE state IN ('produced', 'not_produced') AND production_date >= ?1 AND production_date <= ?2
           UNION ALL
           SELECT COALESCE(ended_at, visited_at), 'visit', prisoner_id, visit_type, NULL FROM visits
             WHERE status = 'completed' AND visited_at >= ?1 AND visited_at <= ?2
           UNION ALL
           SELECT raised_at, 'request_raised', prisoner_id, category, NULL FROM requests
             WHERE raised_at >= ?1 AND raised_at <= ?2
           UNION ALL
           SELECT resolved_at, 'request_resolved', prisoner_id, category, NULL FROM requests
             WHERE resolved_at IS NOT NULL AND resolved_at >= ?1 AND resolved_at <= ?2
           UNION ALL
           SELECT occurred_at, 'health', prisoner_id, event_type, NULL FROM health_events
             WHERE occurred_at >= ?1 AND occurred_at <= ?2
         ) e
         LEFT JOIN prisoners p ON p.id = e.prisoner_id
         ORDER BY e.at DESC
         LIMIT ?3",
    )
    .bind(since)
    .bind(now)
    .bind(EVENT_LIMIT)
    .fetch_all(pool)
    .await
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
        events: recent_events(pool, since, now).await?,
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
    let visits_completed_today = sqlx::query_scalar("SELECT COUNT(*) FROM visits WHERE status = 'completed' AND visited_at >= ? AND visited_at < ?")
        .bind(start_of_today)
        .bind(start_of_today + DAY_MS)
        .fetch_one(pool)
        .await?;
    let visits_awaiting_decision = count(pool, "SELECT COUNT(*) FROM visits WHERE status = 'requested'").await?;
    let open_requests = count(pool, "SELECT COUNT(*) FROM requests WHERE resolved_at IS NULL").await?;
    let oldest_open_request_at = sqlx::query_scalar("SELECT MIN(raised_at) FROM requests WHERE resolved_at IS NULL").fetch_one(pool).await?;
    Ok(Care { visits_today, visits_completed_today, visits_awaiting_decision, health_events_30_days, open_requests, oldest_open_request_at })
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    async fn prisoner(pool: &SqlitePool, id: &str, last: &str, admitted_at: i64) {
        sqlx::query(
            "INSERT INTO prisoners (id, first_name, last_name, admission_instrument_type, admitted_at, status, current_status)
             VALUES (?, 'A', ?, 'warrant', ?, 'unconvicted', 'in_custody')",
        )
        .bind(id)
        .bind(last)
        .bind(admitted_at)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn an_empty_facility_has_a_quiet_day_and_no_events() {
        let pool = pool().await;
        let view = build(&pool).await.unwrap();
        assert_eq!((view.day.admitted, view.day.discharged, view.day.transferred_in, view.day.transferred_out), (0, 0, 0, 0));
        assert_eq!((view.movements.court_today, view.movements.court_done_today), (0, 0));
        assert_eq!((view.care.visits_completed_today, view.care.visits_awaiting_decision), (0, 0));
        assert!(view.recent.events.is_empty());
    }

    #[tokio::test]
    async fn the_day_and_the_feed_come_from_real_records() {
        let pool = pool().await;
        let start = start_of_day(now_ms());
        prisoner(&pool, "p1", "Okello", start + 1).await;
        // Arrived by transfer: one transfer, not also an admission.
        prisoner(&pool, "p2", "Namata", start + 2).await;
        for sql in [
            "INSERT INTO transfers (id, prisoner_id, direction, state, other_prison_name, transferred_at) VALUES ('t1', 'p2', 'in', 'confirmed', 'Luzira', ?1)",
            "INSERT INTO releases (id, prisoner_id, release_type, released_at) VALUES ('r1', 'p1', 'bail', ?1)",
            "INSERT INTO court_productions (id, prisoner_id, production_date, state) VALUES ('c1', 'p1', ?1, 'produced')",
            "INSERT INTO court_productions (id, prisoner_id, production_date, state) VALUES ('c2', 'p1', ?1, 'scheduled')",
            "INSERT INTO visits (id, prisoner_id, visitor_name, visited_at, status) VALUES ('v1', 'p1', 'X', ?1, 'completed')",
            "INSERT INTO visits (id, prisoner_id, visitor_name, visited_at, status) VALUES ('v2', 'p1', 'Y', ?1, 'requested')",
            "INSERT INTO requests (id, prisoner_id, category, description, raised_at) VALUES ('q1', 'p1', 'welfare', 'x', ?1)",
        ] {
            sqlx::query(sql).bind(start + 3).execute(&pool).await.unwrap();
        }

        let view = build(&pool).await.unwrap();
        assert_eq!((view.day.admitted, view.day.transferred_in, view.day.discharged), (1, 1, 1));
        assert_eq!((view.movements.court_today, view.movements.court_done_today), (1, 1));
        assert_eq!((view.care.visits_completed_today, view.care.visits_awaiting_decision), (1, 1));

        let kinds: Vec<&str> = view.recent.events.iter().map(|e| e.kind.as_str()).collect();
        assert_eq!(kinds.iter().filter(|k| **k == "admitted").count(), 1, "a transfer is not also an admission");
        for kind in ["transfer_in", "discharged", "court", "visit", "request_raised"] {
            assert!(kinds.contains(&kind), "{kind} missing from {kinds:?}");
        }
        assert!(!kinds.contains(&"health"), "no health event was recorded");
        let arrival = view.recent.events.iter().find(|e| e.kind == "transfer_in").unwrap();
        assert_eq!((arrival.prisoner_name.as_deref(), arrival.detail.as_deref()), (Some("Namata, A"), Some("Luzira")));
        assert!(view.recent.events.windows(2).all(|w| w[0].at >= w[1].at), "newest first");
    }
}
