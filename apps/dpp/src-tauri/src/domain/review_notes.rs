use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::error::{invalid, DomainError};

/// Review & Legal Observations (docs/dpp/PRODUCT.md) — the reviewing work
/// itself, distinct from a formal Decision. Never changes the file's
/// status; only a real Decision does that.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ReviewNote {
    pub id: String,
    pub prosecution_file_id: String,
    pub statement_id: Option<String>,
    pub evidence_item_id: Option<String>,
    pub author: Option<String>,
    pub note: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReviewNoteInput {
    pub prosecution_file_id: String,
    pub statement_id: Option<String>,
    pub evidence_item_id: Option<String>,
    pub author: Option<String>,
    pub note: Option<String>,
}

pub async fn create_review_note(pool: &SqlitePool, input: CreateReviewNoteInput) -> Result<ReviewNote, DomainError> {
    if input.note.as_deref().map_or(true, |n| n.trim().is_empty()) {
        return invalid("A review note cannot be empty.");
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO review_notes (id, prosecution_file_id, statement_id, evidence_item_id, author, note)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prosecution_file_id)
    .bind(&input.statement_id)
    .bind(&input.evidence_item_id)
    .bind(&input.author)
    .bind(&input.note)
    .execute(pool)
    .await?;

    Ok(sqlx::query_as::<_, ReviewNote>("SELECT * FROM review_notes WHERE id = ?").bind(&id).fetch_one(pool).await?)
}

pub async fn list_for_file(pool: &SqlitePool, prosecution_file_id: &str) -> Result<Vec<ReviewNote>, sqlx::Error> {
    sqlx::query_as::<_, ReviewNote>("SELECT * FROM review_notes WHERE prosecution_file_id = ? ORDER BY created_at DESC")
        .bind(prosecution_file_id)
        .fetch_all(pool)
        .await
}
