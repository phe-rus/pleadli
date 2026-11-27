//! What the station has to do next, answered once.
//!
//! Before this, the sidebar, Today, the case folders, the command report and the phone alerts each read the same
//! records and decided for themselves what "due", "with the DPP" or "waiting" meant, and they disagreed: a case the
//! DPP had accepted dropped back into "Investigating", the custody limit was hard-coded to 48 hours in two places that
//! ignored the station's country rules, and "due soon" was 2, 6 and 12 hours depending on the screen.
//!
//! This module is the one reading. Everything here is derived from records that already exist and nothing is stored:
//!   * where a case stands (its stage and folder), from its status and its latest referral to the DPP;
//!   * what is outstanding on it (obligations), from what the DPP sent back;
//!   * who is in the cells and how long is left, from the arrest and the station's own legal limit.
//!
//! It deliberately does not say who a case is assigned to: no assignment exists in the records, and the product
//! definition leaves "an assigned IO" as a decision not yet taken. Where a person is named it is the officer who made
//! the referral, which is a fact on the record.

use std::collections::{HashMap, HashSet};

use pleadli_interchange::messages::{HearingMinutePayload, ServiceReportPayload};
use serde::Serialize;
use serde_json::Value;
use sqlx::SqlitePool;

use super::rules;

const HOUR_MS: i64 = 3_600_000;

/// How close to the legal limit a person in the cells is called "due". One number for every screen and for what is
/// reported to the command and to officers' phones.
pub const DUE_SOON_HOURS: f64 = 6.0;

/// The legal limits for custody, from the station's own rules, never fixed in code.
#[derive(Debug, Clone, Copy)]
pub struct CustodyLimits {
    pub hours: i64,
    /// `None` where the country's rules give no transfer window.
    pub transfer_days: Option<i64>,
}

impl Default for CustodyLimits {
    fn default() -> Self {
        CustodyLimits { hours: 48, transfer_days: Some(7) }
    }
}

pub async fn custody_limits(pool: &SqlitePool) -> CustodyLimits {
    match rules::active_for_station(pool).await {
        Ok(pack) => CustodyLimits {
            hours: pack.rule("custody.limit_hours").and_then(|r| r.value).filter(|v| *v > 0).unwrap_or(48),
            transfer_days: pack.rule("custody.transfer_window_days").and_then(|r| r.value).filter(|v| *v > 0),
        },
        Err(_) => CustodyLimits::default(),
    }
}

/// The moment a person must be released, charged or brought to court, and what it is counted from.
pub fn custody_deadline(limits: CustodyLimits, arrested_at: i64, cross_jurisdiction: bool, transferred_at: Option<i64>) -> (i64, &'static str) {
    match (cross_jurisdiction, limits.transfer_days, transferred_at) {
        (false, _, _) | (true, None, _) => (arrested_at + limits.hours * HOUR_MS, "arrest"),
        (true, Some(days), None) => (arrested_at + days * 24 * HOUR_MS, "transfer_window"),
        (true, Some(_), Some(at)) => (at + limits.hours * HOUR_MS, "after_transfer"),
    }
}

pub fn hours_remaining(deadline: i64, now: i64) -> f64 {
    (deadline - now) as f64 / HOUR_MS as f64
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustodyItem {
    pub record_id: String,
    pub person_id: String,
    pub person_name: String,
    pub case_id: Option<String>,
    pub case_reference: Option<String>,
    pub arrested_at: i64,
    pub deadline: i64,
    pub basis: &'static str,
    pub hours_remaining: f64,
    /// `past` the limit, `due` within DUE_SOON_HOURS of it, otherwise `ok`.
    pub state: &'static str,
}

/// One thing a case is waiting for the station to do.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Obligation {
    /// `directions`, `not_accepted`, `declined`, `witnesses`, `exhibits`, `minute_unmatched`.
    pub kind: &'static str,
    /// How many directions, witnesses or exhibits.
    pub count: i64,
    /// The names the obligation is about (witnesses, exhibits), for the officer to read, never to compare.
    pub names: Vec<String>,
    pub due_at: Option<i64>,
    pub urgent: bool,
    /// The package this comes from, so the screen can open the DPP's own words.
    pub source_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseStanding {
    pub case_id: String,
    pub reference: String,
    /// `investigating`, `with_dpp`, `returned`, `not_accepted`, `declined`, `sanctioned`, `closed`.
    pub stage: &'static str,
    /// The folder the case is filed under: `investigating`, `dpp` or `closed`.
    pub folder: &'static str,
    /// For a case with the DPP: `awaiting_reply` or `accepted`.
    pub with_dpp: Option<&'static str>,
    pub referred_at: Option<i64>,
    pub referred_to: Option<String>,
    /// The officer who made the latest referral.
    pub referred_by: Option<String>,
    pub obligations: Vec<Obligation>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub in_cells: i64,
    pub custody_due: i64,
    pub custody_past: i64,
    pub investigating: i64,
    pub with_dpp: i64,
    pub closed: i64,
    /// Cases with at least one obligation on the station.
    pub cases_needing_action: i64,
    /// Cases waiting for the DPP's first reply.
    pub awaiting_reply: i64,
    pub minutes_to_match: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attention {
    pub now: i64,
    pub due_soon_hours: f64,
    pub counts: Counts,
    /// Everyone in the cells, soonest deadline first.
    pub custody: Vec<CustodyItem>,
    /// Every case, with where it stands and what is outstanding.
    pub cases: Vec<CaseStanding>,
}

/// The stage and folder a latest-DPP-referral status puts a case in. Statuses are the ones the station and the
/// office's answers can set: pending, accepted, rejected, returned, sanctioned, declined.
fn stage_of(status: &str) -> (&'static str, &'static str, Option<&'static str>) {
    match status {
        "returned" => ("returned", "investigating", None),
        "rejected" => ("not_accepted", "investigating", None),
        "declined" => ("declined", "investigating", None),
        "sanctioned" => ("sanctioned", "dpp", None),
        "accepted" => ("with_dpp", "dpp", Some("accepted")),
        _ => ("with_dpp", "dpp", Some("awaiting_reply")),
    }
}

struct Latest {
    status: String,
    referred_at: i64,
    destination: Option<String>,
    officer: Option<String>,
}

pub async fn compute(pool: &SqlitePool, hidden: &[String]) -> Result<Attention, sqlx::Error> {
    let now = chrono::Utc::now().timestamp_millis();
    let limits = custody_limits(pool).await;
    let hidden: HashSet<&str> = hidden.iter().map(String::as_str).collect();

    // Custody.
    let custody_rows: Vec<(String, String, Option<String>, Option<String>, i64, bool, Option<i64>, String, String)> = sqlx::query_as(
        "SELECT cr.id, cr.person_id, cr.case_id, c.reference, cr.arrested_at, cr.cross_jurisdiction_transfer, cr.transferred_at, p.last_name, p.first_name
         FROM custody_records cr JOIN people p ON p.id = cr.person_id LEFT JOIN cases c ON c.id = cr.case_id
         WHERE cr.status = 'in_custody'",
    )
    .fetch_all(pool)
    .await?;
    let mut custody: Vec<CustodyItem> = custody_rows
        .into_iter()
        .map(|(record_id, person_id, case_id, case_reference, arrested_at, cross, transferred, last, first)| {
            let (deadline, basis) = custody_deadline(limits, arrested_at, cross, transferred);
            let remaining = hours_remaining(deadline, now);
            let hide = case_id.as_deref().is_some_and(|c| hidden.contains(c));
            CustodyItem {
                record_id,
                person_id,
                person_name: [last, first].into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join(", "),
                case_id: if hide { None } else { case_id },
                case_reference: if hide { None } else { case_reference },
                arrested_at,
                deadline,
                basis,
                hours_remaining: remaining,
                state: if remaining < 0.0 { "past" } else if remaining <= DUE_SOON_HOURS { "due" } else { "ok" },
            }
        })
        .collect();
    custody.sort_by_key(|c| c.deadline);

    // The latest referral to the DPP, per case.
    let referral_rows: Vec<(String, String, i64, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT case_id, status, referred_at, destination_name, officer_name FROM referrals WHERE destination_type = 'dpp' ORDER BY referred_at ASC, created_at ASC",
    )
    .fetch_all(pool)
    .await?;
    let mut latest: HashMap<String, Latest> = HashMap::new();
    for (case_id, status, referred_at, destination, officer) in referral_rows {
        latest.insert(case_id, Latest { status, referred_at, destination, officer });
    }

    // What the office sent back: the newest decision notice per police reference, and the newest hearing minute per case.
    let notices: Vec<(String, String)> = sqlx::query_as("SELECT id, payload FROM exchange_incoming WHERE kind = 'decision_notice' ORDER BY received_at ASC").fetch_all(pool).await?;
    let mut notice_by_ref: HashMap<String, (String, Value)> = HashMap::new();
    for (id, payload) in notices {
        if let Ok(v) = serde_json::from_str::<Value>(&payload) {
            if let Some(reference) = v.get("policeReference").and_then(Value::as_str) {
                notice_by_ref.insert(reference.to_string(), (id, v));
            }
        }
    }
    let minutes: Vec<(String, Option<String>, String, String)> = sqlx::query_as("SELECT id, case_id, status, payload FROM exchange_incoming WHERE kind = 'hearing_minute' ORDER BY received_at ASC").fetch_all(pool).await?;
    let mut minute_by_case: HashMap<String, (String, HearingMinutePayload)> = HashMap::new();
    let mut unmatched: i64 = 0;
    for (id, case_id, status, payload) in minutes {
        let Ok(minute) = serde_json::from_str::<HearingMinutePayload>(&payload) else { continue };
        if status == super::exchange::NEEDS_REVIEW {
            unmatched += 1;
            continue;
        }
        let Some(case_id) = case_id else { continue };
        // The office sends only the witnesses still to serve, so its latest minute for the hearing it last sat is the
        // one that stands.
        if minute_by_case.get(&case_id).map_or(true, |(_, m)| minute.heard_at >= m.heard_at) {
            minute_by_case.insert(case_id, (id, minute));
        }
    }
    let reports: Vec<(String, String)> = sqlx::query_as("SELECT in_reply_to, payload FROM exchange_outgoing WHERE kind = 'service_report' AND in_reply_to IS NOT NULL ORDER BY seq ASC").fetch_all(pool).await?;
    // For each minute, who the station has last reported as served. A later report overrides an earlier one, so a
    // correction that says "not served" puts the witness back on the list.
    let mut served_by_minute: HashMap<String, HashMap<String, bool>> = HashMap::new();
    for (minute_id, payload) in reports {
        if let Ok(report) = serde_json::from_str::<ServiceReportPayload>(&payload) {
            let entry = served_by_minute.entry(minute_id).or_default();
            for r in report.results {
                entry.insert(r.name, r.served);
            }
        }
    }

    // Cases.
    let case_rows: Vec<(String, String, String)> = sqlx::query_as("SELECT id, reference, status FROM cases ORDER BY created_at DESC").fetch_all(pool).await?;
    let mut cases = Vec::with_capacity(case_rows.len());
    for (case_id, reference, status) in case_rows {
        if hidden.contains(case_id.as_str()) {
            // A restricted case still counts in its folder, but says nothing else.
            let (stage, folder, with_dpp) = if status == "closed" { ("closed", "closed", None) } else { latest.get(&case_id).map_or(("investigating", "investigating", None), |l| stage_of(&l.status)) };
            cases.push(CaseStanding { case_id, reference: String::new(), stage, folder, with_dpp, referred_at: None, referred_to: None, referred_by: None, obligations: vec![] });
            continue;
        }
        let mine = latest.get(&case_id);
        let (stage, folder, with_dpp) = if status == "closed" {
            ("closed", "closed", None)
        } else {
            mine.map_or(("investigating", "investigating", None), |l| stage_of(&l.status))
        };
        let mut obligations = Vec::new();
        if status != "closed" {
            if stage == "returned" {
                if let Some((id, notice)) = notice_by_ref.get(&reference) {
                    let directions = notice.get("directions").and_then(Value::as_array).map_or(0, Vec::len) as i64;
                    let due = notice.get("returnDueAt").and_then(Value::as_i64);
                    obligations.push(Obligation { kind: "directions", count: directions, names: vec![], due_at: due, urgent: due.is_some_and(|d| d < now), source_id: Some(id.clone()) });
                } else {
                    obligations.push(Obligation { kind: "directions", count: 0, names: vec![], due_at: None, urgent: false, source_id: None });
                }
            }
            if stage == "not_accepted" {
                obligations.push(Obligation { kind: "not_accepted", count: 0, names: vec![], due_at: None, urgent: false, source_id: None });
            }
            if stage == "declined" {
                obligations.push(Obligation { kind: "declined", count: 0, names: vec![], due_at: None, urgent: false, source_id: notice_by_ref.get(&reference).map(|(id, _)| id.clone()) });
            }
        }
        // Hearing obligations belong to a case wherever it stands: the court sits whether or not the file is "open".
        if let Some((minute_id, minute)) = minute_by_case.get(&case_id) {
            let served = served_by_minute.get(minute_id);
            let outstanding: Vec<String> = minute.witnesses_to_serve.iter().filter(|w| !served.and_then(|s| s.get(&w.name)).copied().unwrap_or(false)).map(|w| w.name.clone()).collect();
            if !outstanding.is_empty() {
                obligations.push(Obligation { kind: "witnesses", count: outstanding.len() as i64, names: outstanding, due_at: minute.next_date, urgent: minute.next_date.is_some_and(|d| d < now), source_id: Some(minute_id.clone()) });
            }
            if !minute.exhibits_to_produce.is_empty() {
                obligations.push(Obligation { kind: "exhibits", count: minute.exhibits_to_produce.len() as i64, names: minute.exhibits_to_produce.clone(), due_at: minute.next_date, urgent: minute.next_date.is_some_and(|d| d < now), source_id: Some(minute_id.clone()) });
            }
        }
        obligations.sort_by_key(|o| (!o.urgent, o.due_at.unwrap_or(i64::MAX)));
        cases.push(CaseStanding { case_id, reference, stage, folder, with_dpp, referred_at: mine.map(|l| l.referred_at), referred_to: mine.and_then(|l| l.destination.clone()), referred_by: mine.and_then(|l| l.officer.clone()), obligations });
    }

    let counts = Counts {
        in_cells: custody.len() as i64,
        custody_due: custody.iter().filter(|c| c.state == "due").count() as i64,
        custody_past: custody.iter().filter(|c| c.state == "past").count() as i64,
        investigating: cases.iter().filter(|c| c.folder == "investigating").count() as i64,
        with_dpp: cases.iter().filter(|c| c.folder == "dpp").count() as i64,
        closed: cases.iter().filter(|c| c.folder == "closed").count() as i64,
        cases_needing_action: cases.iter().filter(|c| !c.obligations.is_empty()).count() as i64,
        awaiting_reply: cases.iter().filter(|c| c.with_dpp == Some("awaiting_reply")).count() as i64,
        minutes_to_match: unmatched,
    };
    Ok(Attention { now, due_soon_hours: DUE_SOON_HOURS, counts, custody, cases })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_limit_comes_from_the_rules_and_the_transfer_window_only_where_the_country_has_one() {
        let uganda = CustodyLimits { hours: 48, transfer_days: Some(7) };
        assert_eq!(custody_deadline(uganda, 0, false, None), (48 * HOUR_MS, "arrest"));
        assert_eq!(custody_deadline(uganda, 0, true, None), (7 * 24 * HOUR_MS, "transfer_window"));
        assert_eq!(custody_deadline(uganda, 0, true, Some(100 * HOUR_MS)), (148 * HOUR_MS, "after_transfer"));
        let kenya = CustodyLimits { hours: 24, transfer_days: None };
        assert_eq!(custody_deadline(kenya, 0, true, None), (24 * HOUR_MS, "arrest"), "no window is claimed where the rules give none");
    }

    #[test]
    fn a_status_puts_a_case_in_one_place() {
        assert_eq!(stage_of("pending"), ("with_dpp", "dpp", Some("awaiting_reply")));
        assert_eq!(stage_of("accepted"), ("with_dpp", "dpp", Some("accepted")), "an accepted file is still with the DPP");
        assert_eq!(stage_of("returned").1, "investigating");
        assert_eq!(stage_of("sanctioned").1, "dpp");
        assert_eq!(stage_of("declined").0, "declined");
        assert_eq!(stage_of("rejected").0, "not_accepted");
    }

    async fn pool() -> SqlitePool {
        // A new station starts with sample records; these tests count records, so they start from the empty first day.
        std::env::set_var("PLEADLI_NO_SEED", "1");
        let dir = std::env::temp_dir().join(format!("pleadli-attention-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        crate::db::startup(&dir, dir.join("vault")).await.ok().unwrap().pool
    }

    async fn incoming(pool: &SqlitePool, id: &str, kind: &str, case_id: Option<&str>, status: &str, payload: Value, at: i64) {
        sqlx::query("INSERT OR IGNORE INTO dpp_connections (id, office_id, office_name, office_verifying_key, office_encryption_key, fingerprint, status, responded_at) VALUES ('conn', 'o', 'Office', 'k', 'k', 'f', 'trusted', 1)").execute(pool).await.unwrap();
        sqlx::query("INSERT INTO exchange_incoming (id, connection_id, kind, seq, sent_at, received_at, package_sha256, payload, status, case_id) VALUES (?, 'conn', ?, 1, ?, ?, 'x', ?, ?, ?)")
            .bind(id).bind(kind).bind(at).bind(at).bind(payload.to_string()).bind(status).bind(case_id).execute(pool).await.unwrap();
    }

    async fn report(pool: &SqlitePool, minute: &str, seq: i64, results: Value) {
        let payload = serde_json::json!({ "policeReference": "A", "dppFileKey": "f", "heardAt": 1, "results": results, "reportedAt": seq });
        sqlx::query("INSERT INTO exchange_outgoing (id, connection_id, kind, seq, in_reply_to, payload, prepared_at) VALUES (?, 'conn', 'service_report', ?, ?, ?, 1)")
            .bind(format!("rep{seq}")).bind(seq).bind(minute).bind(payload.to_string()).execute(pool).await.unwrap();
    }

    /// One case taken through the DPP's answers. Each answer moves it to exactly one place, and says what is left for
    /// the station to do, from the records alone.
    #[tokio::test]
    async fn a_case_stands_where_the_dpps_answers_put_it_and_says_what_is_left() {
        let pool = pool().await;
        sqlx::query("INSERT INTO cases (id, reference, summary, status) VALUES ('c1', 'AT CRB 1/2026', 'Theft', 'open'), ('c2', 'AT CRB 2/2026', 'Fraud', 'closed'), ('c3', 'SECRET CRB 3/2026', 'x', 'open')").execute(&pool).await.unwrap();
        let stand = |a: &Attention, id: &str| a.cases.iter().find(|c| c.case_id == id).unwrap().clone();

        let a = compute(&pool, &[]).await.unwrap();
        assert_eq!((stand(&a, "c1").stage, stand(&a, "c1").folder), ("investigating", "investigating"));
        assert_eq!(stand(&a, "c2").folder, "closed");

        // Referred: waiting for a reply. Accepted: still with the DPP, no longer waiting for a first reply.
        sqlx::query("INSERT INTO referrals (id, case_id, destination_type, destination_name, referred_at, status, officer_name) VALUES ('r1', 'c1', 'dpp', 'ODPP Kampala', 10, 'pending', 'D/Sgt B')").execute(&pool).await.unwrap();
        let a = compute(&pool, &[]).await.unwrap();
        assert_eq!((stand(&a, "c1").folder, stand(&a, "c1").with_dpp), ("dpp", Some("awaiting_reply")));
        assert_eq!((a.counts.with_dpp, a.counts.awaiting_reply, a.counts.investigating), (1, 1, 1));
        sqlx::query("UPDATE referrals SET status = 'accepted' WHERE id = 'r1'").execute(&pool).await.unwrap();
        let a = compute(&pool, &[]).await.unwrap();
        assert_eq!((stand(&a, "c1").folder, stand(&a, "c1").with_dpp), ("dpp", Some("accepted")), "accepted does not send the case back to Investigating");
        assert_eq!(a.counts.awaiting_reply, 0);
        assert_eq!(stand(&a, "c1").referred_by.as_deref(), Some("D/Sgt B"));

        // Returned for investigation with two directions: back with the station, and the directions are its to answer.
        sqlx::query("UPDATE referrals SET status = 'returned' WHERE id = 'r1'").execute(&pool).await.unwrap();
        incoming(&pool, "n1", "decision_notice", None, "received", serde_json::json!({ "policeReference": "AT CRB 1/2026", "decisionType": "return_for_investigation", "directions": [{ "kind": "a", "instruction": "x" }, { "kind": "b", "instruction": "y" }], "returnDueAt": 5 }), 20).await;
        let a = compute(&pool, &[]).await.unwrap();
        let c1 = stand(&a, "c1");
        assert_eq!((c1.stage, c1.folder), ("returned", "investigating"));
        assert_eq!((c1.obligations[0].kind, c1.obligations[0].count, c1.obligations[0].urgent), ("directions", 2, true), "a past answer-by date is urgent");
        // Referred again: with the DPP once more, and the old directions are no longer outstanding.
        sqlx::query("INSERT INTO referrals (id, case_id, destination_type, destination_name, referred_at, status, officer_name) VALUES ('r2', 'c1', 'dpp', 'ODPP Kampala', 30, 'pending', 'D/Sgt B')").execute(&pool).await.unwrap();
        let c1 = stand(&compute(&pool, &[]).await.unwrap(), "c1");
        assert_eq!((c1.folder, c1.obligations.len()), ("dpp", 0));

        // The hearing minute names three witnesses. One is served; one is not found; the third is untouched.
        incoming(&pool, "m1", "hearing_minute", Some("c1"), "received", serde_json::json!({ "policeReference": "AT CRB 1/2026", "dppFileKey": "f", "heardAt": 100, "nextDate": i64::MAX, "witnessesToServe": [{ "name": "PW1" }, { "name": "PW2" }, { "name": "PW3" }], "exhibitsToProduce": ["Phone"] }), 40).await;
        report(&pool, "m1", 1, serde_json::json!([{ "name": "PW1", "served": true }, { "name": "PW2", "served": false, "reason": "moved" }])).await;
        let c1 = stand(&compute(&pool, &[]).await.unwrap(), "c1");
        let w = c1.obligations.iter().find(|o| o.kind == "witnesses").unwrap();
        assert_eq!((w.count, w.names.clone()), (2, vec!["PW2".to_string(), "PW3".to_string()]));
        assert_eq!(c1.obligations.iter().find(|o| o.kind == "exhibits").unwrap().count, 1);
        // A correction puts a served witness back on the list; a further report clears the rest.
        report(&pool, "m1", 2, serde_json::json!([{ "name": "PW1", "served": false, "reason": "wrong person" }])).await;
        let w = stand(&compute(&pool, &[]).await.unwrap(), "c1").obligations.into_iter().find(|o| o.kind == "witnesses").unwrap();
        assert_eq!(w.names, vec!["PW1".to_string(), "PW2".to_string(), "PW3".to_string()]);
        report(&pool, "m1", 3, serde_json::json!([{ "name": "PW1", "served": true }, { "name": "PW2", "served": true }, { "name": "PW3", "served": true }])).await;
        let c1 = stand(&compute(&pool, &[]).await.unwrap(), "c1");
        assert!(c1.obligations.iter().all(|o| o.kind != "witnesses"), "nothing left to serve");

        // A minute that could not be matched to a case changes nothing, and is counted for an officer to match.
        incoming(&pool, "m2", "hearing_minute", None, super::super::exchange::NEEDS_REVIEW, serde_json::json!({ "policeReference": "UNKNOWN", "dppFileKey": "g", "heardAt": 1, "witnessesToServe": [{ "name": "PWX" }] }), 50).await;
        let a = compute(&pool, &[]).await.unwrap();
        assert_eq!(a.counts.minutes_to_match, 1);
        assert!(a.cases.iter().all(|c| c.obligations.iter().all(|o| !o.names.contains(&"PWX".to_string()))));

        // A restricted case the officer may not open still counts, and says nothing.
        let a = compute(&pool, &["c3".to_string()]).await.unwrap();
        let hidden = stand(&a, "c3");
        assert_eq!((hidden.reference.as_str(), hidden.folder, hidden.obligations.len()), ("", "investigating", 0));
        pool.close().await;
    }

    /// The limit is the station's own rule, so a Kenyan station is "past" at 24 hours where a Ugandan one is not.
    #[tokio::test]
    async fn custody_is_judged_against_the_stations_own_limit_in_one_place() {
        let pool = pool().await;
        sqlx::query("INSERT INTO people (id, first_name, last_name) VALUES ('p1', 'Moses', 'Ssekandi')").execute(&pool).await.unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query("INSERT INTO custody_records (id, person_id, arrested_at, status) VALUES ('k1', 'p1', ?, 'in_custody')").bind(now - 30 * HOUR_MS).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO custody_records (id, person_id, arrested_at, status) VALUES ('k2', 'p1', ?, 'in_custody')").bind(now - 44 * HOUR_MS).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO custody_records (id, person_id, arrested_at, status) VALUES ('k3', 'p1', ?, 'released')").bind(now - 100 * HOUR_MS).execute(&pool).await.unwrap();
        let a = compute(&pool, &[]).await.unwrap();
        assert_eq!(a.custody.iter().map(|c| (c.record_id.as_str(), c.state)).collect::<Vec<_>>(), vec![("k2", "due"), ("k1", "ok")], "soonest deadline first, and only people still held");
        assert_eq!((a.counts.in_cells, a.counts.custody_due, a.counts.custody_past), (2, 1, 0));
        // The phone alert and the command report read the same deadline.
        let alerts = super::super::custody::list_alerts(&pool).await.unwrap();
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].id, "k2");
        pool.close().await;
    }
}
