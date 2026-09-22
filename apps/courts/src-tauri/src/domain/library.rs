//! The offline law library: texts kept on this computer and searched without a
//! connection. Nothing is bundled. Each text is added by the person with where it
//! came from and its licence, so what is stored is text someone put there on
//! purpose and can check against its source.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{clean, invalid, DomainError};
use pleadli_node_core::db::begin_write;

pub const KINDS: [&str; 5] = ["statute", "guideline", "authority", "practice_direction", "note"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub citation: Option<String>,
    pub source: Option<String>,
    pub licence: Option<String>,
    pub body: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// A row of the library list. With a search, `snippet` is the text around the
/// first match in the body (empty if the match was in the title or citation).
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySummary {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub citation: Option<String>,
    pub source: Option<String>,
    pub licence: Option<String>,
    pub size: i64,
    pub snippet: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemInput {
    pub kind: String,
    pub title: String,
    pub citation: Option<String>,
    pub source: Option<String>,
    pub licence: Option<String>,
    pub body: String,
}

struct Checked {
    title: String,
    body: String,
}

fn check(input: &ItemInput) -> Result<Checked, DomainError> {
    if !KINDS.contains(&input.kind.as_str()) {
        return invalid("That is not a kind of library text.");
    }
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return invalid("Give the text a title.");
    }
    let body = input.body.trim().to_string();
    if body.is_empty() {
        return invalid("There is no text to keep.");
    }
    Ok(Checked { title, body })
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<LibraryItem>, sqlx::Error> {
    sqlx::query_as::<_, LibraryItem>("SELECT id, kind, title, citation, source, licence, body, created_at, updated_at FROM library_items WHERE id = ?").bind(id).fetch_optional(pool).await
}

/// Every text, or those matching `query` in the title, citation or body
/// (case-insensitive, plain text: no wildcard characters), optionally of one
/// `kind`. Titles that match come before body-only matches.
pub async fn list(pool: &SqlitePool, query: &str, kind: &str, limit: i64) -> Result<Vec<LibrarySummary>, sqlx::Error> {
    let q = query.trim();
    sqlx::query_as::<_, LibrarySummary>(
        "SELECT id, kind, title, citation, source, licence, length(body) AS size,
            CASE WHEN ?1 <> '' AND instr(lower(body), lower(?1)) > 0
                 THEN substr(body, max(1, instr(lower(body), lower(?1)) - 80), 240) END AS snippet,
            updated_at
         FROM library_items
         WHERE (?2 = '' OR kind = ?2)
           AND (?1 = '' OR instr(lower(title), lower(?1)) > 0 OR instr(lower(coalesce(citation, '')), lower(?1)) > 0 OR instr(lower(body), lower(?1)) > 0)
         ORDER BY CASE WHEN ?1 <> '' AND (instr(lower(title), lower(?1)) > 0 OR instr(lower(coalesce(citation, '')), lower(?1)) > 0) THEN 0 ELSE 1 END, title
         LIMIT ?3",
    )
    .bind(q)
    .bind(kind)
    .bind(limit.clamp(1, 500))
    .fetch_all(pool)
    .await
}

pub async fn add(pool: &SqlitePool, input: ItemInput) -> Result<LibraryItem, DomainError> {
    let checked = check(&input)?;
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    sqlx::query("INSERT INTO library_items (id, kind, title, citation, source, licence, body) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&input.kind)
        .bind(&checked.title)
        .bind(clean(input.citation))
        .bind(clean(input.source))
        .bind(clean(input.licence))
        .bind(&checked.body)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("library_added").subject("library", &id).detail(&checked.title)).await?;
    tx.commit().await?;
    Ok(get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn update(pool: &SqlitePool, id: &str, input: ItemInput) -> Result<LibraryItem, DomainError> {
    let checked = check(&input)?;
    let mut tx = begin_write(pool).await?;
    let done = sqlx::query(
        "UPDATE library_items SET kind = ?, title = ?, citation = ?, source = ?, licence = ?, body = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?",
    )
    .bind(&input.kind)
    .bind(&checked.title)
    .bind(clean(input.citation))
    .bind(clean(input.source))
    .bind(clean(input.licence))
    .bind(&checked.body)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if done.rows_affected() == 0 {
        return Err(DomainError::NotFound("Text not found.".to_string()));
    }
    audit::record(&mut tx, Entry::new("library_edited").subject("library", id).detail(&checked.title)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn remove(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let mut tx = begin_write(pool).await?;
    let title: Option<String> = sqlx::query_scalar("SELECT title FROM library_items WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    let Some(title) = title else { return Err(DomainError::NotFound("Text not found.".to_string())) };
    sqlx::query("DELETE FROM library_items WHERE id = ?").bind(id).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("library_removed").subject("library", id).detail(&title)).await?;
    tx.commit().await?;
    Ok(())
}
