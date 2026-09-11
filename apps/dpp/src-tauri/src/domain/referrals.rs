use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

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
/// new prosecution_files row.
pub async fn create_resubmission(pool: &SqlitePool, input: CreateResubmissionInput) -> Result<Referral, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO referrals
            (id, prosecution_file_id, police_station, police_reference, received_at, material_summary, is_resubmission, notes)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
    )
    .bind(&id)
    .bind(&input.prosecution_file_id)
    .bind(&input.police_station)
    .bind(&input.police_reference)
    .bind(input.received_at)
    .bind(&input.material_summary)
    .bind(&input.notes)
    .execute(pool)
    .await?;

    sqlx::query_as::<_, Referral>("SELECT * FROM referrals WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await
}

pub async fn list_for_file(pool: &SqlitePool, prosecution_file_id: &str) -> Result<Vec<Referral>, sqlx::Error> {
    sqlx::query_as::<_, Referral>(
        "SELECT * FROM referrals WHERE prosecution_file_id = ? ORDER BY received_at ASC",
    )
    .bind(prosecution_file_id)
    .fetch_all(pool)
    .await
}
