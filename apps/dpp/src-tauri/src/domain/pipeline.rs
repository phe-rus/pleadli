//! The case pipeline (docs/dpp/PIPELINE.md): every file moves through seven
//! stages. For the stage a file is in, Assist prepares a proposal; a named
//! person accepts it (as is or edited) or rejects it. Accepting does the real
//! thing through the same rules as doing it by hand (a review with findings, a
//! decision the law allows, a document, a hand-over, tasks, an outcome) and
//! moves the file on. Nothing is decided by Assist.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::ai::{self, Part};
use super::assist::{self, CountryContext};
use super::charging_reviews::{self, AssessmentInput, OutcomeInput, StartReviewInput, EVIDENTIAL, PUBLIC_INTEREST};
use super::decisions::{self, CreateDecisionInput};
use super::directions::{self, DirectionInput};
use super::error::{invalid, DomainError};
use super::review_notes::{self, CreateReviewNoteInput};
use super::{document_builder, documents, file_items, interchange, laws, tasks};

pub const STAGES: &[&str] = &["receive", "review", "decide", "prepare", "handover", "follow_up", "concluded"];
const OUTCOMES: &[&str] = &["convicted", "acquitted", "withdrawn", "declined", "diverted", "returned_not_resubmitted", "other"];
const METHODS: &[&str] = &["connection", "email", "print", "collection", "download", "other"];
const DAY: i64 = 86_400_000;

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// What Assist is told about the platform it works in.
pub const PLATFORM: &str = "You work inside Pleadli DPP, the case system of a public prosecutor's office. \
A file moves through seven stages: Receive (the police file arrives and is arranged), Review (the evidence is weighed against \
the Evidential and Public Interest tests), Decide (the prosecutor records a decision the law allows), Prepare (the documents the \
decision needs), Hand over (the file or documents go to Police, the court or others, by the exchange, email, print or collection), \
Follow up (hearings, Police answers, reminders), Concluded (the outcome is recorded and the file closes). At each stage you prepare \
a proposal; a prosecutor reads it and accepts, edits or rejects it. The prosecutor decides and signs, never you. \
The app's real places, the only ones to name: the sidebar (Today, Cases, Calendar, Documents, Statistics); a file's three tabs: \
Case (Time limits at the top with the buttons 'Record arrest or detention', where a release, bail, court appearance, remand or \
new detention order is recorded, and 'Document', which drafts the country's custody papers such as a detention request, an \
adjournment certificate or a release order; then the stage stepper with 'Check this stage' (you prepare the proposal), \
'Accept and move on', 'Reject', 'Do this stage yourself' and 'Move on to' the next stage), \
The file (the documents, 'Type a document', 'Import paper'), Activity (history and documents). Never invent other buttons or stages. \
Releasing a person is done outside the app (by the police or the prison on the prosecutor's order); the app only records it.";

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Proposal {
    pub id: String,
    pub prosecution_file_id: String,
    pub stage: String,
    #[sqlx(json)]
    pub body: Value,
    pub model: String,
    pub status: String,
    pub response_note: Option<String>,
    pub decided_by: Option<String>,
    pub decided_at: Option<i64>,
    pub created_by: Option<String>,
    pub created_at: i64,
}

async fn file_stage(pool: &SqlitePool, file_id: &str) -> Result<String, DomainError> {
    Ok(sqlx::query_scalar("SELECT stage FROM prosecution_files WHERE id = ?").bind(file_id).fetch_one(pool).await?)
}

pub async fn set_stage(pool: &SqlitePool, file_id: &str, stage: &str, actor: Option<&str>) -> Result<(), DomainError> {
    if !STAGES.contains(&stage) {
        return invalid("That is not a stage.");
    }
    let found = sqlx::query("UPDATE prosecution_files SET stage = ?, stage_changed_at = ? WHERE id = ?")
        .bind(stage)
        .bind(now())
        .bind(file_id)
        .execute(pool)
        .await?
        .rows_affected();
    if found == 0 {
        return Err(DomainError::NotFound("File not found.".into()));
    }
    let _ = super::audit::log(pool, super::audit::Entry::new("stage_changed").subject("prosecution_file", file_id).detail(format!("{stage} by {}", actor.unwrap_or("someone")))).await;
    Ok(())
}

pub async fn latest(pool: &SqlitePool, file_id: &str) -> Result<Vec<Proposal>, DomainError> {
    Ok(sqlx::query_as("SELECT * FROM proposals WHERE prosecution_file_id = ? ORDER BY created_at DESC LIMIT 20").bind(file_id).fetch_all(pool).await?)
}

async fn store(pool: &SqlitePool, file_id: &str, stage: &str, body: Value, model: &str, actor: Option<&str>) -> Result<Proposal, DomainError> {
    // A newer proposal replaces an unanswered one for the same stage.
    sqlx::query("DELETE FROM proposals WHERE prosecution_file_id = ? AND stage = ? AND status = 'proposed'").bind(file_id).bind(stage).execute(pool).await?;
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO proposals (id, prosecution_file_id, stage, body, model, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(file_id)
        .bind(stage)
        .bind(body.to_string())
        .bind(model)
        .bind(actor)
        .bind(now())
        .execute(pool)
        .await?;
    Ok(sqlx::query_as("SELECT * FROM proposals WHERE id = ?").bind(&id).fetch_one(pool).await?)
}

// ---------------------------------------------------------------- context

/// The words a file's offences are known by, for finding law and precedent.
async fn offence_words(pool: &SqlitePool, file_id: &str) -> Result<Vec<String>, sqlx::Error> {
    let mut text: Vec<String> = sqlx::query_scalar("SELECT offence FROM charges WHERE prosecution_file_id = ?").bind(file_id).fetch_all(pool).await?;
    let title: String = sqlx::query_scalar("SELECT title FROM prosecution_files WHERE id = ?").bind(file_id).fetch_one(pool).await?;
    text.push(title);
    const STOP: &[&str] = &["the", "and", "with", "of", "a", "v.", "vs", "state", "uganda", "contrary", "section", "sections", "act", "code", "penal", "for", "from", "des", "les", "par"];
    let mut words: Vec<String> = text
        .join(" ")
        .split(|c: char| !c.is_alphanumeric())
        .map(|w| w.to_lowercase())
        .filter(|w| w.len() > 4 && !STOP.contains(&w.as_str()))
        .collect();
    words.sort();
    words.dedup();
    Ok(words)
}

/// How this office handled similar offences before, and where prosecutors
/// changed or refused what Assist proposed.
async fn office_history(pool: &SqlitePool, file_id: &str, words: &[String]) -> Result<String, sqlx::Error> {
    let mut out = String::new();
    for w in words.iter().take(4) {
        let rows: Vec<(String, String, Option<String>)> = sqlx::query_as(
            "SELECT c.offence, d.decision_type, d.reasons FROM decisions d JOIN charges c ON c.prosecution_file_id = d.prosecution_file_id
              WHERE d.prosecution_file_id != ? AND lower(c.offence) LIKE ? ORDER BY d.decided_at DESC LIMIT 3",
        )
        .bind(file_id)
        .bind(format!("%{w}%"))
        .fetch_all(pool)
        .await?;
        for (offence, kind, reasons) in rows {
            let reasons: String = reasons.unwrap_or_default().chars().take(300).collect();
            out.push_str(&format!("- {offence}: decided {kind}. {reasons}\n"));
        }
    }
    let feedback: Vec<(String, String, Option<String>)> =
        sqlx::query_as("SELECT stage, status, response_note FROM proposals WHERE status IN ('edited', 'rejected') ORDER BY decided_at DESC LIMIT 8").fetch_all(pool).await?;
    if !feedback.is_empty() {
        out.push_str("\nHow prosecutors here answered earlier proposals:\n");
        for (stage, status, note) in feedback {
            out.push_str(&format!("- {stage}: {status}{}\n", note.map(|n| format!(" ({n})")).unwrap_or_default()));
        }
    }
    Ok(out)
}

/// Everything Assist is told for one file: the platform, the country, the law
/// text that bears on it, the office's history, and the file itself.
pub async fn full_context(pool: &SqlitePool, file_id: &str, country: &CountryContext) -> Result<(String, String), DomainError> {
    let words = offence_words(pool, file_id).await?;
    let law = laws::excerpts(pool, &country.code, &words, 14_000).await?;
    let history = office_history(pool, file_id, &words).await?;
    let guide = super::guide::context_for_file(pool, file_id, &country.code).await?;
    let system = format!(
        "{PLATFORM}\nToday is {} (count every time limit up to today, not only between the papers' own dates).\n{}\n{}\n\nTHE OFFICE'S LEGAL GUIDE FOR THIS FILE'S OFFENCES (the elements the prosecutor checks; use them as the test of whether the evidence is enough):\n{}\n\nLAW TEXT HELD BY THE OFFICE (quote only this; say when the text you need is not here):\n{}\n\nTHIS OFFICE'S PAST HANDLING:\n{}",
        chrono::Utc::now().format("%Y-%m-%d"),
        assist::RULES,
        assist::country_lines(country),
        if guide.is_empty() { "(no guide entry fits this file's offence yet: say so, and do not invent elements)".to_string() } else { guide },
        if law.is_empty() { "(no law text stored yet)".to_string() } else { law },
        if history.is_empty() { "(none yet)".to_string() } else { history },
    );
    let mut file = assist::file_text(pool, file_id).await?;
    // The same answer the screens show, so Assist never describes a position the
    // prosecutor is not looking at. It only describes: the decision stays theirs.
    if let Some(line) = super::attention::describe(pool, file_id).await? {
        file = format!("WHERE THE FILE STANDS (set by the office's records, not by you): {line}\n\n{file}");
    }
    Ok((system, file))
}

// ---------------------------------------------------------------- proposing

fn s(d: &str) -> Value {
    json!({ "type": "string", "description": d })
}

fn review_schema() -> Value {
    let finding = |criteria: &[&str]| {
        json!({ "type": "array", "items": { "type": "object", "properties": {
            "criterion": { "type": "string", "enum": criteria },
            "finding": { "type": "string", "enum": ["favours", "against", "unresolved"] },
            "note": s("One sentence from the file.") }, "required": ["criterion", "finding", "note"] } })
    };
    json!({ "type": "object", "properties": {
        "summary": s("What the file shows, 3 to 6 sentences."),
        "evidentialOutcome": { "type": "string", "enum": ["passed", "failed", "unresolved"] },
        "evidential": finding(EVIDENTIAL),
        "publicInterestOutcome": { "type": "string", "enum": ["passed", "failed", "unresolved"] },
        "publicInterest": finding(PUBLIC_INTEREST),
        "elements": { "type": "array", "items": { "type": "object", "properties": {
            "element": s("One element from the guide, word for word. Empty list if the guide has none for this offence."),
            "status": { "type": "string", "enum": ["shown", "not_shown", "unclear"] },
            "source": s("The paper and page that shows it, e.g. 'Akello statement p. 1'. Empty if not shown."),
            "against": s("Every paper and page that disputes or weakens this element, and what it says, the accused's own statement above all. Empty only if nothing in the file does.") }, "required": ["element", "status", "source", "against"] } },
        "missing": { "type": "array", "items": s("Something the file needs and lacks.") },
        "contradictions": { "type": "array", "items": s("Where the file disagrees with itself.") },
        "procedure": { "type": "array", "items": s("A problem with custody or detention against the country's time limits (count the dates), or with the accused's rights (lawyer, interpreter, caution). Empty if none.") }
    }, "required": ["summary", "evidentialOutcome", "evidential", "publicInterestOutcome", "publicInterest", "elements", "missing", "contradictions", "procedure"] })
}

fn decide_schema(kinds: &[String]) -> Value {
    json!({ "type": "object", "properties": {
        "kind": { "type": "string", "enum": kinds },
        "reasons": s("The reasons, in the prosecutor's voice, citing the file and naming the law from the list."),
        "directions": { "type": "array", "description": "Only for a return for further investigation: what Police must do.", "items": { "type": "object", "properties": {
            "kind": { "type": "string", "enum": directions::KINDS }, "instruction": s("One clear instruction to Police.") }, "required": ["kind", "instruction"] } }
    }, "required": ["kind", "reasons", "directions"] })
}

fn handover_schema() -> Value {
    json!({ "type": "object", "properties": {
        "recipient": s("Who receives it: the police station and officer, the court registry, or others."),
        "method": { "type": "string", "enum": METHODS },
        "note": s("The covering note or letter, short and formal."),
        "replyDays": { "type": "integer", "description": "Days to wait for an answer before following up; 0 if none is expected." }
    }, "required": ["recipient", "method", "note", "replyDays"] })
}

fn follow_up_schema() -> Value {
    json!({ "type": "object", "properties": {
        "summary": s("Where the file stands now, one or two sentences."),
        "steps": { "type": "array", "items": { "type": "object", "properties": {
            "title": s("A task starting with a verb."), "why": s("Why, one sentence."),
            "who": { "type": "string", "enum": ["prosecutor", "police", "court"] }, "dueInDays": { "type": "integer" } },
            "required": ["title", "why", "who", "dueInDays"] } },
        "readyToConclude": { "type": "boolean", "description": "True only when nothing more is expected on this file." }
    }, "required": ["summary", "steps", "readyToConclude"] })
}

fn conclude_schema() -> Value {
    json!({ "type": "object", "properties": {
        "outcome": { "type": "string", "enum": OUTCOMES },
        "note": s("The closing note for the record: what happened and why the file closes.")
    }, "required": ["outcome", "note"] })
}

/// Prepares the proposal for the stage a file is in (or the one asked for).
pub async fn propose(pool: &SqlitePool, file_id: &str, stage: Option<&str>, country: &CountryContext, actor: Option<&str>) -> Result<Proposal, DomainError> {
    let stage = match stage {
        Some(s) => s.to_string(),
        None => file_stage(pool, file_id).await?,
    };
    if !STAGES.contains(&stage.as_str()) {
        return invalid("That is not a stage.");
    }

    // Stages that need no model: they state what the record already holds.
    match stage.as_str() {
        "receive" => {
            let items = file_items::list(pool, file_id).await?;
            let unchecked = items.iter().filter(|i| i.source == "assist" && i.confirmed_at.is_none()).count();
            let people: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prosecution_file_people WHERE prosecution_file_id = ?").bind(file_id).fetch_one(pool).await?;
            let charges: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM charges WHERE prosecution_file_id = ?").bind(file_id).fetch_one(pool).await?;
            let body = json!({ "documents": items.len(), "unchecked": unchecked, "people": people, "charges": charges });
            return store(pool, file_id, &stage, body, "record", actor).await;
        }
        "prepare" => {
            let last: Option<(String, String)> = sqlx::query_as("SELECT id, decision_type FROM decisions WHERE prosecution_file_id = ? ORDER BY decided_at DESC LIMIT 1").bind(file_id).fetch_optional(pool).await?;
            let body = match last {
                Some((id, kind)) => match document_builder::kind_for(&kind) {
                    Some(doc) => json!({ "decisionId": id, "decision": kind, "document": doc, "title": document_builder::title_for(doc) }),
                    None => json!({ "decisionId": id, "decision": kind, "document": Value::Null }),
                },
                None => json!({ "decisionId": Value::Null }),
            };
            return store(pool, file_id, &stage, body, "record", actor).await;
        }
        _ => {}
    }

    let e = assist::engine(pool).await?;
    let (system, file) = full_context(pool, file_id, country).await?;
    let (ask, schema) = match stage.as_str() {
        "review" => ("Review this file against the Evidential Test and, if it is passed, the Public Interest Test. Give a finding for every criterion. Then go through each element in the office's legal guide for this offence and say whether the papers show it, naming the paper and page. Read the accused's statement and every defence account against each element: if any paper disputes an element (for example the accused says he found the thing, or was elsewhere), record it in against and do not mark the element shown, mark it unclear. Where an element is not shown, put it in missing.".to_string(), review_schema()),
        "decide" => {
            let kinds: Vec<String> = country.decisions.iter().filter_map(|d| d.split(':').next().map(|k| k.trim().to_string())).collect();
            let kinds = if kinds.is_empty() { decisions::DECISION_TYPES.iter().map(|k| k.to_string()).collect() } else { kinds };
            ("Propose the one decision the prosecutor should take now, with reasons. If the evidence is not yet sufficient, propose a return for further investigation with precise directions.".to_string(), decide_schema(&kinds))
        }
        "handover" => ("Propose the hand-over the last decision calls for: who receives what, how, and the covering note.".to_string(), handover_schema()),
        "follow_up" => ("Propose the follow-up: what to chase, from whom, and when. Say whether the file is ready to conclude.".to_string(), follow_up_schema()),
        _ => ("Propose how this file concludes: the outcome and a closing note.".to_string(), conclude_schema()),
    };
    // The language is repeated last: models otherwise drift back to English.
    let lang = if country.language.is_empty() { "English".to_string() } else { country.language.clone() };
    let ask = format!("{ask}\nCheck every date against the time limits given for this country.\nWrite every text field in {lang}.");
    let aliases = assist::aliases_for(pool, &e, Some(file_id)).await?;
    match ai::generate_json(&e, &aliases.hide(&system), &[Part::Text(aliases.hide(&format!("{ask}\n\n{file}")))], &schema).await {
        Ok((mut body, model)) => {
            aliases.show_value(&mut body);
            if stage == "review" {
                hold_disputed_elements(&mut body);
            }
            assist::log(pool, Some(file_id), &format!("propose_{stage}"), &model, actor, true, "").await;
            store(pool, file_id, &stage, body, &model, actor).await
        }
        Err(err) => {
            assist::log(pool, Some(file_id), &format!("propose_{stage}"), &e.provider, actor, false, &err.to_string()).await;
            Err(err)
        }
    }
}

/// Whatever the model says, an element that a paper disputes is not "shown":
/// it becomes "unclear", so a small or hurried model cannot hand the
/// prosecutor a tick the file itself contradicts.
fn hold_disputed_elements(body: &mut Value) {
    let mut open = false;
    if let Some(list) = body.get_mut("elements").and_then(Value::as_array_mut) {
        for e in list {
            let disputed = e.get("against").and_then(Value::as_str).is_some_and(|a| !a.trim().is_empty());
            if disputed && e.get("status").and_then(Value::as_str) == Some("shown") {
                e["status"] = Value::String("unclear".into());
            }
            open |= e.get("status").and_then(Value::as_str) != Some("shown");
        }
    }
    // The Evidential Test cannot be "passed" while one of its own criteria is
    // unresolved or against charging, or while an element is open. The Public
    // Interest Test is left to the prosecutor: a factor that does not arise is
    // often just not assessed.
    for (outcome, findings, extra) in [("evidentialOutcome", "evidential", open)] {
        let unsettled = extra
            || body.get(findings).and_then(Value::as_array).is_some_and(|list| list.iter().any(|f| matches!(f.get("finding").and_then(Value::as_str), Some("unresolved") | Some("against"))));
        if unsettled && body.get(outcome).and_then(Value::as_str) == Some("passed") {
            body[outcome] = Value::String("unresolved".into());
        }
    }
}

// ---------------------------------------------------------------- accepting

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerInput {
    /// `accept` or `reject`.
    pub answer: String,
    /// The body as the prosecutor edited it; absent means as proposed.
    pub body: Option<Value>,
    pub note: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Answered {
    pub proposal: Proposal,
    pub stage: String,
}

fn next_of(stage: &str) -> &'static str {
    match stage {
        "receive" => "review",
        "review" => "decide",
        "decide" => "prepare",
        "prepare" => "handover",
        "handover" => "follow_up",
        _ => "concluded",
    }
}

pub async fn answer(pool: &SqlitePool, vault_root: &std::path::Path, proposal_id: &str, input: AnswerInput, actor: &str) -> Result<Answered, DomainError> {
    let _ = vault_root;
    let p: Proposal = sqlx::query_as("SELECT * FROM proposals WHERE id = ?").bind(proposal_id).fetch_one(pool).await?;
    if p.status != "proposed" {
        return invalid("This proposal has already been answered.");
    }
    let file_id = p.prosecution_file_id.clone();
    let note = input.note.clone().map(|n| n.trim().to_string()).filter(|n| !n.is_empty());

    if input.answer == "reject" {
        sqlx::query("UPDATE proposals SET status = 'rejected', response_note = ?, decided_by = ?, decided_at = ? WHERE id = ?")
            .bind(&note)
            .bind(actor)
            .bind(now())
            .bind(proposal_id)
            .execute(pool)
            .await?;
        let proposal = sqlx::query_as("SELECT * FROM proposals WHERE id = ?").bind(proposal_id).fetch_one(pool).await?;
        return Ok(Answered { proposal, stage: file_stage(pool, &file_id).await? });
    }
    if input.answer != "accept" {
        return invalid("Accept or reject.");
    }
    let edited = input.body.as_ref().is_some_and(|b| b != &p.body);
    let body = input.body.unwrap_or(p.body.clone());
    let mut next = next_of(&p.stage).to_string();

    match p.stage.as_str() {
        "receive" => {
            file_items::confirm_all(pool, &file_id, Some(actor)).await?;
        }
        "review" => accept_review(pool, &file_id, &body, actor).await?,
        "decide" => {
            let kind = body["kind"].as_str().unwrap_or("").to_string();
            let review_id: Option<String> = sqlx::query_scalar("SELECT id FROM charging_reviews WHERE prosecution_file_id = ? AND concluded_at IS NULL ORDER BY started_at DESC LIMIT 1")
                .bind(&file_id)
                .fetch_optional(pool)
                .await?;
            let directions: Vec<DirectionInput> = if kind == "return_for_investigation" {
                body["directions"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default()
                    .iter()
                    .map(|d| DirectionInput { kind: d["kind"].as_str().unwrap_or("other").to_string(), instruction: d["instruction"].as_str().unwrap_or("").to_string(), person_id: None, due_at: None })
                    .filter(|d| !d.instruction.trim().is_empty())
                    .collect()
            } else {
                vec![]
            };
            decisions::create_decision(
                pool,
                CreateDecisionInput {
                    prosecution_file_id: file_id.clone(),
                    decision_type: kind.clone(),
                    decided_by: Some(actor.to_string()),
                    decided_at: now(),
                    reasons: body["reasons"].as_str().map(str::to_string),
                    charge_ids: vec![],
                    review_id,
                    corrects_decision_id: None,
                    conclude_review: true,
                    directions,
                },
            )
            .await?;
        }
        "prepare" => {
            if let (Some(decision_id), false) = (body["decisionId"].as_str(), body["document"].is_null()) {
                documents::prepare(pool, decision_id).await?;
            }
        }
        "handover" => {
            let method = body["method"].as_str().filter(|m| METHODS.contains(m)).unwrap_or("other");
            let recipient = body["recipient"].as_str().unwrap_or("").trim();
            if recipient.is_empty() {
                return invalid("Say who receives the file.");
            }
            let reply_days = body["replyDays"].as_i64().unwrap_or(0);
            sqlx::query("INSERT INTO handovers (id, prosecution_file_id, recipient, method, note, reply_due_at, handed_by, handed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(Uuid::new_v4().to_string())
                .bind(&file_id)
                .bind(recipient)
                .bind(method)
                .bind(body["note"].as_str())
                .bind(if reply_days > 0 { Some(now() + reply_days * DAY) } else { None })
                .bind(actor)
                .bind(now())
                .execute(pool)
                .await?;
            if method == "connection" {
                let decision: Option<String> = sqlx::query_scalar("SELECT id FROM decisions WHERE prosecution_file_id = ? ORDER BY decided_at DESC LIMIT 1").bind(&file_id).fetch_optional(pool).await?;
                if let Some(d) = decision {
                    interchange::prepare_decision_notice(pool, &d).await?;
                }
            }
            if reply_days > 0 {
                tasks::create(
                    pool,
                    tasks::CreateTaskInput {
                        prosecution_file_id: Some(file_id.clone()),
                        title: format!("Check for an answer from {recipient}"),
                        note: None,
                        status: Some(if method == "connection" || recipient.to_lowercase().contains("police") { "waiting_police".into() } else { "todo".into() }),
                        due_at: Some(now() + reply_days * DAY),
                        assigned_to: None,
                        proposed: false,
                        source: Some("assist".into()),
                    },
                    Some(actor),
                )
                .await?;
            }
        }
        "follow_up" => {
            for step in body["steps"].as_array().cloned().unwrap_or_default() {
                let who = step["who"].as_str().unwrap_or("prosecutor");
                let days = step["dueInDays"].as_i64().unwrap_or(0);
                tasks::create(
                    pool,
                    tasks::CreateTaskInput {
                        prosecution_file_id: Some(file_id.clone()),
                        title: step["title"].as_str().unwrap_or("Follow up").to_string(),
                        note: step["why"].as_str().map(str::to_string),
                        status: Some(match who {
                            "police" => "waiting_police".into(),
                            "court" => "waiting_court".into(),
                            _ => "todo".into(),
                        }),
                        due_at: if days > 0 { Some(now() + days * DAY) } else { None },
                        assigned_to: None,
                        proposed: false,
                        source: Some("assist".into()),
                    },
                    Some(actor),
                )
                .await?;
            }
            // Follow-up continues until the file is concluded, unless nothing more is expected.
            next = if body["readyToConclude"].as_bool() == Some(true) { "concluded".into() } else { "follow_up".into() };
        }
        "concluded" => {
            let outcome = body["outcome"].as_str().filter(|o| OUTCOMES.contains(o)).unwrap_or("other");
            sqlx::query("UPDATE prosecution_files SET outcome = ?, concluded_at = ? WHERE id = ?").bind(outcome).bind(now()).bind(&file_id).execute(pool).await?;
            // A closed file leaves nothing waiting on the board.
            sqlx::query("UPDATE tasks SET status = 'done', done_at = ?, updated_at = ? WHERE prosecution_file_id = ? AND status != 'done'")
                .bind(now())
                .bind(now())
                .bind(&file_id)
                .execute(pool)
                .await?;
            if let Some(n) = body["note"].as_str().filter(|n| !n.trim().is_empty()) {
                review_notes::create_review_note(pool, CreateReviewNoteInput { prosecution_file_id: file_id.clone(), statement_id: None, evidence_item_id: None, author: Some(actor.to_string()), note: Some(format!("Closing note: {n}")) }).await?;
            }
            next = "concluded".into();
        }
        _ => return invalid("Unknown stage."),
    }

    sqlx::query("UPDATE proposals SET status = ?, body = ?, response_note = ?, decided_by = ?, decided_at = ? WHERE id = ?")
        .bind(if edited { "edited" } else { "accepted" })
        .bind(body.to_string())
        .bind(&note)
        .bind(actor)
        .bind(now())
        .bind(proposal_id)
        .execute(pool)
        .await?;
    if next != p.stage || p.stage == "concluded" {
        set_stage(pool, &file_id, &next, Some(actor)).await?;
    }
    let proposal = sqlx::query_as("SELECT * FROM proposals WHERE id = ?").bind(proposal_id).fetch_one(pool).await?;
    Ok(Answered { proposal, stage: next })
}

/// Accepting a review: the charging review with a finding for each criterion
/// and its outcomes, and the summary as a review note.
async fn accept_review(pool: &SqlitePool, file_id: &str, body: &Value, actor: &str) -> Result<(), DomainError> {
    let open: Option<String> = sqlx::query_scalar("SELECT id FROM charging_reviews WHERE prosecution_file_id = ? AND concluded_at IS NULL ORDER BY started_at DESC LIMIT 1")
        .bind(file_id)
        .fetch_optional(pool)
        .await?;
    let review_id = match open {
        Some(id) => id,
        None => charging_reviews::start_review(pool, StartReviewInput { prosecution_file_id: file_id.to_string(), standard: "two_stage".into(), reopens_decision_id: None, reopen_reason: None }).await?.review.id,
    };
    for key in ["evidential", "publicInterest"] {
        for f in body[key].as_array().cloned().unwrap_or_default() {
            let (Some(criterion), Some(finding)) = (f["criterion"].as_str(), f["finding"].as_str()) else { continue };
            charging_reviews::set_assessment(pool, &review_id, criterion, AssessmentInput { finding: finding.to_string(), note: f["note"].as_str().map(str::to_string) }).await?;
        }
    }
    let ev = body["evidentialOutcome"].as_str().filter(|o| *o == "passed" || *o == "failed");
    if let Some(o) = ev {
        charging_reviews::set_outcome(pool, &review_id, OutcomeInput { test: "evidential".into(), outcome: Some(o.to_string()) }).await?;
        if o == "passed" {
            if let Some(pi) = body["publicInterestOutcome"].as_str().filter(|o| *o == "passed" || *o == "failed") {
                charging_reviews::set_outcome(pool, &review_id, OutcomeInput { test: "public_interest".into(), outcome: Some(pi.to_string()) }).await?;
            }
        }
    }
    let mut note = body["summary"].as_str().unwrap_or("").to_string();
    let list = |k: &str| body[k].as_array().map(|a| a.iter().filter_map(|x| x.as_str()).map(|x| format!("- {x}")).collect::<Vec<_>>().join("\n")).unwrap_or_default();
    let missing = list("missing");
    if !missing.is_empty() {
        note.push_str(&format!("\n\nMissing:\n{missing}"));
    }
    let contradictions = list("contradictions");
    if !contradictions.is_empty() {
        note.push_str(&format!("\n\nContradictions:\n{contradictions}"));
    }
    let procedure = list("procedure");
    if !procedure.is_empty() {
        note.push_str(&format!("\n\nProcedure and rights:\n{procedure}"));
    }
    if !note.trim().is_empty() {
        review_notes::create_review_note(pool, CreateReviewNoteInput { prosecution_file_id: file_id.to_string(), statement_id: None, evidence_item_id: None, author: Some(actor.to_string()), note: Some(note) }).await?;
    }
    Ok(())
}

// ---------------------------------------------------------------- hand-overs and the board

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Handover {
    pub id: String,
    pub prosecution_file_id: String,
    pub recipient: String,
    pub method: String,
    pub note: Option<String>,
    pub reply_due_at: Option<i64>,
    pub handed_by: Option<String>,
    pub handed_at: i64,
}

pub async fn handovers(pool: &SqlitePool, file_id: &str) -> Result<Vec<Handover>, sqlx::Error> {
    sqlx::query_as("SELECT * FROM handovers WHERE prosecution_file_id = ? ORDER BY handed_at DESC").bind(file_id).fetch_all(pool).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoverInput {
    pub prosecution_file_id: String,
    pub recipient: String,
    pub method: String,
    pub note: Option<String>,
}

/// A hand-over recorded by hand (a download or print done outside a proposal).
pub async fn record_handover(pool: &SqlitePool, input: HandoverInput, actor: Option<&str>) -> Result<Handover, DomainError> {
    if !METHODS.contains(&input.method.as_str()) {
        return invalid("Unknown way of handing over.");
    }
    if input.recipient.trim().is_empty() {
        return invalid("Say who receives the file.");
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO handovers (id, prosecution_file_id, recipient, method, note, handed_by, handed_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&input.prosecution_file_id)
        .bind(input.recipient.trim())
        .bind(&input.method)
        .bind(&input.note)
        .bind(actor)
        .bind(now())
        .execute(pool)
        .await?;
    Ok(sqlx::query_as("SELECT * FROM handovers WHERE id = ?").bind(&id).fetch_one(pool).await?)
}

/// One case on the office board.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BoardCard {
    pub id: String,
    pub title: String,
    pub reference: Option<String>,
    pub stage: String,
    pub stage_changed_at: Option<i64>,
    pub received_at: i64,
    pub current_status: String,
    pub outcome: Option<String>,
    pub accused: Option<String>,
    pub next_hearing_at: Option<i64>,
    /// A proposal is waiting for this file's current stage.
    pub proposal_waiting: bool,
    pub open_tasks: i64,
}

pub async fn board(pool: &SqlitePool) -> Result<Vec<BoardCard>, sqlx::Error> {
    sqlx::query_as(
        "SELECT f.id, f.title, COALESCE(f.odpp_registration_number, f.police_reference) AS reference, f.stage, f.stage_changed_at, f.received_at,
                f.current_status, f.outcome,
                (SELECT group_concat(p.first_name || ' ' || p.last_name, ', ') FROM prosecution_file_people fp JOIN people p ON p.id = fp.person_id
                  WHERE fp.prosecution_file_id = f.id AND fp.role = 'accused') AS accused,
                (SELECT MIN(h.starts_at) FROM hearings h WHERE h.prosecution_file_id = f.id AND h.starts_at >= ?1) AS next_hearing_at,
                EXISTS (SELECT 1 FROM proposals pr WHERE pr.prosecution_file_id = f.id AND pr.stage = f.stage AND pr.status = 'proposed') AS proposal_waiting,
                (SELECT COUNT(*) FROM tasks t WHERE t.prosecution_file_id = f.id AND t.status != 'done') AS open_tasks
           FROM prosecution_files f
          WHERE f.stage != 'concluded' OR f.concluded_at > ?2
          ORDER BY COALESCE(f.stage_changed_at, f.received_at) DESC",
    )
    .bind(now() - 12 * 3_600_000)
    .bind(now() - 30 * DAY)
    .fetch_all(pool)
    .await
}

// ---------------------------------------------------------------- conversation

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInput {
    pub messages: Vec<ChatMessage>,
    pub file_id: Option<String>,
    /// Where the prosecutor is in the app, in words ("the Cases board").
    pub place: Option<String>,
    #[serde(default)]
    pub context: CountryContext,
    /// The model chosen in the chat; none means the default.
    #[serde(default)]
    pub model: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatReply {
    pub text: String,
    pub model: String,
}

pub async fn chat(pool: &SqlitePool, input: ChatInput, actor: Option<&str>) -> Result<ChatReply, DomainError> {
    if input.messages.is_empty() {
        return invalid("Say something first.");
    }
    let e = assist::engine_for(pool, input.model.as_deref()).await?;
    let mut system = match &input.file_id {
        Some(id) => {
            let (system, file) = full_context(pool, id, &input.context).await?;
            format!("{system}\n\nTHE FILE OPEN ON SCREEN:\n{file}")
        }
        None => format!("{PLATFORM}\nToday is {}.\n{}\n{}", chrono::Utc::now().format("%Y-%m-%d"), assist::RULES, assist::country_lines(&input.context)),
    };
    if let Some(place) = &input.place {
        system.push_str(&format!("\n\nThe prosecutor is looking at: {place}."));
    }
    system.push_str("\nAnswer in short plain paragraphs or lists. When something should be done in the app, say which stage and which button.");
    let conversation: Vec<(String, String)> = input.messages.iter().rev().take(20).rev().map(|m| (m.role.clone(), m.content.clone())).collect();
    let aliases = assist::aliases_for(pool, &e, input.file_id.as_deref()).await?;
    let hidden_conversation: Vec<(String, String)> = conversation.iter().map(|(role, text)| (role.clone(), aliases.hide(text))).collect();
    match ai::reply(&e, &aliases.hide(&system), &hidden_conversation).await {
        Ok((text, model)) => {
            let text = aliases.show(&text);
            assist::log(pool, input.file_id.as_deref(), "chat", &model, actor, true, "").await;
            Ok(ChatReply { text, model })
        }
        Err(err) => {
            assist::log(pool, input.file_id.as_deref(), "chat", &e.provider, actor, false, &err.to_string()).await;
            Err(err)
        }
    }
}

#[cfg(test)]
mod guard_tests {
    use super::*;

    #[test]
    fn a_disputed_element_is_never_shown() {
        let mut body = json!({ "elements": [
            { "element": "Took without a claim of right", "status": "shown", "source": "Akello p. 1", "against": "Okello's statement: he found the phone near the gate" },
            { "element": "It belonged to someone else", "status": "shown", "source": "Akello p. 1", "against": "" },
            { "element": "Intent", "status": "not_shown", "source": "", "against": "  " }
        ] });
        hold_disputed_elements(&mut body);
        assert_eq!(body["elements"][0]["status"], "unclear");
        assert_eq!(body["elements"][1]["status"], "shown");
        assert_eq!(body["elements"][2]["status"], "not_shown");
        let mut open = json!({ "evidentialOutcome": "passed", "elements": [{ "status": "unclear", "against": "x" }] });
        hold_disputed_elements(&mut open);
        assert_eq!(open["evidentialOutcome"], "unresolved");
        // A criterion left unresolved holds the test even with every element shown.
        let mut crit = json!({ "evidentialOutcome": "passed", "publicInterestOutcome": "passed",
            "evidential": [{ "criterion": "relevance", "finding": "favours" }, { "criterion": "defence", "finding": "unresolved" }],
            "publicInterest": [{ "criterion": "harm", "finding": "favours" }] });
        hold_disputed_elements(&mut crit);
        assert_eq!(crit["evidentialOutcome"], "unresolved");
        assert_eq!(crit["publicInterestOutcome"], "passed");
        // The Public Interest Test is not held for an unassessed factor.
        let mut pi = json!({ "publicInterestOutcome": "passed", "publicInterest": [{ "criterion": "out_of_court", "finding": "unresolved" }] });
        hold_disputed_elements(&mut pi);
        assert_eq!(pi["publicInterestOutcome"], "passed");
        // A body with no elements (an older proposal) is left alone.
        let mut old = json!({ "summary": "x" });
        hold_disputed_elements(&mut old);
        assert_eq!(old, json!({ "summary": "x" }));
    }
}
