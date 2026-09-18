use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

/// Property & Effects (docs/prisons/PRODUCT.md, RESEARCH.md §11.1) — Prisons
/// Act s.62/s.30(2)(a): non-retainable belongings placed in the officer in
/// charge's custody at admission, returned at release. Kept as a plain
/// description + returned marker since no further field structure is
/// confirmed.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PropertyRecord {
    pub id: String,
    pub prisoner_id: String,
    pub description: String,
    pub recorded_at: i64,
    pub returned_at: Option<i64>,
    pub returned_note: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePropertyRecordInput {
    pub prisoner_id: String,
    pub description: String,
    pub recorded_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReturnPropertyRecordInput {
    pub returned_at: i64,
    pub returned_note: Option<String>,
}

pub async fn create_property_record(pool: &SqlitePool, input: CreatePropertyRecordInput) -> Result<PropertyRecord, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO property_records (id, prisoner_id, description, recorded_at) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(&input.prisoner_id)
        .bind(&input.description)
        .bind(input.recorded_at)
        .execute(pool)
        .await?;

    sqlx::query_as::<_, PropertyRecord>("SELECT * FROM property_records WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await
}

pub async fn mark_returned(pool: &SqlitePool, id: &str, input: ReturnPropertyRecordInput) -> Result<PropertyRecord, sqlx::Error> {
    sqlx::query("UPDATE property_records SET returned_at = ?, returned_note = ? WHERE id = ?")
        .bind(input.returned_at)
        .bind(&input.returned_note)
        .bind(id)
        .execute(pool)
        .await?;

    sqlx::query_as::<_, PropertyRecord>("SELECT * FROM property_records WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
}

pub async fn list_for_prisoner(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<PropertyRecord>, sqlx::Error> {
    sqlx::query_as::<_, PropertyRecord>("SELECT * FROM property_records WHERE prisoner_id = ? ORDER BY recorded_at DESC")
        .bind(prisoner_id)
        .fetch_all(pool)
        .await
}
