//! Rulings and judgments: the court's reasoned decisions. A draft is a working
//! document. Delivering renders it once, references it and freezes it under a
//! SHA-256, as an order is (`orders`), and needs the judicial officer and court
//! set in Settings because a decision is signed and headed with them.
//!
//! A draft can carry the date the decision was reserved. It stays visible on
//! Today with the days that have passed since, and no time limit is asserted:
//! what the law requires for delivering a reserved decision has not been read yet
//! (docs/courts/PROPOSAL.md, section 12).

use chrono::{DateTime, Datelike, FixedOffset};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{check_date, check_timestamp, invalid, DomainError};
use pleadli_node_core::db::begin_write;

pub const KINDS: [&str; 2] = ["ruling", "judgment"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RulingContent {
    pub court: String,
    pub heading: String,
    pub title: String,
    pub case_number: String,
    pub case_title: String,
    /// The editor's document as JSON, exactly as delivered.
    pub body: String,
    pub delivered_on: String,
    pub signatory: String,
    pub signatory_title: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ruling {
    pub id: String,
    pub case_id: String,
    pub sitting_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub reserved_on: Option<i64>,
    pub status: String,
    pub reference: Option<String>,
    pub content: Option<RulingContent>,
    pub content_sha256: Option<String>,
    pub intact: Option<bool>,
    pub delivered_on: Option<i64>,
    pub delivered_at: Option<i64>,
    pub delivered_by: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub court_number: String,
    pub case_title: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RulingSummary {
    pub id: String,
    pub case_id: String,
    pub kind: String,
    pub title: String,
    pub status: String,
    pub reference: Option<String>,
    pub reserved_on: Option<i64>,
    pub delivered_on: Option<i64>,
    pub updated_at: i64,
    pub court_number: String,
    pub case_title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInput {
    pub case_id: String,
    pub sitting_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub reserved_on: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInput {
    pub title: String,
    pub body: String,
    pub reserved_on: Option<i64>,
}

#[derive(FromRow)]
struct Row {
    id: String,
    case_id: String,
    sitting_id: Option<String>,
    kind: String,
    title: String,
    body: String,
    reserved_on: Option<i64>,
    status: String,
    reference: Option<String>,
    content: Option<String>,
    content_sha256: Option<String>,
    delivered_on: Option<i64>,
    delivered_at: Option<i64>,
    delivered_by: Option<String>,
    created_at: i64,
    updated_at: i64,
    court_number: String,
    case_title: String,
}

fn hex(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

impl Row {
    fn into_ruling(self) -> Ruling {
        let intact = match (&self.content, &self.content_sha256) {
            (Some(content), Some(hash)) => Some(&hex(content) == hash),
            _ => None,
        };
        Ruling {
            content: self.content.as_deref().and_then(|c| serde_json::from_str(c).ok()),
            id: self.id,
            case_id: self.case_id,
            sitting_id: self.sitting_id,
            kind: self.kind,
            title: self.title,
            body: self.body,
            reserved_on: self.reserved_on,
            status: self.status,
            reference: self.reference,
            content_sha256: self.content_sha256,
            intact,
            delivered_on: self.delivered_on,
            delivered_at: self.delivered_at,
            delivered_by: self.delivered_by,
            created_at: self.created_at,
            updated_at: self.updated_at,
            court_number: self.court_number,
            case_title: self.case_title,
        }
    }
}

const SELECT: &str = "SELECT r.id, r.case_id, r.sitting_id, r.kind, r.title, r.body, r.reserved_on, r.status, r.reference, r.content, r.content_sha256,
        r.delivered_on, r.delivered_at, r.delivered_by, r.created_at, r.updated_at, c.court_number, c.title AS case_title
    FROM rulings r JOIN cases c ON c.id = r.case_id";

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Ruling>, sqlx::Error> {
    let row = sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE r.id = ?"))).bind(id).fetch_optional(pool).await?;
    Ok(row.map(Row::into_ruling))
}

/// `status` is `draft`, `delivered` or empty; `case_id` empty for every case.
pub async fn list(pool: &SqlitePool, status: &str, case_id: &str, limit: i64) -> Result<Vec<RulingSummary>, sqlx::Error> {
    sqlx::query_as::<_, RulingSummary>(
        "SELECT r.id, r.case_id, r.kind, r.title, r.status, r.reference, r.reserved_on, r.delivered_on, r.updated_at, c.court_number, c.title AS case_title
         FROM rulings r JOIN cases c ON c.id = r.case_id
         WHERE (?1 = '' OR r.status = ?1) AND (?2 = '' OR r.case_id = ?2)
         ORDER BY r.updated_at DESC LIMIT ?3",
    )
    .bind(status)
    .bind(case_id)
    .bind(limit.clamp(1, 500))
    .fetch_all(pool)
    .await
}

pub async fn create(pool: &SqlitePool, input: CreateInput) -> Result<Ruling, DomainError> {
    if !KINDS.contains(&input.kind.as_str()) {
        return invalid("A decision is a ruling or a judgment.");
    }
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return invalid("Give the decision a title, for example the application it decides.");
    }
    if let Some(day) = input.reserved_on {
        check_timestamp(day, "The date reserved")?;
    }
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    let known: Option<String> = sqlx::query_scalar("SELECT id FROM cases WHERE id = ?").bind(&input.case_id).fetch_optional(&mut *tx).await?;
    if known.is_none() {
        return Err(DomainError::NotFound("Case not found.".to_string()));
    }
    if let Some(sitting_id) = &input.sitting_id {
        let owner: Option<String> = sqlx::query_scalar("SELECT case_id FROM sittings WHERE id = ?").bind(sitting_id).fetch_optional(&mut *tx).await?;
        if owner.as_deref() != Some(input.case_id.as_str()) {
            return invalid("That sitting is not in this case.");
        }
    }
    sqlx::query("INSERT INTO rulings (id, case_id, sitting_id, kind, title, reserved_on) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&input.case_id)
        .bind(&input.sitting_id)
        .bind(&input.kind)
        .bind(&title)
        .bind(input.reserved_on)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("ruling_drafted").subject("ruling", &id).scope(&input.case_id).detail(&input.kind)).await?;
    tx.commit().await?;
    Ok(get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

async fn draft(conn: &mut sqlx::SqliteConnection, id: &str) -> Result<(String, String), DomainError> {
    let found = sqlx::query_as::<_, (String, String, String)>("SELECT case_id, kind, status FROM rulings WHERE id = ?").bind(id).fetch_optional(&mut *conn).await?;
    let Some((case_id, kind, status)) = found else { return Err(DomainError::NotFound("Decision not found.".to_string())) };
    if status != "draft" {
        return invalid("A delivered decision cannot be changed.");
    }
    Ok((case_id, kind))
}

/// Saving a draft is frequent (the editor saves as it goes), so it is not
/// written to the audit trail; drafting, delivering and discarding are.
pub async fn update(pool: &SqlitePool, id: &str, input: UpdateInput) -> Result<Ruling, DomainError> {
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return invalid("Give the decision a title.");
    }
    if let Some(day) = input.reserved_on {
        check_timestamp(day, "The date reserved")?;
    }
    let mut tx = begin_write(pool).await?;
    draft(&mut tx, id).await?;
    sqlx::query("UPDATE rulings SET title = ?, body = ?, reserved_on = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?")
        .bind(&title)
        .bind(&input.body)
        .bind(input.reserved_on)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn discard(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let mut tx = begin_write(pool).await?;
    let (case_id, _) = draft(&mut tx, id).await?;
    sqlx::query("DELETE FROM rulings WHERE id = ?").bind(id).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("ruling_discarded").subject("ruling", id).scope(&case_id)).await?;
    tx.commit().await?;
    Ok(())
}

/// East Africa Time, UTC+3, which Uganda keeps all year.
fn eat() -> FixedOffset {
    FixedOffset::east_opt(3 * 3600).expect("a valid offset")
}

fn eat_time(ms: i64) -> Option<DateTime<FixedOffset>> {
    DateTime::from_timestamp_millis(ms).map(|t| t.with_timezone(&eat()))
}

fn long_date(ms: i64) -> String {
    eat_time(ms).map(|t| t.format("%-d %B %Y").to_string()).unwrap_or_default()
}

/// The words in an editor document (its `text` nodes), so an empty draft can be
/// told from one with something in it without the server knowing the editor.
pub fn plain_text(body: &str) -> String {
    fn walk(node: &serde_json::Value, out: &mut String) {
        if let Some(text) = node.get("text").and_then(|t| t.as_str()) {
            out.push_str(text);
            out.push(' ');
        }
        if let Some(children) = node.get("content").and_then(|c| c.as_array()) {
            for child in children {
                walk(child, out);
            }
        }
    }
    match serde_json::from_str::<serde_json::Value>(body) {
        Ok(doc) if doc.get("type").and_then(|t| t.as_str()) == Some("doc") => {
            let mut out = String::new();
            walk(&doc, &mut out);
            out
        }
        _ => body.to_string(),
    }
}

/// Delivers a draft: the decision was given in court on `delivered_on`. It is
/// rendered, referenced (`RUL/<year>/<nnnn>` or `JDG/...`) and frozen.
pub async fn deliver(pool: &SqlitePool, id: &str, delivered_on: i64) -> Result<Ruling, DomainError> {
    check_date(delivered_on, "The date of delivery")?;
    let now = chrono::Utc::now().timestamp_millis();
    if delivered_on > now + 86_400_000 {
        return invalid("A decision cannot be delivered on a date that has not come.");
    }
    let mut tx = begin_write(pool).await?;
    let found = sqlx::query_as::<_, (String, String, String, String, String, Option<i64>)>("SELECT case_id, kind, title, body, status, reserved_on FROM rulings WHERE id = ?")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;
    let Some((case_id, kind, title, body, status, reserved_on)) = found else { return Err(DomainError::NotFound("Decision not found.".to_string())) };
    if status != "draft" {
        return invalid("This decision is already delivered.");
    }
    if plain_text(&body).trim().is_empty() {
        return invalid("The decision has no text yet.");
    }
    if let Some(reserved) = reserved_on {
        if delivered_on < reserved {
            return invalid("A decision cannot be delivered before the day it was reserved.");
        }
    }
    let profile = sqlx::query_as::<_, (String, Option<String>, Option<String>)>("SELECT name, title, court_name FROM bench_profile WHERE id = 'default'").fetch_optional(&mut *tx).await?;
    let Some((signatory, signatory_title, court_name)) = profile else {
        return invalid("Set your name and court in Settings first: a decision is signed and headed with them.");
    };
    let Some(court) = court_name.filter(|c| !c.trim().is_empty()) else {
        return invalid("Set the name of your court in Settings first: a decision is headed with it.");
    };
    let (case_number, case_title) = sqlx::query_as::<_, (String, String)>("SELECT court_number, title FROM cases WHERE id = ?").bind(&case_id).fetch_one(&mut *tx).await?;

    let year = eat_time(now).map(|t| t.year()).unwrap_or(1970);
    let prefix = if kind == "judgment" { "JDG" } else { "RUL" };
    let issued: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM rulings WHERE status = 'delivered' AND reference LIKE ?").bind(format!("{prefix}/{year}/%")).fetch_one(&mut *tx).await?;
    let reference = format!("{prefix}/{year}/{:04}", issued + 1);

    let content = RulingContent {
        court,
        heading: if kind == "judgment" { "JUDGMENT".to_string() } else { "RULING".to_string() },
        title,
        case_number,
        case_title,
        body,
        delivered_on: long_date(delivered_on),
        signatory: signatory.clone(),
        signatory_title,
    };
    let text = serde_json::to_string(&content).map_err(|_| DomainError::Invalid("The decision could not be prepared.".to_string()))?;
    sqlx::query("UPDATE rulings SET status = 'delivered', reference = ?, content = ?, content_sha256 = ?, delivered_on = ?, delivered_at = ?, delivered_by = ?, updated_at = ? WHERE id = ?")
        .bind(&reference)
        .bind(&text)
        .bind(hex(&text))
        .bind(delivered_on)
        .bind(now)
        .bind(&signatory)
        .bind(now)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("ruling_delivered").subject("ruling", id).scope(&case_id).detail(&reference)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}
