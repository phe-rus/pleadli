//! The one door to an AI provider, shared by every Pleadli app (feature `ai`). The rest of the app asks for "an answer in
//! this JSON shape" or "a reply to this conversation" and never knows which
//! provider or model answered; this module holds the differences.
//!
//! Providers: Gemini, OpenRouter, Anthropic (Claude), and any server that
//! speaks the OpenAI chat API (Ollama, a government endpoint). The model is
//! chosen automatically from the provider's own list of models unless an
//! administrator fixed one; a busy, rate-limited or retired model falls
//! through to the next candidate.

use base64::Engine as _;
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Why Assist could not answer, in words that can be shown to the person.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AiError(pub String);

impl std::fmt::Display for AiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for AiError {}

pub const PROVIDERS: &[&str] = &["gemini", "openrouter", "anthropic", "openai_compatible"];

const GEMINI: &str = "https://generativelanguage.googleapis.com/v1beta";
const OPENROUTER: &str = "https://openrouter.ai/api/v1";
const ANTHROPIC: &str = "https://api.anthropic.com/v1";

/// What a provider needs to be called.
#[derive(Debug, Clone)]
pub struct Engine {
    pub provider: String,
    pub key: String,
    pub base_url: Option<String>,
    /// A model fixed by an administrator, or None for automatic.
    pub fixed_model: Option<String>,
}

/// One piece of what is sent: text, or a document (PDF or image) as bytes.
pub enum Part {
    Text(String),
    Doc { mime: String, name: String, bytes: Vec<u8> },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub label: String,
    /// Whether automatic choice would use it, and in which order.
    pub rank: Option<usize>,
    /// Costs nothing on this provider (OpenRouter's `:free` models).
    pub free: bool,
    /// Can be held to a JSON Schema by the provider itself.
    #[serde(skip)]
    pub structured: bool,
    /// Reads images (photos of pages).
    #[serde(skip)]
    pub vision: bool,
    #[serde(skip)]
    pub context: u64,
}

impl ModelInfo {
    fn plain(id: String, label: String) -> Self {
        ModelInfo { id, label, rank: None, free: false, structured: true, vision: true, context: 0 }
    }
}

fn client() -> Result<reqwest::Client, AiError> {
    reqwest::Client::builder().timeout(Duration::from_secs(150)).build().map_err(|e| AiError(e.to_string()))
}

fn base(e: &Engine) -> String {
    match e.provider.as_str() {
        "openrouter" => OPENROUTER.to_string(),
        _ => e.base_url.clone().unwrap_or_default().trim_end_matches('/').to_string(),
    }
}

/// The status and JSON of an answer. An answer cut off or garbled on the way
/// counts as a busy model (599), so the next one is tried.
async fn read(res: reqwest::Response) -> Result<(u16, Value), AiError> {
    let status = res.status().as_u16();
    let text = match res.text().await {
        Ok(t) => t,
        Err(_) => return Ok((599, Value::Null)),
    };
    match serde_json::from_str::<Value>(text.trim()) {
        Ok(value) => Ok((status, value)),
        Err(_) => Ok((599, Value::Null)),
    }
}

fn provider_message(v: &Value) -> String {
    v["error"]["message"].as_str().or(v["error"].as_str()).or(v["message"].as_str()).unwrap_or("unknown error").to_string()
}

// ---------------------------------------------------------------- models

/// The provider's own list of models it will serve for this key.
pub async fn list_models(e: &Engine) -> Result<Vec<ModelInfo>, AiError> {
    let c = client()?;
    let (status, v) = match e.provider.as_str() {
        "gemini" => read(c.get(format!("{GEMINI}/models?pageSize=500")).header("x-goog-api-key", &e.key).send().await.map_err(net)?).await?,
        "anthropic" => read(c.get(format!("{ANTHROPIC}/models?limit=100")).header("x-api-key", &e.key).header("anthropic-version", "2023-06-01").send().await.map_err(net)?).await?,
        _ => read(c.get(format!("{}/models", base(e))).bearer_auth(&e.key).send().await.map_err(net)?).await?,
    };
    if status >= 400 {
        return Err(AiError(format!("The provider refused to list its models ({status}): {}", provider_message(&v))));
    }
    let mut models: Vec<ModelInfo> = match e.provider.as_str() {
        "gemini" => v["models"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|m| m["supportedGenerationMethods"].as_array().is_some_and(|a| a.iter().any(|x| x == "generateContent")))
            .map(|m| {
                let id = m["name"].as_str().unwrap_or("").trim_start_matches("models/").to_string();
                ModelInfo::plain(id.clone(), m["displayName"].as_str().unwrap_or(&id).to_string())
            })
            .collect(),
        "anthropic" => v["data"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|m| {
                let id = m["id"].as_str().unwrap_or("").to_string();
                ModelInfo::plain(id.clone(), m["display_name"].as_str().unwrap_or(&id).to_string())
            })
            .collect(),
        _ => v["data"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|m| {
                let id = m["id"].as_str().unwrap_or("").to_string();
                let params = m["supported_parameters"].as_array().cloned().unwrap_or_default();
                let known = !params.is_empty();
                ModelInfo {
                    label: m["name"].as_str().unwrap_or(&id).to_string(),
                    free: id.ends_with(":free"),
                    // An unlisted server (Ollama) is trusted to follow the schema; OpenRouter says per model.
                    structured: !known || params.iter().any(|p| p == "structured_outputs"),
                    vision: m["architecture"]["input_modalities"].as_array().is_none_or(|a| a.iter().any(|x| x == "image")),
                    context: m["context_length"].as_u64().unwrap_or(0),
                    rank: None,
                    id,
                }
            })
            .collect(),
    };
    if e.provider == "openrouter" && !models.iter().any(|m| m.id == "openrouter/auto") {
        models.insert(0, ModelInfo::plain("openrouter/auto".into(), "Auto (OpenRouter picks)".into()));
    }
    let free_only = e.provider == "openrouter" && free_tier(e).await;
    let order = auto_order(&e.provider, &models, free_only);
    for (rank, id) in order.iter().enumerate() {
        if let Some(m) = models.iter_mut().find(|m| &m.id == id) {
            m.rank = Some(rank + 1);
        }
    }
    Ok(models)
}

fn net(e: reqwest::Error) -> AiError {
    if e.is_timeout() {
        return AiError("TIMEOUT".into());
    }
    AiError(format!("The provider could not be reached: {e}"))
}

/// A version number read out of a model id ("gemini-3.8-flash" -> 3.8), for
/// putting newer general models first.
fn version(id: &str) -> f64 {
    id.split(|c: char| c == '-' || c == '/')
        .filter_map(|p| p.parse::<f64>().ok())
        .next()
        .unwrap_or(0.0)
}

/// The models automatic choice tries, best first: a provider's current
/// general-purpose model, never speech, image, embedding or live variants.
fn auto_order(provider: &str, models: &[ModelInfo], free_only: bool) -> Vec<String> {
    const SKIP: &[&str] = &["tts", "image", "live", "embedding", "robotics", "computer-use", "transcribe", "audio", "omni", "customtools", "vision", "guard", "moderation"];
    let usable: Vec<&ModelInfo> = models.iter().filter(|m| !SKIP.iter().any(|s| m.id.contains(s))).collect();
    let mut out: Vec<String> = Vec::new();
    match provider {
        "gemini" => {
            let mut flash: Vec<&&ModelInfo> = usable.iter().filter(|m| m.id.contains("flash") && !m.id.contains("lite") && !m.id.contains("preview") && !m.id.contains("latest")).collect();
            flash.sort_by(|a, b| version(&b.id).partial_cmp(&version(&a.id)).unwrap_or(std::cmp::Ordering::Equal));
            out.extend(flash.iter().take(3).map(|m| m.id.clone()));
            if usable.iter().any(|m| m.id == "gemini-flash-latest") {
                out.push("gemini-flash-latest".into());
            }
            let mut lite: Vec<&&ModelInfo> = usable.iter().filter(|m| m.id.contains("flash-lite") && !m.id.contains("preview")).collect();
            lite.sort_by(|a, b| version(&b.id).partial_cmp(&version(&a.id)).unwrap_or(std::cmp::Ordering::Equal));
            out.extend(lite.iter().take(1).map(|m| m.id.clone()));
        }
        "anthropic" => {
            // The API lists newest first.
            for family in ["sonnet", "opus", "haiku"] {
                if let Some(m) = usable.iter().find(|m| m.id.contains(family)) {
                    out.push(m.id.clone());
                }
            }
        }
        "openrouter" if free_only => {
            // A key with no credit can only use the free models: the large
            // general ones first, those held to a schema before the rest.
            const NOT_GENERAL: &[&str] = &["safety", "code", "nano", "mini", "small", "lfm", "-xs", "lightning", "note-preview"];
            let mut free: Vec<&&ModelInfo> = usable.iter().filter(|m| m.free && !NOT_GENERAL.iter().any(|x| m.id.contains(x))).collect();
            let size = |id: &str| -> u64 {
                id.split(|c: char| c == '-' || c == '/' || c == ':')
                    .filter_map(|p| p.strip_suffix('b').and_then(|n| n.parse::<u64>().ok()))
                    .max()
                    .unwrap_or(if id.contains("ultra") { 500 } else { 30 })
            };
            free.sort_by_key(|m| (std::cmp::Reverse(m.structured), std::cmp::Reverse(size(&m.id))));
            out.extend(free.iter().take(5).map(|m| m.id.clone()));
        }
        "openrouter" => {
            out.push("openrouter/auto".into());
            let mut g: Vec<&&ModelInfo> = usable.iter().filter(|m| m.id.starts_with("google/gemini") && m.id.contains("flash") && !m.id.contains("lite")).collect();
            g.sort_by(|a, b| version(&b.id).partial_cmp(&version(&a.id)).unwrap_or(std::cmp::Ordering::Equal));
            out.extend(g.iter().take(1).map(|m| m.id.clone()));
            if let Some(m) = usable.iter().find(|m| m.id.starts_with("anthropic/claude") && m.id.contains("sonnet")) {
                out.push(m.id.clone());
            }
        }
        _ => out.extend(usable.iter().take(3).map(|m| m.id.clone())),
    }
    out.dedup();
    out
}

type Cache = Mutex<HashMap<String, (Vec<ModelInfo>, Instant)>>;
fn cache() -> &'static Cache {
    static C: OnceLock<Cache> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Whether an OpenRouter key has no credit, so only free models will answer.
async fn free_tier(e: &Engine) -> bool {
    let Ok(c) = client() else { return false };
    match c.get(format!("{OPENROUTER}/key")).bearer_auth(&e.key).send().await {
        Ok(res) => res.json::<Value>().await.ok().and_then(|v| v["data"]["is_free_tier"].as_bool()).unwrap_or(false),
        Err(_) => false,
    }
}

/// The models to try, in order: the fixed one first if there is one, then
/// the automatic choice (read from the provider at most once an hour).
async fn candidates(e: &Engine) -> Result<Vec<ModelInfo>, AiError> {
    let key = format!("{}|{}|{}", e.provider, base(e), &e.key[e.key.len().saturating_sub(6)..]);
    let cached = cache().lock().unwrap().get(&key).filter(|(_, at)| at.elapsed() < Duration::from_secs(3600)).map(|(v, _)| v.clone());
    let listed = match cached {
        Some(v) => v,
        None => {
            let listed = list_models(e).await.unwrap_or_default();
            if !listed.is_empty() {
                cache().lock().unwrap().insert(key, (listed.clone(), Instant::now()));
            }
            listed
        }
    };
    let mut ranked: Vec<ModelInfo> = listed.iter().filter(|m| m.rank.is_some()).cloned().collect();
    ranked.sort_by_key(|m| m.rank);
    let mut out = Vec::new();
    if let Some(id) = &e.fixed_model {
        out.push(listed.iter().find(|m| &m.id == id).cloned().unwrap_or_else(|| ModelInfo::plain(id.clone(), id.clone())));
    }
    out.extend(ranked.into_iter().filter(|m| Some(&m.id) != e.fixed_model.as_ref()));
    if out.is_empty() {
        return Err(AiError("No model is available from this provider for this key.".into()));
    }
    Ok(out)
}

// ---------------------------------------------------------------- schemas

/// Gemini's response schema uses upper-case OpenAPI type names and a subset
/// of JSON Schema; everything else takes standard JSON Schema.
fn gemini_schema(v: &Value) -> Value {
    match v {
        Value::Object(m) => {
            let mut out = Map::new();
            for (k, val) in m {
                match k.as_str() {
                    "type" => {
                        out.insert(k.clone(), Value::String(val.as_str().unwrap_or("string").to_uppercase()));
                    }
                    "additionalProperties" | "$schema" => {}
                    _ => {
                        out.insert(k.clone(), gemini_schema(val));
                    }
                }
            }
            Value::Object(out)
        }
        Value::Array(a) => Value::Array(a.iter().map(gemini_schema).collect()),
        other => other.clone(),
    }
}

fn data_url(mime: &str, bytes: &[u8]) -> String {
    format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))
}

// ---------------------------------------------------------------- calls

enum Want<'a> {
    Json(&'a Value),
    Text,
}

/// One request to one model. `Ok(None)` means "busy or gone, try the next".
async fn call(e: &Engine, info: &ModelInfo, system: &str, turns: &[(String, Vec<&Part>)], want: &Want<'_>) -> Result<Option<Value>, AiError> {
    let model = info.id.as_str();
    // A photo sent to a model that cannot see: try the next model instead.
    let has_image = turns.iter().any(|(_, parts)| parts.iter().any(|p| matches!(p, Part::Doc { mime, .. } if mime.starts_with("image/"))));
    if has_image && !info.vision {
        return Ok(None);
    }
    let c = client()?;
    match e.provider.as_str() {
        "gemini" => {
            let contents: Vec<Value> = turns
                .iter()
                .map(|(role, parts)| {
                    json!({
                        "role": if role == "assistant" { "model" } else { "user" },
                        "parts": parts.iter().map(|p| match p {
                            Part::Text(t) => json!({ "text": t }),
                            Part::Doc { mime, bytes, .. } => json!({ "inlineData": { "mimeType": mime, "data": base64::engine::general_purpose::STANDARD.encode(bytes) } }),
                        }).collect::<Vec<_>>(),
                    })
                })
                .collect();
            let mut config = json!({ "temperature": 0.2 });
            if let Want::Json(schema) = want {
                config["responseMimeType"] = json!("application/json");
                config["responseSchema"] = gemini_schema(schema);
            }
            let body = json!({ "systemInstruction": { "parts": [{ "text": system }] }, "contents": contents, "generationConfig": config });
            let (status, v) = read(c.post(format!("{GEMINI}/models/{model}:generateContent")).header("x-goog-api-key", &e.key).json(&body).send().await.map_err(net)?).await?;
            if matches!(status, 404 | 429 | 500 | 503 | 599) {
                return Ok(None);
            }
            if status >= 400 {
                return Err(AiError(format!("Assist was refused ({status}): {}", provider_message(&v))));
            }
            let text: String = v["candidates"][0]["content"]["parts"].as_array().map(|p| p.iter().filter_map(|x| x["text"].as_str()).collect()).unwrap_or_default();
            finish(text, want, v["candidates"][0]["finishReason"].as_str())
        }
        "anthropic" => {
            let messages: Vec<Value> = turns
                .iter()
                .map(|(role, parts)| {
                    json!({
                        "role": if role == "assistant" { "assistant" } else { "user" },
                        "content": parts.iter().map(|p| match p {
                            Part::Text(t) => json!({ "type": "text", "text": t }),
                            Part::Doc { mime, bytes, .. } if mime == "application/pdf" => json!({ "type": "document", "source": { "type": "base64", "media_type": mime, "data": base64::engine::general_purpose::STANDARD.encode(bytes) } }),
                            Part::Doc { mime, bytes, .. } => json!({ "type": "image", "source": { "type": "base64", "media_type": mime, "data": base64::engine::general_purpose::STANDARD.encode(bytes) } }),
                        }).collect::<Vec<_>>(),
                    })
                })
                .collect();
            let mut body = json!({ "model": model, "max_tokens": 16000, "system": system, "messages": messages, "temperature": 0.2 });
            if let Want::Json(schema) = want {
                body["tools"] = json!([{ "name": "answer", "description": "Give the answer in this exact shape.", "input_schema": schema }]);
                body["tool_choice"] = json!({ "type": "tool", "name": "answer" });
            }
            let (status, v) = read(c.post(format!("{ANTHROPIC}/messages")).header("x-api-key", &e.key).header("anthropic-version", "2023-06-01").json(&body).send().await.map_err(net)?).await?;
            if matches!(status, 404 | 429 | 500 | 529 | 599) {
                return Ok(None);
            }
            if status >= 400 {
                return Err(AiError(format!("Assist was refused ({status}): {}", provider_message(&v))));
            }
            let blocks = v["content"].as_array().cloned().unwrap_or_default();
            if let Want::Json(_) = want {
                if let Some(input) = blocks.iter().find(|b| b["type"] == "tool_use").map(|b| b["input"].clone()) {
                    return Ok(Some(input));
                }
            }
            let text: String = blocks.iter().filter_map(|b| b["text"].as_str()).collect();
            finish(text, want, v["stop_reason"].as_str())
        }
        _ => {
            // A model the provider cannot hold to a schema is told the shape instead.
            let system = match want {
                Want::Json(schema) if !info.structured => format!("{system}\n\nReply with one JSON object only, no other text, matching this JSON Schema:\n{schema}"),
                _ => system.to_string(),
            };
            let mut messages = vec![json!({ "role": "system", "content": system })];
            for (role, parts) in turns {
                let content: Vec<Value> = parts
                    .iter()
                    .map(|p| match p {
                        Part::Text(t) => json!({ "type": "text", "text": t }),
                        Part::Doc { mime, bytes, .. } if mime.starts_with("image/") => json!({ "type": "image_url", "image_url": { "url": data_url(mime, bytes) } }),
                        Part::Doc { mime, name, bytes } => json!({ "type": "file", "file": { "filename": name, "file_data": data_url(mime, bytes) } }),
                    })
                    .collect();
                messages.push(json!({ "role": if role == "assistant" { "assistant" } else { "user" }, "content": content }));
            }
            let mut body = json!({ "model": model, "messages": messages, "temperature": 0.2 });
            if let (Want::Json(schema), true) = (want, info.structured) {
                body["response_format"] = json!({ "type": "json_schema", "json_schema": { "name": "answer", "schema": schema, "strict": false } });
            }
            let mut req = c.post(format!("{}/chat/completions", base(e))).bearer_auth(&e.key).json(&body);
            if e.provider == "openrouter" {
                req = req.header("X-Title", "Pleadli DPP");
            }
            let (status, v) = read(req.send().await.map_err(net)?).await?;
            // Busy, rate-limited, gone, or needs credit: try the next model.
            if matches!(status, 402 | 404 | 408 | 429 | 500 | 502 | 503 | 524 | 599) {
                return Ok(None);
            }
            if status >= 400 {
                return Err(AiError(format!("Assist was refused ({status}): {}", provider_message(&v))));
            }
            let text = v["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();
            finish(text, want, v["choices"][0]["finish_reason"].as_str())
        }
    }
}

fn finish(text: String, want: &Want<'_>, reason: Option<&str>) -> Result<Option<Value>, AiError> {
    if text.trim().is_empty() {
        return Err(AiError(format!("Assist gave no answer ({}).", reason.unwrap_or("empty"))));
    }
    match want {
        Want::Text => Ok(Some(Value::String(text))),
        Want::Json(_) => {
            // Some servers wrap JSON in a code fence even when asked not to.
            let trimmed = text.trim().trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
            serde_json::from_str(trimmed).map(Some).map_err(|err| AiError(format!("Assist's answer was not in the expected shape: {err}")))
        }
    }
}

async fn run(e: &Engine, system: &str, turns: &[(String, Vec<&Part>)], want: Want<'_>) -> Result<(Value, String), AiError> {
    let mut models = candidates(e).await?;
    // Scans and photos need a model that sees: those go first, the rest keep their order.
    let has_docs = turns.iter().any(|(_, parts)| parts.iter().any(|p| matches!(p, Part::Doc { .. })));
    if has_docs {
        models.sort_by_key(|m| !m.vision);
        // Documents are heavy: two models at most, so a fallback can still be tried in time.
        if models.iter().all(|m| m.free) {
            models.truncate(2);
        }
    }
    for (i, model) in models.iter().enumerate() {
        if i > 0 {
            tokio::time::sleep(Duration::from_millis(800)).await;
        }
        match call(e, model, system, turns, &want).await {
            Ok(Some(v)) => return Ok((v, model.id.clone())),
            Ok(None) => continue,
            // A slow or badly answering model is not the end: the next may do better.
            Err(AiError(msg)) if msg == "TIMEOUT" => {
                log::warn!("{} timed out", model.id);
                continue;
            }
            Err(err) if model.free => {
                log::warn!("{} failed: {err}", model.id);
                continue;
            }
            Err(err) => return Err(err),
        }
    }
    Err(AiError("Every model is busy at the provider. Try again in a minute.".into()))
}

/// An answer in the given JSON Schema shape.
pub async fn generate_json(e: &Engine, system: &str, parts: &[Part], schema: &Value) -> Result<(Value, String), AiError> {
    let turn = vec![("user".to_string(), parts.iter().collect::<Vec<_>>())];
    run(e, system, &turn, Want::Json(schema)).await
}

/// A reply to a conversation, as plain text.
pub async fn reply(e: &Engine, system: &str, conversation: &[(String, String)]) -> Result<(String, String), AiError> {
    let parts: Vec<Part> = conversation.iter().map(|(_, t)| Part::Text(t.clone())).collect();
    let turns: Vec<(String, Vec<&Part>)> = conversation.iter().zip(parts.iter()).map(|((role, _), p)| (role.clone(), vec![p])).collect();
    let (v, model) = run(e, system, &turns, Want::Text).await?;
    Ok((v.as_str().unwrap_or("").to_string(), model))
}

// ---------------------------------------------------------------- development keys

/// A development key for a provider, from the environment. Never in a release build.
pub fn env_key(provider: &str) -> Option<String> {
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

/// The last four characters, to show which key is set without showing it.
pub fn key_hint(key: &str) -> String {
    let tail: String = key.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    format!("…{tail}")
}

/// Development builds read a git-ignored `.env.local` (the app passes its
/// path) so a developer's key is found without being typed into the app.
/// Variables already set win.
pub fn load_dev_env(path: &str) {
    if !cfg!(debug_assertions) {
        return;
    }
    let Ok(text) = std::fs::read_to_string(path) else { return };
    for line in text.lines().map(str::trim).filter(|l| !l.starts_with('#')) {
        if let Some((k, v)) = line.split_once('=') {
            if std::env::var(k.trim()).is_err() {
                std::env::set_var(k.trim(), v.trim());
            }
        }
    }
}
