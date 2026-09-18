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

    // UPS-shaped population profile (docs/prisons/RESEARCH.md §8): the six
    // dimensions UPS publishes its population statistics by, derived from
    // prisoner records, plus admission time series at year/month level
    // (week is derived client side from admission_timestamps).
    pub admission_year_counts: Vec<LabeledCount>,
    pub admission_month_counts: Vec<LabeledCount>,
    pub prisoner_age_group_counts: Vec<LabeledCount>,
    pub prisoner_sex_counts: Vec<LabeledCount>,
    pub prisoner_education_counts: Vec<LabeledCount>,
    pub prisoner_nationality_counts: Vec<LabeledCount>,
    pub prisoner_offence_type_counts: Vec<LabeledCount>,
    pub prisoner_sentence_category_counts: Vec<LabeledCount>,

    // By-facility reach of a Head Office: every prisoner row it holds is
    // either stamped `facility_id` from a synced facility (child 3) or not
    // yet attributable — Head Office's own local records predate the sync
    // feature, so `Not assigned` is an honest residual label, never hidden.
    pub facility_population_counts: Vec<LabeledCount>,
    pub facility_in_custody_counts: Vec<LabeledCount>,
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

    // Admissions by calendar year, then by month (YEAR-MONTH). Week stays
    // client side from admission_timestamps.
    let admission_year_counts = labeled_counts(
        pool,
        "SELECT strftime('%Y', datetime(admitted_at / 1000, 'unixepoch')) AS label, COUNT(*) AS count FROM prisoners GROUP BY label ORDER BY label",
    ).await?;
    let admission_month_counts = labeled_counts(
        pool,
        "SELECT strftime('%Y-%m', datetime(admitted_at / 1000, 'unixepoch')) AS label, COUNT(*) AS count FROM prisoners GROUP BY label ORDER BY label",
    ).await?;

    // Population profile by the dimensions UPS publishes (RESEARCH.md §8).
    // The capital-offence-type grouping is a display-time keyword classifier
    // over the free-text offence field (no offence taxonomy is stored), per
    // spec docs/specs/prisons/0002-… — same honesty limit as any
    // display-time label derivation.
    let prisoner_age_group_counts = labeled_counts(
        pool,
        "SELECT CASE
            WHEN date_of_birth IS NULL THEN 'Not recorded'
            WHEN CAST((julianday('now') - julianday(date(date_of_birth / 1000, 'unixepoch'))) / 365.25 AS INTEGER) <= 17 THEN 'Aged 17 and under'
            WHEN CAST((julianday('now') - julianday(date(date_of_birth / 1000, 'unixepoch'))) / 365.25 AS INTEGER) <= 36 THEN 'Aged 18-36'
            WHEN CAST((julianday('now') - julianday(date(date_of_birth / 1000, 'unixepoch'))) / 365.25 AS INTEGER) <= 54 THEN 'Aged 37-54'
            ELSE 'Aged 55 and over'
        END AS label, COUNT(*) AS count FROM prisoners GROUP BY label ORDER BY label",
    ).await?;
    let prisoner_sex_counts = labeled_counts(
        pool,
        "SELECT COALESCE(sex, 'Not recorded') AS label, COUNT(*) AS count FROM prisoners GROUP BY label ORDER BY label",
    ).await?;
    let prisoner_education_counts = labeled_counts(
        pool,
        "SELECT COALESCE(education_level, 'Not recorded') AS label, COUNT(*) AS count FROM prisoners GROUP BY label ORDER BY label",
    ).await?;
    let prisoner_nationality_counts = labeled_counts(
        pool,
        "SELECT COALESCE(nationality, 'Not recorded') AS label, COUNT(*) AS count FROM prisoners GROUP BY label ORDER BY label",
    ).await?;
    let prisoner_offence_type_counts = labeled_counts(
        pool,
        "SELECT CASE
            WHEN offence IS NULL THEN 'Not recorded'
            WHEN LOWER(offence) LIKE '%terroris%' THEN 'Terrorism'
            WHEN LOWER(offence) LIKE '%treason%' THEN 'Treason'
            WHEN LOWER(offence) LIKE '%murder%' THEN 'Murder'
            WHEN LOWER(offence) LIKE '%aggravated robbery%' THEN 'Aggravated robbery'
            WHEN LOWER(offence) LIKE '%rape%' THEN 'Rape'
            ELSE 'Other'
        END AS label, COUNT(*) AS count FROM prisoners GROUP BY label ORDER BY label",
    ).await?;
    let prisoner_sentence_category_counts = labeled_counts(
        pool,
        "SELECT CASE status
            WHEN 'convicted' THEN 'Sentenced'
            WHEN 'unconvicted' THEN 'Remand'
            WHEN 'civil' THEN 'Civil'
            ELSE 'Other'
        END AS label, COUNT(*) AS count FROM prisoners GROUP BY label ORDER BY label",
    ).await?;

    // Snapshot-derived labels: On Head Office, `facility_id` resolves to the
    // facility's name; at any non-HQ install that has not paired yet every
    // row is `Not assigned`. LEFT JOIN so rows are never dropped for an
    // unknown facility id.
    let facility_population_counts = labeled_counts(
        pool,
        "SELECT COALESCE(f.name, 'Not assigned') AS label, COUNT(*) AS count
         FROM prisoners p LEFT JOIN facilities f ON f.id = p.facility_id
         GROUP BY label ORDER BY label",
    ).await?;
    let facility_in_custody_counts = labeled_counts(
        pool,
        "SELECT COALESCE(f.name, 'Not assigned') AS label, COUNT(*) AS count
         FROM prisoners p LEFT JOIN facilities f ON f.id = p.facility_id
         WHERE p.current_status = 'in_custody'
         GROUP BY label ORDER BY label",
    ).await?;

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
        admission_year_counts,
        admission_month_counts,
        prisoner_age_group_counts,
        prisoner_sex_counts,
        prisoner_education_counts,
        prisoner_nationality_counts,
        prisoner_offence_type_counts,
        prisoner_sentence_category_counts,
        facility_population_counts,
        facility_in_custody_counts,
    })
}
