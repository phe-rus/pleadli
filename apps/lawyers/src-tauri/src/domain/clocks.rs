//! Deadlines a practice lives by, counted by the application from what
//! happened on a matter (`matter_events`) and the country's rules
//! (docs/lawyers/REVIEW-2026-09-30.md, section 3; decision D7). Nothing here is
//! typed in by hand and nothing is left to an assistant's arithmetic.
//!
//! Each rule says what starts it (an event), how long it runs, what satisfies
//! it (a later event), which kinds of matter it applies to, and where it comes
//! from. Only Uganda's rules are held, each read from the primary text this
//! session [P]: the Civil Procedure Rules, the 2019 amendment (O.XIA), the
//! Judicature (Court of Appeal Rules) Directions, the Limitation Act and the
//! Civil Procedure and Limitation (Miscellaneous Provisions) Act. Another
//! country gets no clocks and says so, rather than Uganda's by mistake.
//!
//! Days are calendar days from the day of the event. Whether a period ending
//! on a Saturday, Sunday or public holiday runs to the next working day is
//! not settled by the text read [U]: such a day is flagged, not moved.

use chrono::{Datelike, Duration, Months, Weekday};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{check_timestamp, clean, invalid, DomainError};
use super::matters::require_open;
use super::tasks::{day_start, eat_date};
use pleadli_node_core::db::begin_write;

#[derive(Clone, Copy)]
pub enum Span {
    Days(i64),
    Months(u32),
    Years(u32),
}

#[derive(Clone, Copy, PartialEq)]
pub enum Kind {
    /// Something must be done by the day.
    Deadline,
    /// Something may not be done before the day (suing Government after notice).
    Earliest,
}

pub struct Rule {
    pub key: &'static str,
    pub starts: &'static str,
    pub span: Span,
    pub kind: Kind,
    pub satisfied_by: &'static [&'static str],
    /// Kinds of matter it applies to.
    pub applies_to: &'static [&'static str],
    pub cite: &'static str,
}

const LITIGATION: &[&str] = &["civil_suit", "government_suit", "employment_claim", "family_case", "succession"];
const APPLICATIONS: &[&str] = &["civil_suit", "application", "government_suit", "employment_claim", "family_case", "succession"];
const APPEALABLE: &[&str] = &["civil_suit", "application", "government_suit", "employment_claim", "family_case", "succession", "appeal"];

/// Uganda. Limitation for a suit against Government is the shorter period of
/// the Miscellaneous Provisions Act; the general one applies to everyone else.
pub const UGANDA: &[Rule] = &[
    Rule { key: "serve_summons", starts: "summons_issued", span: Span::Days(21), kind: Kind::Deadline, satisfied_by: &["summons_served"], applies_to: LITIGATION, cite: "CPR O.5 r.1(2)" },
    Rule { key: "file_defence", starts: "served_with_summons", span: Span::Days(15), kind: Kind::Deadline, satisfied_by: &["defence_filed"], applies_to: LITIGATION, cite: "CPR O.9 r.1" },
    Rule { key: "reply_to_defence", starts: "defence_received", span: Span::Days(15), kind: Kind::Deadline, satisfied_by: &["reply_filed"], applies_to: LITIGATION, cite: "CPR O.8 r.18(1)" },
    Rule { key: "reply_to_counterclaim", starts: "counterclaim_received", span: Span::Days(15), kind: Kind::Deadline, satisfied_by: &["reply_filed"], applies_to: LITIGATION, cite: "CPR O.8 r.11(1)" },
    Rule { key: "summons_for_directions", starts: "reply_filed", span: Span::Days(28), kind: Kind::Deadline, satisfied_by: &["directions_taken_out"], applies_to: LITIGATION, cite: "CPR O.XIA r.1(2) (2019)" },
    Rule { key: "complete_adr", starts: "adr_ordered", span: Span::Days(21), kind: Kind::Deadline, satisfied_by: &["adr_completed"], applies_to: LITIGATION, cite: "CPR O.12 r.2(2)" },
    Rule { key: "reply_to_application", starts: "application_served_on_us", span: Span::Days(15), kind: Kind::Deadline, satisfied_by: &["application_reply_filed"], applies_to: APPLICATIONS, cite: "CPR O.12 r.3(2)" },
    Rule { key: "notice_of_appeal", starts: "decision_delivered", span: Span::Days(14), kind: Kind::Deadline, satisfied_by: &["notice_of_appeal_lodged"], applies_to: APPEALABLE, cite: "Court of Appeal Rules r.76(2)" },
    Rule { key: "criminal_notice_of_appeal", starts: "decision_delivered", span: Span::Days(14), kind: Kind::Deadline, satisfied_by: &["notice_of_appeal_lodged"], applies_to: &["criminal_defence"], cite: "Court of Appeal Rules r.60(1)" },
    Rule { key: "memorandum_of_appeal", starts: "notice_of_appeal_lodged", span: Span::Days(60), kind: Kind::Deadline, satisfied_by: &["memorandum_lodged"], applies_to: &["civil_suit", "application", "government_suit", "employment_claim", "family_case", "succession", "appeal"], cite: "Court of Appeal Rules r.83(1)" },
    Rule { key: "notice_to_government", starts: "government_notice_served", span: Span::Days(45), kind: Kind::Earliest, satisfied_by: &["suit_filed"], applies_to: &["government_suit"], cite: "Civil Procedure and Limitation (Misc. Provisions) Act s.2(1)" },
    Rule { key: "limitation_contract", starts: "cause_of_action_contract", span: Span::Years(6), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["civil_suit", "employment_claim"], cite: "Limitation Act s.3(1)(a)" },
    Rule { key: "limitation_tort", starts: "cause_of_action_tort", span: Span::Years(6), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["civil_suit"], cite: "Limitation Act s.3(1)(a)" },
    Rule { key: "limitation_injury", starts: "cause_of_action_injury", span: Span::Years(3), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["civil_suit"], cite: "Limitation Act s.3(1)" },
    Rule { key: "limitation_land", starts: "cause_of_action_land", span: Span::Years(12), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["civil_suit"], cite: "Limitation Act s.5" },
    Rule { key: "limitation_government_contract", starts: "cause_of_action_contract", span: Span::Years(3), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["government_suit"], cite: "Civil Procedure and Limitation (Misc. Provisions) Act s.3(2)" },
    Rule { key: "limitation_government_tort", starts: "cause_of_action_tort", span: Span::Years(2), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["government_suit"], cite: "Civil Procedure and Limitation (Misc. Provisions) Act s.3(1)" },
    Rule { key: "limitation_government_injury", starts: "cause_of_action_injury", span: Span::Years(2), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["government_suit"], cite: "Civil Procedure and Limitation (Misc. Provisions) Act s.3(1)" },
    Rule { key: "enforce_judgment", starts: "judgment_enforceable", span: Span::Years(12), kind: Kind::Deadline, satisfied_by: &["execution_started"], applies_to: &["civil_suit", "government_suit", "employment_claim", "family_case"], cite: "Limitation Act s.3(3)" },
];

/// Kenya, read from the texts on Kenya Law (new.kenyalaw.org) on 2026-10-07 [P]:
/// the Civil Procedure Rules 2010 (revised to 31 December 2022), the Court of
/// Appeal Rules 2022 (L.N. 40/2022), the Limitation of Actions Act (Cap. 22),
/// the Public Authorities Limitation Act (Cap. 39) and the Government
/// Proceedings Act (Cap. 40). Appearance is "within the time prescribed in the
/// summons" (O.6 r.1, never under ten days, O.5 r.1(4)), so it is not counted;
/// the defence runs from the appearance. Opposing an application is counted
/// back from the hearing day (O.51 r.14(2)), which this list does not hold yet.
pub const KENYA: &[Rule] = &[
    Rule { key: "summons_validity", starts: "summons_issued", span: Span::Months(12), kind: Kind::Deadline, satisfied_by: &["summons_served"], applies_to: LITIGATION, cite: "CPR O.5 r.2(1)" },
    Rule { key: "file_defence", starts: "appearance_entered", span: Span::Days(14), kind: Kind::Deadline, satisfied_by: &["defence_filed"], applies_to: LITIGATION, cite: "CPR O.7 r.1" },
    Rule { key: "reply_to_defence", starts: "defence_received", span: Span::Days(14), kind: Kind::Deadline, satisfied_by: &["reply_filed"], applies_to: LITIGATION, cite: "CPR O.7 r.17(1)" },
    Rule { key: "reply_to_counterclaim", starts: "counterclaim_received", span: Span::Days(15), kind: Kind::Deadline, satisfied_by: &["reply_filed"], applies_to: LITIGATION, cite: "CPR O.7 r.11" },
    Rule { key: "case_management_checklist", starts: "pleadings_closed", span: Span::Days(14), kind: Kind::Deadline, satisfied_by: &["checklist_filed"], applies_to: LITIGATION, cite: "CPR O.11 r.2(1); close of pleadings O.2 r.13" },
    Rule { key: "notice_of_appeal", starts: "decision_delivered", span: Span::Days(14), kind: Kind::Deadline, satisfied_by: &["notice_of_appeal_lodged"], applies_to: APPEALABLE, cite: "Court of Appeal Rules 2022 r.77(2)" },
    Rule { key: "criminal_notice_of_appeal", starts: "decision_delivered", span: Span::Days(14), kind: Kind::Deadline, satisfied_by: &["notice_of_appeal_lodged"], applies_to: &["criminal_defence"], cite: "Court of Appeal Rules 2022 r.61(1)" },
    Rule { key: "memorandum_of_appeal", starts: "notice_of_appeal_lodged", span: Span::Days(60), kind: Kind::Deadline, satisfied_by: &["memorandum_lodged"], applies_to: &["civil_suit", "application", "government_suit", "employment_claim", "family_case", "succession", "appeal"], cite: "Court of Appeal Rules 2022 r.84(1)" },
    Rule { key: "notice_to_government_30", starts: "government_notice_served", span: Span::Days(30), kind: Kind::Earliest, satisfied_by: &["suit_filed"], applies_to: &["government_suit"], cite: "Government Proceedings Act s.13A(1)" },
    Rule { key: "limitation_contract", starts: "cause_of_action_contract", span: Span::Years(6), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["civil_suit", "employment_claim"], cite: "Limitation of Actions Act s.4(1)(a)" },
    Rule { key: "limitation_tort", starts: "cause_of_action_tort", span: Span::Years(3), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["civil_suit"], cite: "Limitation of Actions Act s.4(2)" },
    Rule { key: "limitation_injury", starts: "cause_of_action_injury", span: Span::Years(3), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["civil_suit"], cite: "Limitation of Actions Act s.4(2)" },
    Rule { key: "limitation_land", starts: "cause_of_action_land", span: Span::Years(12), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["civil_suit"], cite: "Limitation of Actions Act s.7" },
    Rule { key: "limitation_government_contract", starts: "cause_of_action_contract", span: Span::Years(3), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["government_suit"], cite: "Public Authorities Limitation Act s.3(2)" },
    Rule { key: "limitation_government_tort", starts: "cause_of_action_tort", span: Span::Months(12), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["government_suit"], cite: "Public Authorities Limitation Act s.3(1)" },
    Rule { key: "limitation_government_injury", starts: "cause_of_action_injury", span: Span::Months(12), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["government_suit"], cite: "Public Authorities Limitation Act s.3(1)" },
    Rule { key: "enforce_judgment", starts: "judgment_enforceable", span: Span::Years(12), kind: Kind::Deadline, satisfied_by: &["execution_started"], applies_to: &["civil_suit", "government_suit", "employment_claim", "family_case"], cite: "Limitation of Actions Act s.4(4)" },
];

/// Tanzania (Mainland), read on 2026-10-07 [P] from the Civil Procedure Code
/// (Amendment of the First Schedule) Rules, G.N. 381 of 2019; the Tanzania
/// Court of Appeal Rules, 2009 (G.N. 368/2009; periods confirmed unchanged by
/// G.N. 344/2019 in later judgments [S]); the Law of Limitation Act (Cap. 89
/// R.E. 2019, Schedule); and the Government Proceedings Act (Cap. 5, s.6(2)).
/// The Limitation Act sets no shorter period for suing Government, so a
/// Government suit gets the 90-day notice and no limitation of its own here.
pub const TANZANIA: &[Rule] = &[
    Rule { key: "file_defence", starts: "served_with_summons", span: Span::Days(21), kind: Kind::Deadline, satisfied_by: &["defence_filed"], applies_to: LITIGATION, cite: "CPC O.VIII r.1(1) (G.N. 381/2019)" },
    Rule { key: "notice_of_appeal", starts: "decision_delivered", span: Span::Days(30), kind: Kind::Deadline, satisfied_by: &["notice_of_appeal_lodged"], applies_to: APPEALABLE, cite: "Court of Appeal Rules 2009 r.83(2)" },
    Rule { key: "criminal_notice_of_appeal", starts: "decision_delivered", span: Span::Days(30), kind: Kind::Deadline, satisfied_by: &["notice_of_appeal_lodged"], applies_to: &["criminal_defence"], cite: "Court of Appeal Rules 2009 r.68(1)" },
    Rule { key: "memorandum_of_appeal", starts: "notice_of_appeal_lodged", span: Span::Days(60), kind: Kind::Deadline, satisfied_by: &["memorandum_lodged"], applies_to: &["civil_suit", "application", "government_suit", "employment_claim", "family_case", "succession", "appeal"], cite: "Court of Appeal Rules 2009 r.90(1)" },
    Rule { key: "notice_to_government_90", starts: "government_notice_served", span: Span::Days(90), kind: Kind::Earliest, satisfied_by: &["suit_filed"], applies_to: &["government_suit"], cite: "Government Proceedings Act s.6(2)" },
    Rule { key: "limitation_contract", starts: "cause_of_action_contract", span: Span::Years(6), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["civil_suit", "employment_claim"], cite: "Law of Limitation Act, Sch. Pt I item 7" },
    Rule { key: "limitation_tort", starts: "cause_of_action_tort", span: Span::Years(3), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["civil_suit"], cite: "Law of Limitation Act, Sch. Pt I item 6" },
    Rule { key: "limitation_injury", starts: "cause_of_action_injury", span: Span::Years(3), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["civil_suit"], cite: "Law of Limitation Act, Sch. Pt I item 6" },
    Rule { key: "limitation_land", starts: "cause_of_action_land", span: Span::Years(12), kind: Kind::Deadline, satisfied_by: &["suit_filed"], applies_to: &["civil_suit"], cite: "Law of Limitation Act, Sch. Pt I item 22" },
    Rule { key: "enforce_judgment", starts: "judgment_enforceable", span: Span::Years(12), kind: Kind::Deadline, satisfied_by: &["execution_started"], applies_to: &["civil_suit", "government_suit", "employment_claim", "family_case"], cite: "Law of Limitation Act, Sch. Pt III item 20" },
];

/// The rules of a country, when they have been read. None: not researched.
pub fn rules_for(jurisdiction: &str) -> Option<&'static [Rule]> {
    match jurisdiction {
        "ug" => Some(UGANDA),
        "ke" => Some(KENYA),
        "tz" => Some(TANZANIA),
        _ => None,
    }
}

/// Every event that means something to a kind of matter under these rules,
/// in the order a matter usually meets them.
pub fn events_for(rules: &[Rule], matter_type: &str) -> Vec<&'static str> {
    let mut out: Vec<&'static str> = Vec::new();
    for r in rules.iter().filter(|r| r.applies_to.contains(&matter_type)) {
        for e in std::iter::once(&r.starts).chain(r.satisfied_by.iter()) {
            if !out.contains(e) {
                out.push(e);
            }
        }
    }
    out
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MatterEvent {
    pub id: String,
    pub matter_id: String,
    pub kind: String,
    pub on_day: i64,
    pub note: Option<String>,
    pub recorded_by: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventInput {
    pub kind: String,
    pub on_day: i64,
    pub note: Option<String>,
}

/// One running (or answered) deadline on a matter.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Clock {
    pub rule: &'static str,
    pub matter_id: String,
    /// `deadline` (do it by `due_on`) or `earliest` (not before `due_on`).
    pub kind: &'static str,
    pub started_by: String,
    pub started_on: i64,
    pub due_on: i64,
    /// `done` (answered by a later event), `overdue`, `soon` (within 7 days),
    /// `running`, or for an earliest date `waiting` / `ready`.
    pub status: &'static str,
    pub days_left: i64,
    /// The day falls on a Saturday or Sunday: check whether it moves [U].
    pub weekend: bool,
    pub cite: &'static str,
}

fn due(started_on: i64, span: Span) -> i64 {
    let Some(date) = eat_date(started_on) else { return started_on };
    let end = match span {
        Span::Days(n) => date + Duration::days(n),
        Span::Months(mo) => date.checked_add_months(Months::new(mo)).unwrap_or(date),
        Span::Years(y) => date.checked_add_months(Months::new(12 * y)).unwrap_or(date),
    };
    day_start(end)
}

/// The clocks of one matter, from its events, as they stand on `today`.
pub fn compute(rules: &[Rule], matter_id: &str, matter_type: &str, events: &[MatterEvent], today: i64) -> Vec<Clock> {
    let today = eat_date(today).map(day_start).unwrap_or(today);
    let mut clocks = Vec::new();
    for rule in rules.iter().filter(|r| r.applies_to.contains(&matter_type)) {
        // The latest start counts: a second summons restarts service.
        let Some(start) = events.iter().filter(|e| e.kind == rule.starts).max_by_key(|e| e.on_day) else { continue };
        let due_on = due(start.on_day, rule.span);
        let answered = events.iter().any(|e| rule.satisfied_by.contains(&e.kind.as_str()) && e.on_day >= start.on_day && e.id != start.id);
        let days_left = (due_on - today).div_euclid(86_400_000);
        let status = match rule.kind {
            Kind::Earliest if answered => "done",
            Kind::Earliest if days_left > 0 => "waiting",
            Kind::Earliest => "ready",
            Kind::Deadline if answered => "done",
            Kind::Deadline if days_left < 0 => "overdue",
            Kind::Deadline if days_left <= 7 => "soon",
            Kind::Deadline => "running",
        };
        let weekend = eat_date(due_on).map(|d| matches!(d.weekday(), Weekday::Sat | Weekday::Sun)).unwrap_or(false);
        clocks.push(Clock {
            rule: rule.key,
            matter_id: matter_id.to_string(),
            kind: if rule.kind == Kind::Deadline { "deadline" } else { "earliest" },
            started_by: start.kind.clone(),
            started_on: start.on_day,
            due_on,
            status,
            days_left,
            weekend,
            cite: rule.cite,
        });
    }
    clocks.sort_by_key(|c| (c.status == "done", c.due_on));
    clocks
}

async fn jurisdiction(pool: &SqlitePool) -> Result<String, sqlx::Error> {
    Ok(sqlx::query_scalar::<_, String>("SELECT jurisdiction FROM installation WHERE id = 'this'").fetch_optional(pool).await?.unwrap_or_else(|| "ug".to_string()))
}

pub async fn list_events(pool: &SqlitePool, matter_id: &str) -> Result<Vec<MatterEvent>, sqlx::Error> {
    sqlx::query_as::<_, MatterEvent>("SELECT id, matter_id, kind, on_day, note, recorded_by, created_at FROM matter_events WHERE matter_id = ? ORDER BY on_day, created_at")
        .bind(matter_id)
        .fetch_all(pool)
        .await
}

/// What the matter's screen needs: its events, the clocks they start, the
/// events that can be recorded for its kind, and whether the country's rules
/// are held at all.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatterClocks {
    pub researched: bool,
    pub events: Vec<MatterEvent>,
    pub clocks: Vec<Clock>,
    pub can_record: Vec<&'static str>,
}

pub async fn for_matter(pool: &SqlitePool, matter_id: &str, matter_type: &str) -> Result<MatterClocks, sqlx::Error> {
    let events = list_events(pool, matter_id).await?;
    let Some(rules) = rules_for(&jurisdiction(pool).await?) else {
        return Ok(MatterClocks { researched: false, events, clocks: Vec::new(), can_record: Vec::new() });
    };
    let clocks = compute(rules, matter_id, matter_type, &events, chrono::Utc::now().timestamp_millis());
    Ok(MatterClocks { researched: true, can_record: events_for(rules, matter_type), events, clocks })
}

pub async fn record(pool: &SqlitePool, matter_id: &str, input: EventInput, by: Option<String>) -> Result<MatterEvent, DomainError> {
    // A cause of action can lie years back; anything else is at most a day ahead.
    check_timestamp(input.on_day, "The day")?;
    let mut tx = begin_write(pool).await?;
    require_open(&mut tx, matter_id).await?;
    let matter_type: String = sqlx::query_scalar("SELECT matter_type FROM matters WHERE id = ?").bind(matter_id).fetch_one(&mut *tx).await?;
    let place: String = sqlx::query_scalar::<_, String>("SELECT jurisdiction FROM installation WHERE id = 'this'").fetch_optional(&mut *tx).await?.unwrap_or_else(|| "ug".to_string());
    let Some(rules) = rules_for(&place) else { return invalid("The deadlines of this country are not held yet, so nothing can be counted from it.") };
    if !events_for(rules, &matter_type).contains(&input.kind.as_str()) {
        return invalid("That event does not start or answer a deadline for this kind of matter.");
    }
    let on_day = eat_date(input.on_day).map(day_start).unwrap_or(input.on_day);
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO matter_events (id, matter_id, kind, on_day, note, recorded_by) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(matter_id)
        .bind(&input.kind)
        .bind(on_day)
        .bind(clean(input.note))
        .bind(&by)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("event_recorded").subject("matter_event", &id).scope(matter_id).detail(&input.kind)).await?;
    tx.commit().await?;
    Ok(sqlx::query_as::<_, MatterEvent>("SELECT id, matter_id, kind, on_day, note, recorded_by, created_at FROM matter_events WHERE id = ?").bind(&id).fetch_one(pool).await?)
}

/// A mistaken entry is removed, and the removal is in the audit trail.
pub async fn remove(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let mut tx = begin_write(pool).await?;
    let matter_id: Option<String> = sqlx::query_scalar("SELECT matter_id FROM matter_events WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    let Some(matter_id) = matter_id else { return Err(DomainError::NotFound("Event not found.".to_string())) };
    require_open(&mut tx, &matter_id).await?;
    sqlx::query("DELETE FROM matter_events WHERE id = ?").bind(id).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("event_removed").subject("matter_event", id).scope(&matter_id)).await?;
    tx.commit().await?;
    Ok(())
}

/// A clock with the matter it runs on, for Today and the calendar.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeClock {
    #[serde(flatten)]
    pub clock: Clock,
    pub matter_title: String,
    pub court_number: Option<String>,
}

/// Every clock not yet answered on every open matter, soonest first.
pub async fn open_clocks(pool: &SqlitePool) -> Result<Vec<PracticeClock>, sqlx::Error> {
    let Some(rules) = rules_for(&jurisdiction(pool).await?) else { return Ok(Vec::new()) };
    let matters: Vec<(String, String, String, Option<String>)> =
        sqlx::query_as("SELECT id, matter_type, title, court_number FROM matters WHERE status = 'open' AND EXISTS (SELECT 1 FROM matter_events e WHERE e.matter_id = matters.id)").fetch_all(pool).await?;
    let now = chrono::Utc::now().timestamp_millis();
    let mut out = Vec::new();
    for (id, matter_type, title, court_number) in matters {
        let events = list_events(pool, &id).await?;
        for clock in compute(rules, &id, &matter_type, &events, now).into_iter().filter(|c| c.status != "done") {
            out.push(PracticeClock { clock, matter_title: title.clone(), court_number: court_number.clone() });
        }
    }
    out.sort_by_key(|c| c.clock.due_on);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn day(y: i32, m: u32, d: u32) -> i64 {
        day_start(NaiveDate::from_ymd_opt(y, m, d).unwrap())
    }

    fn event(kind: &str, on: i64) -> MatterEvent {
        MatterEvent { id: format!("{kind}-{on}"), matter_id: "m".into(), kind: kind.into(), on_day: on, note: None, recorded_by: None, created_at: on }
    }

    fn clock<'a>(clocks: &'a [Clock], rule: &str) -> &'a Clock {
        clocks.iter().find(|c| c.rule == rule).unwrap_or_else(|| panic!("no {rule} clock"))
    }

    #[test]
    fn a_defence_is_due_fifteen_days_after_service_and_is_answered_by_filing_it() {
        let served = day(2026, 9, 1);
        let clocks = compute(UGANDA, "m", "civil_suit", &[event("served_with_summons", served)], day(2026, 9, 5));
        let c = clock(&clocks, "file_defence");
        assert_eq!(c.due_on, day(2026, 9, 16));
        assert_eq!((c.status, c.days_left), ("running", 11));
        let clocks = compute(UGANDA, "m", "civil_suit", &[event("served_with_summons", served)], day(2026, 9, 12));
        assert_eq!(clock(&clocks, "file_defence").status, "soon");
        let clocks = compute(UGANDA, "m", "civil_suit", &[event("served_with_summons", served)], day(2026, 9, 17));
        assert_eq!(clock(&clocks, "file_defence").status, "overdue");
        let clocks = compute(UGANDA, "m", "civil_suit", &[event("served_with_summons", served), event("defence_filed", day(2026, 9, 14))], day(2026, 9, 20));
        assert_eq!(clock(&clocks, "file_defence").status, "done");
    }

    #[test]
    fn an_appeal_needs_notice_in_fourteen_days_then_the_memorandum_sixty_days_after_the_notice() {
        let decided = day(2026, 3, 2);
        let events = [event("decision_delivered", decided), event("notice_of_appeal_lodged", day(2026, 3, 10))];
        let clocks = compute(UGANDA, "m", "civil_suit", &events, day(2026, 3, 11));
        assert_eq!(clock(&clocks, "notice_of_appeal").status, "done");
        assert_eq!(clock(&clocks, "memorandum_of_appeal").due_on, day(2026, 5, 9));
    }

    #[test]
    fn government_gets_the_shorter_limitation_and_the_forty_five_day_notice() {
        let arose = day(2025, 1, 15);
        let events = [event("cause_of_action_tort", arose), event("government_notice_served", day(2026, 9, 1))];
        let clocks = compute(UGANDA, "m", "government_suit", &events, day(2026, 9, 20));
        assert_eq!(clock(&clocks, "limitation_government_tort").due_on, day(2027, 1, 15), "2 years, not 6");
        assert!(!clocks.iter().any(|c| c.rule == "limitation_tort"), "the general 6 years does not run against Government");
        let notice = clock(&clocks, "notice_to_government");
        assert_eq!((notice.kind, notice.status, notice.due_on), ("earliest", "waiting", day(2026, 10, 16)));
        let clocks = compute(UGANDA, "m", "civil_suit", &[event("cause_of_action_tort", arose)], day(2026, 9, 20));
        assert_eq!(clock(&clocks, "limitation_tort").due_on, day(2031, 1, 15));
    }

    #[test]
    fn a_weekend_due_day_is_flagged_not_moved() {
        // 15 days after Friday 4 September 2026 is Saturday 19 September.
        let clocks = compute(UGANDA, "m", "civil_suit", &[event("served_with_summons", day(2026, 9, 4))], day(2026, 9, 5));
        let c = clock(&clocks, "file_defence");
        assert_eq!(c.due_on, day(2026, 9, 19));
        assert!(c.weekend);
    }

    #[test]
    fn only_rules_read_are_held_and_every_event_belongs_to_a_kind() {
        assert!(rules_for("ug").is_some());
        assert!(rules_for("rw").is_none(), "no country gets another's periods by mistake");
        assert!(events_for(UGANDA, "civil_suit").contains(&"served_with_summons"));
        assert!(events_for(UGANDA, "advice").is_empty(), "advice has no court deadlines");
        for rule in UGANDA {
            for t in rule.applies_to {
                assert!(crate::domain::matter_types::find(t).is_some(), "{} applies to unknown {t}", rule.key);
            }
        }
    }
}
