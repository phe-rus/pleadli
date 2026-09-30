use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::error::{check_timestamp, clean, invalid, DomainError};

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
    /// The connection to the station that referred it, when it arrived through one.
    pub police_connection_id: Option<String>,
    /// Where it is in the case pipeline (docs/dpp/PIPELINE.md).
    pub stage: String,
    pub stage_changed_at: Option<i64>,
    pub outcome: Option<String>,
    pub concluded_at: Option<i64>,
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
) -> Result<ProsecutionFile, DomainError> {
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return invalid("A file needs a title.");
    }
    check_timestamp(input.received_at, "The date received")?;
    let police_station = clean(input.police_station);
    let police_reference = clean(input.police_reference);

    let id = Uuid::new_v4().to_string();
    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO prosecution_files
            (id, odpp_registration_number, title, police_station, police_reference, received_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(clean(input.odpp_registration_number))
    .bind(&title)
    .bind(&police_station)
    .bind(&police_reference)
    .bind(input.received_at)
    .bind(clean(input.notes))
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
    .bind(&police_station)
    .bind(&police_reference)
    .bind(input.received_at)
    .bind(clean(input.material_summary))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(get_prosecution_file(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn update_prosecution_file(
    pool: &SqlitePool,
    id: &str,
    input: UpdateProsecutionFileInput,
) -> Result<ProsecutionFile, DomainError> {
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return invalid("A file needs a title.");
    }
    let result = sqlx::query(
        "UPDATE prosecution_files
         SET odpp_registration_number = ?, title = ?, police_station = ?, police_reference = ?,
             court_case_number = ?, notes = ?
         WHERE id = ?",
    )
    .bind(clean(input.odpp_registration_number))
    .bind(&title)
    .bind(clean(input.police_station))
    .bind(clean(input.police_reference))
    .bind(clean(input.court_case_number))
    .bind(clean(input.notes))
    .bind(id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(DomainError::NotFound("File not found.".to_string()));
    }

    Ok(get_prosecution_file(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
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

/// What identifies a file to the person holding it: the ODPP number, else the
/// Police reference, else the start of its id.
pub fn reference_of(file: &ProsecutionFile) -> String {
    file.odpp_registration_number
        .clone()
        .or_else(|| file.police_reference.clone())
        .filter(|r| !r.trim().is_empty())
        .unwrap_or_else(|| file.id.chars().take(8).collect())
}

/// The file's status is a cache of its decision history, so it is always
/// recomputed from the record and never set directly.
///
/// A decision covers either the whole file or one count. The effective decision
/// for a count is the latest status-affecting one that covers it, by
/// `decided_at` (not by insertion order, so a back-dated decision cannot
/// overwrite a later one). A file with no counts is decided at file level. With
/// counts, the file's status is the roll-up of its counts: any count with
/// Police outranks everything, then any count still undecided, then any count
/// proceeding to court, and otherwise the latest concluded outcome. A file
/// whose returned decision has been followed by a resubmission is `resubmitted`.
pub(crate) async fn recompute_status(tx: &mut sqlx::SqliteConnection, id: &str) -> Result<&'static str, sqlx::Error> {
    let decisions: Vec<(String, i64, Option<String>)> = sqlx::query_as(
        "SELECT decision_type, decided_at, charge_id FROM decisions
         WHERE prosecution_file_id = ? ORDER BY decided_at ASC, created_at ASC, rowid ASC",
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;
    let charges: Vec<String> = sqlx::query_scalar("SELECT id FROM charges WHERE prosecution_file_id = ?")
        .bind(id)
        .fetch_all(&mut *tx)
        .await?;

    // Latest status-affecting decision covering a count (or the whole file).
    let effective = |charge: Option<&str>| {
        decisions.iter().rev().find_map(|(kind, at, scope)| {
            let covers = match (scope.as_deref(), charge) {
                (None, _) => true,
                (Some(s), Some(c)) => s == c,
                (Some(_), None) => false,
            };
            covers.then(|| status_for_decision(kind).map(|status| (status, *at))).flatten()
        })
    };

    let per_count: Vec<Option<(&'static str, i64)>> = if charges.is_empty() {
        vec![effective(None)]
    } else {
        charges.iter().map(|c| effective(Some(c))).collect()
    };

    let returned_at = per_count.iter().flatten().filter(|(s, _)| *s == "returned_for_investigation").map(|(_, at)| *at).max();
    let status = if let Some(returned_at) = returned_at {
        let resubmitted: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM referrals WHERE prosecution_file_id = ? AND is_resubmission = 1 AND received_at >= ?",
        )
        .bind(id)
        .bind(returned_at)
        .fetch_one(&mut *tx)
        .await?;
        if resubmitted > 0 { "resubmitted" } else { "returned_for_investigation" }
    } else if per_count.iter().any(Option::is_none) {
        "under_review"
    } else {
        let decided: Vec<(&'static str, i64)> = per_count.into_iter().flatten().collect();
        ["sanctioned", "plea_bargained", "taken_over"]
            .into_iter()
            .find(|proceeding| decided.iter().any(|(s, _)| s == proceeding))
            .or_else(|| decided.iter().max_by_key(|(_, at)| *at).map(|(s, _)| *s))
            .unwrap_or("under_review")
    };

    sqlx::query("UPDATE prosecution_files SET current_status = ? WHERE id = ?")
        .bind(status)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    Ok(status)
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

/// A file as a list shows it: the record plus what the work on it amounts to.
/// Everything past `file` is derived from other tables at read time.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FileSummary {
    #[sqlx(flatten)]
    #[serde(flatten)]
    pub file: ProsecutionFile,
    /// When the current wait for a decision began: the latest resubmission,
    /// else the original referral.
    pub awaiting_since: i64,
    pub accused: Option<String>,
    pub review_note_count: i64,
    pub statement_count: i64,
    pub charge_count: i64,
    pub decision_count: i64,
    pub last_decision_type: Option<String>,
    pub last_decision_at: Option<i64>,
    pub last_activity_at: i64,
    pub open_review_id: Option<String>,
    pub open_review_standard: Option<String>,
    /// The open review is reopening a concluded file.
    pub reopened: bool,
    pub directions_total: i64,
    pub directions_open: i64,
}

const SUMMARY_SELECT: &str = "SELECT f.*,
    COALESCE((SELECT MAX(r.received_at) FROM referrals r
              WHERE r.prosecution_file_id = f.id AND r.is_resubmission = 1), f.received_at) AS awaiting_since,
    (SELECT group_concat(p.first_name || ' ' || p.last_name, ', ')
       FROM prosecution_file_people fp JOIN people p ON p.id = fp.person_id
      WHERE fp.prosecution_file_id = f.id AND fp.role = 'accused') AS accused,
    (SELECT COUNT(*) FROM review_notes n WHERE n.prosecution_file_id = f.id) AS review_note_count,
    (SELECT COUNT(*) FROM statements s WHERE s.prosecution_file_id = f.id) AS statement_count,
    (SELECT COUNT(*) FROM charges c WHERE c.prosecution_file_id = f.id) AS charge_count,
    (SELECT COUNT(*) FROM decisions d WHERE d.prosecution_file_id = f.id) AS decision_count,
    (SELECT d.decision_type FROM decisions d WHERE d.prosecution_file_id = f.id
      ORDER BY d.decided_at DESC, d.created_at DESC, d.rowid DESC LIMIT 1) AS last_decision_type,
    (SELECT MAX(d.decided_at) FROM decisions d WHERE d.prosecution_file_id = f.id) AS last_decision_at,
    MAX(f.received_at,
        COALESCE((SELECT MAX(d.decided_at) FROM decisions d WHERE d.prosecution_file_id = f.id), 0),
        COALESCE((SELECT MAX(n.created_at) FROM review_notes n WHERE n.prosecution_file_id = f.id), 0),
        COALESCE((SELECT MAX(r.received_at) FROM referrals r WHERE r.prosecution_file_id = f.id), 0)) AS last_activity_at,
    (SELECT r.id FROM charging_reviews r WHERE r.prosecution_file_id = f.id AND r.concluded_at IS NULL) AS open_review_id,
    (SELECT r.standard FROM charging_reviews r WHERE r.prosecution_file_id = f.id AND r.concluded_at IS NULL) AS open_review_standard,
    COALESCE((SELECT r.reopens_decision_id IS NOT NULL FROM charging_reviews r
               WHERE r.prosecution_file_id = f.id AND r.concluded_at IS NULL), 0) AS reopened,
    (SELECT COUNT(*) FROM directions x WHERE x.prosecution_file_id = f.id) AS directions_total,
    (SELECT COUNT(*) FROM directions x WHERE x.prosecution_file_id = f.id AND x.response = 'open') AS directions_open
  FROM prosecution_files f";

/// Which slice of the register a list shows. `intake` is what has arrived and
/// has had no review note yet; `active` is what is awaiting a decision and is
/// being reviewed (or was handed back by Police); `returned` is with Police;
/// `closed` is every file whose charging decision has been made.
fn view_filter(view: &str) -> Result<&'static str, DomainError> {
    Ok(match view {
        "all" | "" => "1 = 1",
        "intake" => "f.current_status = 'under_review' AND NOT EXISTS (SELECT 1 FROM review_notes n WHERE n.prosecution_file_id = f.id)",
        "active" => "(f.current_status = 'resubmitted' OR (f.current_status = 'under_review' AND EXISTS (SELECT 1 FROM review_notes n WHERE n.prosecution_file_id = f.id)))",
        "awaiting" => "f.current_status IN ('under_review', 'resubmitted')",
        "returned" => "f.current_status = 'returned_for_investigation'",
        // A concluded file with a review open on it that reopens a decision.
        "reopened" => "EXISTS (SELECT 1 FROM charging_reviews r WHERE r.prosecution_file_id = f.id AND r.concluded_at IS NULL AND r.reopens_decision_id IS NOT NULL)",
        "closed" => "f.current_status NOT IN ('under_review', 'resubmitted', 'returned_for_investigation')
                     AND NOT EXISTS (SELECT 1 FROM charging_reviews r WHERE r.prosecution_file_id = f.id AND r.concluded_at IS NULL AND r.reopens_decision_id IS NOT NULL)",
        _ => return invalid("Unknown file view."),
    })
}

pub async fn list_file_summaries(pool: &SqlitePool, query: &str, view: &str, limit: i64) -> Result<Vec<FileSummary>, DomainError> {
    let filter = view_filter(view)?;
    let like = format!("%{}%", query.trim());
    let sql = format!(
        "{SUMMARY_SELECT}
         WHERE {filter}
           AND (?1 = '%%' OR f.title LIKE ?1 OR f.odpp_registration_number LIKE ?1
                OR f.police_reference LIKE ?1 OR f.court_case_number LIKE ?1)
         ORDER BY awaiting_since ASC, f.received_at ASC
         LIMIT ?2"
    );
    // Open work is oldest first; a register of concluded files reads newest first.
    let sql = if matches!(view, "closed" | "all" | "") {
        sql.replace("ORDER BY awaiting_since ASC, f.received_at ASC", "ORDER BY last_activity_at DESC")
    } else {
        sql
    };
    Ok(sqlx::query_as::<_, FileSummary>(sqlx::AssertSqlSafe(sql)).bind(like).bind(limit.clamp(1, 500)).fetch_all(pool).await?)
}

pub async fn get_prosecution_file(pool: &SqlitePool, id: &str) -> Result<Option<ProsecutionFile>, sqlx::Error> {
    sqlx::query_as::<_, ProsecutionFile>("SELECT * FROM prosecution_files WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub const FILE_PERSON_ROLES: &[&str] = &["accused", "complainant", "witness"];

pub async fn link_person(
    pool: &SqlitePool,
    prosecution_file_id: &str,
    person_id: &str,
    role: &str,
) -> Result<ProsecutionFilePerson, DomainError> {
    if !FILE_PERSON_ROLES.contains(&role) {
        return invalid("That is not a role a person can hold on a file.");
    }
    if get_prosecution_file(pool, prosecution_file_id).await?.is_none() {
        return Err(DomainError::NotFound("File not found.".to_string()));
    }
    let person_exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM people WHERE id = ?")
        .bind(person_id)
        .fetch_one(pool)
        .await?;
    if person_exists == 0 {
        return Err(DomainError::NotFound("Person not found.".to_string()));
    }
    let already: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM prosecution_file_people WHERE prosecution_file_id = ? AND person_id = ? AND role = ?",
    )
    .bind(prosecution_file_id)
    .bind(person_id)
    .bind(role)
    .fetch_one(pool)
    .await?;
    if already > 0 {
        return invalid("That person is already linked to this file in that role.");
    }

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

    Ok(sqlx::query_as::<_, ProsecutionFilePerson>(
        "SELECT fp.id, fp.prosecution_file_id, fp.person_id, fp.role, fp.created_at,
                p.first_name AS person_first_name, p.last_name AS person_last_name,
                p.other_names AS person_other_names
         FROM prosecution_file_people fp
         JOIN people p ON p.id = fp.person_id
         WHERE fp.id = ?",
    )
    .bind(&id)
    .fetch_one(pool)
    .await?)
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
pub async fn seed_if_empty(pool: &SqlitePool) -> Result<(), DomainError> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prosecution_files")
        .fetch_one(pool)
        .await?;
    if count > 0 {
        return Ok(());
    }

    // Found by name, not by insert order: people created in the same
    // millisecond have no reliable order.
    let person = |last_name: &'static str| async move {
        sqlx::query_scalar::<_, String>("SELECT id FROM people WHERE last_name = ? LIMIT 1")
            .bind(last_name)
            .fetch_optional(pool)
            .await
    };
    let accused = person("Okello").await?;
    let complainant = person("Namutebi").await?;

    let file = create_prosecution_file(
        pool,
        CreateProsecutionFileInput {
            odpp_registration_number: Some("ODPP/KLA/0142/2026".to_string()),
            title: "State vs. Okello: theft of motor vehicle".to_string(),
            police_station: Some("Kira Road Police Station".to_string()),
            police_reference: Some("KIRA ROAD CRB 221/2026".to_string()),
            received_at: chrono::Utc::now().timestamp_millis() - 86_400_000 * 3,
            material_summary: Some(
                "Charge sheet (draft), 2 witness statements, arresting officer statement, vehicle recovery photos"
                    .to_string(),
            ),
            notes: None,
        },
    )
    .await?;

    if let Some(accused) = accused {
        link_person(pool, &file.id, &accused, "accused").await?;
    }
    if let Some(complainant) = complainant {
        link_person(pool, &file.id, &complainant, "complainant").await?;
    }

    Ok(())
}
