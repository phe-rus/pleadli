use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

/// Reports & Analytics owns nothing of its own — every query here reads
/// existing tables directly. Answers "how is this prison doing over time,"
/// never "what needs attention now" (Overview's job). Deliberately does
/// NOT include escape rate or mortality rate — UPS's own real published
/// statistics track these (docs/prisons/RESEARCH.md §8), but this app has
/// no escape/death domain yet, so faking those numbers here would violate
/// the "no invented metrics" rule as directly as inventing a percentage.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LabeledCount {
    pub label: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportsSummary {
    pub admission_timestamps: Vec<i64>,
    pub release_timestamps: Vec<i64>,
    pub transfer_timestamps: Vec<i64>,
    pub visit_timestamps: Vec<i64>,
    pub court_production_timestamps: Vec<i64>,
    pub health_event_timestamps: Vec<i64>,

    pub prisoner_category_counts: Vec<LabeledCount>,
    pub custody_status_counts: Vec<LabeledCount>,
    pub release_type_counts: Vec<LabeledCount>,
    pub transfer_direction_counts: Vec<LabeledCount>,
    pub health_event_type_counts: Vec<LabeledCount>,
}

async fn timestamps(pool: &SqlitePool, sql: &'static str) -> Result<Vec<i64>, sqlx::Error> {
    sqlx::query_scalar(sql).fetch_all(pool).await
}

async fn labeled_counts(pool: &SqlitePool, sql: &'static str) -> Result<Vec<LabeledCount>, sqlx::Error> {
    sqlx::query_as::<_, LabeledCount>(sql).fetch_all(pool).await
}

pub async fn get_reports_summary(pool: &SqlitePool) -> Result<ReportsSummary, sqlx::Error> {
    let admission_timestamps = timestamps(pool, "SELECT admitted_at FROM prisoners").await?;
    let release_timestamps = timestamps(pool, "SELECT released_at FROM releases").await?;
    let transfer_timestamps = timestamps(pool, "SELECT transferred_at FROM transfers").await?;
    let visit_timestamps = timestamps(pool, "SELECT visited_at FROM visits").await?;
    let court_production_timestamps = timestamps(pool, "SELECT production_date FROM court_productions").await?;
    let health_event_timestamps = timestamps(pool, "SELECT occurred_at FROM health_events").await?;

    let prisoner_category_counts =
        labeled_counts(pool, "SELECT status AS label, COUNT(*) AS count FROM prisoners GROUP BY status").await?;
    let custody_status_counts =
        labeled_counts(pool, "SELECT current_status AS label, COUNT(*) AS count FROM prisoners GROUP BY current_status").await?;
    let release_type_counts =
        labeled_counts(pool, "SELECT release_type AS label, COUNT(*) AS count FROM releases GROUP BY release_type").await?;
    let transfer_direction_counts =
        labeled_counts(pool, "SELECT direction AS label, COUNT(*) AS count FROM transfers GROUP BY direction").await?;
    let health_event_type_counts =
        labeled_counts(pool, "SELECT event_type AS label, COUNT(*) AS count FROM health_events GROUP BY event_type").await?;

    Ok(ReportsSummary {
        admission_timestamps,
        release_timestamps,
        transfer_timestamps,
        visit_timestamps,
        court_production_timestamps,
        health_event_timestamps,
        prisoner_category_counts,
        custody_status_counts,
        release_type_counts,
        transfer_direction_counts,
        health_event_type_counts,
    })
}
