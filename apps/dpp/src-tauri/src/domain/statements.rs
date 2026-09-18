use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

/// Police Material (received) — Statements (docs/dpp/PRODUCT.md). DPP's own
/// record of a statement legitimately provided with the referral — see
/// migration 0006 for why this isn't a live link into Police's own table.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Statement {
    pub id: String,
    pub prosecution_file_id: String,
    pub person_id: String,
    pub statement_role: String,
    pub content: Option<String>,
    pub given_at: i64,
    pub source_note: Option<String>,
    pub created_at: i64,
    pub person_first_name: String,
    pub person_last_name: String,
    pub person_other_names: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStatementInput {
    pub prosecution_file_id: String,
    pub person_id: String,
    pub statement_role: String,
    pub content: Option<String>,
    pub given_at: i64,
    pub source_note: Option<String>,
}

pub async fn create_statement(pool: &SqlitePool, input: CreateStatementInput) -> Result<Statement, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO statements (id, prosecution_file_id, person_id, statement_role, content, given_at, source_note)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prosecution_file_id)
    .bind(&input.person_id)
    .bind(&input.statement_role)
    .bind(&input.content)
    .bind(input.given_at)
    .bind(&input.source_note)
    .execute(pool)
    .await?;

    get_statement(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn get_statement(pool: &SqlitePool, id: &str) -> Result<Option<Statement>, sqlx::Error> {
    sqlx::query_as::<_, Statement>(
        "SELECT s.*, p.first_name AS person_first_name, p.last_name AS person_last_name, p.other_names AS person_other_names
         FROM statements s JOIN people p ON p.id = s.person_id WHERE s.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn list_for_file(pool: &SqlitePool, prosecution_file_id: &str) -> Result<Vec<Statement>, sqlx::Error> {
    sqlx::query_as::<_, Statement>(
        "SELECT s.*, p.first_name AS person_first_name, p.last_name AS person_last_name, p.other_names AS person_other_names
         FROM statements s JOIN people p ON p.id = s.person_id
         WHERE s.prosecution_file_id = ? ORDER BY s.given_at ASC",
    )
    .bind(prosecution_file_id)
    .fetch_all(pool)
    .await
}
