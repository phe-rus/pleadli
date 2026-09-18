use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

/// Police Material (received) — Evidence/Exhibits (docs/dpp/PRODUCT.md).
/// See migration 0007: DPP records what Police says exists, never
/// independent physical chain-of-custody.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceItem {
    pub id: String,
    pub prosecution_file_id: String,
    pub category: String,
    pub description: Option<String>,
    pub identification_mark: Option<String>,
    pub recovered_from_location: Option<String>,
    pub source_note: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEvidenceItemInput {
    pub prosecution_file_id: String,
    pub category: String,
    pub description: Option<String>,
    pub identification_mark: Option<String>,
    pub recovered_from_location: Option<String>,
    pub source_note: Option<String>,
}

pub async fn create_evidence_item(pool: &SqlitePool, input: CreateEvidenceItemInput) -> Result<EvidenceItem, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO evidence_items (id, prosecution_file_id, category, description, identification_mark, recovered_from_location, source_note)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prosecution_file_id)
    .bind(&input.category)
    .bind(&input.description)
    .bind(&input.identification_mark)
    .bind(&input.recovered_from_location)
    .bind(&input.source_note)
    .execute(pool)
    .await?;

    sqlx::query_as::<_, EvidenceItem>("SELECT * FROM evidence_items WHERE id = ?").bind(&id).fetch_one(pool).await
}

pub async fn list_for_file(pool: &SqlitePool, prosecution_file_id: &str) -> Result<Vec<EvidenceItem>, sqlx::Error> {
    sqlx::query_as::<_, EvidenceItem>("SELECT * FROM evidence_items WHERE prosecution_file_id = ? ORDER BY created_at ASC")
        .bind(prosecution_file_id)
        .fetch_all(pool)
        .await
}
