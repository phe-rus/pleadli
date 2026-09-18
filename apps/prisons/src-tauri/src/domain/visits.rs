use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

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

pub async fn create_visit(pool: &SqlitePool, input: CreateVisitInput) -> Result<Visit, sqlx::Error> {
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
    .execute(pool)
    .await?;

    sqlx::query_as::<_, Visit>("SELECT * FROM visits WHERE id = ?").bind(&id).fetch_one(pool).await
}

pub async fn list_for_prisoner(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<Visit>, sqlx::Error> {
    sqlx::query_as::<_, Visit>("SELECT * FROM visits WHERE prisoner_id = ? ORDER BY visited_at DESC")
        .bind(prisoner_id)
        .fetch_all(pool)
        .await
}
