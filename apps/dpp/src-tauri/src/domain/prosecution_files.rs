use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

/// The core DPP record (docs/dpp/PRODUCT.md §1). See migrations/0002 for the
/// research grounding behind the three separate reference-number columns
/// and the cached `current_status`.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ProsecutionFile {
    pub id: String,
    pub odpp_registration_number: Option<String>,
    pub title: String,
    pub police_station: Option<String>,
    pub police_reference: Option<String>,
    pub court_case_number: Option<String>,
    pub current_status: String,
    pub received_at: i64,
    pub notes: Option<String>,
    pub created_at: i64,
}

/// Creating a file always logs the intake referral event alongside it
/// (docs/dpp/PRODUCT.md §Intake & Referrals: "creates or updates a
/// Prosecution File") — `material_summary` describes what accompanied the
/// police file, not a field of the file itself.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProsecutionFileInput {
    pub odpp_registration_number: Option<String>,
    pub title: String,
    pub police_station: Option<String>,
    pub police_reference: Option<String>,
    pub received_at: i64,
    pub material_summary: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProsecutionFileInput {
    pub odpp_registration_number: Option<String>,
    pub title: String,
    pub police_station: Option<String>,
    pub police_reference: Option<String>,
    pub court_case_number: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ProsecutionFilePerson {
    pub id: String,
    pub prosecution_file_id: String,
    pub person_id: String,
    pub role: String,
    pub created_at: i64,
    pub person_first_name: String,
    pub person_last_name: String,
    pub person_other_names: Option<String>,
}

pub async fn create_prosecution_file(
    pool: &SqlitePool,
    input: CreateProsecutionFileInput,
) -> Result<ProsecutionFile, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO prosecution_files
            (id, odpp_registration_number, title, police_station, police_reference, received_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.odpp_registration_number)
    .bind(&input.title)
    .bind(&input.police_station)
    .bind(&input.police_reference)
    .bind(input.received_at)
    .bind(&input.notes)
    .execute(&mut *tx)
    .await?;

    let referral_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO referrals
            (id, prosecution_file_id, police_station, police_reference, received_at, material_summary, is_resubmission)
         VALUES (?, ?, ?, ?, ?, ?, 0)",
    )
    .bind(&referral_id)
    .bind(&id)
    .bind(&input.police_station)
    .bind(&input.police_reference)
    .bind(input.received_at)
    .bind(&input.material_summary)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_prosecution_file(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn update_prosecution_file(
    pool: &SqlitePool,
    id: &str,
    input: UpdateProsecutionFileInput,
) -> Result<ProsecutionFile, sqlx::Error> {
    sqlx::query(
        "UPDATE prosecution_files
         SET odpp_registration_number = ?, title = ?, police_station = ?, police_reference = ?,
             court_case_number = ?, notes = ?
         WHERE id = ?",
    )
    .bind(&input.odpp_registration_number)
    .bind(&input.title)
    .bind(&input.police_station)
    .bind(&input.police_reference)
    .bind(&input.court_case_number)
    .bind(&input.notes)
    .bind(id)
    .execute(pool)
    .await?;

    get_prosecution_file(pool, id).await?.ok_or(sqlx::Error::RowNotFound)
}

/// Applies a decision's effect on the cached status — see docs/dpp/PRODUCT.md
/// §Decisions & Reviews for the confirmed decision-type set this mirrors.
/// `None` means the decision is real but doesn't change the file's
/// coarse queue bucket (e.g. a venue decision or a charge amendment).
pub(crate) fn status_for_decision(decision_type: &str) -> Option<&'static str> {
    match decision_type {
        "sanction" | "threshold_charge" => Some("sanctioned"),
        "decline" => Some("declined"),
        "divert" => Some("diverted"),
        "return_for_investigation" => Some("returned_for_investigation"),
        "take_over" => Some("taken_over"),
        "discontinue" | "nolle_prosequi" => Some("discontinued"),
        "plea_bargain_accepted" => Some("plea_bargained"),
        _ => None,
    }
}

pub(crate) async fn set_status(pool: &SqlitePool, id: &str, status: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE prosecution_files SET current_status = ? WHERE id = ?")
        .bind(status)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_prosecution_files(pool: &SqlitePool, query: &str) -> Result<Vec<ProsecutionFile>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, ProsecutionFile>(
            "SELECT * FROM prosecution_files ORDER BY received_at DESC LIMIT 100",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, ProsecutionFile>(
        "SELECT * FROM prosecution_files
         WHERE title LIKE ?1 OR odpp_registration_number LIKE ?1
            OR police_reference LIKE ?1 OR court_case_number LIKE ?1
         ORDER BY received_at DESC LIMIT 100",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

/// Files awaiting an initial charging decision — the Intake queue
/// (docs/dpp/PRODUCT.md §Work Queues), oldest referral first.
pub async fn list_intake_queue(pool: &SqlitePool) -> Result<Vec<ProsecutionFile>, sqlx::Error> {
    sqlx::query_as::<_, ProsecutionFile>(
        "SELECT * FROM prosecution_files
         WHERE current_status IN ('under_review', 'returned_for_investigation')
         ORDER BY received_at ASC",
    )
    .fetch_all(pool)
    .await
}

pub async fn get_prosecution_file(pool: &SqlitePool, id: &str) -> Result<Option<ProsecutionFile>, sqlx::Error> {
    sqlx::query_as::<_, ProsecutionFile>("SELECT * FROM prosecution_files WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn link_person(
    pool: &SqlitePool,
    prosecution_file_id: &str,
    person_id: &str,
    role: &str,
) -> Result<ProsecutionFilePerson, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO prosecution_file_people (id, prosecution_file_id, person_id, role)
         VALUES (?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(prosecution_file_id)
    .bind(person_id)
    .bind(role)
    .execute(pool)
    .await?;

    sqlx::query_as::<_, ProsecutionFilePerson>(
        "SELECT fp.id, fp.prosecution_file_id, fp.person_id, fp.role, fp.created_at,
                p.first_name AS person_first_name, p.last_name AS person_last_name,
                p.other_names AS person_other_names
         FROM prosecution_file_people fp
         JOIN people p ON p.id = fp.person_id
         WHERE fp.id = ?",
    )
    .bind(&id)
    .fetch_one(pool)
    .await
}

pub async fn unlink_person(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM prosecution_file_people WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_file_people(pool: &SqlitePool, prosecution_file_id: &str) -> Result<Vec<ProsecutionFilePerson>, sqlx::Error> {
    sqlx::query_as::<_, ProsecutionFilePerson>(
        "SELECT fp.id, fp.prosecution_file_id, fp.person_id, fp.role, fp.created_at,
                p.first_name AS person_first_name, p.last_name AS person_last_name,
                p.other_names AS person_other_names
         FROM prosecution_file_people fp
         JOIN people p ON p.id = fp.person_id
         WHERE fp.prosecution_file_id = ?
         ORDER BY fp.created_at ASC",
    )
    .bind(prosecution_file_id)
    .fetch_all(pool)
    .await
}

#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prosecution_files")
        .fetch_one(pool)
        .await?;
    if count > 0 {
        return Ok(());
    }

    let people_ids: Vec<String> = sqlx::query_scalar("SELECT id FROM people ORDER BY created_at ASC")
        .fetch_all(pool)
        .await?;

    let file = create_prosecution_file(
        pool,
        CreateProsecutionFileInput {
            odpp_registration_number: Some("ODPP/KLA/0142/2026".to_string()),
            title: "State vs. Okello — theft of motor vehicle".to_string(),
            police_station: Some("Kira Road Police Station".to_string()),
            police_reference: Some("CRB 221/2026".to_string()),
            received_at: chrono::Utc::now().timestamp_millis() - 86_400_000 * 3,
            material_summary: Some(
                "Charge sheet (draft), 2 witness statements, arresting officer statement, vehicle recovery photos"
                    .to_string(),
            ),
            notes: None,
        },
    )
    .await?;

    if let Some(accused) = people_ids.get(1) {
        link_person(pool, &file.id, accused, "accused").await?;
    }
    if let Some(complainant) = people_ids.first() {
        link_person(pool, &file.id, complainant, "complainant").await?;
    }

    Ok(())
}
