//! What each file needs next, who it is waiting on, and whether that is the
//! person signed in. This is the one place those questions are answered.
//!
//! Before this module the app held two fields that could disagree: the
//! decision-derived `current_status` (under review, declined, returned…) and
//! the working `stage` (receive, review, decide, prepare, handover, follow up,
//! concluded). Each screen picked one of them, so the same file was "awaiting a
//! decision" in the status bar and "Prepare" in the Files list. Now nothing
//! outside this module reads either field to decide what is waiting on whom:
//! Today, Inbox, Files, Diary, the status bar, the sidebar counts and Assist all
//! read `Next` and `Summary`. No status is stored here; every answer is derived
//! from the records at the moment it is asked, like the rest of the read models.
//!
//! Only states the product models are used. Where the law or the office's
//! practice is not yet known, the rule says so in a comment and in
//! `docs/dpp/ATTENTION-RULES-2026-11-27.md` rather than guessing.

use serde::Serialize;
use sqlx::{FromRow, SqlitePool};
use std::collections::HashMap;

use super::staff::Actor;

const DAY_MS: i64 = 86_400_000;

/// What the file needs to happen next.
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Next {
    pub file_id: String,
    pub action: Action,
    pub holder: Holder,
    pub holder_id: Option<String>,
    pub holder_name: Option<String>,
    /// The signed-in person is the one this file is held by (or would be given to).
    pub held_by_me: bool,
    /// The signed-in person has something to do on it now. A file held by me
    /// that is only waiting (in court with nothing due, with Police) is held by
    /// me but does not need me.
    pub needs_me: bool,
    /// The date the next thing is due, when the records give one.
    pub due_at: Option<i64>,
    pub overdue: bool,
}

/// Counts for the signed-in person, from the same `Next` rows the lists show.
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    /// Everything that needs the signed-in person now. The sum of the next four.
    pub total: i64,
    pub to_allocate: i64,
    pub to_read: i64,
    pub to_decide: i64,
    pub to_send: i64,
    /// Of `total`, how many are past a time limit.
    pub overdue: i64,
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
    pub next_hearing: Option<i64>,
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

/// An open time limit on a file: when it runs out and whether it has.
#[derive(Debug, Clone, Copy)]
pub struct Limit {
    pub due_at: Option<i64>,
    pub overdue: bool,
}

/// Whether this person gives files out. The registry's `give_out` is open to
/// anyone signed in, so no rule restricts it; the Director, the administrator
/// and the clerk (who keep the registers) are treated as the office. UNRESOLVED:
/// confirm with a practitioner who allocates (docs/dpp/ATTENTION-RULES).
fn gives_out(actor: &Actor) -> bool {
    actor.is_dpp || actor.role == "administrator" || actor.role == "clerk"
}

/// A hearing within this long of now needs the prosecutor on a file in court.
const HEARING_SOON_MS: i64 = 2 * DAY_MS;

/// The rules. Pure: the same facts, actor and clock always give the same answer,
/// which is what lets every screen agree and the rules be tested without a database.
pub fn derive(facts: &Facts, actor: Option<&Actor>, limit: Option<Limit>, now: i64) -> Next {
    let mut next = Next {
        file_id: facts.id.clone(),
        action: Action::Read,
        holder: Holder::Officer,
        holder_id: facts.assigned_to.clone(),
        holder_name: facts.assignee_name.clone(),
        held_by_me: false,
        needs_me: false,
        due_at: limit.and_then(|l| l.due_at),
        overdue: limit.is_some_and(|l| l.overdue),
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
        next.holder = Holder::Nobody;
        next.holder_id = None;
        next.holder_name = None;
        next.due_at = None;
        next.overdue = false;
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
    let is_dpp = actor.is_some_and(|a| a.is_dpp);

    // Gone back to Police for further investigation. The prosecutor is waiting,
    // and chases only when the answer date they set has passed.
    if facts.current_status == "returned_for_investigation" {
        next.action = Action::AwaitPolice;
        next.holder = Holder::Police;
        next.holder_id = None;
        next.holder_name = None;
        next.due_at = facts.reply_due;
        next.overdue = facts.reply_due.is_some_and(|d| d < now);
        next.held_by_me = responsible_me && facts.assigned_to.is_some();
        next.needs_me = responsible_me && next.overdue;
        return next;
    }

    match stage {
        "receive" | "review" if facts.assigned_to.is_none() => {
            next.action = Action::Allocate;
            next.holder = Holder::Office;
            next.held_by_me = false;
            next.needs_me = actor.is_some_and(gives_out);
        }
        "receive" | "review" => {
            next.action = Action::Read;
            next.held_by_me = responsible_me;
            next.needs_me = responsible_me;
        }
        "decide" => {
            next.action = Action::Decide;
            if facts.director_pending > 0 {
                // Discontinuance and nolle prosequi are the Director's alone
                // (Constitution Art. 120(3)(d), Trial on Indictments Act s.135).
                next.holder = Holder::Director;
                next.holder_id = None;
                next.holder_name = None;
                next.held_by_me = is_dpp;
                next.needs_me = is_dpp;
            } else {
                next.held_by_me = responsible_me;
                next.needs_me = responsible_me;
            }
        }
        "prepare" => {
            next.action = Action::Prepare;
            next.held_by_me = responsible_me;
            next.needs_me = responsible_me;
        }
        "handover" => {
            next.action = Action::Send;
            next.held_by_me = responsible_me;
            next.needs_me = responsible_me;
        }
        "follow_up" => {
            next.action = Action::FollowCourt;
            next.held_by_me = responsible_me;
            let hearing_soon = facts.next_hearing.is_some_and(|h| h >= now - DAY_MS && h <= now + HEARING_SOON_MS);
            if next.due_at.is_none() {
                next.due_at = facts.next_hearing.filter(|h| *h >= now);
            }
            next.needs_me = responsible_me && (next.overdue || hearing_soon);
        }
        // Unknown stage: say nothing is owed rather than invent a duty.
        _ => {
            next.action = Action::Closed;
            next.holder = Holder::Nobody;
        }
    }
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
            if n.overdue {
                s.overdue += 1;
            }
            match n.action {
                Action::Allocate => s.to_allocate += 1,
                Action::Read => s.to_read += 1,
                Action::Decide => s.to_decide += 1,
                Action::Prepare | Action::Send => s.to_send += 1,
                _ => {}
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
        (SELECT MIN(h.starts_at) FROM hearings h WHERE h.prosecution_file_id = f.id AND h.starts_at >= (?1 - 86400000)) AS next_hearing,
        (SELECT MAX(hv.reply_due_at) FROM handovers hv WHERE hv.prosecution_file_id = f.id) AS reply_due,
        (f.current_status NOT IN ('under_review', 'resubmitted', 'returned_for_investigation')) AS decided,
        EXISTS (SELECT 1 FROM charging_reviews r WHERE r.prosecution_file_id = f.id AND r.concluded_at IS NULL AND r.reopens_decision_id IS NOT NULL) AS reopened
   FROM prosecution_files f LEFT JOIN staff s ON s.id = f.assigned_to";

/// Every file's next step for this person, plus the counts that follow from them.
pub async fn attention(pool: &SqlitePool, actor: Option<&Actor>) -> Result<Attention, sqlx::Error> {
    let now = chrono::Utc::now().timestamp_millis();
    let facts: Vec<Facts> = sqlx::query_as(FACTS).bind(now).fetch_all(pool).await?;

    // The most urgent open limit on each file, from the one clocks read model.
    let mut limits: HashMap<String, Limit> = HashMap::new();
    for c in super::clocks::clocks(pool).await? {
        let entry = limits.entry(c.file_id).or_insert(Limit { due_at: c.due_at, overdue: c.overdue });
        // Clocks arrive most urgent first, so keep the first; an overdue one always wins.
        if c.overdue && !entry.overdue {
            *entry = Limit { due_at: c.due_at, overdue: true };
        }
    }

    let items: Vec<Next> = facts.iter().map(|f| derive(f, actor, limits.get(&f.id).copied(), now)).collect();
    let summary = summarise(&items);
    Ok(Attention { items, summary })
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_800_000_000_000;

    fn actor(id: &str, role: &str, is_dpp: bool) -> Actor {
        Actor { id: id.into(), name: id.into(), rank: None, role: role.into(), is_dpp }
    }

    fn facts(stage: &str, status: &str, assigned: Option<&str>) -> Facts {
        Facts {
            id: "f1".into(),
            stage: stage.into(),
            current_status: status.into(),
            assigned_to: assigned.map(str::to_string),
            assignee_name: assigned.map(str::to_string),
            director_pending: 0,
            next_hearing: None,
            reply_due: None,
            decided: false,
            reopened: false,
        }
    }

    #[test]
    fn a_declined_file_still_to_be_sent_is_a_send_not_a_decision() {
        // The contradiction this module exists to end: status says declined, stage says prepare.
        let n = derive(&facts("prepare", "declined", Some("amy")), Some(&actor("amy", "prosecutor", false)), None, NOW);
        assert_eq!(n.action, Action::Prepare);
        assert!(n.needs_me && n.held_by_me);
        let s = summarise(&[n]);
        assert_eq!((s.to_decide, s.to_send, s.total), (0, 1, 1));
    }

    #[test]
    fn received_and_unassigned_is_the_offices_to_give_out() {
        let f = facts("receive", "under_review", None);
        let director = derive(&f, Some(&actor("dpp", "prosecutor", true)), None, NOW);
        assert_eq!((director.action, director.holder, director.needs_me), (Action::Allocate, Holder::Office, true));
        // An ordinary prosecutor does not give files out, so it is not on their list.
        let prosecutor = derive(&f, Some(&actor("amy", "prosecutor", false)), None, NOW);
        assert_eq!((prosecutor.action, prosecutor.needs_me, prosecutor.held_by_me), (Action::Allocate, false, false));
        let clerk = derive(&f, Some(&actor("cat", "clerk", false)), None, NOW);
        assert!(clerk.needs_me);
    }

    #[test]
    fn a_file_given_to_a_colleague_is_theirs_and_not_mine() {
        let f = facts("decide", "under_review", Some("ben"));
        let ben = derive(&f, Some(&actor("ben", "prosecutor", false)), None, NOW);
        let amy = derive(&f, Some(&actor("amy", "prosecutor", false)), None, NOW);
        assert!(ben.needs_me && !amy.needs_me && !amy.held_by_me);
        assert_eq!(amy.holder_name.as_deref(), Some("ben"));
        assert_eq!(summarise(&[amy]).with_colleagues, 1);
    }

    #[test]
    fn a_director_only_decision_waits_on_the_director() {
        let mut f = facts("decide", "under_review", Some("amy"));
        f.director_pending = 1;
        let amy = derive(&f, Some(&actor("amy", "prosecutor", false)), None, NOW);
        assert_eq!((amy.holder, amy.needs_me), (Holder::Director, false));
        let dpp = derive(&f, Some(&actor("dpp", "prosecutor", true)), None, NOW);
        assert_eq!((dpp.holder, dpp.needs_me), (Holder::Director, true));
    }

    #[test]
    fn a_file_with_police_waits_and_chases_only_when_the_date_has_passed() {
        let mut f = facts("handover", "returned_for_investigation", Some("amy"));
        f.reply_due = Some(NOW + DAY_MS);
        let me = actor("amy", "prosecutor", false);
        let n = derive(&f, Some(&me), None, NOW);
        assert_eq!((n.action, n.holder, n.needs_me, n.overdue), (Action::AwaitPolice, Holder::Police, false, false));
        let late = derive(&f, Some(&me), None, NOW + 2 * DAY_MS);
        assert!(late.needs_me && late.overdue);
        // A file with Police is never also counted as waiting on a decision.
        assert_eq!(summarise(&[n]).to_decide + summarise(&[late.clone()]).to_send, 0);
    }

    #[test]
    fn concluded_wins_over_every_status() {
        for status in ["under_review", "declined", "returned_for_investigation", "sanctioned"] {
            let n = derive(&facts("concluded", status, Some("amy")), Some(&actor("amy", "prosecutor", false)), Some(Limit { due_at: Some(1), overdue: true }), NOW);
            assert_eq!((n.action, n.holder, n.needs_me, n.overdue), (Action::Closed, Holder::Nobody, false, false), "{status}");
        }
    }

    #[test]
    fn a_file_in_court_needs_me_only_when_something_is_due() {
        let me = actor("amy", "prosecutor", false);
        let mut f = facts("follow_up", "sanctioned", Some("amy"));
        assert!(!derive(&f, Some(&me), None, NOW).needs_me);
        f.next_hearing = Some(NOW + DAY_MS);
        assert!(derive(&f, Some(&me), None, NOW).needs_me);
        f.next_hearing = Some(NOW + 20 * DAY_MS);
        assert!(!derive(&f, Some(&me), None, NOW).needs_me);
        // A time limit that has run out brings it back even with no hearing near.
        assert!(derive(&f, Some(&me), Some(Limit { due_at: None, overdue: true }), NOW).needs_me);
    }

    #[test]
    fn unassigned_work_past_the_allocation_stage_is_whoever_is_signed_in() {
        // A solo office decides without ever giving the file out.
        let n = derive(&facts("decide", "under_review", None), Some(&actor("dpp", "prosecutor", true)), None, NOW);
        assert_eq!((n.action, n.needs_me, n.held_by_me), (Action::Decide, true, true));
    }

    #[test]
    fn nobody_signed_in_means_nothing_is_mine() {
        let n = derive(&facts("decide", "under_review", None), None, None, NOW);
        assert!(!n.needs_me && !n.held_by_me);
    }

    #[test]
    fn the_summary_is_the_sum_of_its_parts() {
        let me = actor("amy", "prosecutor", false);
        let rows = [
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
        let items: Vec<Next> = rows.iter().map(|f| derive(f, Some(&me), None, NOW)).collect();
        let s = summarise(&items);
        assert_eq!(s.total, s.to_allocate + s.to_read + s.to_decide + s.to_send);
        assert_eq!((s.to_read, s.to_decide, s.to_send, s.to_allocate), (1, 1, 2, 0));
        assert_eq!((s.in_court, s.with_police, s.unallocated, s.with_colleagues, s.waiting), (1, 1, 1, 1, 2));
    }
}

#[cfg(test)]
mod conflict_tests {
    use super::*;
    const NOW: i64 = 1_800_000_000_000;
    fn me() -> Actor {
        Actor { id: "amy".into(), name: "amy".into(), rank: None, role: "prosecutor".into(), is_dpp: false }
    }
    fn f(stage: &str, status: &str) -> Facts {
        Facts { id: "f".into(), stage: stage.into(), current_status: status.into(), assigned_to: Some("amy".into()), assignee_name: Some("amy".into()), director_pending: 0, next_hearing: None, reply_due: None, decided: false, reopened: false }
    }

    #[test]
    fn a_decision_recorded_off_the_stepper_moves_the_file_on() {
        // Status says declined but the stage was never advanced from decide.
        let mut x = f("decide", "declined");
        x.decided = true;
        let n = derive(&x, Some(&me()), None, NOW);
        assert_eq!(n.action, Action::Prepare);
    }

    #[test]
    fn a_reopened_concluded_file_needs_a_decision_again() {
        let mut x = f("concluded", "declined");
        x.decided = true;
        x.reopened = true;
        let n = derive(&x, Some(&me()), None, NOW);
        assert_eq!((n.action, n.needs_me), (Action::Decide, true));
    }
}

/// One file's next step, for Assist: what is owed and who holds it, in plain
/// words and independent of who is signed in.
pub async fn describe(pool: &SqlitePool, file_id: &str) -> Result<Option<String>, sqlx::Error> {
    let now = chrono::Utc::now().timestamp_millis();
    let sql = format!("{FACTS} WHERE f.id = ?2");
    let Some(facts) = sqlx::query_as::<_, Facts>(sqlx::AssertSqlSafe(sql)).bind(now).bind(file_id).fetch_optional(pool).await? else {
        return Ok(None);
    };
    let n = derive(&facts, None, None, now);
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
    Ok(Some(format!("{what}; it waits on {who}.")))
}
