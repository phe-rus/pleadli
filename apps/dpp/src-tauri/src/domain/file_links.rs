//! One matter, several files: the police file, a bail application, an appeal.
//! Each is its own file with its own number and cover colour; a link says how
//! they belong together (spec 0001, AC-6).

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::error::{invalid, DomainError};

const RELATIONS: &[&str] = &["trial", "bail", "appeal", "revision", "related"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LinkedFile {
    pub link_id: String,
    pub file_id: String,
    pub title: String,
    pub reference: Option<String>,
    pub kind: String,
    pub cover: String,
    pub stage: String,
    /// How the other file relates to this one, read from this file's side.
    pub relation: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkInput {
    pub linked_file_id: String,
    pub relation: String,
}

/// The files linked to this one, whichever side the link was made from.
pub async fn list(pool: &SqlitePool, file_id: &str) -> Result<Vec<LinkedFile>, sqlx::Error> {
    sqlx::query_as::<_, LinkedFile>(
        "SELECT l.id AS link_id, o.id AS file_id, o.title,
                COALESCE(o.odpp_registration_number, o.police_reference, o.court_case_number) AS reference,
                o.kind, o.cover, o.stage, l.relation
           FROM file_links l
           JOIN prosecution_files o ON o.id = CASE WHEN l.file_id = ?1 THEN l.linked_file_id ELSE l.file_id END
          WHERE l.file_id = ?1 OR l.linked_file_id = ?1
          ORDER BY l.created_at",
    )
    .bind(file_id)
    .fetch_all(pool)
    .await
}

pub async fn link(pool: &SqlitePool, file_id: &str, input: LinkInput) -> Result<Vec<LinkedFile>, DomainError> {
    if !RELATIONS.contains(&input.relation.as_str()) {
        return invalid("Unknown way of linking files.");
    }
    if input.linked_file_id == file_id {
        return invalid("A file cannot be linked to itself.");
    }
    let both: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prosecution_files WHERE id IN (?, ?)")
        .bind(file_id)
        .bind(&input.linked_file_id)
        .fetch_one(pool)
        .await?;
    if both != 2 {
        return Err(DomainError::NotFound("File not found.".to_string()));
    }
    let already: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM file_links WHERE (file_id = ?1 AND linked_file_id = ?2) OR (file_id = ?2 AND linked_file_id = ?1)",
    )
    .bind(file_id)
    .bind(&input.linked_file_id)
    .fetch_one(pool)
    .await?;
    if already > 0 {
        return invalid("These two files are already linked.");
    }
    sqlx::query("INSERT INTO file_links (id, file_id, linked_file_id, relation) VALUES (?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(file_id)
        .bind(&input.linked_file_id)
        .bind(&input.relation)
        .execute(pool)
        .await?;
    Ok(list(pool, file_id).await?)
}

pub async fn unlink(pool: &SqlitePool, link_id: &str) -> Result<(), DomainError> {
    let done = sqlx::query("DELETE FROM file_links WHERE id = ?").bind(link_id).execute(pool).await?;
    if done.rows_affected() == 0 {
        return Err(DomainError::NotFound("Link not found.".to_string()));
    }
    Ok(())
}
