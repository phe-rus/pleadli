//! The document library: preparing, refreshing, issuing and reading the
//! official documents DPP produces from its own record. See migration 0017.

use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::decisions::Decision;
use super::document_builder;
use super::document_content::DocumentContent;
use super::error::{invalid, DomainError};
use super::{prosecution_files, prosecutor_profile};

#[derive(Debug, FromRow)]
struct Row {
    id: String,
    prosecution_file_id: String,
    kind: String,
    title: String,
    reference: Option<String>,
    status: String,
    source_decision_id: String,
    author: Option<String>,
    content: String,
    content_sha256: Option<String>,
    prepared_at: i64,
    issued_at: Option<i64>,
    file_title: String,
    file_reference: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub prosecution_file_id: String,
    pub file_title: String,
    pub file_reference: Option<String>,
    pub kind: String,
    pub title: String,
    /// Pleadli's own number, assigned when the document is issued.
    pub reference: Option<String>,
    pub status: String,
    pub source_decision_id: String,
    pub author: Option<String>,
    pub prepared_at: i64,
    pub issued_at: Option<i64>,
    pub content_sha256: Option<String>,
    /// `draft`, `intact` or `altered`: whether an issued document's stored
    /// content still matches the hash taken when it was issued.
    pub integrity: String,
    pub content: DocumentContent,
}

const SELECT: &str = "SELECT d.id, d.prosecution_file_id, d.kind, d.title, d.reference, d.status, d.source_decision_id, d.author,
        d.content, d.content_sha256, d.prepared_at, d.issued_at, f.title AS file_title,
        COALESCE(f.odpp_registration_number, f.police_reference) AS file_reference
   FROM documents d JOIN prosecution_files f ON f.id = d.prosecution_file_id";

pub fn hash(content: &str) -> String {
    format!("{:x}", Sha256::digest(content.as_bytes()))
}

fn into_document(row: Row) -> Result<Document, DomainError> {
    let integrity = match (&row.status[..], &row.content_sha256) {
        ("issued", Some(expected)) => if hash(&row.content) == *expected { "intact" } else { "altered" },
        _ => "draft",
    };
    let content: DocumentContent = serde_json::from_str(&row.content).map_err(|e| DomainError::Invalid(format!("The stored document could not be read: {e}")))?;
    Ok(Document {
        id: row.id,
        prosecution_file_id: row.prosecution_file_id,
        file_title: row.file_title,
        file_reference: row.file_reference,
        kind: row.kind,
        title: row.title,
        reference: row.reference,
        status: row.status,
        source_decision_id: row.source_decision_id,
        author: row.author,
        prepared_at: row.prepared_at,
        issued_at: row.issued_at,
        content_sha256: row.content_sha256,
        integrity: integrity.to_string(),
        content,
    })
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Document, DomainError> {
    let row = sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE d.id = ?"))).bind(id).fetch_optional(pool).await?;
    into_document(row.ok_or_else(|| DomainError::NotFound("Document not found.".to_string()))?)
}

pub async fn list(pool: &SqlitePool, file_id: Option<&str>) -> Result<Vec<Document>, DomainError> {
    let rows = sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE (?1 IS NULL OR d.prosecution_file_id = ?1) ORDER BY d.prepared_at DESC, d.rowid DESC")))
        .bind(file_id)
        .fetch_all(pool)
        .await?;
    rows.into_iter().map(into_document).collect()
}

async fn decision(pool: &SqlitePool, id: &str) -> Result<Decision, DomainError> {
    sqlx::query_as::<_, Decision>("SELECT * FROM decisions WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| DomainError::NotFound("Decision not found.".to_string()))
}

/// The decisions recorded together with this one (same review, same kind), so
/// one document covers the counts decided as one act.
async fn act_of(pool: &SqlitePool, decision: &Decision) -> Result<Vec<Decision>, sqlx::Error> {
    match &decision.review_id {
        Some(review_id) => {
            sqlx::query_as::<_, Decision>("SELECT * FROM decisions WHERE prosecution_file_id = ? AND decision_type = ? AND review_id = ? ORDER BY rowid")
                .bind(&decision.prosecution_file_id)
                .bind(&decision.decision_type)
                .bind(review_id)
                .fetch_all(pool)
                .await
        }
        None => Ok(vec![decision.clone()]),
    }
}

/// Prepares the document a decision produces, or returns the one already
/// prepared for it.
pub async fn prepare(pool: &SqlitePool, decision_id: &str) -> Result<Document, DomainError> {
    let picked = decision(pool, decision_id).await?;
    let Some(kind) = document_builder::kind_for(&picked.decision_type) else {
        return invalid("That decision does not produce a document.");
    };
    let act = act_of(pool, &picked).await?;
    let source = &act[0];

    let existing: Option<String> = sqlx::query_scalar("SELECT id FROM documents WHERE source_decision_id = ? AND kind = ?")
        .bind(&source.id)
        .bind(kind)
        .fetch_optional(pool)
        .await?;
    if let Some(id) = existing {
        return get(pool, &id).await;
    }

    let file = prosecution_files::get_prosecution_file(pool, &source.prosecution_file_id).await?.ok_or_else(|| DomainError::NotFound("File not found.".to_string()))?;
    let content = document_builder::build(pool, kind, &file, &act).await?;
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO documents (id, prosecution_file_id, kind, title, status, source_decision_id, content, prepared_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)",
    )
    .bind(&id)
    .bind(&file.id)
    .bind(kind)
    .bind(document_builder::title_for(kind))
    .bind(&source.id)
    .bind(serde_json::to_string(&content).unwrap_or_default())
    .bind(chrono::Utc::now().timestamp_millis())
    .execute(pool)
    .await?;
    get(pool, &id).await
}

fn ensure_draft(doc: &Document) -> Result<(), DomainError> {
    if doc.status != "draft" {
        return invalid("An issued document cannot be changed.");
    }
    Ok(())
}

/// Rebuilds a draft from the record as it now stands.
pub async fn refresh(pool: &SqlitePool, id: &str) -> Result<Document, DomainError> {
    let doc = get(pool, id).await?;
    ensure_draft(&doc)?;
    let source = decision(pool, &doc.source_decision_id).await?;
    let act = act_of(pool, &source).await?;
    let file = prosecution_files::get_prosecution_file(pool, &doc.prosecution_file_id).await?.ok_or_else(|| DomainError::NotFound("File not found.".to_string()))?;
    let content = document_builder::build(pool, &doc.kind, &file, &act).await?;
    sqlx::query("UPDATE documents SET content = ?, prepared_at = ? WHERE id = ?")
        .bind(serde_json::to_string(&content).unwrap_or_default())
        .bind(chrono::Utc::now().timestamp_millis())
        .bind(id)
        .execute(pool)
        .await?;
    get(pool, id).await
}

/// Issues a draft: assigns its reference, records who issued it, and freezes
/// the content with its hash.
pub async fn issue(pool: &SqlitePool, id: &str) -> Result<Document, DomainError> {
    let doc = get(pool, id).await?;
    ensure_draft(&doc)?;
    let source = decision(pool, &doc.source_decision_id).await?;
    let profile = prosecutor_profile::get_prosecutor_profile(pool).await?;
    let Some(author) = source.decided_by.clone().or(profile.map(|p| p.name)) else {
        return invalid("Set the prosecutor in Settings before issuing a document, so it carries a name.");
    };

    let stored: String = sqlx::query_scalar("SELECT content FROM documents WHERE id = ?").bind(id).fetch_one(pool).await?;
    let now = chrono::Utc::now();
    let year: i64 = now.format("%Y").to_string().parse().unwrap_or(0);

    let mut tx = pool.begin().await?;
    let next: i64 = sqlx::query_scalar("SELECT next FROM document_counters WHERE year = ?").bind(year).fetch_optional(&mut *tx).await?.unwrap_or(1);
    sqlx::query("INSERT INTO document_counters (year, next) VALUES (?, ?) ON CONFLICT (year) DO UPDATE SET next = excluded.next")
        .bind(year)
        .bind(next + 1)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE documents SET status = 'issued', reference = ?, author = ?, content_sha256 = ?, issued_at = ? WHERE id = ?")
        .bind(format!("DPP-{year}-{next:04}"))
        .bind(&author)
        .bind(hash(&stored))
        .bind(now.timestamp_millis())
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("document_issued").subject("document", id).file(&doc.prosecution_file_id).detail(format!("DPP-{year}-{next:04}, {}", doc.kind))).await?;
    tx.commit().await?;
    get(pool, id).await
}

/// Throws a draft away. An issued document is never deleted.
pub async fn discard(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let doc = get(pool, id).await?;
    ensure_draft(&doc)?;
    sqlx::query("DELETE FROM documents WHERE id = ?").bind(id).execute(pool).await?;
    audit::log(pool, Entry::new("document_discarded").subject("document", id).file(&doc.prosecution_file_id).detail(doc.kind)).await?;
    Ok(())
}
