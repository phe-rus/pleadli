//! The law library: the text of each statute the office works under, with the
//! date it is correct at and where it came from. Assist quotes only this text.
//!
//! Texts come from the Laws.Africa Content API (the institution's token; it
//! serves the latest consolidated version with its date) or are entered by
//! hand where no API covers the country yet (DR Congo).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::error::{invalid, DomainError};

const API: &str = "https://api.laws.africa/v3";

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LawSummary {
    pub id: String,
    pub jurisdiction: String,
    pub title: String,
    pub cite: Option<String>,
    pub frbr_uri: Option<String>,
    pub source: String,
    pub as_at: Option<String>,
    pub characters: i64,
    pub fetched_at: i64,
}

pub async fn list(pool: &SqlitePool, jurisdiction: &str) -> Result<Vec<LawSummary>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, jurisdiction, title, cite, frbr_uri, source, as_at, length(body) AS characters, fetched_at FROM laws WHERE jurisdiction = ? ORDER BY title",
    )
    .bind(jurisdiction)
    .fetch_all(pool)
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualLaw {
    pub jurisdiction: String,
    pub title: String,
    pub cite: Option<String>,
    pub as_at: Option<String>,
    pub body: String,
}

async fn put(pool: &SqlitePool, jurisdiction: &str, title: &str, cite: Option<&str>, frbr: Option<&str>, source: &str, as_at: Option<&str>, body: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO laws (id, jurisdiction, title, cite, frbr_uri, source, as_at, body, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(jurisdiction, title) DO UPDATE SET cite = excluded.cite, frbr_uri = excluded.frbr_uri, source = excluded.source,
           as_at = excluded.as_at, body = excluded.body, fetched_at = excluded.fetched_at",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(jurisdiction)
    .bind(title)
    .bind(cite)
    .bind(frbr)
    .bind(source)
    .bind(as_at)
    .bind(body)
    .bind(now())
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn add_manual(pool: &SqlitePool, input: ManualLaw) -> Result<(), DomainError> {
    if input.title.trim().is_empty() || input.body.trim().len() < 50 {
        return invalid("Give the law's title and paste its text.");
    }
    put(pool, &input.jurisdiction, input.title.trim(), input.cite.as_deref(), None, "manual", input.as_at.as_deref(), &input.body).await?;
    Ok(())
}

pub async fn delete(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    sqlx::query("DELETE FROM laws WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}

/// HTML to readable text: block ends become line breaks, tags go, entities
/// that matter in statutes are decoded.
fn text_of(html: &str) -> String {
    let mut out = String::with_capacity(html.len() / 2);
    let mut in_tag = false;
    let mut tag = String::new();
    for c in html.chars() {
        match (in_tag, c) {
            (false, '<') => {
                in_tag = true;
                tag.clear();
            }
            (true, '>') => {
                in_tag = false;
                let t = tag.to_lowercase();
                if ["/p", "br", "br/", "/h1", "/h2", "/h3", "/h4", "/li", "/div", "/section", "/tr"].iter().any(|b| t.starts_with(b)) {
                    out.push('\n');
                }
            }
            (true, c) => tag.push(c),
            (false, c) => out.push(c),
        }
    }
    let out = out.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&#8212;", "-").replace("&mdash;", "-");
    out.lines().map(str::trim).filter(|l| !l.is_empty()).collect::<Vec<_>>().join("\n")
}

fn norm(s: &str) -> String {
    s.to_lowercase().chars().filter(|c| c.is_alphanumeric() || *c == ' ').collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ")
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub updated: Vec<String>,
    pub not_found: Vec<String>,
}

/// Fetches the latest consolidated text of each named statute from
/// Laws.Africa, matching by title among the country's works.
pub async fn sync_laws_africa(pool: &SqlitePool, token: &str, jurisdiction: &str, titles: &[String]) -> Result<SyncResult, DomainError> {
    if !(jurisdiction.len() == 2 && jurisdiction.chars().all(|c| c.is_ascii_lowercase())) {
        return invalid("Unknown country.");
    }
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(120)).build().map_err(|e| DomainError::Invalid(e.to_string()))?;
    let get = |url: String| client.get(url).header("Authorization", format!("Token {token}")).send();

    // Every work in the country, page by page.
    let mut works: Vec<Value> = Vec::new();
    let mut url = Some(format!("{API}/akn/{jurisdiction}/.json"));
    let mut pages = 0;
    while let Some(u) = url.take() {
        pages += 1;
        let res = get(u).await.map_err(|e| DomainError::Invalid(format!("Laws.Africa could not be reached: {e}")))?;
        if res.status().as_u16() == 401 || res.status().as_u16() == 403 {
            return Err(DomainError::Forbidden("Laws.Africa refused the token.".into()));
        }
        let v: Value = res.json().await.map_err(|e| DomainError::Invalid(format!("Laws.Africa answered in a way that could not be read: {e}")))?;
        works.extend(v["results"].as_array().cloned().unwrap_or_default());
        url = v["next"].as_str().map(str::to_string).filter(|_| pages < 60);
    }

    let mut result = SyncResult { updated: vec![], not_found: vec![] };
    for title in titles {
        // "Penal Code Act (Cap. 120)" matches "Penal Code Act".
        let wanted = norm(title.split('(').next().unwrap_or(title));
        let found = works.iter().filter(|w| w["language"].as_str().is_none_or(|l| l == "eng" || l == "fra")).find(|w| {
            let t = norm(w["title"].as_str().unwrap_or(""));
            t == wanted || t.starts_with(&wanted)
        });
        let Some(work) = found else {
            result.not_found.push(title.clone());
            continue;
        };
        let frbr = work["frbr_uri"].as_str().unwrap_or("");
        let lang = work["language"].as_str().unwrap_or("eng");
        let res = get(format!("{API}{frbr}/{lang}.html")).await.map_err(|e| DomainError::Invalid(format!("Laws.Africa could not be reached: {e}")))?;
        if !res.status().is_success() {
            result.not_found.push(title.clone());
            continue;
        }
        let html = res.text().await.unwrap_or_default();
        let body = text_of(&html);
        if body.len() < 200 {
            result.not_found.push(title.clone());
            continue;
        }
        let as_at = work["expression_date"].as_str().or(work["date"].as_str());
        put(pool, jurisdiction, work["title"].as_str().unwrap_or(title), work["numbered_title"].as_str(), Some(frbr), "laws.africa", as_at, &body).await?;
        result.updated.push(work["title"].as_str().unwrap_or(title).to_string());
    }
    let _ = super::audit::log(pool, super::audit::Entry::new("laws_synced").detail(format!("{jurisdiction}: {} updated, {} not found", result.updated.len(), result.not_found.len()))).await;
    Ok(result)
}

/// The passages of the stored law that bear on these words, each with the
/// statute's name and date, up to `budget` characters in all.
pub async fn excerpts(pool: &SqlitePool, jurisdiction: &str, words: &[String], budget: usize) -> Result<String, sqlx::Error> {
    if jurisdiction.is_empty() || words.is_empty() {
        return Ok(String::new());
    }
    let rows: Vec<(String, Option<String>, Option<String>, String)> = sqlx::query_as("SELECT title, cite, as_at, body FROM laws WHERE jurisdiction = ?").bind(jurisdiction).fetch_all(pool).await?;
    let mut out = String::new();
    for (title, cite, as_at, body) in rows {
        let lines: Vec<&str> = body.lines().collect();
        let mut taken = vec![false; lines.len()];
        let mut chunk = String::new();
        for (i, line) in lines.iter().enumerate() {
            let low = line.to_lowercase();
            if words.iter().any(|w| low.contains(w.as_str())) {
                for j in i.saturating_sub(2)..(i + 8).min(lines.len()) {
                    if !taken[j] {
                        taken[j] = true;
                        chunk.push_str(lines[j]);
                        chunk.push('\n');
                    }
                }
                chunk.push_str("...\n");
            }
            if chunk.len() > budget / 2 {
                break;
            }
        }
        if !chunk.is_empty() {
            out.push_str(&format!("=== {title}{} (text as at {}) ===\n{chunk}\n", cite.map(|c| format!(", {c}")).unwrap_or_default(), as_at.unwrap_or_else(|| "unknown date".into())));
        }
        if out.len() > budget {
            out.truncate(budget);
            break;
        }
    }
    Ok(out)
}
