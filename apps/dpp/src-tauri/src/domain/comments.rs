use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::error::{invalid, DomainError};

/// A comment thread on any structured record (statement, evidence item,
/// charge, decision, review note, or the file itself) — same generic
/// entity_type/entity_id keying as attachments.rs, so any domain gets a
/// comment thread without its own table.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub author: Option<String>,
    pub body: String,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCommentInput {
    pub entity_type: String,
    pub entity_id: String,
    pub author: Option<String>,
    pub body: String,
}

pub async fn create_comment(pool: &SqlitePool, input: CreateCommentInput) -> Result<Comment, DomainError> {
    if !["charge", "statement", "evidence_item", "review_note", "decision"].contains(&input.entity_type.as_str()) {
        return invalid("Comments cannot be attached to that kind of record.");
    }
    if input.body.trim().is_empty() {
        return invalid("A comment cannot be empty.");
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO comments (id, entity_type, entity_id, author, body) VALUES (?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&input.entity_type)
        .bind(&input.entity_id)
        .bind(&input.author)
        .bind(&input.body)
        .execute(pool)
        .await?;

    Ok(sqlx::query_as::<_, Comment>("SELECT * FROM comments WHERE id = ?").bind(&id).fetch_one(pool).await?)
}

pub async fn list_for_entity(pool: &SqlitePool, entity_type: &str, entity_id: &str) -> Result<Vec<Comment>, sqlx::Error> {
    sqlx::query_as::<_, Comment>("SELECT * FROM comments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC")
        .bind(entity_type)
        .bind(entity_id)
        .fetch_all(pool)
        .await
}
