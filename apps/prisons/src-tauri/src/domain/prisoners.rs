use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::Actor;

/// The core record (docs/prisons/PRODUCT.md §1). "Prisoner" is the Prisons
/// Act's own term (s.2); a Prisoner record IS the person here — unlike
/// Police/DPP, there is deliberately no separate cross-cutting People
/// domain (see PRODUCT.md's People section). `Deserialize` exists for
/// child 3's snapshot payload: `/sync/prisoners` receives the same JSON
/// this struct serializes from the sending facility.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Prisoner {
    pub id: String,
    /// Identifies the custody episode across facilities; a transfer carries
    /// it, a re-arrest starts a new one (docs/prisons/product-map/03 G.1).
    #[serde(default)]
    pub episode_id: Option<String>,
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
    /// Free text, deliberately not a structured Facility/Block/Wing/Cell
    /// hierarchy — see docs/prisons/PRODUCT.md's "Current location"
    /// section; no such hierarchy was verified for Uganda (RESEARCH.md §9).
    pub current_location: Option<String>,
    pub date_of_birth: Option<i64>,
    pub sex: Option<String>,
    pub education_level: Option<String>,
    pub nationality: Option<String>,
    pub offence: Option<String>,
    pub documents_pending: bool,
    pub pending_document_type: Option<String>,
    pub notes: Option<String>,
    pub created_at: i64,
    /// Issued by this facility at admission from its numbering scheme
    /// (domain/numbering.rs). NULL for people admitted before numbering existed.
    #[serde(default)]
    pub prisoner_number: Option<String>,
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
    pub date_of_birth: Option<i64>,
    pub sex: Option<String>,
    pub education_level: Option<String>,
    pub nationality: Option<String>,
    pub offence: Option<String>,
    pub documents_pending: bool,
    pub pending_document_type: Option<String>,
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
    pub current_location: Option<String>,
    pub date_of_birth: Option<i64>,
    pub sex: Option<String>,
    pub education_level: Option<String>,
    pub nationality: Option<String>,
    pub offence: Option<String>,
    pub notes: Option<String>,
}

/// Inserts the prisoner row for a person this facility now holds and returns
/// it. The stay, instruments and everything else that belongs to the
/// procedure causing the admission are the caller's job (reception, or
/// arrival by transfer).
pub(crate) async fn insert_prisoner(
    conn: &mut SqliteConnection,
    actor: &Actor,
    input: CreatePrisonerInput,
    episode_id: &str,
    audit_action: &str,
) -> Result<Prisoner, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    let prisoner_number = super::numbering::next_number(conn).await?;

    sqlx::query(
        "INSERT INTO prisoners
            (id, episode_id, first_name, last_name, other_names, national_id, reference, status,
             admission_instrument_type, admission_authority, admitted_at, high_court_only_offence,
             date_of_birth, sex, education_level, nationality, offence,
             documents_pending, pending_document_type, notes, prisoner_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(episode_id)
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
    .bind(input.date_of_birth)
    .bind(&input.sex)
    .bind(&input.education_level)
    .bind(&input.nationality)
    .bind(&input.offence)
    .bind(input.documents_pending)
    .bind(&input.pending_document_type)
    .bind(&input.notes)
    .bind(&prisoner_number)
    .execute(&mut *conn)
    .await?;

    let prisoner = get_prisoner_conn(conn, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    audit::record(conn, actor, AuditEntry::new(audit_action, "prisoner", Some(&id)).after(&prisoner)).await?;
    Ok(prisoner)
}

/// Development seed only: a prisoner with a stay and a verified instrument,
/// without going through the reception procedure.
#[cfg(debug_assertions)]
pub async fn create_prisoner(conn: &mut SqliteConnection, actor: &Actor, input: CreatePrisonerInput) -> Result<Prisoner, sqlx::Error> {
    let episode_id = Uuid::new_v4().simple().to_string();
    let admitted_at = input.admitted_at;
    let kind = input.admission_instrument_type.clone();
    let authority = input.admission_authority.clone();
    let prisoner = insert_prisoner(conn, actor, input, &episode_id, "custody.admit").await?;
    super::custody::open_stay(conn, &prisoner.id, &episode_id, "reception", admitted_at).await?;
    sqlx::query(
        "INSERT INTO instruments (id, prisoner_id, kind, issuing_authority, received_at, authenticated, status, verified_by)
         VALUES (?, ?, ?, ?, ?, 1, 'verified', 'development seed')",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&prisoner.id)
    .bind(kind)
    .bind(authority)
    .bind(admitted_at)
    .execute(&mut *conn)
    .await?;
    Ok(prisoner)
}

pub async fn update_prisoner(conn: &mut SqliteConnection, actor: &Actor, id: &str, input: UpdatePrisonerInput) -> Result<Prisoner, sqlx::Error> {
    let before = get_prisoner_conn(conn, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    sqlx::query(
        "UPDATE prisoners
         SET first_name = ?, last_name = ?, other_names = ?, national_id = ?, reference = ?,
             status = ?, high_court_only_offence = ?, current_location = ?,
             date_of_birth = ?, sex = ?, education_level = ?, nationality = ?, offence = ?,
             notes = ?
         WHERE id = ?",
    )
    .bind(&input.first_name)
    .bind(&input.last_name)
    .bind(&input.other_names)
    .bind(&input.national_id)
    .bind(&input.reference)
    .bind(&input.status)
    .bind(input.high_court_only_offence)
    .bind(&input.current_location)
    .bind(input.date_of_birth)
    .bind(&input.sex)
    .bind(&input.education_level)
    .bind(&input.nationality)
    .bind(&input.offence)
    .bind(&input.notes)
    .bind(id)
    .execute(&mut *conn)
    .await?;

    let after = get_prisoner_conn(conn, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    audit::record(conn, actor, AuditEntry::new("custody.edit", "prisoner", Some(id)).before(&before).after(&after)).await?;
    Ok(after)
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

/// A change to the cached custody status is its own audit entry, so the
/// trail shows the status moving even when a release or transfer caused it.
pub(crate) async fn set_status(
    conn: &mut SqliteConnection,
    actor: &Actor,
    id: &str,
    status: &str,
    cause: &str,
) -> Result<(), sqlx::Error> {
    let before: String = sqlx::query_scalar("SELECT current_status FROM prisoners WHERE id = ?")
        .bind(id)
        .fetch_one(&mut *conn)
        .await?;
    sqlx::query("UPDATE prisoners SET current_status = ? WHERE id = ?")
        .bind(status)
        .bind(id)
        .execute(&mut *conn)
        .await?;
    audit::record(
        conn,
        actor,
        AuditEntry::new("custody.status_changed", "prisoner", Some(id))
            .before(&serde_json::json!({ "currentStatus": before }))
            .after(&serde_json::json!({ "currentStatus": status }))
            .reason(cause),
    )
    .await
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
            OR national_id LIKE ?1 OR reference LIKE ?1 OR prisoner_number LIKE ?1
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

pub(crate) async fn get_prisoner_conn(conn: &mut SqliteConnection, id: &str) -> Result<Option<Prisoner>, sqlx::Error> {
    sqlx::query_as::<_, Prisoner>("SELECT * FROM prisoners WHERE id = ?")
        .bind(id)
        .fetch_optional(&mut *conn)
        .await
}

/// Development seed. Waits until the installation has been set up: a person
/// admitted before first setup would lock the numbering and the facility code
/// the setup is about to choose, which a real install never has.
#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prisoners").fetch_one(pool).await?;
    let officers: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM officers").fetch_one(pool).await?;
    if count > 0 || officers == 0 {
        return Ok(());
    }

    let mut conn = pool.acquire().await?;
    create_prisoner(
        &mut conn,
        &Actor::system("development seed"),
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
            date_of_birth: Some(chrono::Utc::now().timestamp_millis() - 86_400_000 * 365 * 34),
            sex: Some("male".to_string()),
            education_level: Some("secondary".to_string()),
            nationality: Some("ugandan".to_string()),
            offence: Some("Aggravated robbery".to_string()),
            documents_pending: false,
            pending_document_type: None,
            notes: None,
        },
    )
    .await?;

    Ok(())
}
