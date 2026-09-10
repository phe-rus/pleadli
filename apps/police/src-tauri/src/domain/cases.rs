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

async fn write_case_markdown(pool: &SqlitePool, vault_root: &Path, record: &Case) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "case", &record.id).await {
        if let Err(e) = markdown::write_record(&dir, &format!("case-{}", record.id), &record.reference, record) {
            log::warn!("failed to write case markdown: {e}");
        }
    }
}

pub async fn create_case(pool: &SqlitePool, vault_root: &Path, input: CreateCaseInput) -> Result<Case, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    let mut tx = pool.begin().await?;

    sqlx::query("INSERT INTO cases (id, reference, summary, status, incident_id) VALUES (?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&input.reference)
        .bind(&input.summary)
        .bind(&input.status)
        .bind(&input.incident_id)
        .execute(&mut *tx)
        .await?;

    set_case_people(&mut tx, &id, &input.people).await?;
    tx.commit().await?;

    let record = get_case(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_case_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn update_case(pool: &SqlitePool, vault_root: &Path, id: &str, input: CreateCaseInput) -> Result<Case, sqlx::Error> {
    let mut tx = pool.begin().await?;

    sqlx::query("UPDATE cases SET reference = ?, summary = ?, status = ?, incident_id = ? WHERE id = ?")
        .bind(&input.reference)
        .bind(&input.summary)
        .bind(&input.status)
        .bind(&input.incident_id)
        .bind(id)
        .execute(&mut *tx)
        .await?;

    set_case_people(&mut tx, id, &input.people).await?;
    tx.commit().await?;

    let record = get_case(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_case_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn list_cases(pool: &SqlitePool, query: &str) -> Result<Vec<Case>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, Case>(
            "SELECT
                c.id, c.reference, c.summary, c.status, c.incident_id, c.created_at,
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
            c.id, c.reference, c.summary, c.status, c.incident_id, c.created_at,
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

pub async fn get_case(pool: &SqlitePool, id: &str) -> Result<Option<Case>, sqlx::Error> {
    sqlx::query_as::<_, Case>(
        "SELECT
            c.id, c.reference, c.summary, c.status, c.incident_id, c.created_at,
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
            c.id, c.reference, c.summary, c.status, c.incident_id, c.created_at,
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
        },
    )
    .await?;

    Ok(())
}
