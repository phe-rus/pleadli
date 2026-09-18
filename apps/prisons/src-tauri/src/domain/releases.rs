use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::prisoners;

/// Append-only by convention (docs/prisons/PRODUCT.md §Release): every real
/// statutory release trigger as its own event, never a single "released"
/// checkbox.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub id: String,
    pub prisoner_id: String,
    pub release_type: String,
    pub released_at: i64,
    pub ordered_by: Option<String>,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReleaseInput {
    pub prisoner_id: String,
    pub release_type: String,
    pub released_at: i64,
    pub ordered_by: Option<String>,
    pub notes: Option<String>,
}

pub async fn create_release(pool: &SqlitePool, input: CreateReleaseInput) -> Result<Release, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO releases (id, prisoner_id, release_type, released_at, ordered_by, notes)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prisoner_id)
    .bind(&input.release_type)
    .bind(input.released_at)
    .bind(&input.ordered_by)
    .bind(&input.notes)
    .execute(pool)
    .await?;

    let status = prisoners::status_for_release(&input.release_type);
    prisoners::set_status(pool, &input.prisoner_id, status).await?;

    sqlx::query_as::<_, Release>("SELECT * FROM releases WHERE id = ?").bind(&id).fetch_one(pool).await
}

pub async fn list_for_prisoner(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<Release>, sqlx::Error> {
    sqlx::query_as::<_, Release>("SELECT * FROM releases WHERE prisoner_id = ? ORDER BY released_at DESC")
        .bind(prisoner_id)
        .fetch_all(pool)
        .await
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseSearchRow {
    pub id: String,
    pub prisoner_id: String,
    pub first_name: String,
    pub last_name: String,
    pub release_type: String,
    pub released_at: i64,
}

pub async fn search(pool: &SqlitePool, query: &str) -> Result<Vec<ReleaseSearchRow>, sqlx::Error> {
    let like = format!("%{query}%");
    sqlx::query_as::<_, ReleaseSearchRow>(
        "SELECT r.id, r.prisoner_id, p.first_name, p.last_name, r.release_type, r.released_at
         FROM releases r JOIN prisoners p ON p.id = r.prisoner_id
         WHERE r.release_type LIKE ?1 OR p.first_name LIKE ?1 OR p.last_name LIKE ?1 OR p.other_names LIKE ?1
         ORDER BY r.released_at DESC LIMIT 200",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}
