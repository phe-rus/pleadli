//! Directions to Police on a return for further investigation, and what became
//! of each when the file came back.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, SqliteConnection};
use uuid::Uuid;

use super::error::{clean, invalid, DomainError};

pub const KINDS: &[&str] = &["missing_material", "investigation", "statement", "evidence", "clarification", "procedural", "other"];
const RESPONSES: &[&str] = &["open", "met", "not_met"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Direction {
    pub id: String,
    pub prosecution_file_id: String,
    pub decision_id: String,
    pub kind: String,
    pub instruction: String,
    pub person_id: Option<String>,
    pub sort_order: i64,
    pub response: String,
    pub response_note: Option<String>,
    pub responded_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectionInput {
    pub kind: String,
    pub instruction: String,
    /// For an additional statement: from whom.
    pub person_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseInput {
    pub response: String,
    pub note: Option<String>,
}

/// Checked before anything is written.
pub fn validate(inputs: &[DirectionInput]) -> Result<(), DomainError> {
    for input in inputs {
        if !KINDS.contains(&input.kind.as_str()) {
            return invalid("That is not a kind of direction.");
        }
        if input.instruction.trim().is_empty() {
            return invalid("Every direction needs its instruction written out.");
        }
    }
    Ok(())
}

pub async fn insert_for_decision(
    tx: &mut SqliteConnection,
    file_id: &str,
    decision_id: &str,
    inputs: &[DirectionInput],
) -> Result<(), sqlx::Error> {
    for (order, input) in inputs.iter().enumerate() {
        sqlx::query(
            "INSERT INTO directions (id, prosecution_file_id, decision_id, kind, instruction, person_id, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(file_id)
        .bind(decision_id)
        .bind(&input.kind)
        .bind(input.instruction.trim())
        .bind(clean(input.person_id.clone()))
        .bind(order as i64)
        .execute(&mut *tx)
        .await?;
    }
    Ok(())
}

pub async fn list_for_file(pool: &SqlitePool, file_id: &str) -> Result<Vec<Direction>, sqlx::Error> {
    sqlx::query_as::<_, Direction>(
        "SELECT dr.* FROM directions dr JOIN decisions d ON d.id = dr.decision_id
          WHERE dr.prosecution_file_id = ? ORDER BY d.decided_at ASC, dr.sort_order ASC, dr.rowid ASC",
    )
    .bind(file_id)
    .fetch_all(pool)
    .await
}

/// Records whether Police did what a direction asked. Only once the file has
/// come back after the return that carried the direction.
pub async fn set_response(pool: &SqlitePool, id: &str, input: ResponseInput) -> Result<Direction, DomainError> {
    if !RESPONSES.contains(&input.response.as_str()) {
        return invalid("A direction is met, not met, or still open.");
    }
    let (file_id, returned_at): (String, i64) = sqlx::query_as(
        "SELECT dr.prosecution_file_id, d.decided_at FROM directions dr JOIN decisions d ON d.id = dr.decision_id WHERE dr.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| DomainError::NotFound("Direction not found.".to_string()))?;

    let came_back: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM referrals WHERE prosecution_file_id = ? AND is_resubmission = 1 AND received_at >= ?",
    )
    .bind(&file_id)
    .bind(returned_at)
    .fetch_one(pool)
    .await?;
    if came_back == 0 {
        return invalid("The file has not come back from Police yet, so there is nothing to record against this direction.");
    }

    let now = chrono::Utc::now().timestamp_millis();
    let open = input.response == "open";
    sqlx::query("UPDATE directions SET response = ?, response_note = ?, responded_at = ? WHERE id = ?")
        .bind(&input.response)
        .bind(if open { None } else { clean(input.note) })
        .bind(if open { None } else { Some(now) })
        .bind(id)
        .execute(pool)
        .await?;
    Ok(sqlx::query_as::<_, Direction>("SELECT * FROM directions WHERE id = ?").bind(id).fetch_one(pool).await?)
}
