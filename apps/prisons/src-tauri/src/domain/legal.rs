//! The Legal area's read model (docs/prisons/product-map/08 1.1): the court
//! diary, remand thresholds, sentence dates and instruments still awaited.
//! Everything here is a view over records; nothing is stored.

use std::collections::HashMap;

use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

use super::prisoners::Prisoner;
use super::sentences::{self, compute_clocks, Sentence};
use super::time::{now_ms, DAY_MS};

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DiaryEntry {
    pub id: String,
    pub prisoner_id: String,
    pub prisoner_name: String,
    pub court_reference: Option<String>,
    pub production_date: i64,
    pub purpose: Option<String>,
    pub production_method: String,
    pub state: String,
    pub outcome: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThresholdRow {
    pub prisoner_id: String,
    pub prisoner_name: String,
    pub admitted_at: i64,
    pub high_court_only: bool,
    pub days_held: i64,
    pub threshold_days: i64,
    pub mandatory_bail_on: i64,
    pub days_remaining: i64,
    pub last_produced_at: Option<i64>,
    pub next_production_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SentenceRow {
    pub prisoner_id: String,
    pub prisoner_name: String,
    pub term_text: String,
    pub starts_on: i64,
    pub sentence_ends_on: Option<i64>,
    pub release_due_on: Option<i64>,
    pub parole_window_opens_on: Option<i64>,
    pub is_life: bool,
    pub reviewable: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingInstrumentRow {
    pub prisoner_id: String,
    pub prisoner_name: String,
    pub kind: String,
    pub status: String,
    pub since: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsentencedRow {
    pub prisoner_id: String,
    pub prisoner_name: String,
    pub admitted_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegalOverview {
    pub diary: Vec<DiaryEntry>,
    pub thresholds: Vec<ThresholdRow>,
    pub sentences: Vec<SentenceRow>,
    pub unsentenced: Vec<UnsentencedRow>,
    pub pending_instruments: Vec<PendingInstrumentRow>,
}

fn term_text(s: &Sentence) -> String {
    if s.is_life {
        return "Life".to_string();
    }
    let mut parts = Vec::new();
    if s.term_years > 0 {
        parts.push(format!("{} year{}", s.term_years, if s.term_years == 1 { "" } else { "s" }));
    }
    if s.term_months > 0 {
        parts.push(format!("{} month{}", s.term_months, if s.term_months == 1 { "" } else { "s" }));
    }
    if s.term_days > 0 {
        parts.push(format!("{} day{}", s.term_days, if s.term_days == 1 { "" } else { "s" }));
    }
    parts.join(", ")
}

#[derive(Debug, FromRow)]
struct PendingRow {
    prisoner_id: String,
    first_name: String,
    last_name: String,
    kind: String,
    status: String,
    since: i64,
}

pub async fn overview(pool: &SqlitePool) -> Result<LegalOverview, sqlx::Error> {
    let now = now_ms();

    let diary = sqlx::query_as::<_, DiaryEntry>(
        "SELECT cp.id, cp.prisoner_id, p.last_name || ', ' || p.first_name AS prisoner_name, cp.court_reference,
                cp.production_date, cp.purpose, cp.production_method, cp.state, cp.outcome
         FROM court_productions cp JOIN prisoners p ON p.id = cp.prisoner_id
         WHERE cp.state = 'scheduled' AND p.current_status = 'in_custody'
         ORDER BY cp.production_date ASC LIMIT 300",
    )
    .fetch_all(pool)
    .await?;

    let prisoners = sqlx::query_as::<_, Prisoner>("SELECT * FROM prisoners WHERE current_status = 'in_custody' ORDER BY admitted_at ASC")
        .fetch_all(pool)
        .await?;
    let sentence_by: HashMap<String, Sentence> = sentences::list_active(pool).await?.into_iter().map(|s| (s.prisoner_id.clone(), s)).collect();

    let last_produced: HashMap<String, i64> = sqlx::query_as::<_, (String, i64)>(
        "SELECT prisoner_id, MAX(production_date) FROM court_productions WHERE state = 'produced' GROUP BY prisoner_id",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .collect();
    let next_scheduled: HashMap<String, i64> = sqlx::query_as::<_, (String, i64)>(
        "SELECT prisoner_id, MIN(production_date) FROM court_productions WHERE state = 'scheduled' GROUP BY prisoner_id",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .collect();

    let mut thresholds = Vec::new();
    let mut sentence_rows = Vec::new();
    let mut unsentenced = Vec::new();
    for p in &prisoners {
        let name = format!("{}, {}", p.last_name, p.first_name);
        let sentence = sentence_by.get(&p.id);
        let clocks = compute_clocks(p, sentence, now);

        if let Some(due) = clocks.mandatory_bail_on {
            thresholds.push(ThresholdRow {
                prisoner_id: p.id.clone(),
                prisoner_name: name.clone(),
                admitted_at: p.admitted_at,
                high_court_only: p.high_court_only_offence,
                days_held: clocks.days_held,
                threshold_days: if p.high_court_only_offence { 180 } else { 60 },
                mandatory_bail_on: due,
                days_remaining: (due - now).div_euclid(DAY_MS),
                last_produced_at: last_produced.get(&p.id).copied(),
                next_production_at: next_scheduled.get(&p.id).copied(),
            });
        }

        match sentence {
            Some(s) => sentence_rows.push(SentenceRow {
                prisoner_id: p.id.clone(),
                prisoner_name: name.clone(),
                term_text: term_text(s),
                starts_on: s.starts_on,
                sentence_ends_on: clocks.sentence_ends_on,
                release_due_on: clocks.release_due_on,
                parole_window_opens_on: clocks.parole_window_opens_on,
                is_life: clocks.is_life,
                reviewable: clocks.reviewable,
            }),
            None if p.status == "convicted" => {
                unsentenced.push(UnsentencedRow { prisoner_id: p.id.clone(), prisoner_name: name.clone(), admitted_at: p.admitted_at })
            }
            None => {}
        }
    }
    thresholds.sort_by_key(|t| t.days_remaining);
    sentence_rows.sort_by_key(|s| s.release_due_on.unwrap_or(i64::MAX));

    let pending = sqlx::query_as::<_, PendingRow>(
        "SELECT i.prisoner_id, p.first_name, p.last_name, i.kind, i.status, COALESCE(i.received_at, i.created_at) AS since
         FROM instruments i JOIN prisoners p ON p.id = i.prisoner_id
         WHERE i.status IN ('pending', 'rectification_pending') AND p.current_status = 'in_custody'
         ORDER BY since ASC",
    )
    .fetch_all(pool)
    .await?;
    let pending_instruments = pending
        .into_iter()
        .map(|r| PendingInstrumentRow {
            prisoner_id: r.prisoner_id,
            prisoner_name: format!("{}, {}", r.last_name, r.first_name),
            kind: r.kind,
            status: r.status,
            since: r.since,
        })
        .collect();

    Ok(LegalOverview { diary, thresholds, sentences: sentence_rows, unsentenced, pending_instruments })
}
