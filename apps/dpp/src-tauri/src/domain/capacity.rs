//! Capacity and workload over time. Every figure is counted from the record:
//! how much arrived, how much was decided, how long the work took, where it
//! sits. It measures the work, never the prosecutor, and no target is implied.
//!
//! The backlog at each month's end is not stored anywhere. It is replayed from
//! each file's own referrals, decisions and resubmissions, at file level (a
//! decision about one count is treated as a decision about the file), which is
//! what the file status is derived from too.

use std::collections::HashMap;

use chrono::{Datelike, TimeZone, Utc};
use serde::Serialize;
use sqlx::SqlitePool;

use super::decisions;
use super::prosecution_files::status_for_decision;

const DAY_MS: i64 = 86_400_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthPoint {
    pub starts_at: i64,
    /// The month is still running.
    pub partial: bool,
    pub received: i64,
    pub resubmitted: i64,
    /// Files that had a charging decision recorded in the month.
    pub files_decided: i64,
    pub returned: i64,
    pub documents_issued: i64,
    /// Files waiting on a decision at the end of the month (or now).
    pub awaiting_at_end: i64,
    pub with_police_at_end: i64,
}

/// How long something took, over the period.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Spread {
    pub count: i64,
    pub median_days: Option<f64>,
    pub mean_days: Option<f64>,
    pub longest_days: Option<f64>,
    /// Up to a week, up to two, up to four, longer.
    pub bands: [i64; 4],
}

fn spread(mut durations_ms: Vec<i64>) -> Spread {
    if durations_ms.is_empty() {
        return Spread::default();
    }
    durations_ms.sort_unstable();
    let days = |ms: i64| ms as f64 / DAY_MS as f64;
    let n = durations_ms.len();
    let median = if n % 2 == 1 { days(durations_ms[n / 2]) } else { (days(durations_ms[n / 2 - 1]) + days(durations_ms[n / 2])) / 2.0 };
    let mut bands = [0; 4];
    for ms in &durations_ms {
        let d = days(*ms);
        bands[if d <= 7.0 { 0 } else if d <= 14.0 { 1 } else if d <= 28.0 { 2 } else { 3 }] += 1;
    }
    Spread {
        count: n as i64,
        median_days: Some(median),
        mean_days: Some(durations_ms.iter().map(|m| days(*m)).sum::<f64>() / n as f64),
        longest_days: Some(days(*durations_ms.last().unwrap())),
        bands,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Turnaround {
    /// From the referral to the first charging decision.
    pub referral_to_decision: Spread,
    /// From a return to the resubmission that answered it.
    pub time_with_police: Spread,
    /// From a document being prepared to it being issued.
    pub document_to_issue: Spread,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Waiting {
    pub file_id: String,
    pub title: String,
    pub reference: Option<String>,
    pub since: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Count {
    pub label: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capacity {
    pub months: Vec<MonthPoint>,
    pub turnaround: Turnaround,
    pub directions_met: i64,
    pub directions_not_met: i64,
    pub directions_open: i64,
    pub decision_mix: Vec<Count>,
    pub by_offence: Vec<Count>,
    pub longest_waiting: Vec<Waiting>,
    pub longest_with_police: Vec<Waiting>,
}

#[derive(Clone, Copy, PartialEq)]
enum State {
    Awaiting,
    WithPolice,
    Concluded,
}

fn month_start(year: i32, month: u32) -> i64 {
    Utc.with_ymd_and_hms(year, month, 1, 0, 0, 0).single().map(|d| d.timestamp_millis()).unwrap_or(0)
}

/// The starts of the last `count` calendar months, oldest first, ending with the current one.
fn month_starts(now: i64, count: u32) -> Vec<i64> {
    let today = Utc.timestamp_millis_opt(now).single().unwrap_or_else(Utc::now);
    let mut year = today.year();
    let mut month = today.month() as i32;
    let mut out = Vec::new();
    for _ in 0..count {
        out.push(month_start(year, month as u32));
        month -= 1;
        if month == 0 {
            month = 12;
            year -= 1;
        }
    }
    out.reverse();
    out
}

pub async fn capacity(pool: &SqlitePool, months: u32) -> Result<Capacity, sqlx::Error> {
    let months = months.clamp(1, 24);
    let now = Utc::now().timestamp_millis();
    let starts = month_starts(now, months);
    let window_start = starts[0];
    let charging: Vec<&str> = decisions::DECISION_TYPES.iter().copied().filter(|t| super::charging_reviews::charging_decision_types().contains(t)).collect();

    // ---- the replay: each file's events in time order.
    #[derive(Clone, Copy)]
    enum Event {
        Referral,
        Resubmission,
        Decision(State),
    }
    let mut events: HashMap<String, Vec<(i64, Event)>> = HashMap::new();
    let referrals: Vec<(String, i64, bool)> = sqlx::query_as("SELECT prosecution_file_id, received_at, is_resubmission FROM referrals").fetch_all(pool).await?;
    for (file, at, resub) in referrals {
        events.entry(file).or_default().push((at, if resub { Event::Resubmission } else { Event::Referral }));
    }
    let all_decisions: Vec<(String, String, i64)> =
        sqlx::query_as("SELECT prosecution_file_id, decision_type, decided_at FROM decisions ORDER BY decided_at ASC, rowid ASC").fetch_all(pool).await?;
    for (file, kind, at) in &all_decisions {
        if let Some(status) = status_for_decision(kind) {
            let state = if status == "returned_for_investigation" { State::WithPolice } else { State::Concluded };
            events.entry(file.clone()).or_default().push((*at, Event::Decision(state)));
        }
    }
    for list in events.values_mut() {
        list.sort_by_key(|(at, _)| *at);
    }
    let state_at = |list: &[(i64, Event)], t: i64| -> Option<State> {
        let mut state = None;
        for (at, event) in list {
            if *at > t {
                break;
            }
            state = Some(match event {
                Event::Referral | Event::Resubmission => State::Awaiting,
                Event::Decision(s) => *s,
            });
        }
        state
    };

    let mut points = Vec::with_capacity(starts.len());
    for (i, start) in starts.iter().enumerate() {
        let end = starts.get(i + 1).copied().unwrap_or(now + 1);
        let partial = i + 1 == starts.len();
        let received: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM referrals WHERE is_resubmission = 0 AND received_at >= ? AND received_at < ?").bind(start).bind(end).fetch_one(pool).await?;
        let resubmitted: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM referrals WHERE is_resubmission = 1 AND received_at >= ? AND received_at < ?").bind(start).bind(end).fetch_one(pool).await?;
        let returned: i64 = sqlx::query_scalar("SELECT COUNT(DISTINCT prosecution_file_id || ':' || decided_at) FROM decisions WHERE decision_type = 'return_for_investigation' AND decided_at >= ? AND decided_at < ?").bind(start).bind(end).fetch_one(pool).await?;
        let documents_issued: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM documents WHERE issued_at >= ? AND issued_at < ?").bind(start).bind(end).fetch_one(pool).await?;
        let files_decided = {
            let mut seen = std::collections::HashSet::new();
            for (file, kind, at) in &all_decisions {
                if *at >= *start && *at < end && charging.contains(&kind.as_str()) {
                    seen.insert(file.clone());
                }
            }
            seen.len() as i64
        };
        let at = end - 1;
        let mut awaiting = 0;
        let mut with_police = 0;
        for list in events.values() {
            match state_at(list, at) {
                Some(State::Awaiting) => awaiting += 1,
                Some(State::WithPolice) => with_police += 1,
                _ => {}
            }
        }
        points.push(MonthPoint { starts_at: *start, partial, received, resubmitted, files_decided, returned, documents_issued, awaiting_at_end: awaiting, with_police_at_end: with_police });
    }

    // ---- turnaround, over the period.
    let mut first_charging: HashMap<&str, i64> = HashMap::new();
    for (file, kind, at) in &all_decisions {
        if charging.contains(&kind.as_str()) {
            first_charging.entry(file.as_str()).or_insert(*at);
        }
    }
    let mut to_decision = Vec::new();
    for (file, list) in &events {
        let first_referral = list.iter().find(|(_, e)| matches!(e, Event::Referral)).map(|(at, _)| *at);
        if let (Some(referral), Some(decided)) = (first_referral, first_charging.get(file.as_str()).copied()) {
            if decided >= window_start && decided >= referral {
                to_decision.push(decided - referral);
            }
        }
    }
    let with_police: Vec<(i64, i64)> = sqlx::query_as(
        "SELECT r.received_at - d.decided_at, r.received_at FROM referrals r JOIN decisions d ON d.id = r.answers_decision_id
          WHERE r.is_resubmission = 1 AND r.received_at >= ?",
    )
    .bind(window_start)
    .fetch_all(pool)
    .await?;
    let to_issue: Vec<i64> = sqlx::query_scalar("SELECT issued_at - created_at FROM documents WHERE issued_at IS NOT NULL AND issued_at >= ?").bind(window_start).fetch_all(pool).await?;

    let count_of = |response: &'static str| async move {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM directions WHERE response = ?").bind(response).fetch_one(pool).await
    };

    let mix: Vec<(String, i64)> = sqlx::query_as(
        "SELECT decision_type, COUNT(DISTINCT prosecution_file_id || ':' || decided_at) FROM decisions WHERE decided_at >= ? GROUP BY decision_type ORDER BY 2 DESC",
    )
    .bind(window_start)
    .fetch_all(pool)
    .await?;
    let offences: Vec<(String, i64)> = sqlx::query_as(
        "SELECT c.offence, COUNT(*) FROM charges c JOIN prosecution_files f ON f.id = c.prosecution_file_id
          WHERE f.current_status IN ('under_review', 'resubmitted', 'returned_for_investigation')
          GROUP BY c.offence ORDER BY 2 DESC, 1 ASC LIMIT 8",
    )
    .fetch_all(pool)
    .await?;

    let longest_waiting: Vec<Waiting> = sqlx::query_as(
        "SELECT f.id AS file_id, f.title, COALESCE(f.odpp_registration_number, f.police_reference) AS reference,
                COALESCE((SELECT MAX(r.received_at) FROM referrals r WHERE r.prosecution_file_id = f.id AND r.is_resubmission = 1), f.received_at) AS since
           FROM prosecution_files f WHERE f.current_status IN ('under_review', 'resubmitted') ORDER BY since ASC LIMIT 5",
    )
    .fetch_all(pool)
    .await?;
    let longest_with_police: Vec<Waiting> = sqlx::query_as(
        "SELECT f.id AS file_id, f.title, COALESCE(f.odpp_registration_number, f.police_reference) AS reference,
                (SELECT MAX(d.decided_at) FROM decisions d WHERE d.prosecution_file_id = f.id AND d.decision_type = 'return_for_investigation') AS since
           FROM prosecution_files f WHERE f.current_status = 'returned_for_investigation' ORDER BY since ASC LIMIT 5",
    )
    .fetch_all(pool)
    .await?;

    Ok(Capacity {
        months: points,
        turnaround: Turnaround {
            referral_to_decision: spread(to_decision),
            time_with_police: spread(with_police.into_iter().map(|(d, _)| d).filter(|d| *d >= 0).collect()),
            document_to_issue: spread(to_issue.into_iter().filter(|d| *d >= 0).collect()),
        },
        directions_met: count_of("met").await?,
        directions_not_met: count_of("not_met").await?,
        directions_open: count_of("open").await?,
        decision_mix: mix.into_iter().map(|(label, count)| Count { label, count }).collect(),
        by_offence: offences.into_iter().map(|(label, count)| Count { label, count }).collect(),
        longest_waiting,
        longest_with_police,
    })
}
