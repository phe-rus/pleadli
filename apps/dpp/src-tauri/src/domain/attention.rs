//! What each file needs next, who it is waiting on, and whether that is the
//! person signed in. This is the one place those questions are answered.
//!
//! A file is described on four separate levels, because one answer cannot be
//! all of them:
//!
//! 1. its overall `state` (unallocated, reading, deciding, preparing, sending,
//!    with Police, in court, closed): where the file is;
//! 2. its `obligations`: everything owed on it now, at the same time. A file in
//!    court can also have a paper to prepare, a time limit running and a task
//!    for a colleague; each is its own entry with its own date and its own
//!    "is this mine" answer;
//! 3. its `primary` obligation: the one most worth doing first, for the person
//!    signed in. It is a pointer into the list, never a replacement for it;
//! 4. the signed-in person's own responsibilities (`held_by_me`, `needs_me`,
//!    `can_take`), which follow from the obligations and from what that person
//!    is allowed to do (`capabilities.rs`).
//!
//! Before this module the app held two fields that could disagree: the
//! decision-derived `current_status` and the working `stage`. Each screen picked
//! one of them, so the same file was "awaiting a decision" in the status bar and
//! "Prepare" in the Files list. Nothing outside this module reads either field
//! to decide what is waiting on whom. No status is stored here; every answer is
//! derived from the records at the moment it is asked.
//!
//! Only states the product models are used. Where the law or the office's
//! practice is not yet known, the rule says so in a comment and in
//! `docs/dpp/ATTENTION-RULES-2026-11-27.md` rather than guessing.

use serde::Serialize;
use sqlx::{FromRow, SqlitePool};
use std::collections::HashMap;

use super::capabilities::{self, Set};
use super::staff::Actor;

const DAY_MS: i64 = 86_400_000;

/// The stage's next step: what the file needs to happen.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    /// A police file has arrived and nobody holds it yet: it is to be given out.
    Allocate,
    /// Read the police file and weigh the evidence.
    Read,
    /// Record the decision the law allows, with reasons.
    Decide,
    /// Draft the papers the decision needs.
    Prepare,
    /// Hand the answer back to Police, the court or others.
    Send,
    /// The file is with Police for further investigation.
    AwaitPolice,
    /// Charged and before the court: hearings, answers, reminders.
    FollowCourt,
    /// Nothing further is owed on the file.
    Closed,
}

/// Where the file is overall.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum State {
    Unallocated,
    Reading,
    Deciding,
    Preparing,
    Sending,
    WithPolice,
    InCourt,
    Closed,
}

/// Who the file is waiting on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Holder {
    /// Nobody holds it yet: the office gives it out.
    Office,
    /// A member of staff (named in `holder_name` when the file has been given out).
    Officer,
    /// A decision only the Director may take is waiting.
    Director,
    Police,
    Nobody,
}

/// One thing owed on a file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Allocate,
    Read,
    Decide,
    DirectorDecision,
    Prepare,
    Send,
    PoliceReply,
    Hearing,
    TimeLimit,
    Task,
}

impl Kind {
    /// The kinds that come from the file's stage, as opposed to a date or a task.
    fn is_stage(self) -> bool {
        matches!(self, Kind::Allocate | Kind::Read | Kind::Decide | Kind::DirectorDecision | Kind::Prepare | Kind::Send | Kind::PoliceReply)
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Obligation {
    pub kind: Kind,
    /// When it is due, or when the hearing is.
    pub due_at: Option<i64>,
    pub overdue: bool,
    /// The signed-in person is the one who has to do it.
    pub mine: bool,
    /// Which time limit, or what the task says; empty for the rest.
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Next {
    pub file_id: String,
    /// The stage's next step. Not the whole story: see `obligations`.
    pub action: Action,
    pub state: State,
    pub holder: Holder,
    pub holder_id: Option<String>,
    pub holder_name: Option<String>,
    /// The signed-in person is the one this file is held by.
    pub held_by_me: bool,
    /// The signed-in person has something to do on it now (any obligation of theirs).
    pub needs_me: bool,
    /// Nobody holds it and the signed-in person may take it for themselves.
    pub can_take: bool,
    /// Everything owed on the file, mine first, then most urgent first.
    pub obligations: Vec<Obligation>,
    /// The first of `obligations`: the one to do first.
    pub primary: Option<Obligation>,
    /// The most urgent date among the obligations that are mine (or all, when none is).
    pub due_at: Option<i64>,
    pub overdue: bool,
}

/// Counts for the signed-in person, from the same `Next` rows the lists show.
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    /// Files that need the signed-in person now. The sum of the next five.
    pub total: i64,
    pub to_allocate: i64,
    pub to_read: i64,
    pub to_decide: i64,
    pub to_send: i64,
    /// Needing them only for a hearing, a time limit, a task or a chase.
    pub to_follow_up: i64,
    /// Of `total`, how many are past a time limit.
    pub overdue: i64,
    /// Of `total`, how many have more than one thing owed by the signed-in person.
    pub with_several: i64,
    /// Held by the signed-in person and only waiting.
    pub waiting: i64,
    /// With Police for further investigation, whoever holds them.
    pub with_police: i64,
    /// Before the court, whoever holds them.
    pub in_court: i64,
    /// Held by a colleague and needing them, not me.
    pub with_colleagues: i64,
    /// Open files nobody holds yet.
    pub unallocated: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attention {
    pub items: Vec<Next>,
    pub summary: Summary,
}

/// The facts the rules need about one file, read in one query.
#[derive(Debug, Clone, FromRow)]
pub struct Facts {
    pub id: String,
    pub stage: String,
    pub current_status: String,
    pub assigned_to: Option<String>,
    pub assignee_name: Option<String>,
    /// Waiting proposals for the decide stage that name a decision only the Director may take.
    pub director_pending: i64,
    /// When Police were asked to answer by, on the latest handover.
    pub reply_due: Option<i64>,
    /// A charging decision has been recorded on the file (its status is no longer
    /// under review, resubmitted or returned).
    #[sqlx(try_from = "i64")]
    pub decided: bool,
    /// A review is open on it that reopens an earlier decision.
    #[sqlx(try_from = "i64")]
    pub reopened: bool,
}

/// An open time limit on a file: which one, when it runs out and whether it has.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Limit {
    pub kind: String,
    pub due_at: Option<i64>,
    pub overdue: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskDue {
    pub title: String,
    pub assigned_to: Option<String>,
    pub due_at: Option<i64>,
}

/// Dated and assigned things beyond the stage: hearings, time limits, tasks.
#[derive(Debug, Clone, Default)]
pub struct Extras {
    /// Start times of hearings from a day ago onward, earliest first.
    pub hearings: Vec<i64>,
    pub limits: Vec<Limit>,
    pub tasks: Vec<TaskDue>,
}

/// Who is asking, what they may do, and how far ahead a hearing needs them.
#[derive(Debug, Clone)]
pub struct Viewer<'a> {
    pub actor: &'a Actor,
    pub caps: Set,
}

/// How many days before a hearing the prosecutor is told to prepare, when the
/// office has not set it. A working choice, not a rule from a standard: it is
/// the `hearing_notice` time limit in Settings.
pub const DEFAULT_HEARING_NOTICE_DAYS: i64 = 2;

/// The rules. Pure: the same facts, viewer and clock always give the same
/// answer, which is what lets every screen agree and the rules be tested
/// without a database.
pub fn derive(facts: &Facts, extras: &Extras, viewer: Option<&Viewer>, notice_ms: i64, now: i64) -> Next {
    let actor = viewer.map(|v| v.actor);
    let caps = viewer.map(|v| v.caps).unwrap_or_default();

    let mut next = Next {
        file_id: facts.id.clone(),
        action: Action::Read,
        state: State::Reading,
        holder: Holder::Officer,
        holder_id: facts.assigned_to.clone(),
        holder_name: facts.assignee_name.clone(),
        held_by_me: false,
        needs_me: false,
        can_take: false,
        obligations: Vec::new(),
        primary: None,
        due_at: None,
        overdue: false,
    };

    // A review reopening an earlier decision brings a closed file back to the
    // prosecutor, who must decide again.
    let stage = if facts.stage == "concluded" && facts.reopened {
        "decide"
    } else if facts.decided && matches!(facts.stage.as_str(), "receive" | "review" | "decide") {
        // A decision recorded outside the stepper (the older Decisions route) leaves
        // the stage behind. The decision is made; its papers and answer are next.
        "prepare"
    } else {
        facts.stage.as_str()
    };

    // Closed first: a concluded file owes nothing, whatever its status says.
    if stage == "concluded" {
        next.action = Action::Closed;
        next.state = State::Closed;
        next.holder = Holder::Nobody;
        next.holder_id = None;
        next.holder_name = None;
        return next;
    }

    // The signed-in person is responsible for a file given to them, and for one
    // nobody holds yet. UNRESOLVED: nothing in the app stops another officer
    // from working a file that was given to a colleague, so this is only about
    // whose list it appears on.
    let responsible_me = match (&facts.assigned_to, actor) {
        (Some(a), Some(x)) => a == &x.id,
        (None, Some(_)) => true,
        _ => false,
    };
    // Work on a file is the work of someone who may review files. An
    // administrator who only administers has none of it, whoever holds the file.
    let does_work = responsible_me && caps.review_files;
    let mut owed: Vec<Obligation> = Vec::new();
    let stage_owed = |kind: Kind, mine: bool, due_at: Option<i64>, overdue: bool| Obligation { kind, due_at, overdue, mine, detail: None };

    // Gone back to Police for further investigation. The prosecutor is waiting,
    // and chases only when the answer date they set has passed.
    if facts.current_status == "returned_for_investigation" {
        next.action = Action::AwaitPolice;
        next.state = State::WithPolice;
        next.holder = Holder::Police;
        next.holder_id = None;
        next.holder_name = None;
        let late = facts.reply_due.is_some_and(|d| d < now);
        next.held_by_me = does_work && facts.assigned_to.is_some();
        owed.push(stage_owed(Kind::PoliceReply, does_work && late, facts.reply_due, late));
    } else {
        match stage {
            "receive" | "review" if facts.assigned_to.is_none() => {
                next.action = Action::Allocate;
                next.state = State::Unallocated;
                next.holder = Holder::Office;
                next.can_take = caps.self_assign && caps.review_files;
                owed.push(stage_owed(Kind::Allocate, caps.allocate_files, None, false));
            }
            "receive" | "review" => {
                next.action = Action::Read;
                next.state = State::Reading;
                next.held_by_me = does_work;
                owed.push(stage_owed(Kind::Read, does_work, None, false));
            }
            "decide" => {
                next.action = Action::Decide;
                next.state = State::Deciding;
                if facts.director_pending > 0 {
                    // Discontinuance and nolle prosequi are the Director's alone
                    // (Constitution Art. 120(3)(d), Trial on Indictments Act s.135).
                    next.holder = Holder::Director;
                    next.holder_id = None;
                    next.holder_name = None;
                    next.held_by_me = caps.approve_director_decisions;
                    owed.push(stage_owed(Kind::DirectorDecision, caps.approve_director_decisions, None, false));
                } else {
                    next.held_by_me = does_work;
                    owed.push(stage_owed(Kind::Decide, does_work, None, false));
                }
            }
            "prepare" => {
                next.action = Action::Prepare;
                next.state = State::Preparing;
                next.held_by_me = does_work;
                owed.push(stage_owed(Kind::Prepare, does_work, None, false));
            }
            "handover" => {
                next.action = Action::Send;
                next.state = State::Sending;
                next.held_by_me = does_work;
                owed.push(stage_owed(Kind::Send, does_work, None, false));
            }
            "follow_up" => {
                next.action = Action::FollowCourt;
                next.state = State::InCourt;
                next.held_by_me = does_work;
            }
            // Unknown stage: say nothing is owed rather than invent a duty.
            _ => {
                next.action = Action::Closed;
                next.state = State::Closed;
                next.holder = Holder::Nobody;
                return next;
            }
        }
    }

    // Hearings, from any stage: a paper still to prepare does not hide a date
    // in court. Each hearing within the notice period is owed by the one who
    // holds the file; the first one after that is listed so it is not forgotten,
    // but is nobody's yet.
    let mut listed_later = false;
    for &h in extras.hearings.iter().filter(|h| **h >= now - DAY_MS) {
        let near = h <= now + notice_ms;
        if near {
            owed.push(Obligation { kind: Kind::Hearing, due_at: Some(h), overdue: false, mine: does_work, detail: None });
        } else if !listed_later {
            listed_later = true;
            owed.push(Obligation { kind: Kind::Hearing, due_at: Some(h), overdue: false, mine: false, detail: None });
        }
    }

    // Time limits the office keeps: each one its own line. Giving a file out is
    // for whoever may give files out; the rest for the one who holds it.
    for l in &extras.limits {
        if l.kind == "allocation" {
            // The time limit for giving a file out is the date of the giving-out step itself, not a second duty.
            if let Some(step) = owed.iter_mut().find(|o| o.kind == Kind::Allocate) {
                step.due_at = l.due_at;
                step.overdue = l.overdue;
            }
            continue;
        }
        owed.push(Obligation { kind: Kind::TimeLimit, due_at: l.due_at, overdue: l.overdue, mine: l.overdue && does_work, detail: Some(l.kind.clone()) });
    }

    // Tasks (including directions to Police and communication with colleagues):
    // each belongs to the person it is assigned to.
    for t in &extras.tasks {
        let mine = matches!((&t.assigned_to, actor), (Some(a), Some(x)) if a == &x.id);
        owed.push(Obligation { kind: Kind::Task, due_at: t.due_at, overdue: t.due_at.is_some_and(|d| d < now), mine, detail: Some(t.title.clone()) });
    }

    // Mine first, then past due, then the nearest date; dateless stage steps
    // before dateless extras, so the stage step leads when nothing is dated.
    owed.sort_by_key(|o| (!o.mine, !o.overdue, o.due_at.unwrap_or(i64::MAX), !o.kind.is_stage()));
    next.needs_me = owed.iter().any(|o| o.mine);
    let lead = owed.iter().find(|o| o.mine).or(owed.first());
    next.due_at = lead.and_then(|o| o.due_at);
    next.overdue = owed.iter().any(|o| o.mine && o.overdue) || (!next.needs_me && owed.iter().any(|o| o.overdue));
    next.primary = lead.cloned();
    next.obligations = owed;
    next
}

pub fn summarise(items: &[Next]) -> Summary {
    let mut s = Summary::default();
    for n in items {
        match n.action {
            Action::AwaitPolice => s.with_police += 1,
            Action::FollowCourt => s.in_court += 1,
            Action::Allocate => s.unallocated += 1,
            _ => {}
        }
        if n.needs_me {
            s.total += 1;
            if n.obligations.iter().any(|o| o.mine && o.overdue) {
                s.overdue += 1;
            }
            if n.obligations.iter().filter(|o| o.mine).count() > 1 {
                s.with_several += 1;
            }
            // Counted once, under the stage step when that step is mine, else as follow-up.
            match n.obligations.iter().find(|o| o.mine && o.kind.is_stage()).map(|o| o.kind) {
                Some(Kind::Allocate) => s.to_allocate += 1,
                Some(Kind::Read) => s.to_read += 1,
                Some(Kind::Decide | Kind::DirectorDecision) => s.to_decide += 1,
                Some(Kind::Prepare | Kind::Send) => s.to_send += 1,
                _ => s.to_follow_up += 1,
            }
        } else if n.held_by_me && n.action != Action::Closed {
            s.waiting += 1;
        } else if matches!(n.holder, Holder::Officer) && n.holder_id.is_some() && !n.held_by_me && !matches!(n.action, Action::FollowCourt | Action::AwaitPolice) {
            s.with_colleagues += 1;
        }
    }
    s
}

const FACTS: &str = "SELECT f.id AS id, f.stage AS stage, f.current_status AS current_status, f.assigned_to AS assigned_to, s.name AS assignee_name,
        (SELECT COUNT(*) FROM proposals p WHERE p.prosecution_file_id = f.id AND p.stage = 'decide' AND p.status = 'proposed'
            AND json_extract(p.body, '$.decision') IN ('discontinue', 'nolle_prosequi')) AS director_pending,
        (SELECT MAX(hv.reply_due_at) FROM handovers hv WHERE hv.prosecution_file_id = f.id) AS reply_due,
        (f.current_status NOT IN ('under_review', 'resubmitted', 'returned_for_investigation')) AS decided,
        EXISTS (SELECT 1 FROM charging_reviews r WHERE r.prosecution_file_id = f.id AND r.concluded_at IS NULL AND r.reopens_decision_id IS NOT NULL) AS reopened
   FROM prosecution_files f LEFT JOIN staff s ON s.id = f.assigned_to";

/// Hearings, time limits and open tasks, grouped by file.
async fn extras(pool: &SqlitePool, now: i64, only: Option<&str>) -> Result<HashMap<String, Extras>, sqlx::Error> {
    let mut by_file: HashMap<String, Extras> = HashMap::new();

    let hearings: Vec<(String, i64)> = sqlx::query_as("SELECT prosecution_file_id, starts_at FROM hearings WHERE starts_at >= ? ORDER BY starts_at")
        .bind(now - DAY_MS)
        .fetch_all(pool)
        .await?;
    for (file, at) in hearings {
        by_file.entry(file).or_default().hearings.push(at);
    }

    for c in super::clocks::clocks(pool).await? {
        by_file.entry(c.file_id).or_default().limits.push(Limit { kind: c.kind, due_at: c.due_at, overdue: c.overdue });
    }

    // Only tasks a person has accepted (not Assist's proposals) and that are still to do.
    let tasks: Vec<(String, String, Option<String>, Option<i64>)> = sqlx::query_as(
        "SELECT prosecution_file_id, title, assigned_to, due_at FROM tasks WHERE prosecution_file_id IS NOT NULL AND proposed = 0 AND status IN ('todo', 'doing') ORDER BY due_at IS NULL, due_at",
    )
    .fetch_all(pool)
    .await?;
    for (file, title, assigned_to, due_at) in tasks {
        by_file.entry(file).or_default().tasks.push(TaskDue { title, assigned_to, due_at });
    }

    if let Some(id) = only {
        by_file.retain(|k, _| k == id);
    }
    Ok(by_file)
}

async fn notice_ms(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
    let days: Option<i64> = sqlx::query_scalar("SELECT days FROM time_limits WHERE key = 'hearing_notice'").fetch_optional(pool).await?;
    Ok(days.unwrap_or(DEFAULT_HEARING_NOTICE_DAYS) * DAY_MS)
}

/// Every file's next step for this person, plus the counts that follow from them.
pub async fn attention(pool: &SqlitePool, actor: Option<&Actor>) -> Result<Attention, sqlx::Error> {
    let now = chrono::Utc::now().timestamp_millis();
    let facts: Vec<Facts> = sqlx::query_as(FACTS).fetch_all(pool).await?;
    let by_file = extras(pool, now, None).await?;
    let notice = notice_ms(pool).await?;
    let caps = match actor {
        Some(a) => Some(capabilities::for_actor(pool, capabilities::protection(pool).await?, a).await?),
        None => None,
    };
    let viewer = actor.zip(caps).map(|(actor, caps)| Viewer { actor, caps });
    let none = Extras::default();
    let items: Vec<Next> = facts.iter().map(|f| derive(f, by_file.get(&f.id).unwrap_or(&none), viewer.as_ref(), notice, now)).collect();
    let summary = summarise(&items);
    Ok(Attention { items, summary })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::staff::Protection;
    use std::collections::HashSet;

    const NOW: i64 = 1_800_000_000_000;
    const NOTICE: i64 = 2 * DAY_MS;

    /// The seeded defaults of migration 0044, in a shared office.
    fn grants() -> HashSet<String> {
        ["prosecutor:self_assign", "prosecutor:review_files", "clerk:register_files", "clerk:allocate_files"].iter().map(|s| s.to_string()).collect()
    }

    fn person(id: &str, role: &str, is_dpp: bool) -> (Actor, Set) {
        let a = Actor { id: id.into(), name: id.into(), rank: None, role: role.into(), is_dpp };
        let caps = capabilities::resolve(&a, Protection::Basic, &grants());
        (a, caps)
    }

    fn facts(stage: &str, status: &str, assigned: Option<&str>) -> Facts {
        Facts {
            id: "f1".into(),
            stage: stage.into(),
            current_status: status.into(),
            assigned_to: assigned.map(str::to_string),
            assignee_name: assigned.map(str::to_string),
            director_pending: 0,
            reply_due: None,
            decided: false,
            reopened: false,
        }
    }

    fn run(f: &Facts, who: &(Actor, Set), extras: &Extras, now: i64) -> Next {
        derive(f, extras, Some(&Viewer { actor: &who.0, caps: who.1 }), NOTICE, now)
    }

    fn plain(f: &Facts, who: &(Actor, Set)) -> Next {
        run(f, who, &Extras::default(), NOW)
    }

    #[test]
    fn a_declined_file_still_to_be_sent_is_a_send_not_a_decision() {
        // The contradiction this module exists to end: status says declined, stage says prepare.
        let n = plain(&facts("prepare", "declined", Some("amy")), &person("amy", "prosecutor", false));
        assert_eq!((n.action, n.state), (Action::Prepare, State::Preparing));
        assert!(n.needs_me && n.held_by_me);
        let s = summarise(&[n]);
        assert_eq!((s.to_decide, s.to_send, s.total), (0, 1, 1));
    }

    #[test]
    fn a_received_file_is_the_offices_to_give_out_and_only_those_who_may_see_it_on_their_list() {
        let f = facts("receive", "under_review", None);
        let director = plain(&f, &person("dpp", "prosecutor", true));
        assert_eq!((director.action, director.holder, director.needs_me), (Action::Allocate, Holder::Office, true));
        // An ordinary prosecutor does not give files out: it is not theirs to do, but they may take it.
        let prosecutor = plain(&f, &person("amy", "prosecutor", false));
        assert_eq!((prosecutor.action, prosecutor.needs_me, prosecutor.held_by_me, prosecutor.can_take), (Action::Allocate, false, false, true));
        let clerk = plain(&f, &person("cat", "clerk", false));
        assert!(clerk.needs_me && !clerk.can_take, "a clerk gives files out but may not take them to review");
        // An administrator who only administers has neither.
        let admin = plain(&f, &person("ada", "administrator", false));
        assert!(!admin.needs_me && !admin.can_take);
    }

    #[test]
    fn an_administrator_holding_a_file_does_not_need_to_work_it() {
        // A file left with someone who may not review it shows as theirs but asks nothing of them.
        let n = plain(&facts("decide", "under_review", Some("ada")), &person("ada", "administrator", false));
        assert!(!n.needs_me && !n.held_by_me);
    }

    #[test]
    fn a_file_given_to_a_colleague_is_theirs_and_not_mine() {
        let f = facts("decide", "under_review", Some("ben"));
        let ben = plain(&f, &person("ben", "prosecutor", false));
        let amy = plain(&f, &person("amy", "prosecutor", false));
        assert!(ben.needs_me && !amy.needs_me && !amy.held_by_me);
        assert_eq!(amy.holder_name.as_deref(), Some("ben"));
        assert_eq!(summarise(&[amy]).with_colleagues, 1);
    }

    #[test]
    fn a_director_only_decision_waits_on_the_director() {
        let mut f = facts("decide", "under_review", Some("amy"));
        f.director_pending = 1;
        let amy = plain(&f, &person("amy", "prosecutor", false));
        assert_eq!((amy.holder, amy.needs_me), (Holder::Director, false));
        let dpp = plain(&f, &person("dpp", "prosecutor", true));
        assert_eq!((dpp.holder, dpp.needs_me), (Holder::Director, true));
        assert_eq!(dpp.primary.map(|o| o.kind), Some(Kind::DirectorDecision));
        // An administrator is not the Director just by administering.
        assert!(!plain(&f, &person("ada", "administrator", false)).needs_me);
    }

    #[test]
    fn a_file_with_police_waits_and_chases_only_when_the_date_has_passed() {
        let mut f = facts("handover", "returned_for_investigation", Some("amy"));
        f.reply_due = Some(NOW + DAY_MS);
        let me = person("amy", "prosecutor", false);
        let n = plain(&f, &me);
        assert_eq!((n.action, n.state, n.holder, n.needs_me, n.overdue), (Action::AwaitPolice, State::WithPolice, Holder::Police, false, false));
        let late = run(&f, &me, &Extras::default(), NOW + 2 * DAY_MS);
        assert!(late.needs_me && late.overdue);
        // A file with Police is never also counted as waiting on a decision.
        assert_eq!(summarise(&[n]).to_decide + summarise(&[late.clone()]).to_send, 0);
        assert_eq!(summarise(&[late]).to_follow_up, 1);
    }

    #[test]
    fn concluded_wins_over_every_status() {
        let mut extras = Extras::default();
        extras.limits.push(Limit { kind: "complaint_reply".into(), due_at: Some(1), overdue: true });
        extras.hearings.push(NOW + DAY_MS);
        for status in ["under_review", "declined", "returned_for_investigation", "sanctioned"] {
            let n = run(&facts("concluded", status, Some("amy")), &person("amy", "prosecutor", false), &extras, NOW);
            assert_eq!((n.action, n.holder, n.needs_me, n.overdue), (Action::Closed, Holder::Nobody, false, false), "{status}");
            assert!(n.obligations.is_empty(), "{status}");
        }
    }

    #[test]
    fn a_file_in_court_needs_me_only_when_something_is_due() {
        let me = person("amy", "prosecutor", false);
        let f = facts("follow_up", "sanctioned", Some("amy"));
        let mut e = Extras::default();
        assert!(!run(&f, &me, &e, NOW).needs_me);
        e.hearings = vec![NOW + DAY_MS];
        assert!(run(&f, &me, &e, NOW).needs_me);
        e.hearings = vec![NOW + 20 * DAY_MS];
        let far = run(&f, &me, &e, NOW);
        assert!(!far.needs_me, "a hearing weeks away is listed but not yet owed");
        assert_eq!(far.obligations.len(), 1, "yet it is not hidden");
        // A time limit that has run out brings it back even with no hearing near.
        e.limits.push(Limit { kind: "adjournment_review".into(), due_at: None, overdue: true });
        assert!(run(&f, &me, &e, NOW).needs_me);
    }

    #[test]
    fn one_file_can_owe_several_things_at_once_and_none_hides_another() {
        // Preparing a paper, a hearing tomorrow, a task for a colleague and a reply to chase: all four.
        let me = person("amy", "prosecutor", false);
        let f = facts("prepare", "sanctioned", Some("amy"));
        let e = Extras {
            hearings: vec![NOW + DAY_MS],
            limits: vec![Limit { kind: "complaint_reply".into(), due_at: Some(NOW - DAY_MS), overdue: true }],
            tasks: vec![
                TaskDue { title: "Ask Ben for the exhibit list".into(), assigned_to: Some("ben".into()), due_at: Some(NOW + DAY_MS) },
                TaskDue { title: "Call the investigating officer".into(), assigned_to: Some("amy".into()), due_at: None },
            ],
        };
        let n = run(&f, &me, &e, NOW);
        assert_eq!(n.state, State::Preparing);
        let kinds: Vec<(Kind, bool)> = n.obligations.iter().map(|o| (o.kind, o.mine)).collect();
        assert!(kinds.contains(&(Kind::Prepare, true)) && kinds.contains(&(Kind::Hearing, true)) && kinds.contains(&(Kind::TimeLimit, true)));
        assert!(kinds.contains(&(Kind::Task, true)) && kinds.contains(&(Kind::Task, false)), "my task and Ben's task are separate lines");
        // The most urgent of mine leads: the overdue time limit, not the paper.
        assert_eq!(n.primary.as_ref().map(|o| o.kind), Some(Kind::TimeLimit));
        assert!(n.overdue);
        let s = summarise(&[n]);
        assert_eq!((s.total, s.to_send, s.with_several, s.overdue), (1, 1, 1, 1), "one file, counted once, flagged as having several");

        // Ben sees the same file as the one holding nothing: his task is his, the rest is Amy's.
        let ben = run(&f, &person("ben", "prosecutor", false), &e, NOW);
        let mine: Vec<Kind> = ben.obligations.iter().filter(|o| o.mine).map(|o| o.kind).collect();
        assert_eq!(mine, vec![Kind::Task]);
        assert!(ben.needs_me && !ben.held_by_me);
        assert_eq!(summarise(&[ben]).to_follow_up, 1);
    }

    #[test]
    fn a_hearing_does_not_wait_for_the_file_to_reach_the_court_stage() {
        let me = person("amy", "prosecutor", false);
        let mut e = Extras::default();
        e.hearings = vec![NOW + DAY_MS];
        let n = run(&facts("handover", "sanctioned", Some("amy")), &me, &e, NOW);
        assert!(n.obligations.iter().any(|o| o.kind == Kind::Hearing && o.mine));
        assert_eq!(n.state, State::Sending);
    }

    #[test]
    fn the_hearing_notice_is_the_offices_to_set_not_fixed_in_the_rules() {
        let me = person("amy", "prosecutor", false);
        let f = facts("follow_up", "sanctioned", Some("amy"));
        let e = Extras { hearings: vec![NOW + 5 * DAY_MS], ..Default::default() };
        assert!(!derive(&f, &e, Some(&Viewer { actor: &me.0, caps: me.1 }), 2 * DAY_MS, NOW).needs_me);
        assert!(derive(&f, &e, Some(&Viewer { actor: &me.0, caps: me.1 }), 7 * DAY_MS, NOW).needs_me);
    }

    #[test]
    fn unassigned_work_past_the_allocation_stage_is_whoever_may_review_signed_in() {
        // A solo office decides without ever giving the file out.
        let n = plain(&facts("decide", "under_review", None), &person("dpp", "prosecutor", true));
        assert_eq!((n.action, n.needs_me, n.held_by_me), (Action::Decide, true, true));
        // A clerk signed in does not take it over.
        let clerk = plain(&facts("decide", "under_review", None), &person("cat", "clerk", false));
        assert_eq!((clerk.needs_me, clerk.held_by_me), (false, false));
    }

    #[test]
    fn nobody_signed_in_means_nothing_is_mine() {
        let n = derive(&facts("decide", "under_review", None), &Extras::default(), None, NOTICE, NOW);
        assert!(!n.needs_me && !n.held_by_me);
    }

    #[test]
    fn the_summary_is_the_sum_of_its_parts() {
        let me = person("amy", "prosecutor", false);
        let mut rows = vec![
            facts("review", "under_review", Some("amy")),
            facts("decide", "under_review", Some("amy")),
            facts("prepare", "declined", Some("amy")),
            facts("handover", "sanctioned", Some("amy")),
            facts("follow_up", "sanctioned", Some("amy")),
            facts("receive", "under_review", None),
            facts("handover", "returned_for_investigation", Some("amy")),
            facts("concluded", "declined", Some("amy")),
            facts("decide", "under_review", Some("ben")),
        ];
        for (i, r) in rows.iter_mut().enumerate() {
            r.id = format!("f{i}");
        }
        // The court file also has a hearing tomorrow.
        let court = Extras { hearings: vec![NOW + DAY_MS], ..Default::default() };
        let quiet = Extras::default();
        let items: Vec<Next> = rows.iter().map(|f| run(f, &me, if f.stage == "follow_up" { &court } else { &quiet }, NOW)).collect();
        let s = summarise(&items);
        assert_eq!(s.total, s.to_allocate + s.to_read + s.to_decide + s.to_send + s.to_follow_up);
        assert_eq!((s.to_read, s.to_decide, s.to_send, s.to_allocate, s.to_follow_up), (1, 1, 2, 0, 1));
        assert_eq!((s.in_court, s.with_police, s.unallocated, s.with_colleagues, s.waiting), (1, 1, 1, 1, 1));
    }

    #[test]
    fn a_decision_recorded_off_the_stepper_moves_the_file_on() {
        // Status says declined but the stage was never advanced from decide.
        let mut x = facts("decide", "declined", Some("amy"));
        x.decided = true;
        assert_eq!(plain(&x, &person("amy", "prosecutor", false)).action, Action::Prepare);
    }

    #[test]
    fn a_reopened_concluded_file_needs_a_decision_again() {
        let mut x = facts("concluded", "declined", Some("amy"));
        x.decided = true;
        x.reopened = true;
        let n = plain(&x, &person("amy", "prosecutor", false));
        assert_eq!((n.action, n.needs_me), (Action::Decide, true));
    }
}

/// One file's next step, for Assist: what is owed and who holds it, in plain
/// words and independent of who is signed in.
pub async fn describe(pool: &SqlitePool, file_id: &str) -> Result<Option<String>, sqlx::Error> {
    let now = chrono::Utc::now().timestamp_millis();
    let sql = format!("{FACTS} WHERE f.id = ?1");
    let Some(facts) = sqlx::query_as::<_, Facts>(sqlx::AssertSqlSafe(sql)).bind(file_id).fetch_optional(pool).await? else {
        return Ok(None);
    };
    let mut by_file = extras(pool, now, Some(file_id)).await?;
    let extra = by_file.remove(file_id).unwrap_or_default();
    let n = derive(&facts, &extra, None, notice_ms(pool).await?, now);
    let what = match n.action {
        Action::Allocate => "the file is to be given out",
        Action::Read => "the police file is to be read",
        Action::Decide => "a decision is to be taken",
        Action::Prepare => "the papers for the decision are to be drafted",
        Action::Send => "the answer is to be sent",
        Action::AwaitPolice => "the file is with Police for further investigation",
        Action::FollowCourt => "the case is before the court",
        Action::Closed => "nothing further is owed on the file",
    };
    let who = match n.holder {
        Holder::Office => "the office".to_string(),
        Holder::Officer => n.holder_name.unwrap_or_else(|| "the prosecutor".to_string()),
        Holder::Director => "the Director of Public Prosecutions".to_string(),
        Holder::Police => "Police".to_string(),
        Holder::Nobody => "no one".to_string(),
    };
    // Dated things on top of the stage: said, so one next step is not taken for the whole file.
    let mut also: Vec<&str> = Vec::new();
    for o in &n.obligations {
        let word = match o.kind {
            Kind::Hearing => "a hearing is coming up",
            Kind::TimeLimit => "a time limit is running",
            Kind::Task => "a task is open",
            _ => continue,
        };
        if !also.contains(&word) {
            also.push(word);
        }
    }
    let extra = if also.is_empty() { String::new() } else { format!(" Also: {}.", also.join(", ")) };
    Ok(Some(format!("{what}; it waits on {who}.{extra}")))
}
