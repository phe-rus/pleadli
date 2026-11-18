use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::attachments::Attachment;
use super::bonds::Bond;
use super::charge_sheets::ChargeSheet;
use super::custody::CustodyRecord;
use super::exhibits::Exhibit;
use super::referrals::Referral;
use super::registers;
use super::statements::Statement;
use super::{attachments, bonds, charge_sheets, custody, exhibits, markdown, referrals, statements};

/// The role list (complainant, suspect, witness, victim, accused) is exactly
/// what docs/police/PRODUCT.md specifies for how a Case relates to People —
/// not invented here. Status is deliberately minimal ('open' | 'closed'):
/// PRODUCT.md says not to invent workflow states, and a real "referred"
/// status belongs with the Referrals domain once that (and its relationship
/// to "Dispatch") is actually resolved, not guessed at here.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Case {
    pub id: String,
    pub reference: String,
    pub summary: String,
    pub status: String,
    pub incident_id: Option<String>,
    pub incident_summary: Option<String>,
    pub people_count: i64,
    pub created_at: i64,
    /** Shown only to administrators and the officer who restricted it. */
    pub restricted: bool,
    pub restricted_by: Option<String>,
    /** Whether the officer asking may see the case's content. Set on the way out, never stored. */
    #[sqlx(skip)]
    pub can_view: bool,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CasePerson {
    pub id: String,
    pub case_id: String,
    pub person_id: String,
    pub role: String,
    pub person_first_name: String,
    pub person_last_name: String,
    pub person_other_names: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CasePersonInput {
    pub person_id: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCaseInput {
    pub reference: String,
    pub summary: String,
    pub status: String,
    pub incident_id: Option<String>,
    pub people: Vec<CasePersonInput>,
    #[serde(default)]
    pub restricted: bool,
    /** The officer making the change, filled in by the server and never read from the request. */
    #[serde(skip_deserializing, default)]
    pub actor_id: Option<String>,
}

async fn set_case_people(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    case_id: &str,
    people: &[CasePersonInput],
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM case_people WHERE case_id = ?")
        .bind(case_id)
        .execute(&mut **tx)
        .await?;

    for person in people {
        sqlx::query("INSERT INTO case_people (id, case_id, person_id, role) VALUES (?, ?, ?, ?)")
            .bind(Uuid::new_v4().to_string())
            .bind(case_id)
            .bind(&person.person_id)
            .bind(&person.role)
            .execute(&mut **tx)
            .await?;
    }

    Ok(())
}

pub(crate) async fn write_case_markdown(pool: &SqlitePool, vault_root: &Path, record: &Case) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "case", &record.id).await {
        if let Err(e) = markdown::write_record(&dir, &format!("case-{}", record.id), &record.reference, record) {
            log::warn!("failed to write case markdown: {e}");
        }
    }
}

pub async fn create_case(pool: &SqlitePool, vault_root: &Path, input: CreateCaseInput) -> Result<Case, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    let mut tx = pool.begin().await?;

    // A case opened without a reference is numbered by the Crime Record Book:
    // the next number of the year, cited the way the register cites it. A
    // reference typed by hand is kept exactly as written and takes no number.
    let (reference, crb_year, crb_number) = if input.reference.trim().is_empty() {
        let (number, year) = registers::take_next(&mut tx, registers::CRB).await?;
        let station: Option<String> = sqlx::query_scalar("SELECT name FROM station_profile WHERE id = 'default'")
            .fetch_optional(&mut *tx)
            .await?
            .flatten();
        (registers::citation(registers::CRB, number, year, station.as_deref()), Some(year), Some(number))
    } else {
        (input.reference.trim().to_string(), None, None)
    };

    sqlx::query("INSERT INTO cases (id, reference, summary, status, incident_id, crb_year, crb_number, restricted, restricted_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&reference)
        .bind(&input.summary)
        .bind(&input.status)
        .bind(&input.incident_id)
        .bind(crb_year)
        .bind(crb_number)
        .bind(input.restricted)
        .bind(if input.restricted { input.actor_id.clone() } else { None })
        .execute(&mut *tx)
        .await?;

    set_case_people(&mut tx, &id, &input.people).await?;
    tx.commit().await?;

    let record = get_case(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_case_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn update_case(pool: &SqlitePool, vault_root: &Path, id: &str, input: CreateCaseInput) -> Result<Case, sqlx::Error> {
    let old_reference: Option<String> = sqlx::query_scalar("SELECT reference FROM cases WHERE id = ?").bind(id).fetch_optional(pool).await?;
    let mut tx = pool.begin().await?;

    sqlx::query("UPDATE cases SET reference = ?, summary = ?, status = ?, incident_id = ?, restricted = ?,
         restricted_by = CASE WHEN ? = 1 THEN COALESCE(restricted_by, ?) ELSE NULL END WHERE id = ?")
        .bind(&input.reference)
        .bind(&input.summary)
        .bind(&input.status)
        .bind(&input.incident_id)
        .bind(input.restricted)
        .bind(input.restricted)
        .bind(&input.actor_id)
        .bind(id)
        .execute(&mut *tx)
        .await?;

    set_case_people(&mut tx, id, &input.people).await?;
    tx.commit().await?;

    let record = get_case(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;

    // A new reference is a new folder name. The case's folder and everything
    // in it moves with it, so its files are never split across the old name
    // and the new one.
    if let Some(old_reference) = old_reference.filter(|old| *old != record.reference) {
        if let Err(e) = attachments::rename_case_folder(pool, vault_root, &old_reference, &record.reference).await {
            log::warn!("could not rename the vault folder for case {id}: {e}");
        }
        if let Err(e) = attachments::settle_case(pool, vault_root, id).await {
            log::warn!("could not settle the files of case {id}: {e}");
        }
    }
    write_case_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn list_cases(pool: &SqlitePool, query: &str) -> Result<Vec<Case>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, Case>(
            "SELECT
                c.id, c.reference, c.summary, c.status, c.incident_id, c.created_at, c.restricted, c.restricted_by,
                i.summary AS incident_summary,
                (SELECT COUNT(*) FROM case_people cp WHERE cp.case_id = c.id) AS people_count
             FROM cases c
             LEFT JOIN incidents i ON i.id = c.incident_id
             ORDER BY c.created_at DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, Case>(
        "SELECT
            c.id, c.reference, c.summary, c.status, c.incident_id, c.created_at, c.restricted, c.restricted_by,
            i.summary AS incident_summary,
            (SELECT COUNT(*) FROM case_people cp WHERE cp.case_id = c.id) AS people_count
         FROM cases c
         LEFT JOIN incidents i ON i.id = c.incident_id
         WHERE c.reference LIKE ?1 OR c.summary LIKE ?1
         ORDER BY c.created_at DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

/// Every case, unfiltered and unlimited, for the bulk data export.
pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Case>, sqlx::Error> {
    sqlx::query_as::<_, Case>(
        "SELECT
            c.id, c.reference, c.summary, c.status, c.incident_id, c.created_at, c.restricted, c.restricted_by,
            i.summary AS incident_summary,
            (SELECT COUNT(*) FROM case_people cp WHERE cp.case_id = c.id) AS people_count
         FROM cases c
         LEFT JOIN incidents i ON i.id = c.incident_id
         ORDER BY c.created_at ASC",
    )
    .fetch_all(pool)
    .await
}

pub async fn get_case(pool: &SqlitePool, id: &str) -> Result<Option<Case>, sqlx::Error> {
    sqlx::query_as::<_, Case>(
        "SELECT
            c.id, c.reference, c.summary, c.status, c.incident_id, c.created_at, c.restricted, c.restricted_by,
            i.summary AS incident_summary,
            (SELECT COUNT(*) FROM case_people cp WHERE cp.case_id = c.id) AS people_count
         FROM cases c
         LEFT JOIN incidents i ON i.id = c.incident_id
         WHERE c.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn list_for_person(pool: &SqlitePool, person_id: &str) -> Result<Vec<Case>, sqlx::Error> {
    sqlx::query_as::<_, Case>(
        "SELECT
            c.id, c.reference, c.summary, c.status, c.incident_id, c.created_at, c.restricted, c.restricted_by,
            i.summary AS incident_summary,
            (SELECT COUNT(*) FROM case_people cp2 WHERE cp2.case_id = c.id) AS people_count
         FROM cases c
         JOIN case_people cp ON cp.case_id = c.id
         LEFT JOIN incidents i ON i.id = c.incident_id
         WHERE cp.person_id = ?
         ORDER BY c.created_at DESC",
    )
    .bind(person_id)
    .fetch_all(pool)
    .await
}

pub async fn list_case_people(pool: &SqlitePool, case_id: &str) -> Result<Vec<CasePerson>, sqlx::Error> {
    sqlx::query_as::<_, CasePerson>(
        "SELECT
            cp.id, cp.case_id, cp.person_id, cp.role,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM case_people cp
         JOIN people p ON p.id = cp.person_id
         WHERE cp.case_id = ?",
    )
    .bind(case_id)
    .fetch_all(pool)
    .await
}

/// The Investigation workspace, resolved (2026-09) to be exactly this: a
/// composed read over a Case's own already-linked records, not a separate
/// entity — see docs/police/PRODUCT.md's Investigations section. Nothing
/// here is indexed or stored twice; it's the same pattern as
/// `people::get_person_profile`, applied to a Case instead of a Person.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseWorkspace {
    pub case: Case,
    pub people: Vec<CasePerson>,
    pub statements: Vec<Statement>,
    pub custody_records: Vec<CustodyRecord>,
    pub bonds: Vec<Bond>,
    pub exhibits: Vec<Exhibit>,
    pub charge_sheets: Vec<ChargeSheet>,
    pub referrals: Vec<Referral>,
    pub attachments: Vec<Attachment>,
}

pub async fn get_case_workspace(pool: &SqlitePool, id: &str) -> Result<Option<CaseWorkspace>, sqlx::Error> {
    let Some(case) = get_case(pool, id).await? else {
        return Ok(None);
    };

    let people = list_case_people(pool, id).await?;
    let statements = statements::list_for_case(pool, id).await?;
    let custody_records = custody::list_for_case(pool, id).await?;
    let bonds = bonds::list_for_case(pool, id).await?;
    let exhibits = exhibits::list_for_case(pool, id).await?;
    let charge_sheets = charge_sheets::list_for_case(pool, id).await?;
    let referrals = referrals::list_for_case(pool, id).await?;
    let attachments = attachments::list_attachments(pool, "case", id).await?;

    Ok(Some(CaseWorkspace {
        case,
        people,
        statements,
        custody_records,
        bonds,
        exhibits,
        charge_sheets,
        referrals,
        attachments,
    }))
}

#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool, vault_root: &Path) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cases").fetch_one(pool).await?;
    if count > 0 {
        return Ok(());
    }

    let person_ids: Vec<String> = sqlx::query_scalar("SELECT id FROM people ORDER BY created_at LIMIT 2")
        .fetch_all(pool)
        .await?;
    let incident_ids: Vec<String> = sqlx::query_scalar("SELECT id FROM incidents ORDER BY created_at LIMIT 1")
        .fetch_all(pool)
        .await?;

    let mut people = Vec::new();
    if let Some(p) = person_ids.first() {
        people.push(CasePersonInput { person_id: p.clone(), role: "complainant".to_string() });
    }
    if let Some(p) = person_ids.get(1) {
        people.push(CasePersonInput { person_id: p.clone(), role: "suspect".to_string() });
    }

    create_case(
        pool,
        vault_root,
        CreateCaseInput {
            reference: "CC-2026-0001".to_string(),
            summary: "Break-in at a retail shop on Kampala Road".to_string(),
            status: "open".to_string(),
            incident_id: incident_ids.first().cloned(),
            people,
            restricted: false,
            actor_id: None,
        },
    )
    .await?;

    Ok(())
}

/** Someone the paperwork names (booked into the cells, charged) is also a person on the case, so
 * the case page never under-reports who is involved. A person already on the case keeps their
 * role, except that a suspect who is then charged becomes the accused. */
pub async fn ensure_case_person(pool: &SqlitePool, case_id: &str, person_id: &str, role: &str) -> Result<(), sqlx::Error> {
    let existing: Option<String> = sqlx::query_scalar("SELECT role FROM case_people WHERE case_id = ? AND person_id = ? LIMIT 1")
        .bind(case_id)
        .bind(person_id)
        .fetch_optional(pool)
        .await?;
    match existing {
        None => {
            sqlx::query("INSERT INTO case_people (id, case_id, person_id, role) VALUES (?, ?, ?, ?)")
                .bind(Uuid::new_v4().to_string())
                .bind(case_id)
                .bind(person_id)
                .bind(role)
                .execute(pool)
                .await?;
        }
        Some(current) if current == "suspect" && role == "accused" => {
            sqlx::query("UPDATE case_people SET role = 'accused' WHERE case_id = ? AND person_id = ?")
                .bind(case_id)
                .bind(person_id)
                .execute(pool)
                .await?;
        }
        Some(_) => {}
    }
    Ok(())
}

/** Whether this officer may see a case's content: any case that is not restricted, or one that is and
 * the officer is an administrator or the one who restricted it. */
pub fn may_view(restricted: bool, restricted_by: Option<&str>, actor: &super::sessions::Actor) -> bool {
    !restricted || actor.role == "admin" || restricted_by == Some(actor.officer_id.as_str())
}

/** The case as this officer may see it. A restricted case they may not open keeps its reference and
 * status, so the register still counts it, but loses its summary, incident and people. */
pub fn apply_access(mut case: Case, actor: &super::sessions::Actor) -> Case {
    case.can_view = may_view(case.restricted, case.restricted_by.as_deref(), actor);
    if !case.can_view {
        case.summary = String::new();
        case.incident_id = None;
        case.incident_summary = None;
        case.people_count = 0;
    }
    case
}

/** The restricted cases this officer may not see: lists of papers leave out anything that belongs to them. */
pub async fn hidden_case_ids(pool: &SqlitePool, actor: &super::sessions::Actor) -> Result<Vec<String>, sqlx::Error> {
    if actor.role == "admin" {
        return Ok(vec![]);
    }
    sqlx::query_scalar("SELECT id FROM cases WHERE restricted = 1 AND COALESCE(restricted_by, '') <> ?")
        .bind(&actor.officer_id)
        .fetch_all(pool)
        .await
}

/** Whether this officer may open the case with this id (a case that does not exist is open to all). */
pub async fn can_open(pool: &SqlitePool, id: &str, actor: &super::sessions::Actor) -> Result<bool, sqlx::Error> {
    Ok(!hidden_case_ids(pool, actor).await?.iter().any(|hidden| hidden == id))
}
