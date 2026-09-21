//! Composed reports: a document an officer assembles from written text and
//! tables drawn from the registers, saved as a draft and issued when done.
//!
//! The node does not interpret the blocks. It keeps them exactly as the screen
//! sends them, so a draft can hold any layout the editor offers, and it
//! checks only what keeps the store sound: a bounded number of blocks, each
//! with an id and a known type, and a bounded size. What makes a composed
//! report trustworthy is not the draft but the issue: issuing copies the
//! blocks into `generated_reports` as a numbered, fingerprinted snapshot, and
//! from then on the draft cannot be edited. Nothing is deleted.

use serde::Serialize;
use serde_json::{json, Value};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::error::DomainError;
use super::facility_profile;
use super::reports::{self, GeneratedReport, Issuer, ReportDocument};
use super::time::now_ms;

const MAX_TITLE_CHARS: usize = 200;
const MAX_BLOCKS: usize = 200;
const MAX_BYTES: usize = 2_000_000;
const BLOCK_TYPES: [&str; 2] = ["text", "table"];
/// The kind an issued composed report is stored under, and its reference prefix.
pub const KIND: &str = "composed";
const PREFIX: &str = "CR";

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DraftSummary {
    pub id: String,
    pub title: String,
    pub created_by_name: String,
    pub updated_by_name: String,
    pub updated_at: i64,
    /// Set once issued. An issued draft is read-only and the report it became
    /// is opened instead.
    pub issued_report_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    #[serde(flatten)]
    pub summary: DraftSummary,
    pub blocks: Value,
}

#[derive(Debug, FromRow)]
struct Row {
    id: String,
    title: String,
    blocks_json: String,
    created_by_name: String,
    updated_by_name: String,
    updated_at: i64,
    issued_report_id: Option<String>,
}

impl Row {
    fn into_draft(self) -> Result<Draft, DomainError> {
        let blocks = serde_json::from_str(&self.blocks_json).map_err(|e| DomainError::rejected(e.to_string()))?;
        Ok(Draft {
            summary: DraftSummary {
                id: self.id,
                title: self.title,
                created_by_name: self.created_by_name,
                updated_by_name: self.updated_by_name,
                updated_at: self.updated_at,
                issued_report_id: self.issued_report_id,
            },
            blocks,
        })
    }
}

/// The draft columns, as a literal so it can be joined to a `WHERE` at compile
/// time: sqlx takes only static SQL.
macro_rules! select_row {
    ($tail:literal) => {
        concat!("SELECT id, title, blocks_json, created_by_name, updated_by_name, updated_at, issued_report_id FROM report_drafts ", $tail)
    };
}

fn check(title: &str, blocks: &Value) -> Result<(String, String), DomainError> {
    let title = title.trim();
    if title.is_empty() {
        return Err(DomainError::rejected("Give the report a title."));
    }
    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(DomainError::rejected("The title is too long."));
    }
    let list = blocks.as_array().ok_or_else(|| DomainError::rejected("The report's content is not a list of blocks."))?;
    if list.len() > MAX_BLOCKS {
        return Err(DomainError::rejected("The report has too many blocks."));
    }
    for block in list {
        let known = block.get("id").and_then(Value::as_str).is_some() && block.get("type").and_then(Value::as_str).is_some_and(|t| BLOCK_TYPES.contains(&t));
        if !known {
            return Err(DomainError::rejected("Every block needs an id and a type of text or table."));
        }
    }
    let json = serde_json::to_string(blocks).map_err(|e| DomainError::rejected(e.to_string()))?;
    if json.len() > MAX_BYTES {
        return Err(DomainError::rejected("The report is too large. Use fewer rows."));
    }
    Ok((title.to_string(), json))
}

pub async fn list(pool: &SqlitePool) -> Result<Vec<DraftSummary>, sqlx::Error> {
    sqlx::query_as("SELECT id, title, created_by_name, updated_by_name, updated_at, issued_report_id FROM report_drafts ORDER BY updated_at DESC LIMIT 200")
        .fetch_all(pool)
        .await
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Draft>, DomainError> {
    let row: Option<Row> = sqlx::query_as(select_row!("WHERE id = ?")).bind(id).fetch_optional(pool).await?;
    row.map(Row::into_draft).transpose()
}

async fn load(conn: &mut SqliteConnection, id: &str) -> Result<Row, DomainError> {
    sqlx::query_as(select_row!("WHERE id = ?")).bind(id).fetch_optional(&mut *conn).await?.ok_or(DomainError::NotFound("That draft"))
}

pub async fn create(conn: &mut SqliteConnection, actor: &Actor, title: &str, blocks: &Value) -> Result<Draft, DomainError> {
    let (title, blocks_json) = check(title, blocks)?;
    let id = format!("draft-{}", Uuid::new_v4());
    let now = now_ms();
    sqlx::query(
        "INSERT INTO report_drafts (id, title, blocks_json, created_by_name, created_at, updated_by_name, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&title)
    .bind(&blocks_json)
    .bind(&actor.name)
    .bind(now)
    .bind(&actor.name)
    .bind(now)
    .execute(&mut *conn)
    .await?;
    audit::record(conn, actor, AuditEntry::new("report_draft.create", "report_draft", Some(&id)).after(&json!({ "title": title }))).await?;
    load(conn, &id).await?.into_draft()
}

/// Saves the title and blocks. An issued draft is refused: the issued report
/// is the record, and it does not change.
pub async fn update(conn: &mut SqliteConnection, actor: &Actor, id: &str, title: &str, blocks: &Value) -> Result<Draft, DomainError> {
    let existing = load(conn, id).await?;
    if existing.issued_report_id.is_some() {
        return Err(DomainError::conflict("ALREADY_ISSUED", "This report has been issued and can no longer be edited."));
    }
    let (title, blocks_json) = check(title, blocks)?;
    sqlx::query("UPDATE report_drafts SET title = ?, blocks_json = ?, updated_by_name = ?, updated_at = ? WHERE id = ?")
        .bind(&title)
        .bind(&blocks_json)
        .bind(&actor.name)
        .bind(now_ms())
        .bind(id)
        .execute(&mut *conn)
        .await?;
    // Saving is frequent; the audit records that it happened and by whom, not each keystroke's content.
    audit::record(conn, actor, AuditEntry::new("report_draft.save", "report_draft", Some(id))).await?;
    load(conn, id).await?.into_draft()
}

/// Turns the draft into a numbered, fingerprinted report and freezes the draft.
pub async fn issue(conn: &mut SqliteConnection, actor: &Actor, id: &str) -> Result<GeneratedReport, DomainError> {
    let draft = load(conn, id).await?;
    if draft.issued_report_id.is_some() {
        return Err(DomainError::conflict("ALREADY_ISSUED", "This report has already been issued."));
    }
    let blocks: Value = serde_json::from_str(&draft.blocks_json).map_err(|e| DomainError::rejected(e.to_string()))?;
    if blocks.as_array().is_none_or(|list| list.is_empty()) {
        return Err(DomainError::rejected("Add something to the report before issuing it."));
    }
    let profile = facility_profile::get_conn(conn).await?;
    let head_office: bool = sqlx::query_scalar("SELECT is_head_office FROM hq_config WHERE id = 'default'").fetch_optional(&mut *conn).await?.unwrap_or(false);
    let issuer = if head_office {
        Issuer { name: Some("Head Office".to_string()), facility_number: None, location: None, region: None }
    } else {
        Issuer { name: profile.name, facility_number: profile.facility_number, location: profile.location, region: profile.region }
    };
    let document = ReportDocument {
        kind: KIND.to_string(),
        title: draft.title,
        period_from: None,
        period_to: None,
        as_at: now_ms(),
        issuer,
        body: json!({ "blocks": blocks }),
    };
    let report = reports::store(conn, actor, PREFIX, &document).await?;
    sqlx::query("UPDATE report_drafts SET issued_report_id = ? WHERE id = ?").bind(&report.record.id).bind(id).execute(&mut *conn).await?;
    audit::record(conn, actor, AuditEntry::new("report_draft.issue", "report_draft", Some(id)).after(&json!({ "reportId": report.record.id, "reference": report.record.reference }))).await?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::authz::Actor;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    fn actor() -> Actor {
        Actor::system("test")
    }

    fn blocks() -> Value {
        json!([{ "id": "b1", "type": "text", "doc": "{}" }, { "id": "b2", "type": "table", "rows": [] }])
    }

    #[tokio::test]
    async fn a_draft_is_saved_and_reopened_as_written() {
        let pool = pool().await;
        let mut conn = pool.acquire().await.unwrap();
        let draft = create(&mut conn, &actor(), "  Monthly note  ", &blocks()).await.unwrap();
        assert!(draft.summary.id.starts_with("draft-"));
        assert_eq!(draft.summary.title, "Monthly note", "the title is trimmed");
        let saved = update(&mut conn, &actor(), &draft.summary.id, "Monthly note, revised", &json!([{ "id": "b1", "type": "text" }])).await.unwrap();
        assert_eq!(saved.blocks, json!([{ "id": "b1", "type": "text" }]));
        drop(conn);
        assert_eq!(list(&pool).await.unwrap().len(), 1);
        assert_eq!(get(&pool, &draft.summary.id).await.unwrap().unwrap().summary.title, "Monthly note, revised");
    }

    #[tokio::test]
    async fn what_the_store_cannot_hold_is_refused() {
        let pool = pool().await;
        let mut conn = pool.acquire().await.unwrap();
        assert!(create(&mut conn, &actor(), " ", &blocks()).await.is_err(), "no title");
        assert!(create(&mut conn, &actor(), "T", &json!({ "not": "a list" })).await.is_err());
        assert!(create(&mut conn, &actor(), "T", &json!([{ "id": "b1", "type": "chart" }])).await.is_err(), "unknown block type");
        assert!(create(&mut conn, &actor(), "T", &json!([{ "type": "text" }])).await.is_err(), "no id");
    }

    #[tokio::test]
    async fn issuing_numbers_and_freezes_the_report() {
        let pool = pool().await;
        let mut conn = pool.acquire().await.unwrap();
        let draft = create(&mut conn, &actor(), "Note to the region", &blocks()).await.unwrap();
        let report = issue(&mut conn, &actor(), &draft.summary.id).await.unwrap();
        assert!(report.record.reference.starts_with("CR-"), "{}", report.record.reference);
        assert_eq!(report.record.kind, KIND);
        assert_eq!(report.document["body"]["blocks"], blocks());

        drop(conn);
        let after = get(&pool, &draft.summary.id).await.unwrap().unwrap();
        let mut conn = pool.acquire().await.unwrap();
        assert_eq!(after.summary.issued_report_id.as_deref(), Some(report.record.id.as_str()));
        assert!(update(&mut conn, &actor(), &draft.summary.id, "Changed", &blocks()).await.is_err(), "an issued draft is not edited");
        assert!(issue(&mut conn, &actor(), &draft.summary.id).await.is_err(), "and is not issued twice");

        let empty = create(&mut conn, &actor(), "Nothing yet", &json!([])).await.unwrap();
        assert!(issue(&mut conn, &actor(), &empty.summary.id).await.is_err(), "an empty report is not issued");
    }
}
