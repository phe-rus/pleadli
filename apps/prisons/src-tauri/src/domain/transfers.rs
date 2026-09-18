use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::prisoners;

/// docs/prisons/PRODUCT.md §Transfers. A transfer is a movement event on
/// the existing Prisoner record — RESEARCH.md §9 confirmed transfers
/// preserve one continuous custody identity, never a new episode.
///
/// `direction` "out": this prison sends the prisoner elsewhere — flips
/// `current_status` to `transferred_out`, removing them from this
/// installation's active in-custody views (they're no longer this
/// facility's operational responsibility) while keeping the record for
/// history. `direction` "in": this prison receives back a prisoner it
/// already has a record for — flips status back to `in_custody`. A
/// prisoner this installation has never seen before still goes through
/// Admission, not this table: each Prisons installation is one prison's
/// own local database (no sync engine, see architecture docs), so there is
/// no cross-installation record to "transfer in" — only a same-record
/// re-entry after this prison's own earlier transfer-out.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Transfer {
    pub id: String,
    pub prisoner_id: String,
    pub direction: String,
    pub other_prison_name: Option<String>,
    pub transferred_at: i64,
    pub ordering_authority: Option<String>,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTransferInput {
    pub prisoner_id: String,
    pub direction: String,
    pub other_prison_name: Option<String>,
    pub transferred_at: i64,
    pub ordering_authority: Option<String>,
    pub notes: Option<String>,
}

fn status_for_transfer(direction: &str) -> &'static str {
    match direction {
        "in" => "in_custody",
        _ => "transferred_out",
    }
}

pub async fn create_transfer(pool: &SqlitePool, input: CreateTransferInput) -> Result<Transfer, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO transfers (id, prisoner_id, direction, other_prison_name, transferred_at, ordering_authority, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prisoner_id)
    .bind(&input.direction)
    .bind(&input.other_prison_name)
    .bind(input.transferred_at)
    .bind(&input.ordering_authority)
    .bind(&input.notes)
    .execute(pool)
    .await?;

    let status = status_for_transfer(&input.direction);
    prisoners::set_status(pool, &input.prisoner_id, status).await?;

    sqlx::query_as::<_, Transfer>("SELECT * FROM transfers WHERE id = ?").bind(&id).fetch_one(pool).await
}

pub async fn list_for_prisoner(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<Transfer>, sqlx::Error> {
    sqlx::query_as::<_, Transfer>("SELECT * FROM transfers WHERE prisoner_id = ? ORDER BY transferred_at DESC")
        .bind(prisoner_id)
        .fetch_all(pool)
        .await
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TransferSearchRow {
    pub id: String,
    pub prisoner_id: String,
    pub first_name: String,
    pub last_name: String,
    pub direction: String,
    pub other_prison_name: Option<String>,
    pub transferred_at: i64,
}

pub async fn search(pool: &SqlitePool, query: &str) -> Result<Vec<TransferSearchRow>, sqlx::Error> {
    let like = format!("%{query}%");
    sqlx::query_as::<_, TransferSearchRow>(
        "SELECT t.id, t.prisoner_id, p.first_name, p.last_name, t.direction, t.other_prison_name, t.transferred_at
         FROM transfers t JOIN prisoners p ON p.id = t.prisoner_id
         WHERE t.other_prison_name LIKE ?1 OR p.first_name LIKE ?1 OR p.last_name LIKE ?1 OR p.other_names LIKE ?1
         ORDER BY t.transferred_at DESC LIMIT 200",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}
