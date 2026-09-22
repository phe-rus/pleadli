//! Operational read models: how much work this installation carries, and what
//! has happened on it. Nothing here is stored. Every number is counted from the
//! record at the moment it is asked for, and only from states the product
//! actually models. There is no invented deadline: the one date rule is the
//! Threshold Test's mandatory 14-day review (docs/dpp/RESEARCH.md §3).

use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

const DAY_MS: i64 = 86_400_000;
const THRESHOLD_REVIEW_DAYS: i64 = 14;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct Counts {
    total_files: i64,
    awaiting_decision: i64,
    intake: i64,
    resubmitted: i64,
    returned: i64,
    concluded: i64,
    reopened: i64,
    charged: i64,
    court_matters: i64,
    charged_without_court_reference: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgeBands {
    pub under_a_week: i64,
    pub one_to_two_weeks: i64,
    pub two_to_four_weeks: i64,
    pub over_four_weeks: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekPoint {
    pub starts_at: i64,
    pub received: i64,
    pub decided: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct StationCount {
    pub label: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ThresholdReview {
    pub file_id: String,
    pub file_title: String,
    pub file_reference: Option<String>,
    pub decided_at: i64,
    #[sqlx(skip)]
    pub due_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workload {
    pub total_files: i64,
    /// Files waiting on a charging decision (intake plus in review).
    pub awaiting_decision: i64,
    /// Received and not yet reviewed: no review note recorded.
    pub intake: i64,
    /// Awaiting a decision and under review, or handed back by Police.
    pub in_review: i64,
    pub resubmitted: i64,
    pub returned: i64,
    /// Files whose charging decision has been made.
    pub concluded: i64,
    /// Concluded files with a review open that reopens a decision.
    pub reopened: i64,
    pub charged: i64,
    pub court_matters: i64,
    pub charged_without_court_reference: i64,
    pub decisions_total: i64,
    pub decisions_last_30_days: i64,
    pub people: i64,
    /// Documents prepared and not yet issued.
    pub draft_documents: i64,
    /// Referrals from stations, read into the app but not yet accepted or rejected.
    pub incoming_waiting: i64,
    /// Receipts and notices prepared for a station and not yet exported.
    pub outgoing_pending: i64,
    /// Active files (awaiting or with Police) by the station that referred them.
    pub stations: Vec<StationCount>,
    pub oldest_awaiting_since: Option<i64>,
    pub age_bands: AgeBands,
    pub weekly: Vec<WeekPoint>,
    pub threshold_reviews: Vec<ThresholdReview>,
}

pub async fn workload(pool: &SqlitePool) -> Result<Workload, sqlx::Error> {
    let now = chrono::Utc::now().timestamp_millis();

    let counts: Counts = sqlx::query_as(
        "SELECT COUNT(*) AS total_files,
                COALESCE(SUM(current_status IN ('under_review', 'resubmitted')), 0) AS awaiting_decision,
                COALESCE(SUM(current_status = 'under_review'
                             AND NOT EXISTS (SELECT 1 FROM review_notes n WHERE n.prosecution_file_id = f.id)), 0) AS intake,
                COALESCE(SUM(current_status = 'resubmitted'), 0) AS resubmitted,
                COALESCE(SUM(current_status = 'returned_for_investigation'), 0) AS returned,
                COALESCE(SUM(current_status NOT IN ('under_review', 'resubmitted', 'returned_for_investigation')
                             AND NOT EXISTS (SELECT 1 FROM charging_reviews r WHERE r.prosecution_file_id = f.id
                                             AND r.concluded_at IS NULL AND r.reopens_decision_id IS NOT NULL)), 0) AS concluded,
                COALESCE(SUM(EXISTS (SELECT 1 FROM charging_reviews r WHERE r.prosecution_file_id = f.id
                                     AND r.concluded_at IS NULL AND r.reopens_decision_id IS NOT NULL)), 0) AS reopened,
                COALESCE(SUM(current_status IN ('sanctioned', 'plea_bargained')), 0) AS charged,
                COALESCE(SUM(court_case_number IS NOT NULL AND court_case_number <> ''), 0) AS court_matters,
                COALESCE(SUM(current_status IN ('sanctioned', 'plea_bargained')
                             AND (court_case_number IS NULL OR court_case_number = '')), 0) AS charged_without_court_reference
           FROM prosecution_files f",
    )
    .fetch_one(pool)
    .await?;

    let awaiting_since: Vec<i64> = sqlx::query_scalar(
        "SELECT COALESCE((SELECT MAX(r.received_at) FROM referrals r
                           WHERE r.prosecution_file_id = f.id AND r.is_resubmission = 1), f.received_at)
           FROM prosecution_files f WHERE f.current_status IN ('under_review', 'resubmitted')",
    )
    .fetch_all(pool)
    .await?;
    let mut age_bands = AgeBands { under_a_week: 0, one_to_two_weeks: 0, two_to_four_weeks: 0, over_four_weeks: 0 };
    for since in &awaiting_since {
        match (now - since) / DAY_MS {
            d if d < 7 => age_bands.under_a_week += 1,
            d if d < 14 => age_bands.one_to_two_weeks += 1,
            d if d < 28 => age_bands.two_to_four_weeks += 1,
            _ => age_bands.over_four_weeks += 1,
        }
    }

    let mut weekly = Vec::with_capacity(8);
    for i in 0..8 {
        let from = now - (8 - i) * 7 * DAY_MS;
        let to = from + 7 * DAY_MS;
        let received: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM referrals WHERE is_resubmission = 0 AND received_at >= ? AND received_at < ?")
            .bind(from)
            .bind(to)
            .fetch_one(pool)
            .await?;
        let decided: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM decisions WHERE decided_at >= ? AND decided_at < ?")
            .bind(from)
            .bind(to)
            .fetch_one(pool)
            .await?;
        weekly.push(WeekPoint { starts_at: from, received, decided });
    }

    let mut threshold_reviews: Vec<ThresholdReview> = sqlx::query_as(
        "SELECT d.prosecution_file_id AS file_id, f.title AS file_title,
                COALESCE(f.odpp_registration_number, f.police_reference) AS file_reference, d.decided_at
           FROM decisions d JOIN prosecution_files f ON f.id = d.prosecution_file_id
          WHERE d.decision_type = 'threshold_charge'
            AND d.id = (SELECT d2.id FROM decisions d2 WHERE d2.prosecution_file_id = d.prosecution_file_id
                         ORDER BY d2.decided_at DESC, d2.created_at DESC, d2.rowid DESC LIMIT 1)
          ORDER BY d.decided_at ASC",
    )
    .fetch_all(pool)
    .await?;
    for review in &mut threshold_reviews {
        review.due_at = review.decided_at + THRESHOLD_REVIEW_DAYS * DAY_MS;
    }

    let decisions_total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM decisions").fetch_one(pool).await?;
    let decisions_last_30_days: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM decisions WHERE decided_at >= ?")
        .bind(now - 30 * DAY_MS)
        .fetch_one(pool)
        .await?;
    let people: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM people").fetch_one(pool).await?;
    let stations: Vec<StationCount> = sqlx::query_as(
        "SELECT COALESCE(NULLIF(TRIM(police_station), ''), 'No station recorded') AS label, COUNT(*) AS count FROM prosecution_files
          WHERE current_status IN ('under_review', 'resubmitted', 'returned_for_investigation') GROUP BY label ORDER BY count DESC, label ASC LIMIT 8",
    )
    .fetch_all(pool)
    .await?;
    let incoming_waiting: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM incoming_packages WHERE kind = 'referral' AND status = 'received'").fetch_one(pool).await?;
    let outgoing_pending: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM outgoing_packages WHERE exported_at IS NULL AND kind != 'pairing_confirmation'").fetch_one(pool).await?;
    let draft_documents: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM documents WHERE status = 'draft'").fetch_one(pool).await?;

    Ok(Workload {
        total_files: counts.total_files,
        awaiting_decision: counts.awaiting_decision,
        intake: counts.intake,
        in_review: counts.awaiting_decision - counts.intake,
        resubmitted: counts.resubmitted,
        returned: counts.returned,
        concluded: counts.concluded,
        reopened: counts.reopened,
        charged: counts.charged,
        court_matters: counts.court_matters,
        charged_without_court_reference: counts.charged_without_court_reference,
        decisions_total,
        decisions_last_30_days,
        people,
        draft_documents,
        incoming_waiting,
        outgoing_pending,
        stations,
        oldest_awaiting_since: awaiting_since.iter().copied().min(),
        age_bands,
        weekly,
        threshold_reviews,
    })
}

/// One thing that happened, read back from the tables that recorded it. This
/// is the chronology of a file and, unfiltered, the activity of the whole
/// installation. There is no separate event log to drift from the records.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEvent {
    pub kind: String,
    pub id: String,
    pub file_id: String,
    pub file_title: String,
    pub file_reference: Option<String>,
    pub at: i64,
    pub subject: Option<String>,
    pub detail: Option<String>,
}

pub async fn activity(pool: &SqlitePool, file_id: Option<&str>, limit: i64) -> Result<Vec<ActivityEvent>, sqlx::Error> {
    sqlx::query_as::<_, ActivityEvent>(
        "WITH e AS (
            SELECT CASE r.is_resubmission WHEN 1 THEN 'resubmission_received' ELSE 'referral_received' END AS kind,
                   r.id AS id, r.prosecution_file_id AS file_id, r.received_at AS at,
                   r.police_station AS subject, r.police_reference AS detail FROM referrals r
            UNION ALL
            SELECT 'statement_added', s.id, s.prosecution_file_id, s.created_at, s.statement_role,
                   p.first_name || ' ' || p.last_name FROM statements s JOIN people p ON p.id = s.person_id
            UNION ALL
            SELECT 'evidence_added', v.id, v.prosecution_file_id, v.created_at, v.category, v.description FROM evidence_items v
            UNION ALL
            SELECT 'charge_added', c.id, c.prosecution_file_id, c.created_at, c.offence, c.statutory_section FROM charges c
            UNION ALL
            SELECT 'review_note_added', n.id, n.prosecution_file_id, n.created_at, n.author, NULL FROM review_notes n
            UNION ALL
            SELECT CASE WHEN d.corrects_decision_id IS NULL THEN 'decision_recorded' ELSE 'decision_corrected' END,
                   d.id, d.prosecution_file_id, d.decided_at, d.decision_type, d.decided_by FROM decisions d
            UNION ALL
            SELECT CASE WHEN c.reopens_decision_id IS NULL THEN 'review_started' ELSE 'review_reopened' END,
                   c.id, c.prosecution_file_id, c.started_at, c.standard, COALESCE(c.reopen_reason, c.started_by) FROM charging_reviews c
            UNION ALL
            SELECT 'direction_answered', x.id, x.prosecution_file_id, x.responded_at, x.response, x.kind
              FROM directions x WHERE x.responded_at IS NOT NULL
            UNION ALL
            SELECT 'document_issued', g.id, g.prosecution_file_id, g.issued_at, g.title, g.reference FROM documents g WHERE g.issued_at IS NOT NULL
            UNION ALL
            SELECT 'attachment_added', a.id, a.entity_id, a.created_at, a.file_name, a.mime_type
              FROM attachments a WHERE a.entity_type = 'prosecution_file'
         )
         SELECT e.kind, e.id, e.file_id, f.title AS file_title,
                COALESCE(f.odpp_registration_number, f.police_reference) AS file_reference,
                e.at, e.subject, e.detail
           FROM e JOIN prosecution_files f ON f.id = e.file_id
          WHERE (?1 IS NULL OR e.file_id = ?1)
          ORDER BY e.at DESC, e.id DESC LIMIT ?2",
    )
    .bind(file_id)
    .bind(limit.clamp(1, 500))
    .fetch_all(pool)
    .await
}

/// A piece of received Police material, from any file, for the material
/// browser: one row per statement, evidence item or proposed charge.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MaterialRow {
    pub kind: String,
    pub id: String,
    pub file_id: String,
    pub file_title: String,
    pub file_reference: Option<String>,
    pub at: i64,
    /// Role, category or offence.
    pub subject: String,
    /// Person, description or statutory section.
    pub detail: Option<String>,
}

pub async fn material(pool: &SqlitePool, kind: &str, limit: i64) -> Result<Vec<MaterialRow>, super::error::DomainError> {
    let select = match kind {
        "statement" => {
            "SELECT 'statement' AS kind, s.id AS id, s.prosecution_file_id AS file_id, s.given_at AS at,
                    s.statement_role AS subject, p.first_name || ' ' || p.last_name AS detail
               FROM statements s JOIN people p ON p.id = s.person_id"
        }
        "evidence" => {
            "SELECT 'evidence' AS kind, v.id, v.prosecution_file_id, v.created_at, v.category, v.description FROM evidence_items v"
        }
        "charge" => "SELECT 'charge' AS kind, c.id, c.prosecution_file_id, c.created_at, c.offence, c.statutory_section FROM charges c",
        _ => return super::error::invalid("Unknown kind of material."),
    };
    let sql = format!(
        "WITH m AS ({select})
         SELECT m.kind, m.id, m.file_id, f.title AS file_title,
                COALESCE(f.odpp_registration_number, f.police_reference) AS file_reference,
                m.at, m.subject, m.detail
           FROM m JOIN prosecution_files f ON f.id = m.file_id ORDER BY m.at DESC LIMIT ?"
    );
    Ok(sqlx::query_as::<_, MaterialRow>(sqlx::AssertSqlSafe(sql)).bind(limit.clamp(1, 500)).fetch_all(pool).await?)
}
