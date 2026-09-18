use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::custody;
use super::prisoners;
use super::sentences;
use super::time::{eat_hour, now_ms};

/// Discharge (docs/prisons/product-map/02 W4, decision D13).
///
/// Two gates guard a wrongful discharge: outstanding property (s.62 handback)
/// and an admission whose warrant has not arrived. Spec 0002 made both hard
/// blocks. s.83 makes the officer in charge responsible for discharge
/// "immediately upon becoming entitled to release", so a hard block can cause
/// unlawful detention. A gate is therefore met, or waived by an officer who
/// holds the exception authority, with a recorded reason. The waived gates
/// become obligations to regularise afterwards.
#[derive(Debug)]
pub enum ReleaseError {
    Db(sqlx::Error),
    NotInCustody,
    GatesUnmet(Vec<GateCheck>),
    ExceptionNeedsAuthority,
    ExceptionReasonRequired,
}

impl From<sqlx::Error> for ReleaseError {
    fn from(err: sqlx::Error) -> Self {
        ReleaseError::Db(err)
    }
}

impl std::fmt::Display for ReleaseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ReleaseError::Db(err) => write!(f, "{err}"),
            ReleaseError::NotInCustody => write!(f, "This person is not in custody here, so there is no one to discharge."),
            ReleaseError::GatesUnmet(gates) => {
                let unmet: Vec<&str> = gates.iter().filter(|g| g.blocking && !g.met).map(|g| g.label.as_str()).collect();
                write!(f, "Cannot discharge yet: {}. Complete these, or have the Officer in Charge authorise an exception.", unmet.join("; "))
            }
            ReleaseError::ExceptionNeedsAuthority => {
                write!(f, "Only an Officer in Charge can authorise discharge without a gate being met.")
            }
            ReleaseError::ExceptionReasonRequired => write!(f, "Record the reason for the exception."),
        }
    }
}

impl std::error::Error for ReleaseError {}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GateCheck {
    pub key: String,
    pub label: String,
    /// A blocking gate must be met or waived. A non-blocking one is shown
    /// as a warning so nothing surprises the officer.
    pub blocking: bool,
    pub met: bool,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DischargeAssessment {
    pub in_custody: bool,
    pub gates: Vec<GateCheck>,
    pub release_due_on: Option<i64>,
    pub blocked: bool,
}

/// The officer on whose authority an exception rests: the actor themself
/// when they hold the exception authority, otherwise an OIC who has just
/// verified their own credentials at this workstation.
#[derive(Debug, Clone)]
pub struct Authoriser {
    pub badge_number: String,
    pub name: String,
}

pub async fn assess(conn: &mut SqliteConnection, prisoner_id: &str) -> Result<DischargeAssessment, sqlx::Error> {
    let prisoner = prisoners::get_prisoner_conn(conn, prisoner_id).await?.ok_or(sqlx::Error::RowNotFound)?;
    let mut gates = Vec::new();

    let outstanding: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM property_records WHERE prisoner_id = ? AND returned_at IS NULL")
        .bind(prisoner_id)
        .fetch_one(&mut *conn)
        .await?;
    gates.push(GateCheck {
        key: "property_outstanding".into(),
        label: if outstanding > 0 { format!("{outstanding} item(s) of property not handed back") } else { "Property handed back".into() },
        blocking: true,
        met: outstanding == 0,
        detail: (outstanding > 0).then(|| "s.62: property is returned on discharge.".to_string()),
    });

    gates.push(GateCheck {
        key: "documents_pending".into(),
        label: if prisoner.documents_pending { "A legal document is still pending".into() } else { "Legal documents complete".into() },
        blocking: true,
        met: !prisoner.documents_pending,
        detail: prisoner.pending_document_type.clone().filter(|_| prisoner.documents_pending),
    });

    let scheduled: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM court_productions WHERE prisoner_id = ? AND state = 'scheduled'")
        .bind(prisoner_id)
        .fetch_one(&mut *conn)
        .await?;
    if scheduled > 0 {
        gates.push(GateCheck {
            key: "court_scheduled".into(),
            label: format!("{scheduled} court production(s) still scheduled"),
            blocking: false,
            met: false,
            detail: Some("Confirm the discharge authority covers these, then cancel them.".into()),
        });
    }

    let hospitalised: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM (
             SELECT event_type FROM health_events WHERE prisoner_id = ? ORDER BY occurred_at DESC LIMIT 1
         ) WHERE event_type IN ('hospital_referral', 'mental_hospital_transfer')",
    )
    .bind(prisoner_id)
    .fetch_one(&mut *conn)
    .await?;
    if hospitalised > 0 {
        gates.push(GateCheck {
            key: "under_treatment".into(),
            label: "Currently referred to hospital".into(),
            blocking: false,
            met: false,
            detail: Some("s.83: a prisoner under medical treatment on the release date is discharged to a medical or social service.".into()),
        });
    }

    let release_due_on = sentences::active_for_conn(conn, prisoner_id)
        .await?
        .and_then(|s| sentences::compute_clocks(&prisoner, Some(&s), now_ms()).release_due_on);
    let blocked = gates.iter().any(|g| g.blocking && !g.met);
    Ok(DischargeAssessment { in_custody: prisoner.current_status == "in_custody", gates, release_due_on, blocked })
}

pub async fn assess_pool(pool: &SqlitePool, prisoner_id: &str) -> Result<DischargeAssessment, sqlx::Error> {
    let mut conn = pool.acquire().await?;
    assess(&mut conn, prisoner_id).await
}

/// Append-only by convention: every real statutory release trigger as its
/// own event, never a single "released" checkbox.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub id: String,
    pub prisoner_id: String,
    pub release_type: String,
    pub released_at: i64,
    pub ordered_by: Option<String>,
    pub notes: Option<String>,
    pub basis: Option<String>,
    pub authorised_by: Option<String>,
    pub exception_reason: Option<String>,
    pub exception_gates: Option<String>,
    pub after_noon: bool,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthoriserCredentials {
    pub badge_number: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExceptionRequest {
    pub reason: String,
    pub authoriser: Option<AuthoriserCredentials>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReleaseInput {
    pub prisoner_id: String,
    pub release_type: String,
    pub released_at: i64,
    pub ordered_by: Option<String>,
    pub basis: Option<String>,
    pub notes: Option<String>,
    pub exception: Option<ExceptionRequest>,
}

pub async fn create_release(
    conn: &mut SqliteConnection,
    actor: &Actor,
    input: CreateReleaseInput,
    authoriser: Option<Authoriser>,
) -> Result<Release, ReleaseError> {
    let correction = input.release_type == "erroneous_release_correction";
    let assessment = assess(conn, &input.prisoner_id).await?;

    if correction {
        // s.79: a re-arrest of someone wrongly discharged. The person is not
        // in custody at the moment of recording, and no gate applies.
    } else if !assessment.in_custody {
        return Err(ReleaseError::NotInCustody);
    }

    let mut waived: Vec<String> = Vec::new();
    let mut exception_reason: Option<String> = None;
    let mut authorised_by: Option<String> = None;

    let unmet: Vec<GateCheck> = assessment.gates.iter().filter(|g| g.blocking && !g.met).cloned().collect();
    if !correction && !unmet.is_empty() {
        match (&input.exception, &authoriser) {
            (None, _) => return Err(ReleaseError::GatesUnmet(assessment.gates)),
            (Some(ex), _) if ex.reason.trim().is_empty() => return Err(ReleaseError::ExceptionReasonRequired),
            (Some(_), None) => return Err(ReleaseError::ExceptionNeedsAuthority),
            (Some(ex), Some(auth)) => {
                waived = unmet.iter().map(|g| g.key.clone()).collect();
                exception_reason = Some(ex.reason.trim().to_string());
                authorised_by = Some(format!("{} ({})", auth.name, auth.badge_number));
            }
        }
    }

    let after_noon = matches!(input.release_type.as_str(), "full_remission" | "partial_remission") && eat_hour(input.released_at) >= 12;
    let id = Uuid::new_v4().to_string();
    let gates_json = (!waived.is_empty()).then(|| serde_json::to_string(&waived).unwrap_or_default());

    sqlx::query(
        "INSERT INTO releases
            (id, prisoner_id, release_type, released_at, ordered_by, notes, basis, authorised_by, exception_reason, exception_gates, after_noon)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prisoner_id)
    .bind(&input.release_type)
    .bind(input.released_at)
    .bind(&input.ordered_by)
    .bind(&input.notes)
    .bind(&input.basis)
    .bind(&authorised_by)
    .bind(&exception_reason)
    .bind(&gates_json)
    .bind(after_noon)
    .execute(&mut *conn)
    .await?;

    let status = prisoners::status_for_release(&input.release_type);
    prisoners::set_status(conn, actor, &input.prisoner_id, status, "release").await?;

    if correction {
        let episode: Option<String> = sqlx::query_scalar("SELECT episode_id FROM prisoners WHERE id = ?").bind(&input.prisoner_id).fetch_one(&mut *conn).await?;
        custody::open_stay(conn, &input.prisoner_id, episode.as_deref().unwrap_or_default(), "re_arrest", input.released_at).await?;
    } else {
        custody::close_open_stay(conn, &input.prisoner_id, "discharge", input.released_at, &id).await?;
    }

    let release = sqlx::query_as::<_, Release>("SELECT * FROM releases WHERE id = ?").bind(&id).fetch_one(&mut *conn).await?;
    audit::record(conn, actor, AuditEntry::new("discharge.release", "release", Some(&id)).workflow(&id).after(&release)).await?;
    if let (Some(reason), Some(by)) = (&exception_reason, &authorised_by) {
        audit::record(
            conn,
            actor,
            AuditEntry::new("discharge.exception", "release", Some(&id))
                .workflow(&id)
                .reason(reason)
                .authorised_by(by)
                .after(&serde_json::json!({ "waivedGates": waived })),
        )
        .await?;
    }
    Ok(release)
}

pub async fn list_for_prisoner(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<Release>, sqlx::Error> {
    sqlx::query_as::<_, Release>("SELECT * FROM releases WHERE prisoner_id = ? ORDER BY released_at DESC")
        .bind(prisoner_id)
        .fetch_all(pool)
        .await
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseSearchRow {
    pub id: String,
    pub prisoner_id: String,
    pub first_name: String,
    pub last_name: String,
    pub release_type: String,
    pub released_at: i64,
}

pub async fn search(pool: &SqlitePool, query: &str) -> Result<Vec<ReleaseSearchRow>, sqlx::Error> {
    let like = format!("%{query}%");
    sqlx::query_as::<_, ReleaseSearchRow>(
        "SELECT r.id, r.prisoner_id, p.first_name, p.last_name, r.release_type, r.released_at
         FROM releases r JOIN prisoners p ON p.id = r.prisoner_id
         WHERE r.release_type LIKE ?1 OR p.first_name LIKE ?1 OR p.last_name LIKE ?1 OR p.other_names LIKE ?1
         ORDER BY r.released_at DESC LIMIT 200",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}
