use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

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

pub async fn create_charge(pool: &SqlitePool, input: CreateChargeInput) -> Result<Charge, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO charges (id, prosecution_file_id, accused_person_id, offence, statutory_section, particulars)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prosecution_file_id)
    .bind(&input.accused_person_id)
    .bind(&input.offence)
    .bind(&input.statutory_section)
    .bind(&input.particulars)
    .execute(pool)
    .await?;

    sqlx::query_as::<_, Charge>("SELECT * FROM charges WHERE id = ?").bind(&id).fetch_one(pool).await
}

pub async fn list_for_file(pool: &SqlitePool, prosecution_file_id: &str) -> Result<Vec<Charge>, sqlx::Error> {
    sqlx::query_as::<_, Charge>("SELECT * FROM charges WHERE prosecution_file_id = ? ORDER BY created_at ASC")
        .bind(prosecution_file_id)
        .fetch_all(pool)
        .await
}
