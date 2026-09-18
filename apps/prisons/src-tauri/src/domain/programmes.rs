use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

/// Rehabilitation & Work Programmes (docs/prisons/PRODUCT.md) — a
/// prisoner's participation in a named programme, not a calendar or
/// output/quota tracker (RESEARCH.md §10 found no such system).
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ProgrammeParticipation {
    pub id: String,
    pub prisoner_id: String,
    pub category: String,
    pub programme_name: String,
    pub status: String,
    pub started_at: i64,
    pub notes: Option<String>,
    pub completed_at: Option<i64>,
    pub certificate_reference: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProgrammeParticipationInput {
    pub prisoner_id: String,
    pub category: String,
    pub programme_name: String,
    pub status: String,
    pub started_at: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifyProgrammeParticipationInput {
    pub completed_at: i64,
    pub certificate_reference: Option<String>,
}

pub async fn create_participation(pool: &SqlitePool, input: CreateProgrammeParticipationInput) -> Result<ProgrammeParticipation, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO programme_participations (id, prisoner_id, category, programme_name, status, started_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prisoner_id)
    .bind(&input.category)
    .bind(&input.programme_name)
    .bind(&input.status)
    .bind(input.started_at)
    .bind(&input.notes)
    .execute(pool)
    .await?;

    sqlx::query_as::<_, ProgrammeParticipation>("SELECT * FROM programme_participations WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await
}

pub async fn certify_participation(
    pool: &SqlitePool,
    id: &str,
    input: CertifyProgrammeParticipationInput,
) -> Result<ProgrammeParticipation, sqlx::Error> {
    sqlx::query("UPDATE programme_participations SET completed_at = ?, certificate_reference = ?, status = 'completed' WHERE id = ?")
        .bind(input.completed_at)
        .bind(&input.certificate_reference)
        .bind(id)
        .execute(pool)
        .await?;

    sqlx::query_as::<_, ProgrammeParticipation>("SELECT * FROM programme_participations WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
}

pub async fn list_for_prisoner(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<ProgrammeParticipation>, sqlx::Error> {
    sqlx::query_as::<_, ProgrammeParticipation>("SELECT * FROM programme_participations WHERE prisoner_id = ? ORDER BY started_at DESC")
        .bind(prisoner_id)
        .fetch_all(pool)
        .await
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ProgrammeParticipationSearchRow {
    pub id: String,
    pub prisoner_id: String,
    pub first_name: String,
    pub last_name: String,
    pub programme_name: String,
    pub certificate_reference: Option<String>,
    pub started_at: i64,
}

pub async fn search(pool: &SqlitePool, query: &str) -> Result<Vec<ProgrammeParticipationSearchRow>, sqlx::Error> {
    let like = format!("%{query}%");
    sqlx::query_as::<_, ProgrammeParticipationSearchRow>(
        "SELECT pp.id, pp.prisoner_id, p.first_name, p.last_name, pp.programme_name, pp.certificate_reference, pp.started_at
         FROM programme_participations pp JOIN prisoners p ON p.id = pp.prisoner_id
         WHERE pp.programme_name LIKE ?1 OR pp.certificate_reference LIKE ?1 OR p.first_name LIKE ?1 OR p.last_name LIKE ?1 OR p.other_names LIKE ?1
         ORDER BY pp.started_at DESC LIMIT 200",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}
