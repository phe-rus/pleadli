//! The exhibits register of a case: what was produced, by whom, at which
//! sitting, and what the court did with it.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{clean, invalid, DomainError};
use pleadli_node_core::db::begin_write;

const SIDES: [(&str, &str); 3] = [("prosecution", "P"), ("defence", "D"), ("court", "C")];
const STATUSES: [&str; 3] = ["marked", "admitted", "rejected"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Exhibit {
    pub id: String,
    pub case_id: String,
    pub sitting_id: Option<String>,
    pub label: String,
    pub produced_by: String,
    pub description: String,
    pub witness: Option<String>,
    pub status: String,
    pub note: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkInput {
    pub sitting_id: Option<String>,
    pub produced_by: String,
    pub description: String,
    pub witness: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInput {
    pub description: String,
    pub witness: Option<String>,
    pub status: String,
    pub note: Option<String>,
}

const COLUMNS: &str = "id, case_id, sitting_id, label, produced_by, description, witness, status, note, created_at, updated_at";

pub async fn list(pool: &SqlitePool, case_id: &str) -> Result<Vec<Exhibit>, sqlx::Error> {
    sqlx::query_as::<_, Exhibit>(sqlx::AssertSqlSafe(format!("SELECT {COLUMNS} FROM exhibits WHERE case_id = ? ORDER BY created_at, label"))).bind(case_id).fetch_all(pool).await
}

async fn get(pool: &SqlitePool, id: &str) -> Result<Exhibit, sqlx::Error> {
    sqlx::query_as::<_, Exhibit>(sqlx::AssertSqlSafe(format!("SELECT {COLUMNS} FROM exhibits WHERE id = ?"))).bind(id).fetch_one(pool).await
}

/// Marks an exhibit: gives it the next label for its side in this case (P1, P2,
/// D1, C1). The number is worked out inside the write, so two marks never share
/// one.
pub async fn mark(pool: &SqlitePool, case_id: &str, input: MarkInput) -> Result<Exhibit, DomainError> {
    let Some((_, prefix)) = SIDES.iter().find(|(side, _)| *side == input.produced_by) else {
        return invalid("Say who produced the exhibit: the prosecution, the defence or the court.");
    };
    let description = input.description.trim().to_string();
    if description.is_empty() {
        return invalid("Describe the exhibit.");
    }
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    let known: Option<String> = sqlx::query_scalar("SELECT id FROM cases WHERE id = ?").bind(case_id).fetch_optional(&mut *tx).await?;
    if known.is_none() {
        return Err(DomainError::NotFound("Case not found.".to_string()));
    }
    if let Some(sitting_id) = &input.sitting_id {
        let owner: Option<String> = sqlx::query_scalar("SELECT case_id FROM sittings WHERE id = ?").bind(sitting_id).fetch_optional(&mut *tx).await?;
        if owner.as_deref() != Some(case_id) {
            return invalid("That sitting is not in this case.");
        }
    }
    let last: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(CAST(SUBSTR(label, 2) AS INTEGER)), 0) FROM exhibits WHERE case_id = ? AND produced_by = ?")
        .bind(case_id)
        .bind(&input.produced_by)
        .fetch_one(&mut *tx)
        .await?;
    let label = format!("{prefix}{}", last + 1);
    sqlx::query("INSERT INTO exhibits (id, case_id, sitting_id, label, produced_by, description, witness) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(case_id)
        .bind(&input.sitting_id)
        .bind(&label)
        .bind(&input.produced_by)
        .bind(&description)
        .bind(clean(input.witness))
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("exhibit_marked").subject("exhibit", &id).scope(case_id).detail(&label)).await?;
    tx.commit().await?;
    Ok(get(pool, &id).await?)
}

pub async fn update(pool: &SqlitePool, id: &str, input: UpdateInput) -> Result<Exhibit, DomainError> {
    if !STATUSES.contains(&input.status.as_str()) {
        return invalid("An exhibit is marked, admitted or rejected.");
    }
    let description = input.description.trim().to_string();
    if description.is_empty() {
        return invalid("Describe the exhibit.");
    }
    let mut tx = begin_write(pool).await?;
    let before = sqlx::query_as::<_, (String, String, String)>("SELECT case_id, label, status FROM exhibits WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    let Some((case_id, label, status)) = before else { return Err(DomainError::NotFound("Exhibit not found.".to_string())) };
    sqlx::query("UPDATE exhibits SET description = ?, witness = ?, status = ?, note = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?")
        .bind(&description)
        .bind(clean(input.witness))
        .bind(&input.status)
        .bind(clean(input.note))
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if status != input.status {
        audit::record(&mut tx, Entry::new("exhibit_ruled_on").subject("exhibit", id).scope(&case_id).detail(format!("{label} {}", input.status))).await?;
    }
    tx.commit().await?;
    Ok(get(pool, id).await?)
}

/// A mark made in error can be taken back while the court has done nothing
/// with the exhibit. Numbers go on from the highest one used, so a label that
/// was given out and taken back is never handed to a different exhibit while a
/// later one still stands.
pub async fn remove(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let mut tx = begin_write(pool).await?;
    let found = sqlx::query_as::<_, (String, String, String)>("SELECT case_id, label, status FROM exhibits WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    let Some((case_id, label, status)) = found else { return Err(DomainError::NotFound("Exhibit not found.".to_string())) };
    if status != "marked" {
        return invalid("The court has already ruled on this exhibit, so it stays on the register.");
    }
    sqlx::query("DELETE FROM exhibits WHERE id = ?").bind(id).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("exhibit_removed").subject("exhibit", id).scope(&case_id).detail(&label)).await?;
    tx.commit().await?;
    Ok(())
}
