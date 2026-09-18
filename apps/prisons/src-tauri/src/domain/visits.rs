use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::Actor;

/// Real, grounded procedure (docs/prisons/RESEARCH.md §9-11, secondary-
/// sourced via Justice Centres Uganda): gate identification/search,
/// reception registration, supervised visit. Upgraded from a plain log to
/// authorization + attendance as two distinct concepts (docs/prisons/
/// PRODUCT.md) — `visit_type` is a free-text tag whose real, grounded
/// values are enumerated in the frontend's `features/visits/schema.ts`
/// (ordinary, legal_advisor s.64(3), personal_doctor, voluntary_visitor,
/// and special_authorization split into weekend/researcher tiers), and
/// `status` separates "authorized" from "actually happened."
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Visit {
    pub id: String,
    pub prisoner_id: String,
    pub visitor_name: String,
    pub visitor_identification: Option<String>,
    pub visited_at: i64,
    pub supervising_officer: Option<String>,
    pub notes: Option<String>,
    pub visit_type: String,
    pub status: String,
    pub authorized_by: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVisitInput {
    pub prisoner_id: String,
    pub visitor_name: String,
    pub visitor_identification: Option<String>,
    pub visited_at: i64,
    pub supervising_officer: Option<String>,
    pub notes: Option<String>,
    pub visit_type: String,
    pub status: String,
    pub authorized_by: Option<String>,
}

pub async fn create_visit(conn: &mut SqliteConnection, actor: &Actor, input: CreateVisitInput) -> Result<Visit, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO visits (id, prisoner_id, visitor_name, visitor_identification, visited_at, supervising_officer, notes, visit_type, status, authorized_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prisoner_id)
    .bind(&input.visitor_name)
    .bind(&input.visitor_identification)
    .bind(input.visited_at)
    .bind(&input.supervising_officer)
    .bind(&input.notes)
    .bind(&input.visit_type)
    .bind(&input.status)
    .bind(&input.authorized_by)
    .execute(&mut *conn)
    .await?;

    let visit = sqlx::query_as::<_, Visit>("SELECT * FROM visits WHERE id = ?").bind(&id).fetch_one(&mut *conn).await?;
    audit::record(conn, actor, AuditEntry::new("visit.record", "visit", Some(&id)).after(&visit)).await?;
    Ok(visit)
}

pub async fn list_for_prisoner(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<Visit>, sqlx::Error> {
    sqlx::query_as::<_, Visit>("SELECT * FROM visits WHERE prisoner_id = ? ORDER BY visited_at DESC")
        .bind(prisoner_id)
        .fetch_all(pool)
        .await
}

/// A visit joined with its prisoner's name — the shape of the facility-wide
/// visit log (docs/prisons/navigation.md §4.5), as opposed to the
/// per-prisoner `Visit` list. Authorization and attendance stay two
/// concepts (`status`), exactly as they are per-prisoner.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct VisitListItem {
    pub id: String,
    pub prisoner_id: String,
    pub prisoner_first_name: String,
    pub prisoner_last_name: String,
    pub prisoner_other_names: Option<String>,
    pub visitor_name: String,
    pub visitor_identification: Option<String>,
    pub visited_at: i64,
    pub supervising_officer: Option<String>,
    pub notes: Option<String>,
    pub visit_type: String,
    pub status: String,
    pub authorized_by: Option<String>,
    pub created_at: i64,
}

/// The whole facility's visit ledger, newest first. An optional search term
/// matches the visitor and their identification, or the prisoner's names.
/// An empty query is the whole log: the page's own table search filters
/// client side, matching how the s.118 remand list already behaves.
pub async fn list_all(pool: &SqlitePool, query: &str) -> Result<Vec<VisitListItem>, sqlx::Error> {
    if query.trim().is_empty() {
        return sqlx::query_as::<_, VisitListItem>(
            "SELECT v.*, p.first_name AS prisoner_first_name, p.last_name AS prisoner_last_name, p.other_names AS prisoner_other_names
             FROM visits v
             JOIN prisoners p ON p.id = v.prisoner_id
             ORDER BY v.visited_at DESC",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{query}%");
    sqlx::query_as::<_, VisitListItem>(
        "SELECT v.*, p.first_name AS prisoner_first_name, p.last_name AS prisoner_last_name, p.other_names AS prisoner_other_names
         FROM visits v
         JOIN prisoners p ON p.id = v.prisoner_id
         WHERE v.visitor_name LIKE ?1
            OR v.visitor_identification LIKE ?1
            OR p.first_name LIKE ?1
            OR p.last_name LIKE ?1
            OR p.other_names LIKE ?1
         ORDER BY v.visited_at DESC
         LIMIT 200",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct VisitSearchRow {
    pub id: String,
    pub prisoner_id: String,
    pub first_name: String,
    pub last_name: String,
    pub visitor_name: String,
    pub visitor_identification: Option<String>,
    pub visit_type: String,
    pub visited_at: i64,
}

pub async fn search(pool: &SqlitePool, query: &str) -> Result<Vec<VisitSearchRow>, sqlx::Error> {
    let like = format!("%{query}%");
    sqlx::query_as::<_, VisitSearchRow>(
        "SELECT v.id, v.prisoner_id, p.first_name, p.last_name, v.visitor_name, v.visitor_identification, v.visit_type, v.visited_at
         FROM visits v JOIN prisoners p ON p.id = v.prisoner_id
         WHERE v.visitor_name LIKE ?1 OR v.visitor_identification LIKE ?1 OR p.first_name LIKE ?1 OR p.last_name LIKE ?1 OR p.other_names LIKE ?1
         ORDER BY v.visited_at DESC LIMIT 200",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}
