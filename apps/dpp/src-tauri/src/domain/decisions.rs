use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::prosecution_files;

/// Append-only by convention (docs/dpp/PRODUCT.md §Decisions & Reviews): no
/// update/delete command is ever exposed for this table. A correction is a
/// new decision row, never a mutation of history.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Decision {
    pub id: String,
    pub prosecution_file_id: String,
    pub decision_type: String,
    pub decided_by: Option<String>,
    pub decided_at: i64,
    pub reasons: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDecisionInput {
    pub prosecution_file_id: String,
    pub decision_type: String,
    pub decided_by: Option<String>,
    pub decided_at: i64,
    pub reasons: Option<String>,
}

pub async fn create_decision(pool: &SqlitePool, input: CreateDecisionInput) -> Result<Decision, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO decisions (id, prosecution_file_id, decision_type, decided_by, decided_at, reasons)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prosecution_file_id)
    .bind(&input.decision_type)
    .bind(&input.decided_by)
    .bind(input.decided_at)
    .bind(&input.reasons)
    .execute(pool)
    .await?;

    if let Some(status) = prosecution_files::status_for_decision(&input.decision_type) {
        prosecution_files::set_status(pool, &input.prosecution_file_id, status).await?;
    }

    sqlx::query_as::<_, Decision>("SELECT * FROM decisions WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await
}

pub async fn list_for_file(pool: &SqlitePool, prosecution_file_id: &str) -> Result<Vec<Decision>, sqlx::Error> {
    sqlx::query_as::<_, Decision>(
        "SELECT * FROM decisions WHERE prosecution_file_id = ? ORDER BY decided_at DESC",
    )
    .bind(prosecution_file_id)
    .fetch_all(pool)
    .await
}
