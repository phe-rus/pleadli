use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

/// Reports & Analytics owns nothing of its own — every query here reads
/// existing tables directly (never through a domain's own `list_*`, which
/// caps at 50 rows for its own UI purposes; a trend needs the real
/// count). Answers "how is the station doing over time," never "what
/// needs attention now" — that's Overview's job, not this one's.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LabeledCount {
    pub label: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportsSummary {
    // Raw timestamps, unfiltered — the frontend buckets these into weekly
    // trends with the same `weeklyBuckets` helper Overview already uses,
    // so the two views never disagree about what "this week" means.
    pub station_diary_timestamps: Vec<i64>,
    pub incident_timestamps: Vec<i64>,
    pub case_timestamps: Vec<i64>,
    pub statement_timestamps: Vec<i64>,
    pub custody_timestamps: Vec<i64>,
    pub bond_timestamps: Vec<i64>,
    pub exhibit_timestamps: Vec<i64>,
    pub charge_sheet_timestamps: Vec<i64>,
    pub referral_timestamps: Vec<i64>,

    pub case_status_counts: Vec<LabeledCount>,
    pub custody_status_counts: Vec<LabeledCount>,
    pub bond_status_counts: Vec<LabeledCount>,
    pub exhibit_status_counts: Vec<LabeledCount>,
    pub referral_status_counts: Vec<LabeledCount>,
    pub referral_destination_counts: Vec<LabeledCount>,
    pub top_offences: Vec<LabeledCount>,
}

async fn timestamps(pool: &SqlitePool, sql: &'static str) -> Result<Vec<i64>, sqlx::Error> {
    sqlx::query_scalar(sql).fetch_all(pool).await
}

async fn labeled_counts(pool: &SqlitePool, sql: &'static str) -> Result<Vec<LabeledCount>, sqlx::Error> {
    sqlx::query_as::<_, LabeledCount>(sql).fetch_all(pool).await
}

pub async fn get_reports_summary(pool: &SqlitePool) -> Result<ReportsSummary, sqlx::Error> {
    let station_diary_timestamps = timestamps(pool, "SELECT created_at FROM station_diary_entries").await?;
    let incident_timestamps = timestamps(pool, "SELECT occurred_at FROM incidents").await?;
    let case_timestamps = timestamps(pool, "SELECT created_at FROM cases").await?;
    let statement_timestamps = timestamps(pool, "SELECT given_at FROM statements").await?;
    let custody_timestamps = timestamps(pool, "SELECT arrested_at FROM custody_records").await?;
    let bond_timestamps = timestamps(pool, "SELECT granted_at FROM bonds").await?;
    let exhibit_timestamps = timestamps(pool, "SELECT recovered_at FROM exhibits").await?;
    let charge_sheet_timestamps = timestamps(pool, "SELECT charged_at FROM charge_sheets").await?;
    let referral_timestamps = timestamps(pool, "SELECT referred_at FROM referrals").await?;

    let case_status_counts =
        labeled_counts(pool, "SELECT status AS label, COUNT(*) AS count FROM cases GROUP BY status").await?;
    let custody_status_counts =
        labeled_counts(pool, "SELECT status AS label, COUNT(*) AS count FROM custody_records GROUP BY status").await?;
    let bond_status_counts =
        labeled_counts(pool, "SELECT status AS label, COUNT(*) AS count FROM bonds GROUP BY status").await?;
    let exhibit_status_counts =
        labeled_counts(pool, "SELECT status AS label, COUNT(*) AS count FROM exhibits GROUP BY status").await?;
    let referral_status_counts =
        labeled_counts(pool, "SELECT status AS label, COUNT(*) AS count FROM referrals GROUP BY status").await?;
    let referral_destination_counts = labeled_counts(
        pool,
        "SELECT destination_type AS label, COUNT(*) AS count FROM referrals GROUP BY destination_type",
    )
    .await?;
    let top_offences = labeled_counts(
        pool,
        "SELECT offence AS label, COUNT(*) AS count FROM charge_sheets GROUP BY offence ORDER BY count DESC LIMIT 10",
    )
    .await?;

    Ok(ReportsSummary {
        station_diary_timestamps,
        incident_timestamps,
        case_timestamps,
        statement_timestamps,
        custody_timestamps,
        bond_timestamps,
        exhibit_timestamps,
        charge_sheet_timestamps,
        referral_timestamps,
        case_status_counts,
        custody_status_counts,
        bond_status_counts,
        exhibit_status_counts,
        referral_status_counts,
        referral_destination_counts,
        top_offences,
    })
}
