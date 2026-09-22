use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::error::{check_timestamp, clean, invalid, DomainError};
use super::prosecution_files;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Referral {
    pub id: String,
    pub prosecution_file_id: String,
    pub police_station: Option<String>,
    pub police_reference: Option<String>,
    pub received_at: i64,
    pub material_summary: Option<String>,
    pub is_resubmission: bool,
    pub notes: Option<String>,
    pub created_at: i64,
    /// The return this resubmission answers.
    pub answers_decision_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateResubmissionInput {
    pub prosecution_file_id: String,
    pub police_station: Option<String>,
    pub police_reference: Option<String>,
    pub received_at: i64,
    pub material_summary: Option<String>,
    pub notes: Option<String>,
}

/// A file returned to Police for further investigation coming back is a
/// resubmission referral against the *same* file (RESEARCH.md §3), never a
/// new prosecution_files row. It is only meaningful for a file that is
/// currently with Police, and it moves the file back into review in the same
/// transaction that records it.
pub async fn create_resubmission(pool: &SqlitePool, input: CreateResubmissionInput) -> Result<Referral, DomainError> {
    check_timestamp(input.received_at, "The date received")?;
    let file = prosecution_files::get_prosecution_file(pool, &input.prosecution_file_id)
        .await?
        .ok_or_else(|| DomainError::NotFound("File not found.".to_string()))?;
    if file.current_status != "returned_for_investigation" {
        return invalid("Only a file that has been returned to Police can be resubmitted.");
    }
    // The return it answers: the latest one on the file.
    let answers: Option<(String, i64)> = sqlx::query_as(
        "SELECT id, decided_at FROM decisions WHERE prosecution_file_id = ? AND decision_type = 'return_for_investigation'
          ORDER BY decided_at DESC, created_at DESC, rowid DESC LIMIT 1",
    )
    .bind(&input.prosecution_file_id)
    .fetch_optional(pool)
    .await?;
    let returned_at = answers.as_ref().map(|(_, at)| *at);
    if returned_at.is_some_and(|at| input.received_at < at) {
        return invalid("A resubmission cannot be received before the file was returned.");
    }

    let id = Uuid::new_v4().to_string();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO referrals
            (id, prosecution_file_id, police_station, police_reference, received_at, material_summary, is_resubmission, notes, answers_decision_id)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prosecution_file_id)
    .bind(clean(input.police_station))
    .bind(clean(input.police_reference))
    .bind(input.received_at)
    .bind(clean(input.material_summary))
    .bind(clean(input.notes))
    .bind(answers.map(|(id, _)| id))
    .execute(&mut *tx)
    .await?;
    prosecution_files::recompute_status(&mut tx, &input.prosecution_file_id).await?;
    tx.commit().await?;

    Ok(sqlx::query_as::<_, Referral>("SELECT * FROM referrals WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await?)
}

pub async fn list_for_file(pool: &SqlitePool, prosecution_file_id: &str) -> Result<Vec<Referral>, sqlx::Error> {
    sqlx::query_as::<_, Referral>(
        "SELECT * FROM referrals WHERE prosecution_file_id = ? ORDER BY received_at ASC",
    )
    .bind(prosecution_file_id)
    .fetch_all(pool)
    .await
}
