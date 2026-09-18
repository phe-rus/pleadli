use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::Actor;

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

pub async fn create_property_record(conn: &mut SqliteConnection, actor: &Actor, input: CreatePropertyRecordInput) -> Result<PropertyRecord, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO property_records (id, prisoner_id, description, recorded_at) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(&input.prisoner_id)
        .bind(&input.description)
        .bind(input.recorded_at)
        .execute(&mut *conn)
        .await?;

    let record = sqlx::query_as::<_, PropertyRecord>("SELECT * FROM property_records WHERE id = ?")
        .bind(&id)
        .fetch_one(&mut *conn)
        .await?;
    audit::record(conn, actor, AuditEntry::new("property.take", "property_record", Some(&id)).after(&record)).await?;
    Ok(record)
}

pub async fn mark_returned(conn: &mut SqliteConnection, actor: &Actor, id: &str, input: ReturnPropertyRecordInput) -> Result<PropertyRecord, sqlx::Error> {
    let before = sqlx::query_as::<_, PropertyRecord>("SELECT * FROM property_records WHERE id = ?")
        .bind(id)
        .fetch_one(&mut *conn)
        .await?;
    sqlx::query("UPDATE property_records SET returned_at = ?, returned_note = ? WHERE id = ?")
        .bind(input.returned_at)
        .bind(&input.returned_note)
        .bind(id)
        .execute(&mut *conn)
        .await?;

    let after = sqlx::query_as::<_, PropertyRecord>("SELECT * FROM property_records WHERE id = ?")
        .bind(id)
        .fetch_one(&mut *conn)
        .await?;
    audit::record(conn, actor, AuditEntry::new("property.return", "property_record", Some(id)).before(&before).after(&after)).await?;
    Ok(after)
}

pub async fn list_for_prisoner(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<PropertyRecord>, sqlx::Error> {
    sqlx::query_as::<_, PropertyRecord>("SELECT * FROM property_records WHERE prisoner_id = ? ORDER BY recorded_at DESC")
        .bind(prisoner_id)
        .fetch_all(pool)
        .await
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PropertyRecordSearchRow {
    pub id: String,
    pub prisoner_id: String,
    pub first_name: String,
    pub last_name: String,
    pub description: String,
    pub recorded_at: i64,
}

pub async fn search(pool: &SqlitePool, query: &str) -> Result<Vec<PropertyRecordSearchRow>, sqlx::Error> {
    let like = format!("%{query}%");
    sqlx::query_as::<_, PropertyRecordSearchRow>(
        "SELECT pr.id, pr.prisoner_id, p.first_name, p.last_name, pr.description, pr.recorded_at
         FROM property_records pr JOIN prisoners p ON p.id = pr.prisoner_id
         WHERE pr.description LIKE ?1 OR p.first_name LIKE ?1 OR p.last_name LIKE ?1 OR p.other_names LIKE ?1
         ORDER BY pr.recorded_at DESC LIMIT 200",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}
