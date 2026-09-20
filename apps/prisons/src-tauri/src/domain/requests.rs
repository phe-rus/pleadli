use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::Actor;

/// Communication & Requests (docs/prisons/PRODUCT.md, RESEARCH.md §11.6) —
/// the Human Rights Committee / "Mukutano" mechanism. A plain complaint
/// log, not a structured multi-stage case-management system, since no
/// source confirms record format beyond this shape. `prisoner_id` is
/// optional since a complaint may be committee-sourced rather than
/// individually attributed.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub id: String,
    pub prisoner_id: Option<String>,
    pub category: String,
    pub description: String,
    pub raised_at: i64,
    pub outcome_note: Option<String>,
    pub resolved_at: Option<i64>,
    pub created_at: i64,
    pub prisoner_first_name: Option<String>,
    pub prisoner_last_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRequestInput {
    pub prisoner_id: Option<String>,
    pub category: String,
    pub description: String,
    pub raised_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveRequestInput {
    pub resolved_at: i64,
    pub outcome_note: Option<String>,
}

pub async fn create_request(conn: &mut SqliteConnection, actor: &Actor, input: CreateRequestInput) -> Result<Request, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO requests (id, prisoner_id, category, description, raised_at) VALUES (?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&input.prisoner_id)
        .bind(&input.category)
        .bind(&input.description)
        .bind(input.raised_at)
        .execute(&mut *conn)
        .await?;

    let request = get_request_conn(conn, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    audit::record(conn, actor, AuditEntry::new("request.log", "request", Some(&id)).after(&request)).await?;
    Ok(request)
}

pub async fn resolve_request(conn: &mut SqliteConnection, actor: &Actor, id: &str, input: ResolveRequestInput) -> Result<Request, sqlx::Error> {
    let before = get_request_conn(conn, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    sqlx::query("UPDATE requests SET resolved_at = ?, outcome_note = ? WHERE id = ?")
        .bind(input.resolved_at)
        .bind(&input.outcome_note)
        .bind(id)
        .execute(&mut *conn)
        .await?;

    let after = get_request_conn(conn, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    audit::record(conn, actor, AuditEntry::new("request.resolve", "request", Some(id)).before(&before).after(&after)).await?;
    Ok(after)
}

async fn get_request_conn(conn: &mut SqliteConnection, id: &str) -> Result<Option<Request>, sqlx::Error> {
    sqlx::query_as::<_, Request>(
        "SELECT r.*, p.first_name AS prisoner_first_name, p.last_name AS prisoner_last_name
         FROM requests r LEFT JOIN prisoners p ON p.id = r.prisoner_id WHERE r.id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await
}

pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Request>, sqlx::Error> {
    sqlx::query_as::<_, Request>(
        "SELECT r.*, p.first_name AS prisoner_first_name, p.last_name AS prisoner_last_name
         FROM requests r LEFT JOIN prisoners p ON p.id = r.prisoner_id ORDER BY r.raised_at DESC",
    )
    .fetch_all(pool)
    .await
}

pub async fn search(pool: &SqlitePool, query: &str) -> Result<Vec<Request>, sqlx::Error> {
    let like = format!("%{query}%");
    sqlx::query_as::<_, Request>(
        "SELECT r.*, p.first_name AS prisoner_first_name, p.last_name AS prisoner_last_name
         FROM requests r LEFT JOIN prisoners p ON p.id = r.prisoner_id
         WHERE r.category LIKE ?1 OR r.description LIKE ?1 OR p.first_name LIKE ?1 OR p.last_name LIKE ?1
         ORDER BY r.raised_at DESC LIMIT 200",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

pub async fn list_for_prisoner(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<Request>, sqlx::Error> {
    sqlx::query_as::<_, Request>(
        "SELECT r.*, p.first_name AS prisoner_first_name, p.last_name AS prisoner_last_name
         FROM requests r LEFT JOIN prisoners p ON p.id = r.prisoner_id WHERE r.prisoner_id = ? ORDER BY r.raised_at DESC",
    )
    .bind(prisoner_id)
    .fetch_all(pool)
    .await
}
