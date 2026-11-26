use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::error::{invalid, DomainError};

/// Police Material (received) — the proposed charge(s) (docs/dpp/
/// PRODUCT.md). See migration 0008: same structured shape as Police's own
/// charge_sheets, since DPP is reviewing a proposed charge, not inventing
/// one.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Charge {
    pub id: String,
    pub prosecution_file_id: String,
    pub accused_person_id: Option<String>,
    pub offence: String,
    pub statutory_section: Option<String>,
    pub particulars: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChargeInput {
    pub prosecution_file_id: String,
    pub accused_person_id: Option<String>,
    pub offence: String,
    pub statutory_section: Option<String>,
    pub particulars: Option<String>,
}

pub async fn create_charge(pool: &SqlitePool, input: CreateChargeInput) -> Result<Charge, DomainError> {
    if input.offence.trim().is_empty() {
        return invalid("A charge needs an offence.");
    }
    let id = Uuid::new_v4().to_string();
    // With no accused named, a file that has exactly one accused means that person.
    let accused = match input.accused_person_id.clone().filter(|a| !a.trim().is_empty()) {
        Some(a) => Some(a),
        None => {
            let sole: Vec<String> = sqlx::query_scalar("SELECT person_id FROM prosecution_file_people WHERE prosecution_file_id = ? AND role = 'accused'").bind(&input.prosecution_file_id).fetch_all(pool).await?;
            if sole.len() == 1 { sole.into_iter().next() } else { None }
        }
    };
    sqlx::query(
        "INSERT INTO charges (id, prosecution_file_id, accused_person_id, offence, statutory_section, particulars)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prosecution_file_id)
    .bind(&accused)
    .bind(&input.offence)
    .bind(&input.statutory_section)
    .bind(&input.particulars)
    .execute(pool)
    .await?;

    Ok(sqlx::query_as::<_, Charge>("SELECT * FROM charges WHERE id = ?").bind(&id).fetch_one(pool).await?)
}

pub async fn list_for_file(pool: &SqlitePool, prosecution_file_id: &str) -> Result<Vec<Charge>, sqlx::Error> {
    sqlx::query_as::<_, Charge>("SELECT * FROM charges WHERE prosecution_file_id = ? ORDER BY created_at ASC")
        .bind(prosecution_file_id)
        .fetch_all(pool)
        .await
}

/// Removes a charge that was added by mistake. A charge a decision is about is
/// part of the record and stays: a wrong one is answered by a later decision.
pub async fn delete_charge(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM charges WHERE id = ?").bind(id).fetch_optional(pool).await?;
    if exists.is_none() {
        return Err(DomainError::NotFound("Charge not found.".to_string()));
    }
    let decided: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM decisions WHERE charge_id = ?").bind(id).fetch_one(pool).await?;
    if decided > 0 {
        return invalid("A decision is about this charge, so it stays in the record. Correct it with a later decision.");
    }
    sqlx::query("DELETE FROM charges WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}
