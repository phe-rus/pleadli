//! The obligation engine (docs/prisons/product-map/02 S4, README P6): what is
//! owed, for whom, by when.
//!
//! Obligations are derived, never stored as a second copy of a fact. Each is
//! computed from the records (custody, sentence, court diary, transfers,
//! discharges) every time it is asked for, so a corrected sentence or a
//! recorded instrument changes the queue immediately and nothing can go stale.
//! What is stored is the human response to a derived obligation, in
//! `obligation_resolutions`, keyed by the obligation's stable key.
//!
//! Due-date periods marked [H] below are hypotheses (structural, not from a
//! Ugandan source) and are deliberately constants in one place; the field
//! validation kit (R-06) is what settles them.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::error::DomainError;
use super::prisoners::Prisoner;
use super::sentences::{self, compute_clocks, review_mark, review_marks_passed, Sentence};
use super::time::{now_ms, DAY_MS};

/// [H] Days after reception before a pending instrument is chased.
pub const PENDING_INSTRUMENT_CHASE_DAYS: i64 = 7;
/// [H] Days in transit before an unconfirmed transfer is flagged.
pub const TRANSFER_CONFIRMATION_DAYS: i64 = 3;
/// [H] Days after an excepted discharge to regularise the waived gates.
pub const REGULARISE_DAYS: i64 = 7;

const BAIL_LOOKAHEAD_DAYS: i64 = 14;
const DISCHARGE_LOOKAHEAD_DAYS: i64 = 7;
const REVIEW_LOOKAHEAD_DAYS: i64 = 60;
const COURT_LOOKAHEAD_DAYS: i64 = 7;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Procedure {
    /// discharge | court_outcome | instrument | sentence | hospital_return |
    /// transfer_confirm | transfer_arrival | regularise | file
    pub kind: String,
    pub id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Obligation {
    pub key: String,
    pub kind: String,
    /// due | exception
    pub group: &'static str,
    pub prisoner_id: Option<String>,
    pub prisoner_name: Option<String>,
    pub title: String,
    pub detail: Option<String>,
    pub due_at: Option<i64>,
    pub procedure: Option<Procedure>,
    /// Can be closed by recording the action taken. Others close by doing
    /// the procedure they open.
    pub resolvable: bool,
}

#[derive(Debug, FromRow)]
struct ScheduledProduction {
    id: String,
    prisoner_id: String,
    court_reference: Option<String>,
    production_date: i64,
    purpose: Option<String>,
    first_name: String,
    last_name: String,
}

#[derive(Debug, FromRow)]
struct TransferRow {
    id: String,
    prisoner_id: Option<String>,
    direction: String,
    person_name: Option<String>,
    other_prison_name: Option<String>,
    dispatched_at: Option<i64>,
    arrived_at: Option<i64>,
    first_name: Option<String>,
    last_name: Option<String>,
}

#[derive(Debug, FromRow)]
struct ExceptedRelease {
    id: String,
    prisoner_id: String,
    released_at: i64,
    exception_gates: Option<String>,
    first_name: String,
    last_name: String,
}

fn name_of(first: &str, last: &str) -> String {
    format!("{last}, {first}")
}

fn pending_label(kind: Option<&str>) -> String {
    match kind {
        Some("charge_sheet") => "charge sheet",
        Some("committed_warrant") => "committed warrant",
        Some("both") => "charge sheet and warrant",
        Some(other) if !other.is_empty() && other != "other" => return other.replace('_', " "),
        _ => "a required document",
    }
    .to_string()
}

pub async fn derive(pool: &SqlitePool, now: i64) -> Result<Vec<Obligation>, sqlx::Error> {
    let mut out: Vec<Obligation> = Vec::new();

    let resolved: HashSet<String> = sqlx::query_scalar("SELECT key FROM obligation_resolutions").fetch_all(pool).await?.into_iter().collect();

    let prisoners = sqlx::query_as::<_, Prisoner>("SELECT * FROM prisoners WHERE current_status = 'in_custody'").fetch_all(pool).await?;
    let sentence_by_prisoner: HashMap<String, Sentence> =
        sentences::list_active(pool).await?.into_iter().map(|s| (s.prisoner_id.clone(), s)).collect();

    for p in &prisoners {
        let name = name_of(&p.first_name, &p.last_name);
        let sentence = sentence_by_prisoner.get(&p.id);
        let clocks = compute_clocks(p, sentence, now);

        if p.documents_pending {
            out.push(Obligation {
                key: format!("instrument_pending:{}", p.id),
                kind: "instrument_pending".into(),
                group: "exception",
                prisoner_id: Some(p.id.clone()),
                prisoner_name: Some(name.clone()),
                title: format!("Documents pending: {}", pending_label(p.pending_document_type.as_deref())),
                detail: Some("Custody continues. Chase the issuing court or police and record the instrument when it arrives.".into()),
                due_at: Some(p.admitted_at + PENDING_INSTRUMENT_CHASE_DAYS * DAY_MS),
                procedure: Some(Procedure { kind: "instrument".into(), id: Some(p.id.clone()) }),
                resolvable: false,
            });
        }

        if p.status == "convicted" && sentence.is_none() {
            out.push(Obligation {
                key: format!("sentence_missing:{}", p.id),
                kind: "sentence_missing".into(),
                group: "exception",
                prisoner_id: Some(p.id.clone()),
                prisoner_name: Some(name.clone()),
                title: "Sentence not recorded".into(),
                detail: Some("Without a sentence there is no entitlement date. Record the term and start date from the warrant.".into()),
                due_at: Some(p.admitted_at + PENDING_INSTRUMENT_CHASE_DAYS * DAY_MS),
                procedure: Some(Procedure { kind: "sentence".into(), id: Some(p.id.clone()) }),
                resolvable: false,
            });
        }

        if let Some(threshold) = clocks.mandatory_bail_on {
            let key = format!("mandatory_bail:{}", p.id);
            if threshold <= now + BAIL_LOOKAHEAD_DAYS * DAY_MS && !resolved.contains(&key) {
                let days = if p.high_court_only_offence { 180 } else { 60 };
                out.push(Obligation {
                    key,
                    kind: "mandatory_bail".into(),
                    group: "due",
                    prisoner_id: Some(p.id.clone()),
                    prisoner_name: Some(name.clone()),
                    title: format!("Mandatory-bail threshold: {days} days on remand"),
                    detail: Some(format!(
                        "Art. 23(6): held {} days. Record the action taken (who was notified and what was sent).",
                        clocks.days_held
                    )),
                    due_at: Some(threshold),
                    procedure: Some(Procedure { kind: "file".into(), id: Some(p.id.clone()) }),
                    resolvable: true,
                });
            }
        }

        if let Some(due) = clocks.release_due_on {
            if due <= now + DISCHARGE_LOOKAHEAD_DAYS * DAY_MS {
                out.push(Obligation {
                    key: format!("discharge:{}", p.id),
                    kind: "discharge_due".into(),
                    group: "due",
                    prisoner_id: Some(p.id.clone()),
                    prisoner_name: Some(name.clone()),
                    title: if due < now { "Discharge overdue".into() } else { "Discharge due on entitlement".into() },
                    detail: Some("Computed entitlement date. Check the warrant. Discharge is before noon (s.83).".into()),
                    due_at: Some(due),
                    procedure: Some(Procedure { kind: "discharge".into(), id: Some(p.id.clone()) }),
                    resolvable: false,
                });
            }
        }

        if let (Some(opens), Some(due)) = (clocks.parole_window_opens_on, clocks.release_due_on) {
            let key = format!("parole:{}", p.id);
            if opens <= now && due > now && !resolved.contains(&key) {
                out.push(Obligation {
                    key,
                    kind: "parole_window".into(),
                    group: "due",
                    prisoner_id: Some(p.id.clone()),
                    prisoner_name: Some(name.clone()),
                    title: "Parole window open".into(),
                    detail: Some("s.89: within six months of the release date. Record whether parole was considered.".into()),
                    due_at: Some(due),
                    procedure: Some(Procedure { kind: "file".into(), id: Some(p.id.clone()) }),
                    resolvable: true,
                });
            }
        }

        if let (true, Some(sentence)) = (clocks.reviewable, sentence) {
            let passed = review_marks_passed(sentence, now);
            let overdue_key = format!("review:{}:{}", p.id, passed);
            let (k, key) = if passed >= 1 && !resolved.contains(&overdue_key) {
                (passed, overdue_key)
            } else {
                (passed + 1, format!("review:{}:{}", p.id, passed + 1))
            };
            let due = review_mark(sentence, k);
            if due <= now + REVIEW_LOOKAHEAD_DAYS * DAY_MS && !resolved.contains(&key) {
                out.push(Obligation {
                    key,
                    kind: "review_due".into(),
                    group: "due",
                    prisoner_id: Some(p.id.clone()),
                    prisoner_name: Some(name.clone()),
                    title: format!("s.88 review bundle: year {}", k * 4),
                    detail: Some("OIC statement on work and conduct, medical officer's report, social worker's assessment, to Head Office.".into()),
                    due_at: Some(due),
                    procedure: Some(Procedure { kind: "file".into(), id: Some(p.id.clone()) }),
                    resolvable: true,
                });
            }
        }
    }

    let productions = sqlx::query_as::<_, ScheduledProduction>(
        "SELECT cp.id, cp.prisoner_id, cp.court_reference, cp.production_date, cp.purpose, p.first_name, p.last_name
         FROM court_productions cp JOIN prisoners p ON p.id = cp.prisoner_id
         WHERE cp.state = 'scheduled' AND p.current_status = 'in_custody' AND cp.production_date <= ?
         ORDER BY cp.production_date ASC",
    )
    .bind(now + COURT_LOOKAHEAD_DAYS * DAY_MS)
    .fetch_all(pool)
    .await?;
    for cp in productions {
        let overdue = cp.production_date < now;
        let court = cp.court_reference.clone().unwrap_or_else(|| "court".into());
        out.push(Obligation {
            key: format!("court:{}", cp.id),
            kind: "court_date".into(),
            group: "due",
            prisoner_id: Some(cp.prisoner_id.clone()),
            prisoner_name: Some(name_of(&cp.first_name, &cp.last_name)),
            title: if overdue { format!("Record the outcome: {court}") } else { format!("Court production: {court}") },
            detail: cp.purpose.clone(),
            due_at: Some(cp.production_date),
            procedure: Some(Procedure { kind: "court_outcome".into(), id: Some(cp.id) }),
            resolvable: false,
        });
    }

    for h in super::health_events::list_hospitalised(pool).await? {
        out.push(Obligation {
            key: format!("hospital:{}", h.prisoner_id),
            kind: "hospital_return".into(),
            group: "due",
            prisoner_id: Some(h.prisoner_id.clone()),
            prisoner_name: Some(name_of(&h.first_name, &h.last_name)),
            title: "Hospital return awaited".into(),
            detail: h.facility_name.clone(),
            due_at: None,
            procedure: Some(Procedure { kind: "hospital_return".into(), id: Some(h.prisoner_id) }),
            resolvable: false,
        });
    }

    let transfers = sqlx::query_as::<_, TransferRow>(
        "SELECT t.id, t.prisoner_id, t.direction, t.person_name, t.other_prison_name, t.dispatched_at, t.arrived_at,
                p.first_name, p.last_name
         FROM transfers t LEFT JOIN prisoners p ON p.id = t.prisoner_id
         WHERE (t.direction = 'out' AND t.state = 'in_transit') OR (t.direction = 'in' AND t.state = 'arrived')",
    )
    .fetch_all(pool)
    .await?;
    for t in transfers {
        let display = match (&t.first_name, &t.last_name) {
            (Some(f), Some(l)) => name_of(f, l),
            _ => t.person_name.clone().unwrap_or_else(|| "Unnamed".into()),
        };
        if t.direction == "out" {
            out.push(Obligation {
                key: format!("transfer_confirm:{}", t.id),
                kind: "transfer_confirmation".into(),
                group: "exception",
                prisoner_id: t.prisoner_id.clone(),
                prisoner_name: Some(display),
                title: format!("Transfer to {} not confirmed", t.other_prison_name.as_deref().unwrap_or("another prison")),
                detail: Some("In transit: still in the custody of the prison officer (s.73(5)). Import the receiving facility's confirmation.".into()),
                due_at: t.dispatched_at.map(|d| d + TRANSFER_CONFIRMATION_DAYS * DAY_MS),
                procedure: Some(Procedure { kind: "transfer_confirm".into(), id: Some(t.id) }),
                resolvable: false,
            });
        } else {
            out.push(Obligation {
                key: format!("transfer_arrival:{}", t.id),
                kind: "transfer_arrival".into(),
                group: "due",
                prisoner_id: None,
                prisoner_name: Some(display),
                title: format!("Arrival from {} awaits confirmation", t.other_prison_name.as_deref().unwrap_or("another prison")),
                detail: Some("Verify identity against the dossier, reconcile property, place, then confirm to the sender.".into()),
                due_at: t.arrived_at,
                procedure: Some(Procedure { kind: "transfer_arrival".into(), id: Some(t.id) }),
                resolvable: false,
            });
        }
    }

    let excepted = sqlx::query_as::<_, ExceptedRelease>(
        "SELECT r.id, r.prisoner_id, r.released_at, r.exception_gates, p.first_name, p.last_name
         FROM releases r JOIN prisoners p ON p.id = r.prisoner_id
         WHERE r.exception_gates IS NOT NULL",
    )
    .fetch_all(pool)
    .await?;
    for r in excepted {
        let gates: Vec<String> = r.exception_gates.as_deref().and_then(|g| serde_json::from_str(g).ok()).unwrap_or_default();
        for gate in gates {
            let open = match gate.as_str() {
                "property_outstanding" => {
                    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM property_records WHERE prisoner_id = ? AND returned_at IS NULL")
                        .bind(&r.prisoner_id)
                        .fetch_one(pool)
                        .await?
                        > 0
                }
                "documents_pending" => {
                    sqlx::query_scalar::<_, i64>("SELECT documents_pending FROM prisoners WHERE id = ?").bind(&r.prisoner_id).fetch_one(pool).await? > 0
                }
                _ => false,
            };
            if !open {
                continue;
            }
            let what = if gate == "property_outstanding" { "Return outstanding property" } else { "Obtain the pending document" };
            out.push(Obligation {
                key: format!("regularise:{}:{}", r.id, gate),
                kind: "regularise".into(),
                group: "exception",
                prisoner_id: Some(r.prisoner_id.clone()),
                prisoner_name: Some(name_of(&r.first_name, &r.last_name)),
                title: format!("Regularise after excepted discharge: {}", what.to_lowercase()),
                detail: Some("The OIC authorised this discharge without the gate being met. Complete it and record it.".into()),
                due_at: Some(r.released_at + REGULARISE_DAYS * DAY_MS),
                procedure: Some(Procedure { kind: "regularise".into(), id: Some(r.prisoner_id.clone()) }),
                resolvable: false,
            });
        }
    }

    out.sort_by_key(|o| o.due_at.unwrap_or(i64::MAX));
    Ok(out)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveInput {
    pub key: String,
    pub kind: String,
    pub prisoner_id: Option<String>,
    pub action_taken: String,
}

pub async fn resolve(conn: &mut SqliteConnection, actor: &Actor, input: ResolveInput) -> Result<(), DomainError> {
    if !matches!(input.kind.as_str(), "mandatory_bail" | "parole_window" | "review_due") {
        return Err(DomainError::rejected("That obligation closes by doing the procedure it opens."));
    }
    if input.action_taken.trim().is_empty() {
        return Err(DomainError::rejected("Record the action taken."));
    }
    sqlx::query(
        "INSERT INTO obligation_resolutions (key, kind, prisoner_id, outcome, action_taken, resolved_at, resolved_by)
         VALUES (?, ?, ?, 'actioned', ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET action_taken = excluded.action_taken, resolved_at = excluded.resolved_at, resolved_by = excluded.resolved_by",
    )
    .bind(&input.key)
    .bind(&input.kind)
    .bind(&input.prisoner_id)
    .bind(input.action_taken.trim())
    .bind(now_ms())
    .bind(&actor.name)
    .execute(&mut *conn)
    .await?;
    audit::record(
        conn,
        actor,
        AuditEntry::new("obligation.resolved", "obligation", Some(&input.key)).reason(input.action_taken.trim()).after(&serde_json::json!({
            "kind": input.kind,
            "prisonerId": input.prisoner_id,
        })),
    )
    .await?;
    Ok(())
}

/// Obligations for one person, for the prisoner file header.
pub async fn for_prisoner(pool: &SqlitePool, prisoner_id: &str, now: i64) -> Result<Vec<Obligation>, sqlx::Error> {
    Ok(derive(pool, now).await?.into_iter().filter(|o| o.prisoner_id.as_deref() == Some(prisoner_id)).collect())
}
