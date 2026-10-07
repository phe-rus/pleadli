//! AI Assist: reads a file and helps a prosecutor with it. It summarises,
//! points out what is missing or contradicts, lays out the decision options
//! with reasons, proposes next steps, and sorts an imported scan into the
//! file's index. It never decides: every output is a labelled draft a person
//! accepts or ignores, and every request is logged (who, which file, what for).
//!
//! It runs only when the office has turned it on (`assist_settings.mode`) and
//! an administrator has acknowledged where the data goes. The provider key is
//! kept in this encrypted database and never sent to the screen. A development
//! build may take a key from the environment instead (see `load_dev_env`).
//! Which provider and model answer is `ai.rs`'s business.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use std::path::Path;
use uuid::Uuid;

use super::ai::{self, Engine, Part, PROVIDERS};
use super::error::{invalid, DomainError};
use super::file_items::{self, FileItemInput, KINDS};

/// What one request may carry in documents; kept under the providers'
/// inline limits so the JSON around it fits.
const MAX_INLINE_BYTES: usize = 18 * 1024 * 1024;

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
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
    pub laws_token_set: bool,
    pub acknowledged_by: Option<String>,
    pub acknowledged_at: Option<i64>,
    /// Ready to use: on, acknowledged, and a key is there.
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
    /// The Laws.Africa token; same rules as the key.
    pub laws_token: Option<String>,
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
    laws_token: Option<String>,
}

async fn row(pool: &SqlitePool) -> Result<Row, sqlx::Error> {
    let found: Option<Row> = sqlx::query_as(
        "SELECT mode, provider, model, api_key, acknowledged_by, acknowledged_at, base_url, auto_model, laws_token FROM assist_settings WHERE id = 'this'",
    )
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
        laws_token: None,
    }))
}

/// A development key for the chosen provider, from `.env.local`.
fn env_key(provider: &str) -> Option<String> {
    if !cfg!(debug_assertions) {
        return None;
    }
    let var = match provider {
        "gemini" => "GEMINI_API_KEY",
        "openrouter" => "OPENROUTER_API_KEY",
        "anthropic" => "ANTHROPIC_API_KEY",
        _ => "OPENAI_COMPATIBLE_API_KEY",
    };
    std::env::var(var).ok().filter(|k| !k.trim().is_empty())
}

fn hint(key: &str) -> String {
    let tail: String = key.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    format!("…{tail}")
}

pub async fn settings(pool: &SqlitePool) -> Result<AssistSettings, sqlx::Error> {
    let r = row(pool).await?;
    let (key_source, key_hint) = match (&r.api_key, env_key(&r.provider)) {
        (Some(k), _) => (Some("settings".to_string()), Some(hint(k))),
        (None, Some(k)) => (Some("environment".to_string()), Some(hint(&k))),
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
        laws_token_set: r.laws_token.is_some() || std::env::var("LAWS_AFRICA_TOKEN").is_ok_and(|t| !t.is_empty() && cfg!(debug_assertions)),
        acknowledged_by: r.acknowledged_by,
        acknowledged_at: r.acknowledged_at,
        ready,
    })
}

pub async fn save_settings(pool: &SqlitePool, input: AssistSettingsInput, actor: &str) -> Result<AssistSettings, DomainError> {
    if !["off", "institution_key"].contains(&input.mode.as_str()) {
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
    let laws_token = match input.laws_token {
        Some(t) if t.trim().is_empty() => None,
        Some(t) => Some(t.trim().to_string()),
        None => r.laws_token.clone(),
    };
    let auto_model = input.auto_model.unwrap_or(r.auto_model);
    let (by, at) = if input.acknowledge { (Some(actor.to_string()), Some(now())) } else if input.mode == "off" { (None, None) } else { (r.acknowledged_by, r.acknowledged_at) };
    sqlx::query(
        "INSERT INTO assist_settings (id, mode, provider, model, api_key, acknowledged_by, acknowledged_at, base_url, auto_model, laws_token, updated_at)
         VALUES ('this', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET mode = excluded.mode, provider = excluded.provider, model = excluded.model, api_key = excluded.api_key,
           acknowledged_by = excluded.acknowledged_by, acknowledged_at = excluded.acknowledged_at, base_url = excluded.base_url,
           auto_model = excluded.auto_model, laws_token = excluded.laws_token, updated_at = excluded.updated_at",
    )
    .bind(&input.mode)
    .bind(&provider)
    .bind(&model)
    .bind(&key)
    .bind(&by)
    .bind(at)
    .bind(&base_url)
    .bind(auto_model)
    .bind(&laws_token)
    .bind(now())
    .execute(pool)
    .await?;
    let _ = super::audit::log(
        pool,
        super::audit::Entry::new("assist_settings_changed").detail(format!("mode {}, provider {provider}, model {}", input.mode, if auto_model { "automatic" } else { &model })),
    )
    .await;
    Ok(settings(pool).await?)
}

/// The Laws.Africa token, if one is set.
pub async fn laws_token(pool: &SqlitePool) -> Result<Option<String>, sqlx::Error> {
    let r = row(pool).await?;
    Ok(r.laws_token.or_else(|| if cfg!(debug_assertions) { std::env::var("LAWS_AFRICA_TOKEN").ok().filter(|t| !t.is_empty()) } else { None }))
}

/// Development builds read `src-tauri/.env.local` (git-ignored) so a
/// developer's key is found without being typed into the app.
pub fn load_dev_env() {
    if !cfg!(debug_assertions) {
        return;
    }
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/.env.local");
    let Ok(text) = std::fs::read_to_string(path) else { return };
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            if std::env::var(k.trim()).is_err() {
                std::env::set_var(k.trim(), v.trim());
            }
        }
    }
}

// ---------------------------------------------------------------- the engine

/// The provider, key and model settings, or why Assist cannot run.
/// The provider and key with the model a person chose for one request, if any.
pub async fn engine_for(pool: &SqlitePool, chosen: Option<&str>) -> Result<Engine, DomainError> {
    let mut e = engine(pool).await?;
    if let Some(model) = chosen.map(str::trim).filter(|m| !m.is_empty()) {
        e.fixed_model = Some(model.to_string());
    }
    Ok(e)
}

pub async fn engine(pool: &SqlitePool) -> Result<Engine, DomainError> {
    let r = row(pool).await?;
    if r.mode == "off" {
        return Err(DomainError::Forbidden("Assist is off. An administrator can turn it on in Settings.".into()));
    }
    if r.acknowledged_at.is_none() {
        return Err(DomainError::Forbidden("An administrator must first confirm where Assist sends the file.".into()));
    }
    let key = r.api_key.clone().or_else(|| env_key(&r.provider));
    let key = match (key, r.provider.as_str(), &r.base_url) {
        (Some(k), _, _) => k,
        (None, "openai_compatible", Some(_)) => String::new(),
        _ => return Err(DomainError::Forbidden("Assist has no provider key yet.".into())),
    };
    let fixed = if r.auto_model || r.model.is_empty() { None } else { Some(r.model.clone()) };
    Ok(Engine { provider: r.provider, key, base_url: r.base_url, fixed_model: fixed })
}

/// The provider's own model list, marked with what automatic choice would use.
pub async fn models(pool: &SqlitePool) -> Result<Vec<ai::ModelInfo>, DomainError> {
    let r = row(pool).await?;
    let key = r.api_key.clone().or_else(|| env_key(&r.provider)).unwrap_or_default();
    if key.is_empty() && r.provider != "openai_compatible" && r.provider != "openrouter" {
        return invalid("Add the provider key first.");
    }
    ai::list_models(&Engine { provider: r.provider, key, base_url: r.base_url, fixed_model: None }).await
}

pub(crate) async fn log(pool: &SqlitePool, file_id: Option<&str>, purpose: &str, model: &str, actor: Option<&str>, ok: bool, detail: &str) {
    let _ = sqlx::query("INSERT INTO assist_log (id, prosecution_file_id, purpose, model, requested_by, ok, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(file_id)
        .bind(purpose)
        .bind(model)
        .bind(actor)
        .bind(ok)
        .bind(detail)
        .bind(now())
        .execute(pool)
        .await;
}

/// What the screen tells Assist about the country: taken from the country
/// pack on the frontend so there is one source for it.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CountryContext {
    /// The country pack's code ("ug", "cd"): which stored law applies.
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub country: String,
    /// The prosecution service's own name there, and its head's title.
    #[serde(default)]
    pub institution: String,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub laws: Vec<String>,
    /// "kind: label" for each decision this country has.
    #[serde(default)]
    pub decisions: Vec<String>,
    /// "code. title" for each section of the country's file order.
    #[serde(default)]
    pub file_sections: Vec<String>,
    /// "label: hours (basis)" for each legal time limit.
    #[serde(default)]
    pub time_limits: Vec<String>,
    /// Courts, lowest first.
    #[serde(default)]
    pub courts: Vec<String>,
    /// The legal clocks the app computed for the file on screen.
    #[serde(default)]
    pub clocks: Vec<String>,
}

pub(crate) fn country_lines(c: &CountryContext) -> String {
    let extra = format!(
        "\nThe file order here: {}.\nTime limits: {}.\nCourts, lowest first: {}.",
        c.file_sections.join("; "),
        c.time_limits.join("; "),
        c.courts.join(", ")
    );
    let clocks = if c.clocks.is_empty() {
        String::new()
    } else {
        format!("\nLEGAL CLOCKS COMPUTED BY THE APP FROM THE CUSTODY RECORD (authoritative: rely on these, do not recount; raise any that is overdue first):\n- {}", c.clocks.join("\n- "))
    };
    let service = if c.institution.is_empty() { String::new() } else { format!("\nThe prosecution service here is the {}. Always call it and its head by these names, never by another country's.", c.institution) };
    extra + &clocks + &service + &format!(
        "\nCountry: {}. Answer in this language: {}.\nThe office works under: {}.\nThe decisions a prosecutor here can take (kind: name): {}.",
        c.country,
        if c.language.is_empty() { "English" } else { &c.language },
        if c.laws.is_empty() { "(not listed)".to_string() } else { c.laws.join("; ") },
        c.decisions.join("; "),
    )
}

pub(crate) const RULES: &str = "You assist a public prosecutor. You never decide: you lay out what the file shows so the prosecutor can decide. \
Work only from the file given. Never invent facts, names, dates, section numbers or cases. When the law matters, name the statute \
from the list you were given and say plainly that the section must be checked against the text; never quote law from memory. \
Say what is missing rather than guessing. Be short, plain and specific. No em-dashes.";

// ---------------------------------------------------------------- the brief

/// Plain text out of a statement body that may be a rich-text JSON document.
fn plain(text: &str) -> String {
    if !text.trim_start().starts_with('{') {
        return text.to_string();
    }
    fn walk(v: &Value, out: &mut String) {
        match v {
            Value::Object(m) => {
                if let Some(Value::String(t)) = m.get("text") {
                    out.push_str(t);
                }
                if let Some(c) = m.get("content") {
                    walk(c, out);
                }
                if m.get("type").and_then(Value::as_str).is_some_and(|t| t == "paragraph" || t == "heading") {
                    out.push('\n');
                }
            }
            Value::Array(a) => a.iter().for_each(|x| walk(x, out)),
            _ => {}
        }
    }
    match serde_json::from_str::<Value>(text) {
        Ok(v) => {
            let mut out = String::new();
            walk(&v, &mut out);
            out
        }
        Err(_) => text.to_string(),
    }
}

/// Everything in the file as plain text, in a fixed order.
pub(crate) async fn file_text(pool: &SqlitePool, file_id: &str) -> Result<String, DomainError> {
    let f: (String, Option<String>, Option<String>, Option<String>, Option<String>, i64, String, Option<String>) = sqlx::query_as(
        "SELECT title, odpp_registration_number, police_reference, police_station, court_case_number, received_at, current_status, notes FROM prosecution_files WHERE id = ?",
    )
    .bind(file_id)
    .fetch_one(pool)
    .await?;
    let mut out = format!(
        "FILE: {}\nProsecution reference: {}\nPolice reference: {}\nPolice station: {}\nCourt reference: {}\nReceived: {}\nStatus: {}\nNotes: {}\n",
        f.0,
        f.1.unwrap_or_default(),
        f.2.unwrap_or_default(),
        f.3.unwrap_or_default(),
        f.4.unwrap_or_default(),
        chrono::DateTime::from_timestamp_millis(f.5).map(|d| d.format("%Y-%m-%d").to_string()).unwrap_or_default(),
        f.6,
        f.7.unwrap_or_default()
    );

    let people: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT p.first_name || ' ' || p.last_name, fp.role, COALESCE(p.other_names, '') FROM prosecution_file_people fp JOIN people p ON p.id = fp.person_id WHERE fp.prosecution_file_id = ?",
    )
    .bind(file_id)
    .fetch_all(pool)
    .await?;
    out.push_str("\nPEOPLE\n");
    for (name, role, _) in people {
        out.push_str(&format!("- {name} ({role})\n"));
    }

    let statements: Vec<(String, String, Option<String>, i64)> = sqlx::query_as(
        "SELECT p.first_name || ' ' || p.last_name, s.statement_role, s.content, s.given_at FROM statements s JOIN people p ON p.id = s.person_id WHERE s.prosecution_file_id = ? ORDER BY s.given_at",
    )
    .bind(file_id)
    .fetch_all(pool)
    .await?;
    out.push_str("\nSTATEMENTS\n");
    for (who, role, content, at) in statements {
        let date = chrono::DateTime::from_timestamp_millis(at).map(|d| d.format("%Y-%m-%d").to_string()).unwrap_or_default();
        out.push_str(&format!("--- {who}, {role}, {date}\n{}\n", plain(&content.unwrap_or_default())));
    }

    let evidence: Vec<(String, Option<String>, Option<String>, Option<String>)> =
        sqlx::query_as("SELECT category, description, identification_mark, recovered_from_location FROM evidence_items WHERE prosecution_file_id = ?")
            .bind(file_id)
            .fetch_all(pool)
            .await?;
    out.push_str("\nEVIDENCE\n");
    for (cat, desc, mark, place) in evidence {
        out.push_str(&format!("- {cat}: {} (mark {}, from {})\n", desc.unwrap_or_default(), mark.unwrap_or_default(), place.unwrap_or_default()));
    }

    let charges: Vec<(String, Option<String>, Option<String>)> = sqlx::query_as("SELECT offence, statutory_section, particulars FROM charges WHERE prosecution_file_id = ?")
        .bind(file_id)
        .fetch_all(pool)
        .await?;
    out.push_str("\nPROPOSED CHARGES\n");
    for (offence, section, particulars) in charges {
        out.push_str(&format!("- {offence} {} : {}\n", section.unwrap_or_default(), particulars.unwrap_or_default()));
    }

    let items = file_items::list(pool, file_id).await?;
    out.push_str("\nDOCUMENTS IN THE FILE\n");
    for i in items {
        out.push_str(&format!("--- [{}] {}\n{}\n{}\n", i.kind, i.title, i.summary.unwrap_or_default(), i.body.map(|b| plain(&b)).unwrap_or_default()));
    }

    let decisions: Vec<(String, Option<String>)> = sqlx::query_as("SELECT decision_type, reasons FROM decisions WHERE prosecution_file_id = ? ORDER BY decided_at")
        .bind(file_id)
        .fetch_all(pool)
        .await?;
    out.push_str("\nDECISIONS SO FAR\n");
    for (t, r) in decisions {
        out.push_str(&format!("- {t}: {}\n", r.unwrap_or_default()));
    }
    Ok(out)
}

fn brief_schema() -> Value {
    let s = |d: &str| json!({ "type": "string", "description": d });
    json!({
        "type": "object",
        "properties": {
            "summary": s("The facts in 3 to 6 plain sentences."),
            "people": { "type": "array", "items": { "type": "object", "properties": {
                "name": s("As written in the file."), "role": s("accused, complainant, witness, officer..."), "says": s("What their evidence shows, one or two sentences.") },
                "required": ["name", "role", "says"] } },
            "contradictions": { "type": "array", "items": s("A point where the file disagrees with itself, naming both sources.") },
            "missing": { "type": "array", "items": s("Evidence or a document the file needs and does not have.") },
            "offences": { "type": "array", "items": { "type": "object", "properties": {
                "offence": s("Offence name."), "statute": s("Which statute from the list, or empty."), "why": s("Which facts point to it.") },
                "required": ["offence", "statute", "why"] } },
            "options": { "type": "array", "items": { "type": "object", "properties": {
                "kind": s("One of the decision kinds given."), "for": s("Reasons for, from the file."), "against": s("Reasons against, from the file."), "recommended": { "type": "boolean" } },
                "required": ["kind", "for", "against", "recommended"] } },
            "nextSteps": { "type": "array", "items": { "type": "object", "properties": {
                "title": s("A task, starting with a verb."), "why": s("Why, in one sentence."), "who": { "type": "string", "enum": ["prosecutor", "police", "court"] } },
                "required": ["title", "why", "who"] } }
        },
        "required": ["summary", "people", "contradictions", "missing", "offences", "options", "nextSteps"]
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Brief {
    pub id: String,
    pub model: String,
    pub created_at: i64,
    pub requested_by: Option<String>,
    pub brief: Value,
}

pub async fn brief(pool: &SqlitePool, file_id: &str, context: &CountryContext, model: Option<&str>, actor: Option<&str>) -> Result<Brief, DomainError> {
    let e = engine_for(pool, model).await?;
    let text = file_text(pool, file_id).await?;
    let system = format!("{RULES}\n{}", country_lines(context));
    let result = ai::generate_json(&e, &system, &[Part::Text(format!("Prepare a brief on this file.\n\n{text}"))], &brief_schema()).await;
    match result {
        Ok((value, model)) => {
            let id = Uuid::new_v4().to_string();
            let at = now();
            sqlx::query("INSERT INTO assist_log (id, prosecution_file_id, purpose, model, requested_by, ok, detail, created_at) VALUES (?, ?, 'brief', ?, ?, 1, ?, ?)")
                .bind(&id)
                .bind(file_id)
                .bind(&model)
                .bind(actor)
                .bind(value.to_string())
                .bind(at)
                .execute(pool)
                .await?;
            Ok(Brief { id, model, created_at: at, requested_by: actor.map(str::to_string), brief: value })
        }
        Err(err) => {
            log(pool, Some(file_id), "brief", &e.provider, actor, false, &err.to_string()).await;
            Err(err)
        }
    }
}

/// The last brief written for a file, if any.
pub async fn latest_brief(pool: &SqlitePool, file_id: &str) -> Result<Option<Brief>, DomainError> {
    let found: Option<(String, String, i64, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT id, model, created_at, requested_by, detail FROM assist_log WHERE prosecution_file_id = ? AND purpose = 'brief' AND ok = 1 ORDER BY created_at DESC LIMIT 1",
    )
    .bind(file_id)
    .fetch_optional(pool)
    .await?;
    Ok(found.map(|(id, model, created_at, requested_by, detail)| Brief {
        id,
        model,
        created_at,
        requested_by,
        brief: detail.and_then(|d| serde_json::from_str(&d).ok()).unwrap_or(Value::Null),
    }))
}

// ---------------------------------------------------------------- importing paper

fn arrange_schema() -> Value {
    let s = |d: &str| json!({ "type": "string", "description": d });
    json!({
        "type": "object",
        "properties": {
            "fileTitle": s("A title for the whole case in the way this country writes it (Uganda: 'Uganda v. Surname: offence'; DR Congo: 'MP c/ NOM: infraction'), from the papers."),
            "policeReference": s("The police case number if one is written, else empty."),
            "people": { "type": "array", "description": "Every person the case is about, once each (not police officers or doctors).", "items": { "type": "object", "properties": {
                "firstName": s("Given name as written."), "lastName": s("Surname as written."),
                "role": { "type": "string", "enum": ["accused", "complainant", "witness"] } },
                "required": ["firstName", "lastName", "role"] } },
            "custody": { "type": "array", "description": "Every dated custody fact in the papers: arrest, being brought before a court or magistrate, each warrant or order of detention (provisional arrest warrant, detention order, extension, remand), bail, release. Empty if none.", "items": { "type": "object", "properties": {
                "kind": { "type": "string", "enum": super::custody::KINDS },
                "at": s("Date and time as written, YYYY-MM-DDTHH:MM (use 00:00 if no time is written)."),
                "person": s("Who it concerns, as written.") },
                "required": ["kind", "at", "person"] } },
            "charges": { "type": "array", "description": "Charges proposed in the papers (a draft charge sheet or the investigator's recommendation), as written. Empty if none.", "items": { "type": "object", "properties": {
                "offence": s("Statement of offence, as written."), "section": s("Sections as written, e.g. 'ss. 285 and 286(2) Penal Code Act', or empty."),
                "particulars": s("Particulars of offence, as written."), "accused": s("Surname of the accused it is against.") },
                "required": ["offence", "section", "particulars", "accused"] } },
            "items": { "type": "array", "items": { "type": "object", "properties": {
                "source": { "type": "integer", "description": "Which uploaded document (1 = first) this sits in." },
                "pageFrom": { "type": "integer" },
                "pageTo": { "type": "integer" },
                "kind": { "type": "string", "enum": KINDS },
                "title": s("What the document is, e.g. 'Statement of Grace Namutebi (complainant)'."),
                "date": s("The date written on it, YYYY-MM-DD, or empty."),
                "people": s("Names that appear, comma separated."),
                "summary": s("Two sentences on what it says."),
                "text": s("The full text of the pages, transcribed as written, handwriting included. Mark words you cannot read as [illegible].")
            }, "required": ["source", "pageFrom", "pageTo", "kind", "title", "date", "people", "summary", "text"] } }
        },
        "required": ["fileTitle", "policeReference", "people", "custody", "charges", "items"]
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Arranged {
    pub file_title: String,
    pub police_reference: String,
    /// Proposals only: the screen offers them, a person adds them.
    pub people: Value,
    pub custody: Value,
    pub charges: Value,
    pub items: Vec<file_items::FileItem>,
}

/// Reads scans already stored on the file (PDFs or photos, in the order
/// given), splits them into documents, and adds each one to the file's index
/// as an unconfirmed Assist row pointing at its pages.
pub async fn arrange(
    pool: &SqlitePool,
    vault_root: &Path,
    file_id: &str,
    attachment_ids: &[String],
    context: &CountryContext,
    model: Option<&str>,
    actor: Option<&str>,
) -> Result<Arranged, DomainError> {
    if attachment_ids.is_empty() {
        return invalid("Choose the scans to read.");
    }
    let e = engine_for(pool, model).await?;
    let mut parts = vec![Part::Text(format!(
        "These are {} scanned or photographed documents from one criminal case file. Split them into the separate documents they contain \
         (each statement, report, form, letter or exhibit list is one document), in the order they appear. For each, give where it sits \
         (which upload, first and last page; a photo is one page), what kind it is, its title, date, the people named, a short summary, \
         and the full transcribed text.", attachment_ids.len()))];
    let mut total = 0usize;
    for (i, id) in attachment_ids.iter().enumerate() {
        let (att, bytes) = super::attachments::read_attachment(pool, vault_root, id)
            .await
            .map_err(|e| DomainError::Invalid(e.to_string()))?
            .ok_or_else(|| DomainError::NotFound("A scan was not found.".into()))?;
        if att.entity_type != "prosecution_file" || att.entity_id != file_id {
            return invalid("That scan belongs to another record.");
        }
        let mime = att.mime_type.as_str();
        if !(mime == "application/pdf" || mime.starts_with("image/")) {
            return invalid("Only PDFs and photos can be read.");
        }
        total += bytes.len();
        if total > MAX_INLINE_BYTES {
            return invalid("These scans are too large to read in one go. Import fewer at a time.");
        }
        parts.push(Part::Text(format!("Upload {}: {}", i + 1, att.file_name)));
        parts.push(Part::Doc { mime: mime.to_string(), name: att.file_name.clone(), bytes });
    }
    let system = format!("{RULES}\nYou are sorting paper into a case file.\n{}", country_lines(context));
    // Reading scans is the heaviest thing Assist does. If the office's provider
    // cannot finish it (free models are rate-limited), a Gemini key, when
    // there is one, reads them instead.
    let mut result = ai::generate_json(&e, &system, &parts, &arrange_schema()).await;
    if result.is_err() && e.provider != "gemini" {
        if let Some(key) = env_key("gemini") {
            let gemini = Engine { provider: "gemini".into(), key, base_url: None, fixed_model: None };
            result = ai::generate_json(&gemini, &system, &parts, &arrange_schema()).await;
        }
    }
    let (value, model) = match result {
        Ok(v) => v,
        Err(err) => {
            log(pool, Some(file_id), "arrange", &e.provider, actor, false, &err.to_string()).await;
            return Err(err);
        }
    };

    let mut created = Vec::new();
    for item in value["items"].as_array().cloned().unwrap_or_default() {
        let source = item["source"].as_u64().unwrap_or(1).max(1) as usize;
        let Some(attachment_id) = attachment_ids.get(source - 1) else { continue };
        let kind = item["kind"].as_str().filter(|k| KINDS.contains(k)).unwrap_or("other").to_string();
        let title = item["title"].as_str().unwrap_or("").trim().to_string();
        let date = item["date"]
            .as_str()
            .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
            .and_then(|d| d.and_hms_opt(12, 0, 0))
            .map(|d| d.and_utc().timestamp_millis());
        let from = item["pageFrom"].as_i64().filter(|p| *p >= 1);
        let to = item["pageTo"].as_i64().filter(|p| from.is_some_and(|f| *p >= f)).or(from);
        let input = FileItemInput {
            prosecution_file_id: file_id.to_string(),
            kind,
            title: if title.is_empty() { "Document".into() } else { title },
            document_date: date,
            attachment_id: Some(attachment_id.clone()),
            page_from: from,
            page_to: to,
            summary: item["summary"].as_str().map(str::to_string),
            body: item["text"].as_str().map(str::to_string),
            people: item["people"].as_str().map(str::to_string),
        };
        created.push(file_items::create(pool, input, "assist", actor).await?);
    }
    log(pool, Some(file_id), "arrange", &model, actor, true, &format!("{} scans, {} documents", attachment_ids.len(), created.len())).await;
    Ok(Arranged {
        file_title: value["fileTitle"].as_str().unwrap_or("").to_string(),
        police_reference: value["policeReference"].as_str().unwrap_or("").to_string(),
        people: value["people"].clone(),
        custody: value["custody"].clone(),
        charges: value["charges"].clone(),
        items: created,
    })
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: String,
    pub prosecution_file_id: Option<String>,
    pub purpose: String,
    pub model: String,
    pub requested_by: Option<String>,
    pub ok: bool,
    pub created_at: i64,
}

pub async fn recent_log(pool: &SqlitePool, limit: i64) -> Result<Vec<LogEntry>, sqlx::Error> {
    sqlx::query_as("SELECT id, prosecution_file_id, purpose, model, requested_by, ok, created_at FROM assist_log ORDER BY created_at DESC LIMIT ?")
        .bind(limit)
        .fetch_all(pool)
        .await
}
