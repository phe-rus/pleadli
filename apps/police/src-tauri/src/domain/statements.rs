use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::{attachments, markdown};

/// `officer_name` is a plain field, not a real identity reference — same
/// reasoning as duty::DutyAssignment: there's no auth yet, so "who took it"
/// can only ever be a denormalized name, not a verified identity. Revisit
/// once real officer auth exists.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Statement {
    pub id: String,
    pub content: String,
    pub person_id: String,
    pub person_first_name: String,
    pub person_last_name: String,
    pub person_other_names: Option<String>,
    pub case_id: Option<String>,
    pub case_reference: Option<String>,
    pub officer_name: Option<String>,
    pub given_at: i64,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStatementInput {
    pub content: String,
    pub person_id: String,
    pub case_id: Option<String>,
    pub officer_name: Option<String>,
    pub given_at: i64,
}

pub(crate) async fn write_statement_markdown(pool: &SqlitePool, vault_root: &Path, record: &Statement) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "statement", &record.id).await {
        let title = format!("Statement: {} {}", record.person_first_name, record.person_last_name);
        if let Err(e) = markdown::write_record(&dir, &format!("statement-{}", record.id), &title, record) {
            log::warn!("failed to write statement markdown: {e}");
        }
    }
}

pub async fn create_statement(pool: &SqlitePool, vault_root: &Path, input: CreateStatementInput) -> Result<Statement, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO statements (id, content, person_id, case_id, officer_name, given_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.content)
    .bind(&input.person_id)
    .bind(&input.case_id)
    .bind(&input.officer_name)
    .bind(input.given_at)
    .execute(pool)
    .await?;

    let record = get_statement(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_statement_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn update_statement(
    pool: &SqlitePool,
    vault_root: &Path,
    id: &str,
    input: CreateStatementInput,
) -> Result<Statement, sqlx::Error> {
    sqlx::query(
        "UPDATE statements
         SET content = ?, person_id = ?, case_id = ?, officer_name = ?, given_at = ?
         WHERE id = ?",
    )
    .bind(&input.content)
    .bind(&input.person_id)
    .bind(&input.case_id)
    .bind(&input.officer_name)
    .bind(input.given_at)
    .bind(id)
    .execute(pool)
    .await?;

    let record = get_statement(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_statement_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn list_statements(pool: &SqlitePool, query: &str) -> Result<Vec<Statement>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, Statement>(
            "SELECT
                s.id, s.content, s.person_id, s.case_id, s.officer_name, s.given_at, s.created_at,
                p.first_name AS person_first_name,
                p.last_name AS person_last_name,
                p.other_names AS person_other_names,
                c.reference AS case_reference
             FROM statements s
             JOIN people p ON p.id = s.person_id
             LEFT JOIN cases c ON c.id = s.case_id
             ORDER BY s.given_at DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, Statement>(
        "SELECT
            s.id, s.content, s.person_id, s.case_id, s.officer_name, s.given_at, s.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names,
            c.reference AS case_reference
         FROM statements s
         JOIN people p ON p.id = s.person_id
         LEFT JOIN cases c ON c.id = s.case_id
         WHERE p.first_name LIKE ?1 OR p.last_name LIKE ?1 OR s.officer_name LIKE ?1
         ORDER BY s.given_at DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

/// Every statement, unfiltered and unlimited, for the bulk data export.
pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Statement>, sqlx::Error> {
    sqlx::query_as::<_, Statement>(
        "SELECT
            s.id, s.content, s.person_id, s.case_id, s.officer_name, s.given_at, s.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names,
            c.reference AS case_reference
         FROM statements s
         JOIN people p ON p.id = s.person_id
         LEFT JOIN cases c ON c.id = s.case_id
         ORDER BY s.given_at ASC",
    )
    .fetch_all(pool)
    .await
}

pub async fn list_for_person(pool: &SqlitePool, person_id: &str) -> Result<Vec<Statement>, sqlx::Error> {
    sqlx::query_as::<_, Statement>(
        "SELECT
            s.id, s.content, s.person_id, s.case_id, s.officer_name, s.given_at, s.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names,
            c.reference AS case_reference
         FROM statements s
         JOIN people p ON p.id = s.person_id
         LEFT JOIN cases c ON c.id = s.case_id
         WHERE s.person_id = ?
         ORDER BY s.given_at DESC",
    )
    .bind(person_id)
    .fetch_all(pool)
    .await
}

pub async fn list_for_case(pool: &SqlitePool, case_id: &str) -> Result<Vec<Statement>, sqlx::Error> {
    sqlx::query_as::<_, Statement>(
        "SELECT
            s.id, s.content, s.person_id, s.case_id, s.officer_name, s.given_at, s.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names,
            c.reference AS case_reference
         FROM statements s
         JOIN people p ON p.id = s.person_id
         LEFT JOIN cases c ON c.id = s.case_id
         WHERE s.case_id = ?
         ORDER BY s.given_at DESC",
    )
    .bind(case_id)
    .fetch_all(pool)
    .await
}

pub async fn get_statement(pool: &SqlitePool, id: &str) -> Result<Option<Statement>, sqlx::Error> {
    sqlx::query_as::<_, Statement>(
        "SELECT
            s.id, s.content, s.person_id, s.case_id, s.officer_name, s.given_at, s.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names,
            c.reference AS case_reference
         FROM statements s
         JOIN people p ON p.id = s.person_id
         LEFT JOIN cases c ON c.id = s.case_id
         WHERE s.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool, vault_root: &Path) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM statements")
        .fetch_one(pool)
        .await?;
    if count > 0 {
        return Ok(());
    }

    let person_id: Option<String> = sqlx::query_scalar("SELECT id FROM people ORDER BY created_at LIMIT 1")
        .fetch_optional(pool)
        .await?;
    let case_id: Option<String> = sqlx::query_scalar("SELECT id FROM cases ORDER BY created_at LIMIT 1")
        .fetch_optional(pool)
        .await?;

    let Some(person_id) = person_id else { return Ok(()) };

    create_statement(
        pool,
        vault_root,
        CreateStatementInput {
            content: super::seed_support::plain_text_to_rich_text_json(
                "I was at the shop when I heard glass breaking around 2am. I called the police immediately.",
            ),
            person_id,
            case_id,
            officer_name: Some("Namuli, S.".to_string()),
            given_at: chrono::Utc::now().timestamp_millis(),
        },
    )
    .await?;

    Ok(())
}
