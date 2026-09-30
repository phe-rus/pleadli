//! Today: what the advocate needs to see on opening the app, worked out from the
//! records. Nothing here is stored; it is a read model over hearings, tasks,
//! matters, documents and plea negotiations.

use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

use super::hearings::{self, DiaryRow};

const DAY: i64 = 86_400_000;
/// A task due within this many days is worth a look.
const SOON_DAYS: i64 = 3;
const TREND_DAYS: i64 = 56;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Attention {
    /// `hearing_not_closed`, `no_hearing`, `task_overdue`, `task_soon`, `plea_unconfirmed`.
    pub kind: String,
    pub matter_id: Option<String>,
    pub matter_title: Option<String>,
    pub court_number: Option<String>,
    pub at: Option<i64>,
    pub detail: Option<String>,
    pub ref_id: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ReasonCount {
    pub reason: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub open_matters: i64,
    pub hearings_today: i64,
    pub not_closed: i64,
    pub no_hearing: i64,
    pub tasks_open: i64,
    pub tasks_overdue: i64,
    pub draft_documents: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub counts: Counts,
    pub hearings: Vec<DiaryRow>,
    pub upcoming: Vec<DiaryRow>,
    pub attention: Vec<Attention>,
    pub recent_adjournments: Vec<i64>,
    pub reason_counts: Vec<ReasonCount>,
}

/// `from` and `to` bound the local day; `now` is the clock.
pub async fn overview(pool: &SqlitePool, from: i64, to: i64, now: i64) -> Result<Overview, sqlx::Error> {
    let hearings_today = hearings::diary(pool, from, to).await?;
    let upcoming = hearings::diary(pool, to, to + 7 * DAY).await?;

    let attention = sqlx::query_as::<_, Attention>(
        "SELECT 'hearing_not_closed' AS kind, m.id AS matter_id, m.title AS matter_title, m.court_number, h.at AS at, NULL AS detail, h.id AS ref_id
           FROM hearings h JOIN matters m ON m.id = h.matter_id
          WHERE h.status = 'scheduled' AND h.at < ?1 AND m.status = 'open'
         UNION ALL
         SELECT 'no_hearing', m.id, m.title, m.court_number, (SELECT MAX(h.at) FROM hearings h WHERE h.matter_id = m.id), NULL, NULL
           FROM matters m
          WHERE m.status = 'open' AND m.matter_type NOT IN ('land_transaction', 'company_matter', 'advice')
            AND NOT EXISTS (SELECT 1 FROM hearings h WHERE h.matter_id = m.id AND h.status = 'scheduled')
         UNION ALL
         SELECT CASE WHEN t.due_on < ?1 THEN 'task_overdue' ELSE 'task_soon' END, t.matter_id, m.title, m.court_number, t.due_on, t.title, t.id
           FROM tasks t LEFT JOIN matters m ON m.id = t.matter_id
          WHERE t.done_at IS NULL AND t.due_on IS NOT NULL AND t.due_on < ?1 + ?2 * 86400000
         UNION ALL
         SELECT 'plea_unconfirmed', m.id, m.title, m.court_number, p.signed_on, NULL, NULL
           FROM plea_negotiations p JOIN matters m ON m.id = p.matter_id
          WHERE p.status = 'agreed' AND m.status = 'open'
         ORDER BY 1, 5",
    )
    .bind(from)
    .bind(SOON_DAYS)
    .fetch_all(pool)
    .await?;

    let open_matters: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM matters WHERE status = 'open'").fetch_one(pool).await?;
    let tasks_open: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tasks WHERE done_at IS NULL").fetch_one(pool).await?;
    let draft_documents: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM documents WHERE status = 'draft'").fetch_one(pool).await?;
    let count_of = |kind: &str| attention.iter().filter(|a| a.kind == kind).count() as i64;

    let since = now - TREND_DAYS * DAY;
    let recent_adjournments: Vec<i64> = sqlx::query_scalar("SELECT closed_at FROM hearings WHERE status = 'adjourned' AND closed_at >= ? ORDER BY closed_at").bind(since).fetch_all(pool).await?;
    let reason_counts = sqlx::query_as::<_, ReasonCount>("SELECT adjourn_reason AS reason, COUNT(*) AS count FROM hearings WHERE status = 'adjourned' AND closed_at >= ? AND adjourn_reason IS NOT NULL GROUP BY adjourn_reason ORDER BY count DESC, reason")
        .bind(since)
        .fetch_all(pool)
        .await?;

    Ok(Overview {
        counts: Counts {
            open_matters,
            hearings_today: hearings_today.len() as i64,
            not_closed: count_of("hearing_not_closed"),
            no_hearing: count_of("no_hearing"),
            tasks_open,
            tasks_overdue: count_of("task_overdue"),
            draft_documents,
        },
        hearings: hearings_today,
        upcoming,
        attention,
        recent_adjournments,
        reason_counts,
    })
}
