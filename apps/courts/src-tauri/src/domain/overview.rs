//! Today: what the bench needs to see on opening the app, worked out from the
//! records. Nothing here is stored; it is a read model over sittings, cases and
//! orders.

use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

use super::sittings::{self, CauseListRow};

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Attention {
    /// `not_closed`, `no_next_date`, `remand_ending`, `remand_undated`,
    /// `record_unsigned`, `reserved`.
    pub kind: String,
    pub case_id: String,
    pub court_number: String,
    pub case_title: String,
    /// The sitting or remand date the item is about.
    pub at: Option<i64>,
    /// The person (a remand) or the decision's title (a reserved decision).
    pub person: Option<String>,
    /// The sitting or decision the item is about, where there is one.
    pub ref_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub open_cases: i64,
    pub unscheduled: i64,
    pub draft_orders: i64,
    pub sittings_today: i64,
    pub not_closed: i64,
    pub draft_rulings: i64,
    pub unsigned_records: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ReasonCount {
    pub reason: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub counts: Counts,
    pub sittings: Vec<CauseListRow>,
    pub attention: Vec<Attention>,
    /// When each adjournment of the last eight weeks was recorded, for a trend.
    pub recent_adjournments: Vec<i64>,
    /// Why sittings were adjourned over the same eight weeks.
    pub reason_counts: Vec<ReasonCount>,
}

/// The window the adjournment figures look back over.
const TREND_DAYS: i64 = 56;

/// A remand ending within this many days is worth a look. It is a reminder, not
/// a statement of law: how long a remand may run is the court's to decide.
const REMAND_WARNING_DAYS: i64 = 7;

/// `from` and `to` bound the court's local day, `now` is the clock.
pub async fn overview(pool: &SqlitePool, from: i64, to: i64, now: i64) -> Result<Overview, sqlx::Error> {
    let sittings = sittings::cause_list(pool, from, to).await?;

    let attention = sqlx::query_as::<_, Attention>(
        "SELECT 'not_closed' AS kind, c.id AS case_id, c.court_number, c.title AS case_title, s.scheduled_at AS at, NULL AS person, s.id AS ref_id
           FROM sittings s JOIN cases c ON c.id = s.case_id
          WHERE s.status = 'scheduled' AND s.scheduled_at < ?1 AND c.status = 'open'
         UNION ALL
         SELECT 'no_next_date', c.id, c.court_number, c.title,
                (SELECT MAX(s.scheduled_at) FROM sittings s WHERE s.case_id = c.id), NULL, NULL
           FROM cases c
          WHERE c.status = 'open' AND NOT EXISTS (SELECT 1 FROM sittings s WHERE s.case_id = c.id AND s.status = 'scheduled')
         UNION ALL
         SELECT CASE WHEN p.remand_until IS NULL THEN 'remand_undated' ELSE 'remand_ending' END,
                c.id, c.court_number, c.title, p.remand_until, p.name, NULL
           FROM case_parties p JOIN cases c ON c.id = p.case_id
          WHERE c.status = 'open' AND p.role = 'accused' AND p.custody = 'remanded'
            AND (p.remand_until IS NULL OR p.remand_until < ?1 + ?2 * 86400000)
         UNION ALL
         SELECT 'record_unsigned', c.id, c.court_number, c.title, s.scheduled_at, NULL, s.id
           FROM sittings s JOIN cases c ON c.id = s.case_id
          WHERE s.status IN ('held', 'adjourned') AND s.record_signed_at IS NULL
            AND (EXISTS (SELECT 1 FROM bench_notes n WHERE n.sitting_id = s.id) OR EXISTS (SELECT 1 FROM appearances a WHERE a.sitting_id = s.id))
         UNION ALL
         SELECT 'reserved', c.id, c.court_number, c.title, r.reserved_on, r.title, r.id
           FROM rulings r JOIN cases c ON c.id = r.case_id
          WHERE r.status = 'draft' AND r.reserved_on IS NOT NULL
         ORDER BY 1, 5",
    )
    .bind(now)
    .bind(REMAND_WARNING_DAYS)
    .fetch_all(pool)
    .await?;

    let open_cases: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cases WHERE status = 'open'").fetch_one(pool).await?;
    let unscheduled = attention.iter().filter(|a| a.kind == "no_next_date").count() as i64;
    let not_closed = attention.iter().filter(|a| a.kind == "not_closed").count() as i64;
    let unsigned_records = attention.iter().filter(|a| a.kind == "record_unsigned").count() as i64;
    let draft_rulings: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM rulings WHERE status = 'draft'").fetch_one(pool).await?;
    let draft_orders: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM orders WHERE status = 'draft'").fetch_one(pool).await?;

    let since = now - TREND_DAYS * 86_400_000;
    let recent_adjournments: Vec<i64> = sqlx::query_scalar("SELECT recorded_at FROM adjournments WHERE recorded_at >= ? ORDER BY recorded_at").bind(since).fetch_all(pool).await?;
    let reason_counts = sqlx::query_as::<_, ReasonCount>("SELECT reason, COUNT(*) AS count FROM adjournments WHERE recorded_at >= ? GROUP BY reason ORDER BY count DESC, reason").bind(since).fetch_all(pool).await?;

    Ok(Overview {
        counts: Counts { open_cases, unscheduled, draft_orders, sittings_today: sittings.len() as i64, not_closed, draft_rulings, unsigned_records },
        sittings,
        attention,
        recent_adjournments,
        reason_counts,
    })
}
