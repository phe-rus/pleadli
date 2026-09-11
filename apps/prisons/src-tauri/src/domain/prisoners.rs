use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

/// The core record (docs/prisons/PRODUCT.md §1). "Prisoner" is the Prisons
/// Act's own term (s.2); a Prisoner record IS the person here — unlike
/// Police/DPP, there is deliberately no separate cross-cutting People
/// domain (see PRODUCT.md's People section).
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Prisoner {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub other_names: Option<String>,
    pub national_id: Option<String>,
    pub reference: Option<String>,
    pub status: String,
    pub admission_instrument_type: String,
    pub admission_authority: Option<String>,
    pub admitted_at: i64,
    pub current_status: String,
    pub high_court_only_offence: bool,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePrisonerInput {
    pub first_name: String,
    pub last_name: String,
    pub other_names: Option<String>,
    pub national_id: Option<String>,
    pub reference: Option<String>,
    pub status: String,
    pub admission_instrument_type: String,
    pub admission_authority: Option<String>,
    pub admitted_at: i64,
    pub high_court_only_offence: bool,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePrisonerInput {
    pub first_name: String,
    pub last_name: String,
    pub other_names: Option<String>,
    pub national_id: Option<String>,
    pub reference: Option<String>,
    pub status: String,
    pub high_court_only_offence: bool,
    pub notes: Option<String>,
}

pub async fn create_prisoner(pool: &SqlitePool, input: CreatePrisonerInput) -> Result<Prisoner, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO prisoners
            (id, first_name, last_name, other_names, national_id, reference, status,
             admission_instrument_type, admission_authority, admitted_at, high_court_only_offence, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.first_name)
    .bind(&input.last_name)
    .bind(&input.other_names)
    .bind(&input.national_id)
    .bind(&input.reference)
    .bind(&input.status)
    .bind(&input.admission_instrument_type)
    .bind(&input.admission_authority)
    .bind(input.admitted_at)
    .bind(input.high_court_only_offence)
    .bind(&input.notes)
    .execute(pool)
    .await?;

    get_prisoner(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn update_prisoner(pool: &SqlitePool, id: &str, input: UpdatePrisonerInput) -> Result<Prisoner, sqlx::Error> {
    sqlx::query(
        "UPDATE prisoners
         SET first_name = ?, last_name = ?, other_names = ?, national_id = ?, reference = ?,
             status = ?, high_court_only_offence = ?, notes = ?
         WHERE id = ?",
    )
    .bind(&input.first_name)
    .bind(&input.last_name)
    .bind(&input.other_names)
    .bind(&input.national_id)
    .bind(&input.reference)
    .bind(&input.status)
    .bind(input.high_court_only_offence)
    .bind(&input.notes)
    .bind(id)
    .execute(pool)
    .await?;

    get_prisoner(pool, id).await?.ok_or(sqlx::Error::RowNotFound)
}

/// Applies a release's effect on the cached custody status — mirrors DPP's
/// `status_for_decision`. Every release type moves a prisoner out of
/// custody except the one correction type (s.79 erroneous-release
/// re-arrest), which moves them back in.
pub(crate) fn status_for_release(release_type: &str) -> &'static str {
    match release_type {
        "erroneous_release_correction" => "in_custody",
        _ => "released",
    }
}

pub(crate) async fn set_status(pool: &SqlitePool, id: &str, status: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE prisoners SET current_status = ? WHERE id = ?")
        .bind(status)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_prisoners(pool: &SqlitePool, query: &str) -> Result<Vec<Prisoner>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, Prisoner>("SELECT * FROM prisoners ORDER BY admitted_at DESC LIMIT 200")
            .fetch_all(pool)
            .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, Prisoner>(
        "SELECT * FROM prisoners
         WHERE first_name LIKE ?1 OR last_name LIKE ?1 OR other_names LIKE ?1
            OR national_id LIKE ?1 OR reference LIKE ?1
         ORDER BY admitted_at DESC LIMIT 200",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

/// In-custody prisoners, oldest admission first — the base population this
/// installation is actually responsible for right now.
pub async fn list_in_custody(pool: &SqlitePool) -> Result<Vec<Prisoner>, sqlx::Error> {
    sqlx::query_as::<_, Prisoner>(
        "SELECT * FROM prisoners WHERE current_status = 'in_custody' ORDER BY admitted_at ASC",
    )
    .fetch_all(pool)
    .await
}

pub async fn get_prisoner(pool: &SqlitePool, id: &str) -> Result<Option<Prisoner>, sqlx::Error> {
    sqlx::query_as::<_, Prisoner>("SELECT * FROM prisoners WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
}

#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prisoners").fetch_one(pool).await?;
    if count > 0 {
        return Ok(());
    }

    create_prisoner(
        pool,
        CreatePrisonerInput {
            first_name: "Moses".to_string(),
            last_name: "Kintu".to_string(),
            other_names: None,
            national_id: Some("CM88012345ABCDE".to_string()),
            reference: None,
            status: "unconvicted".to_string(),
            admission_instrument_type: "remand_warrant".to_string(),
            admission_authority: Some("Jinja Chief Magistrate's Court".to_string()),
            admitted_at: chrono::Utc::now().timestamp_millis() - 86_400_000 * 45,
            high_court_only_offence: true,
            notes: None,
        },
    )
    .await?;

    Ok(())
}
