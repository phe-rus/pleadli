//! Assist: helps the advocate with a matter (docs/lawyers/REVIEW-2026-09-30.md,
//! 4.3; D12). It summarises, lays out a chronology, finds what the other side
//! has not answered, drafts from the facts, and explains a deadline the app
//! has already counted. It never decides and never counts days: every answer is
//! a draft a named person uses or ignores, and every request is logged.
//!
//! It runs only when an administrator has turned it on and confirmed where a
//! matter's papers go. The provider key stays in this encrypted database.
//! Which provider and model answer is `pleadli_node_core::ai`'s business.

use pleadli_node_core::ai::{self, AiError, Engine, ModelInfo, Part, PROVIDERS};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{clean, invalid, DomainError};
use super::{clients, clocks, documents, hearings, installation, matters, notes, papers, parties};

/// A document's text is cut here: enough for a pleading, not a whole bundle.
const MAX_DOCUMENT_CHARS: usize = 40_000;
/// What the matter record may add to one request.
const MAX_CONTEXT_CHARS: usize = 60_000;

pub const TASKS: [&str; 7] = ["summary", "chronology", "summarise_document", "unanswered", "draft", "explain_clock", "chat"];

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn from_ai(e: AiError) -> DomainError {
    DomainError::Invalid(e.0)
}

// ---------------------------------------------------------------- settings

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistSettings {
    pub mode: String,
    pub provider: String,
    /// The model an administrator fixed; ignored while `auto_model` is on.
    pub model: String,
    pub auto_model: bool,
    pub base_url: Option<String>,
    /// Whether a key is available, and from where. The key itself never leaves.
    pub key_source: Option<String>,
    pub key_hint: Option<String>,
    pub acknowledged_by: Option<String>,
    pub acknowledged_at: Option<i64>,
    /// On, confirmed, and a key is there.
    pub ready: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistSettingsInput {
    pub mode: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub auto_model: Option<bool>,
    pub base_url: Option<String>,
    /// A new key; absent leaves the stored one, empty removes it.
    pub api_key: Option<String>,
    #[serde(default)]
    pub acknowledge: bool,
}

#[derive(sqlx::FromRow)]
struct Row {
    mode: String,
    provider: String,
    model: String,
    api_key: Option<String>,
    acknowledged_by: Option<String>,
    acknowledged_at: Option<i64>,
    base_url: Option<String>,
    auto_model: bool,
}

async fn row(pool: &SqlitePool) -> Result<Row, sqlx::Error> {
    let found: Option<Row> =
        sqlx::query_as("SELECT mode, provider, model, api_key, acknowledged_by, acknowledged_at, base_url, auto_model FROM assist_settings WHERE id = 'this'")
            .fetch_optional(pool)
            .await?;
    Ok(found.unwrap_or(Row {
        mode: "off".into(),
        provider: "gemini".into(),
        model: String::new(),
        api_key: None,
        acknowledged_by: None,
        acknowledged_at: None,
        base_url: None,
        auto_model: true,
    }))
}

pub async fn settings(pool: &SqlitePool) -> Result<AssistSettings, sqlx::Error> {
    let r = row(pool).await?;
    let (key_source, key_hint) = match (&r.api_key, ai::env_key(&r.provider)) {
        (Some(k), _) => (Some("settings".to_string()), Some(ai::key_hint(k))),
        (None, Some(k)) => (Some("environment".to_string()), Some(ai::key_hint(&k))),
        _ => (None, None),
    };
    // An OpenAI-compatible server on this computer (Ollama) may need no key.
    let keyless = r.provider == "openai_compatible" && r.base_url.is_some();
    let ready = r.mode != "off" && r.acknowledged_at.is_some() && (key_source.is_some() || keyless);
    Ok(AssistSettings {
        mode: r.mode,
        provider: r.provider,
        model: r.model,
        auto_model: r.auto_model,
        base_url: r.base_url,
        key_source,
        key_hint,
        acknowledged_by: r.acknowledged_by,
        acknowledged_at: r.acknowledged_at,
        ready,
    })
}

pub async fn save_settings(pool: &SqlitePool, input: AssistSettingsInput, actor: &str) -> Result<AssistSettings, DomainError> {
    if !["off", "practice_key"].contains(&input.mode.as_str()) {
        return invalid("Unknown Assist mode.");
    }
    let r = row(pool).await?;
    let provider = input.provider.unwrap_or(r.provider.clone());
    if !PROVIDERS.contains(&provider.as_str()) {
        return invalid("Unknown provider.");
    }
    let model = input.model.map(|m| m.trim().to_string()).unwrap_or(r.model.clone());
    if !model.chars().all(|c| c.is_ascii_alphanumeric() || "-._/:".contains(c)) {
        return invalid("That is not a model name.");
    }
    let base_url = match input.base_url {
        Some(u) if u.trim().is_empty() => None,
        Some(u) if u.trim().starts_with("http://") || u.trim().starts_with("https://") => Some(u.trim().trim_end_matches('/').to_string()),
        Some(_) => return invalid("The server address must start with http:// or https://."),
        None => r.base_url.clone(),
    };
    if provider == "openai_compatible" && base_url.is_none() {
        return invalid("Give the server's address, for example http://localhost:11434/v1.");
    }
    // A different provider's key is no use to this one.
    let old_key = if provider == r.provider { r.api_key.clone() } else { None };
    let key = match input.api_key {
        Some(k) if k.trim().is_empty() => None,
        Some(k) => Some(k.trim().to_string()),
        None => old_key,
    };
    let auto_model = input.auto_model.unwrap_or(r.auto_model);
    let (by, at) = if input.acknowledge {
        (Some(actor.to_string()), Some(now()))
    } else if input.mode == "off" {
        (None, None)
    } else {
        (r.acknowledged_by, r.acknowledged_at)
    };
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    sqlx::query(
        "INSERT INTO assist_settings (id, mode, provider, model, api_key, acknowledged_by, acknowledged_at, base_url, auto_model, updated_at)
         VALUES ('this', ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET mode = excluded.mode, provider = excluded.provider, model = excluded.model, api_key = excluded.api_key,
           acknowledged_by = excluded.acknowledged_by, acknowledged_at = excluded.acknowledged_at, base_url = excluded.base_url,
           auto_model = excluded.auto_model, updated_at = excluded.updated_at",
    )
    .bind(&input.mode)
    .bind(&provider)
    .bind(&model)
    .bind(&key)
    .bind(&by)
    .bind(at)
    .bind(&base_url)
    .bind(auto_model)
    .bind(now())
    .execute(&mut *tx)
    .await?;
    audit::record(
        &mut tx,
        Entry::new("assist_settings_changed").detail(format!("{}, {provider}, model {}", input.mode, if auto_model { "automatic" } else { &model })),
    )
    .await?;
    tx.commit().await?;
    Ok(settings(pool).await?)
}

/// The provider, key and model, or why Assist cannot run.
async fn engine(pool: &SqlitePool) -> Result<Engine, DomainError> {
    let r = row(pool).await?;
    if r.mode == "off" {
        return Err(DomainError::Forbidden("Assist is off. An administrator can turn it on in Settings.".into()));
    }
    if r.acknowledged_at.is_none() {
        return Err(DomainError::Forbidden("An administrator must first confirm where Assist sends a matter's papers.".into()));
    }
    let key = r.api_key.clone().or_else(|| ai::env_key(&r.provider));
    let key = match (key, r.provider.as_str(), &r.base_url) {
        (Some(k), _, _) => k,
        (None, "openai_compatible", Some(_)) => String::new(),
        _ => return Err(DomainError::Forbidden("Assist has no provider key yet.".into())),
    };
    let fixed = if r.auto_model || r.model.is_empty() { None } else { Some(r.model.clone()) };
    Ok(Engine { provider: r.provider, key, base_url: r.base_url, fixed_model: fixed })
}

/// The provider's own model list, marked with what automatic choice would use.
pub async fn models(pool: &SqlitePool) -> Result<Vec<ModelInfo>, DomainError> {
    let r = row(pool).await?;
    let key = r.api_key.clone().or_else(|| ai::env_key(&r.provider)).unwrap_or_default();
    if key.is_empty() && r.provider != "openai_compatible" && r.provider != "openrouter" {
        return invalid("Add the provider key first.");
    }
    ai::list_models(&Engine { provider: r.provider, key, base_url: r.base_url, fixed_model: None }).await.map_err(from_ai)
}

async fn log(pool: &SqlitePool, matter_id: &str, task: &str, model: &str, actor: &str, ok: bool, detail: &str) {
    let _ = sqlx::query("INSERT INTO assist_log (id, matter_id, task, model, requested_by, ok, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(matter_id)
        .bind(task)
        .bind(model)
        .bind(actor)
        .bind(ok)
        .bind(detail)
        .bind(now())
        .execute(pool)
        .await;
}

// ---------------------------------------------------------------- asking

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AskInput {
    pub task: String,
    /// The document the task is about (summarise, unanswered).
    pub document_id: Option<String>,
    /// Pasted text instead of a document, or the facts to draft from.
    pub text: Option<String>,
    /// What to draft ("a demand letter", "an affidavit in reply").
    pub draft_kind: Option<String>,
    /// The deadline to explain, by its rule key.
    pub rule: Option<String>,
    /// The conversation so far, oldest first, for `chat`.
    #[serde(default)]
    pub messages: Vec<ChatMessage>,
    /// The language the person reads ("en", "sw", "de", "fr").
    pub language: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Point {
    /// A day as written in the papers ("12 March 2026"), when there is one.
    #[serde(default)]
    pub date: Option<String>,
    pub text: String,
    /// Where it comes from: a document, a hearing, a note.
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub title: String,
    pub paragraphs: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Answer {
    pub task: String,
    pub text: Option<String>,
    pub points: Vec<Point>,
    pub draft: Option<Draft>,
    pub model: String,
}

fn language_name(code: Option<&str>) -> &'static str {
    match code.unwrap_or("en") {
        "sw" => "Swahili",
        "de" => "German",
        "fr" => "French",
        _ => "English",
    }
}

fn day(ms: i64) -> String {
    let eat = chrono::FixedOffset::east_opt(3 * 3600).expect("a valid offset");
    chrono::DateTime::from_timestamp_millis(ms).map(|d| d.with_timezone(&eat).format("%-d %B %Y").to_string()).unwrap_or_default()
}

fn cut(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let kept: String = text.chars().take(max).collect();
    format!("{kept}\n[... cut here: the rest is not shown]")
}

/// The matter as the app records it, in plain lines. Deadlines are the ones
/// the app counted: Assist is told they are authoritative.
async fn matter_context(pool: &SqlitePool, matter: &matters::Matter) -> Result<String, sqlx::Error> {
    let client = clients::get(pool, &matter.client_id).await?;
    let mut out = format!(
        "MATTER: {}\nKind: {} (stage: {})\nClient (we act for them): {}\nCourt: {} {}\n",
        matter.title,
        words("matter_type", &matter.matter_type),
        words("stage", &matter.stage),
        client.map(|c| format!("{} ({})", c.name, c.kind)).unwrap_or_default(),
        matter.court_name.clone().unwrap_or_else(|| "not recorded".into()),
        matter.court_number.clone().unwrap_or_default(),
    );
    if let Some(offence) = &matter.offence {
        out.push_str(&format!("Offence charged: {offence}\n"));
    }
    let people = parties::list(pool, &matter.id).await?;
    if !people.is_empty() {
        out.push_str("PARTIES:\n");
        for p in people {
            out.push_str(&format!("- {} ({})\n", p.name, p.role));
        }
    }
    let counted = clocks::for_matter(pool, &matter.id, &matter.matter_type).await?;
    if !counted.events.is_empty() {
        out.push_str("WHAT HAS HAPPENED (recorded steps):\n");
        for e in &counted.events {
            out.push_str(&format!("- {}: {}{}\n", day(e.on_day), words("event", &e.kind), e.note.as_deref().map(|n| format!(" ({n})")).unwrap_or_default()));
        }
    }
    if !counted.clocks.is_empty() {
        out.push_str("DEADLINES COUNTED BY THE APP (authoritative: rely on these, never recount):\n");
        for c in &counted.clocks {
            out.push_str(&format!(
                "- [{}] {}: {} {} ({}), started by \"{}\" on {}, status {}, {} days left{}\n",
                c.rule,
                words("clock", c.rule),
                if c.kind == "earliest" { "not before" } else { "due by" },
                day(c.due_on),
                c.cite,
                words("event", &c.started_by),
                day(c.started_on),
                c.status,
                c.days_left,
                if c.weekend { ", falls on a weekend: check whether it moves" } else { "" }
            ));
        }
    } else if !counted.researched {
        out.push_str("DEADLINES: this country's time limits have not been researched in the app. Do not state any.\n");
    }
    let listed = hearings::list_for_matter(pool, &matter.id).await?;
    if !listed.is_empty() {
        out.push_str("HEARINGS:\n");
        for h in listed {
            out.push_str(&format!(
                "- {}: {} [{}]{}{}\n",
                day(h.at),
                h.purpose,
                h.status,
                h.outcome.map(|o| format!(" outcome: {o}")).unwrap_or_default(),
                h.adjourn_reason.map(|r| format!(" adjourned: {r}")).unwrap_or_default()
            ));
        }
    }
    let written = notes::list_notes(pool, &matter.id).await?;
    if !written.is_empty() {
        out.push_str("NOTES:\n");
        for n in written {
            out.push_str(&format!("- {}: {}\n", day(n.at), documents::plain_text(&n.body).replace('\n', " ")));
        }
    }
    let held = papers::list(pool, &matter.id).await?;
    if !held.is_empty() {
        out.push_str("PAPERS HELD (scans and photos; summaries by Assist are unchecked):\n");
        for p in held {
            out.push_str(&format!(
                "- {}{} ({}){}{}\n",
                p.dated.map(|d| format!("{d}: ")).unwrap_or_default(),
                p.title,
                p.kind,
                p.from_whom.map(|f| format!(" from {f}")).unwrap_or_default(),
                p.summary.map(|s| format!(": {}", s.replace('\n', " "))).unwrap_or_default()
            ));
        }
    }
    let docs = documents::list(pool, "", &matter.id, 50).await?;
    if !docs.is_empty() {
        out.push_str("DOCUMENTS ON THE MATTER:\n");
        for d in docs {
            out.push_str(&format!("- {} ({}, {}){}\n", d.title, d.kind, d.status, d.reference.map(|r| format!(" {r}")).unwrap_or_default()));
        }
    }
    Ok(cut(&out, MAX_CONTEXT_CHARS))
}

/// The app's own English words for its keys (events, deadlines, kinds of
/// matter), from the translation catalogue: one source, never a bare key.
fn words(group: &str, key: &str) -> String {
    static EN: std::sync::OnceLock<Value> = std::sync::OnceLock::new();
    let en = EN.get_or_init(|| serde_json::from_str(include_str!("../../../messages/en.json")).unwrap_or(Value::Null));
    en[group][key].as_str().map(str::to_string).unwrap_or_else(|| key.replace('_', " "))
}

const RULES: &str = "You assist an advocate or a paralegal in a law practice with one matter.
- You never decide and never file: everything you write is a draft a named advocate checks.
- Use only the matter record and papers given. Never invent a fact, name, date, amount, case or court number: write ____ where something is not known.
- Deadlines: the app has counted them. Rely on the listed deadlines exactly, never recount days and never state a time limit that is not listed.
- Law: do not quote the words of any Act, rule or judgment. Name an Act and section only when the record names it; otherwise write \"(check the law)\".
- Be plain and short. No preamble.";

fn schema_points() -> Value {
    json!({
        "type": "object",
        "properties": { "points": { "type": "array", "items": { "type": "object",
            "properties": { "date": { "type": "string" }, "text": { "type": "string" }, "source": { "type": "string" } },
            "required": ["text"] } } },
        "required": ["points"]
    })
}

fn schema_text() -> Value {
    json!({ "type": "object", "properties": { "text": { "type": "string" } }, "required": ["text"] })
}

fn schema_draft() -> Value {
    json!({
        "type": "object",
        "properties": { "title": { "type": "string" }, "paragraphs": { "type": "array", "items": { "type": "string" } } },
        "required": ["title", "paragraphs"]
    })
}

async fn document_text(pool: &SqlitePool, matter_id: &str, input: &AskInput) -> Result<(String, String), DomainError> {
    if let Some(id) = &input.document_id {
        // A paper that has been read is chosen like a document: its transcript.
        if let Some(paper) = papers::get(pool, id).await? {
            if paper.matter_id != matter_id {
                return invalid("That paper is on another matter.");
            }
            let Some(text) = paper.transcript.filter(|t| !t.trim().is_empty()) else {
                return invalid("Assist has not read that paper yet. Read it first, under Papers.");
            };
            return Ok((paper.title, cut(&text, MAX_DOCUMENT_CHARS)));
        }
        let doc = documents::get(pool, id).await?.ok_or_else(|| DomainError::NotFound("No such document.".into()))?;
        if doc.matter_id != matter_id {
            return invalid("That document is on another matter.");
        }
        return Ok((doc.title, cut(&documents::plain_text(&doc.body), MAX_DOCUMENT_CHARS)));
    }
    match clean(input.text.clone()) {
        Some(t) => Ok(("the pasted text".into(), cut(&t, MAX_DOCUMENT_CHARS))),
        None => invalid("Choose a document or paste its text."),
    }
}

/// One request to Assist about one matter. Paralegals may ask; the accounts
/// role does not work on matters.
pub async fn ask(pool: &SqlitePool, matter_id: &str, input: AskInput, actor: &super::staff::Actor) -> Result<Answer, DomainError> {
    if actor.role == "accounts" {
        return Err(DomainError::Forbidden("Assist works on matters: ask an advocate or a paralegal.".into()));
    }
    if !TASKS.contains(&input.task.as_str()) {
        return invalid("Unknown Assist task.");
    }
    let matter = matters::get(pool, matter_id).await?.ok_or_else(|| DomainError::NotFound("No such matter.".into()))?;
    let e = engine(pool).await?;
    let country = installation::get(pool).await?.map(|i| i.jurisdiction).unwrap_or_default();
    let lang = language_name(input.language.as_deref());
    let context = matter_context(pool, &matter).await?;
    let system = format!("{RULES}\nThe practice is in {}.\nWrite every answer in {lang}.", if country == "ug" { "Uganda".to_string() } else { country.to_uppercase() });

    let task = input.task.clone();
    let result: Result<(Answer, String), DomainError> = async {
        if task == "chat" {
            if input.messages.is_empty() {
                return invalid("Ask something first.");
            }
            let mut conversation: Vec<(String, String)> = vec![("user".into(), format!("The matter record:\n{context}")), ("assistant".into(), "Understood.".into())];
            conversation.extend(input.messages.iter().rev().take(20).rev().map(|m| (if m.role == "assistant" { "assistant" } else { "user" }.to_string(), m.content.clone())));
            let (text, model) = ai::reply(&e, &system, &conversation).await.map_err(from_ai)?;
            return Ok((Answer { task: task.clone(), text: Some(text), points: vec![], draft: None, model: model.clone() }, model));
        }
        let (ask, schema): (String, Value) = match task.as_str() {
            "summary" => ("Summarise where this matter stands for an advocate taking it over: what it is about, what has happened, what is due next and by when, and what is missing from the record. Put it in the field `text`, in short paragraphs.".into(), schema_text()),
            "chronology" => ("List every dated event in the record, oldest first, one point each: `date` as written, `text` what happened, `source` where it is recorded (a step, a hearing, a note, a document).".into(), schema_points()),
            "summarise_document" => {
                let (title, text) = document_text(pool, matter_id, &input).await?;
                (format!("Summarise {title} for the advocate: who says what, what is asked for, and the dates and amounts in it. Put it in `text`.\n\nTHE DOCUMENT:\n{text}"), schema_text())
            }
            "unanswered" => {
                let (title, text) = document_text(pool, matter_id, &input).await?;
                (format!("This is {title}, from the other side or the court. List, one point each, every allegation, question or claim in it that our side has not yet answered or must respond to, with `source` the paragraph it is in and `text` what must be answered. Do not answer them.\n\nTHE DOCUMENT:\n{text}"), schema_points())
            }
            "draft" => {
                let kind = clean(input.draft_kind.clone()).unwrap_or_else(|| "a letter".into());
                let facts = clean(input.text.clone()).unwrap_or_default();
                (format!("Draft the body of {kind} for this matter, as numbered paragraphs in `paragraphs` (no heading, no court caption and no signature block: the app adds them), and a short `title`. Use ____ for anything not known.\n\nTHE FACTS GIVEN:\n{facts}"), schema_draft())
            }
            "explain_clock" => {
                let rule = clean(input.rule.clone()).ok_or_else(|| DomainError::Invalid("Choose a deadline.".into()))?;
                (format!("Explain the deadline marked [{rule}] in the list (\"{}\"): refer to it and its starting event by their names, never by the bracketed key, and do not change who must act: what must be done, what started it, what happens if it is missed, and what the advocate can do if it cannot be met. Do not recount or change the date. Put it in `text`.", words("clock", &rule)), schema_text())
            }
            _ => return invalid("Unknown Assist task."),
        };
        let (value, model) = ai::generate_json(&e, &system, &[Part::Text(format!("{ask}\n\nTHE MATTER RECORD:\n{context}"))], &schema).await.map_err(from_ai)?;
        let points: Vec<Point> = serde_json::from_value(value["points"].clone()).unwrap_or_default();
        let draft: Option<Draft> = serde_json::from_value(value.clone()).ok().filter(|_| task == "draft");
        let text = value["text"].as_str().map(str::to_string);
        Ok((Answer { task: task.clone(), text, points, draft, model: model.clone() }, model))
    }
    .await;
    match result {
        Ok((answer, model)) => {
            log(pool, matter_id, &task, &model, &actor.name, true, "").await;
            Ok(answer)
        }
        Err(err) => {
            log(pool, matter_id, &task, &e.provider, &actor.name, false, &err.to_string()).await;
            Err(err)
        }
    }
}

// ---------------------------------------------------------------- reading papers

/// What a single request may carry: under the providers' inline limits.
const MAX_INLINE_BYTES: usize = 18 * 1024 * 1024;
/// Papers read in one request.
pub const MAX_PAPERS: usize = 6;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    /// An event kind this matter can record (`clocks` can_record).
    pub event: String,
    /// YYYY-MM-DD as the paper shows it.
    pub on: String,
    pub note: Option<String>,
    /// The paper it was seen in.
    pub paper_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PapersRead {
    pub papers: Vec<papers::Paper>,
    /// Steps seen in the papers that would start or stop a deadline here.
    /// Proposed only: a person records each one.
    pub found: Vec<Found>,
    pub model: String,
}

fn schema_read() -> Value {
    json!({
        "type": "object",
        "properties": {
            "papers": { "type": "array", "items": { "type": "object", "properties": {
                "index": { "type": "integer" },
                "title": { "type": "string" },
                "kind": { "type": "string", "enum": papers::KINDS },
                "dated": { "type": "string" },
                "from": { "type": "string" },
                "summary": { "type": "string" },
                "transcript": { "type": "string" }
            }, "required": ["index", "title", "kind", "summary", "transcript"] } },
            "found": { "type": "array", "items": { "type": "object", "properties": {
                "index": { "type": "integer" },
                "event": { "type": "string" },
                "on": { "type": "string" },
                "note": { "type": "string" }
            }, "required": ["index", "event", "on"] } }
        },
        "required": ["papers", "found"]
    })
}

/// Assist reads papers: names, kinds, dates, who they are from, a summary and
/// the text, written onto each paper as unchecked; and the steps it saw that
/// this matter's deadlines turn on, proposed for a person to record.
pub async fn read_papers(pool: &SqlitePool, vault_root: &std::path::Path, matter_id: &str, paper_ids: &[String], language: Option<&str>, actor: &super::staff::Actor) -> Result<PapersRead, DomainError> {
    if actor.role == "accounts" {
        return Err(DomainError::Forbidden("Assist works on matters: ask an advocate or a paralegal.".into()));
    }
    if paper_ids.is_empty() {
        return invalid("Choose the papers to read.");
    }
    if paper_ids.len() > MAX_PAPERS {
        return invalid("Read at most six papers at a time.");
    }
    let matter = matters::get(pool, matter_id).await?.ok_or_else(|| DomainError::NotFound("No such matter.".into()))?;
    let e = engine(pool).await?;
    let mut parts = Vec::new();
    let mut total = 0usize;
    for (i, id) in paper_ids.iter().enumerate() {
        let (paper, bytes) = papers::open(pool, vault_root, id).await?;
        if paper.matter_id != matter_id {
            return invalid("That paper is on another matter.");
        }
        total += bytes.len();
        if total > MAX_INLINE_BYTES {
            return invalid("Those papers are too large to read together. Read fewer at a time.");
        }
        parts.push(Part::Text(format!("PAPER {i}: file \"{}\"", paper.file_name)));
        parts.push(Part::Doc { mime: paper.mime_type.clone(), name: paper.file_name.clone(), bytes });
    }
    let counted = clocks::for_matter(pool, matter_id, &matter.matter_type).await?;
    let events: Vec<String> = counted.can_record.iter().map(|k| format!("{k} = {}", words("event", k))).collect();
    let lang = language_name(language);
    let system = format!("{RULES}\nYou are reading papers brought into a matter: scans and photos of pages.\nWrite titles and summaries in {lang}; transcripts in the paper's own language.");
    let ask = format!(
        "For each PAPER i: `index` i; a short `title` (what it is and between whom, e.g. \"Summons to file a defence, HCCS 88/2026\"); `kind` one of {kinds}; `dated` the date the paper bears as YYYY-MM-DD, or empty; `from` who wrote or issued it; a `summary` of two or three sentences with the dates and sums in it; `transcript` the full text as written, pages in order, [illegible] where it cannot be read.\n\
         Then `found`: steps the papers show happened, only from this list of event keys (key = meaning): {events}. For each: `index` of the paper, `event` the key, `on` YYYY-MM-DD, `note` a few words. Only what a paper states; never guess a date.\n\nTHE MATTER:\n{context}",
        kinds = papers::KINDS.join(", "),
        events = if events.is_empty() { "(none: leave `found` empty)".to_string() } else { events.join("; ") },
        context = matter_context(pool, &matter).await?,
    );
    parts.insert(0, Part::Text(ask));

    let result = ai::generate_json(&e, &system, &parts, &schema_read()).await.map_err(from_ai);
    let (value, model) = match result {
        Ok(v) => v,
        Err(err) => {
            log(pool, matter_id, "read_papers", &e.provider, &actor.name, false, &err.to_string()).await;
            return Err(err);
        }
    };
    for item in value["papers"].as_array().cloned().unwrap_or_default() {
        let Some(id) = item["index"].as_u64().and_then(|i| paper_ids.get(i as usize)) else { continue };
        let text = |k: &str| item[k].as_str().map(str::to_string);
        papers::record_reading(
            pool,
            id,
            papers::Reading { title: text("title").unwrap_or_default(), kind: text("kind").unwrap_or_default(), dated: text("dated"), from_whom: text("from"), summary: text("summary"), transcript: text("transcript") },
        )
        .await?;
    }
    let found = value["found"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|f| {
            let event = f["event"].as_str()?.to_string();
            let on = papers::check_day(f["on"].as_str().map(str::to_string)).ok().flatten()?;
            let paper_id = paper_ids.get(f["index"].as_u64()? as usize)?.clone();
            counted.can_record.contains(&event.as_str()).then_some(Found { event, on, note: f["note"].as_str().map(str::to_string).filter(|n| !n.is_empty()), paper_id })
        })
        .collect();
    log(pool, matter_id, "read_papers", &model, &actor.name, true, &format!("{} paper(s)", paper_ids.len())).await;
    let mut read = Vec::new();
    for id in paper_ids {
        if let Some(p) = papers::get(pool, id).await? {
            read.push(p);
        }
    }
    Ok(PapersRead { papers: read, found, model })
}
