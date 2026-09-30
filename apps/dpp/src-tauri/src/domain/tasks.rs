//! The Board: the office's tasks, each in one of five columns. A task can
//! belong to a file or stand alone. Assist may propose tasks; a proposal is
//! only a suggestion until a person keeps it (`proposed = 0`).

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::error::{clean, invalid, DomainError};

pub const STATUSES: &[&str] = &["todo", "doing", "waiting_police", "waiting_court", "done"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub prosecution_file_id: Option<String>,
    pub title: String,
    pub note: Option<String>,
    pub status: String,
    pub due_at: Option<i64>,
    pub assigned_to: Option<String>,
    pub position: f64,
    pub source: String,
    pub proposed: bool,
    pub created_by: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub done_at: Option<i64>,
    /// Joined for display: the file's title and reference, the assignee's name.
    pub file_title: Option<String>,
    pub file_reference: Option<String>,
    pub assignee_name: Option<String>,
}

const SELECT: &str = "SELECT t.*, f.title AS file_title, COALESCE(f.odpp_registration_number, f.police_reference) AS file_reference, s.name AS assignee_name
    FROM tasks t LEFT JOIN prosecution_files f ON f.id = t.prosecution_file_id LEFT JOIN staff s ON s.id = t.assigned_to";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskInput {
    pub prosecution_file_id: Option<String>,
    pub title: String,
    pub note: Option<String>,
    pub status: Option<String>,
    pub due_at: Option<i64>,
    pub assigned_to: Option<String>,
    #[serde(default)]
    pub proposed: bool,
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskInput {
    pub title: Option<String>,
    pub note: Option<Option<String>>,
    pub status: Option<String>,
    pub due_at: Option<Option<i64>>,
    pub assigned_to: Option<Option<String>>,
    pub position: Option<f64>,
    /// Keep a proposal: it becomes an ordinary task.
    pub keep: Option<bool>,
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Task, DomainError> {
    Ok(sqlx::query_as::<_, Task>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE t.id = ?"))).bind(id).fetch_one(pool).await?)
}

/// Every task, or one file's. Done tasks older than 30 days drop off the board.
pub async fn list(pool: &SqlitePool, file_id: Option<&str>) -> Result<Vec<Task>, sqlx::Error> {
    let cutoff = now() - 30 * 86_400_000;
    match file_id {
        Some(id) => {
            sqlx::query_as::<_, Task>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE t.prosecution_file_id = ? ORDER BY t.status, t.position, t.created_at")))
                .bind(id)
                .fetch_all(pool)
                .await
        }
        None => {
            sqlx::query_as::<_, Task>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE t.status != 'done' OR t.done_at > ? ORDER BY t.position, t.created_at")))
                .bind(cutoff)
                .fetch_all(pool)
                .await
        }
    }
}

pub async fn create(pool: &SqlitePool, input: CreateTaskInput, actor: Option<&str>) -> Result<Task, DomainError> {
    let title = input.title.trim();
    if title.is_empty() {
        return invalid("A task needs a title.");
    }
    let status = input.status.unwrap_or_else(|| "todo".to_string());
    if !STATUSES.contains(&status.as_str()) {
        return invalid("That is not a column on the board.");
    }
    let source = input.source.unwrap_or_else(|| if input.proposed { "assist".into() } else { "person".into() });
    if !["person", "assist", "direction"].contains(&source.as_str()) {
        return invalid("Unknown task source.");
    }
    let position: f64 = sqlx::query_scalar("SELECT CAST(COALESCE(MAX(position), 0) + 1 AS REAL) FROM tasks WHERE status = ?")
        .bind(&status)
        .fetch_one(pool)
        .await?;
    let id = Uuid::new_v4().to_string();
    let t = now();
    sqlx::query(
        "INSERT INTO tasks (id, prosecution_file_id, title, note, status, due_at, assigned_to, position, source, proposed, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(clean(input.prosecution_file_id))
    .bind(title)
    .bind(clean(input.note))
    .bind(&status)
    .bind(input.due_at)
    .bind(clean(input.assigned_to))
    .bind(position)
    .bind(&source)
    .bind(input.proposed)
    .bind(actor)
    .bind(t)
    .bind(t)
    .execute(pool)
    .await?;
    get(pool, &id).await
}

pub async fn update(pool: &SqlitePool, id: &str, input: UpdateTaskInput) -> Result<Task, DomainError> {
    let current = get(pool, id).await?;
    let title = match input.title {
        Some(t) if t.trim().is_empty() => return invalid("A task needs a title."),
        Some(t) => t.trim().to_string(),
        None => current.title,
    };
    let status = input.status.unwrap_or(current.status.clone());
    if !STATUSES.contains(&status.as_str()) {
        return invalid("That is not a column on the board.");
    }
    let done_at = if status == "done" { current.done_at.or(Some(now())) } else { None };
    let proposed = if input.keep == Some(true) { false } else { current.proposed };
    sqlx::query("UPDATE tasks SET title = ?, note = ?, status = ?, due_at = ?, assigned_to = ?, position = ?, proposed = ?, done_at = ?, updated_at = ? WHERE id = ?")
        .bind(title)
        .bind(input.note.map(clean).unwrap_or(current.note))
        .bind(&status)
        .bind(input.due_at.unwrap_or(current.due_at))
        .bind(input.assigned_to.map(clean).unwrap_or(current.assigned_to))
        .bind(input.position.unwrap_or(current.position))
        .bind(proposed)
        .bind(done_at)
        .bind(now())
        .bind(id)
        .execute(pool)
        .await?;
    get(pool, id).await
}

pub async fn delete(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let found = sqlx::query("DELETE FROM tasks WHERE id = ?").bind(id).execute(pool).await?.rows_affected();
    if found == 0 {
        return Err(DomainError::NotFound("Task not found.".into()));
    }
    Ok(())
}
