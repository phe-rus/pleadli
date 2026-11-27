//! Medical examinations: the police medical form (PF3) and the post-mortem.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MedicalExam {
    pub id: String,
    pub kind: String,
    pub person_id: String,
    pub person_first_name: String,
    pub person_last_name: String,
    pub person_other_names: Option<String>,
    pub case_id: Option<String>,
    pub case_reference: Option<String>,
    pub facility: Option<String>,
    pub examiner_name: Option<String>,
    pub requested_at: i64,
    pub examined_at: Option<i64>,
    pub status: String,
    pub findings: Option<String>,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMedicalExamInput {
    pub kind: String,
    pub person_id: String,
    pub case_id: Option<String>,
    pub facility: Option<String>,
    pub examiner_name: Option<String>,
    pub requested_at: i64,
    pub examined_at: Option<i64>,
    pub status: String,
    pub findings: Option<String>,
    pub notes: Option<String>,
}

const KINDS: &[&str] = &["pf3", "post_mortem"];
const STATUSES: &[&str] = &["requested", "completed"];

/** Why this record cannot be saved, or None. A completed examination says when it was done. */
pub fn problem(input: &CreateMedicalExamInput) -> Option<String> {
    if !KINDS.contains(&input.kind.as_str()) {
        return Some("The kind must be a police medical form (PF3) or a post-mortem.".into());
    }
    if !STATUSES.contains(&input.status.as_str()) {
        return Some("The status must be requested or completed.".into());
    }
    if input.status == "completed" && input.examined_at.is_none() {
        return Some("A completed examination needs the date it was done.".into());
    }
    None
}

/** The columns and joins every read of an examination shares, as a literal so it can be joined to a
 * WHERE clause at compile time. */
macro_rules! select {
    () => {
        "SELECT
        e.id, e.kind, e.person_id, e.case_id, e.facility, e.examiner_name, e.requested_at, e.examined_at,
        e.status, e.findings, e.notes, e.created_at,
        p.first_name AS person_first_name, p.last_name AS person_last_name, p.other_names AS person_other_names,
        c.reference AS case_reference
     FROM medical_exams e
     JOIN people p ON p.id = e.person_id
     LEFT JOIN cases c ON c.id = e.case_id"
    };
}

pub async fn create_exam(pool: &SqlitePool, input: CreateMedicalExamInput) -> Result<MedicalExam, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO medical_exams (id, kind, person_id, case_id, facility, examiner_name, requested_at, examined_at, status, findings, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.kind)
    .bind(&input.person_id)
    .bind(&input.case_id)
    .bind(&input.facility)
    .bind(&input.examiner_name)
    .bind(input.requested_at)
    .bind(input.examined_at)
    .bind(&input.status)
    .bind(&input.findings)
    .bind(&input.notes)
    .execute(pool)
    .await?;
    if let Some(case_id) = &input.case_id {
        // An examined person is on the case: the injured as a victim, the deceased as a victim too.
        super::cases::ensure_case_person(pool, case_id, &input.person_id, "victim").await?;
    }
    get_exam(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn update_exam(pool: &SqlitePool, id: &str, input: CreateMedicalExamInput) -> Result<MedicalExam, sqlx::Error> {
    sqlx::query(
        "UPDATE medical_exams SET kind = ?, person_id = ?, case_id = ?, facility = ?, examiner_name = ?, requested_at = ?,
         examined_at = ?, status = ?, findings = ?, notes = ? WHERE id = ?",
    )
    .bind(&input.kind)
    .bind(&input.person_id)
    .bind(&input.case_id)
    .bind(&input.facility)
    .bind(&input.examiner_name)
    .bind(input.requested_at)
    .bind(input.examined_at)
    .bind(&input.status)
    .bind(&input.findings)
    .bind(&input.notes)
    .bind(id)
    .execute(pool)
    .await?;
    get_exam(pool, id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn get_exam(pool: &SqlitePool, id: &str) -> Result<Option<MedicalExam>, sqlx::Error> {
    sqlx::query_as::<_, MedicalExam>(concat!(select!(), " WHERE e.id = ?")).bind(id).fetch_optional(pool).await
}

pub async fn list_for_case(pool: &SqlitePool, case_id: &str) -> Result<Vec<MedicalExam>, sqlx::Error> {
    sqlx::query_as::<_, MedicalExam>(concat!(select!(), " WHERE e.case_id = ? ORDER BY e.requested_at DESC")).bind(case_id).fetch_all(pool).await
}

pub async fn list_exams(pool: &SqlitePool, query: &str) -> Result<Vec<MedicalExam>, sqlx::Error> {
    let like = format!("%{}%", query.trim());
    sqlx::query_as::<_, MedicalExam>(concat!(
        select!(),
        " WHERE ?1 = '%%' OR p.first_name LIKE ?1 OR p.last_name LIKE ?1 OR c.reference LIKE ?1 OR e.facility LIKE ?1
         ORDER BY e.requested_at DESC LIMIT 50"
    ))
    .bind(like)
    .fetch_all(pool)
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(kind: &str, status: &str, examined_at: Option<i64>) -> CreateMedicalExamInput {
        CreateMedicalExamInput {
            kind: kind.into(), person_id: "p".into(), case_id: None, facility: None, examiner_name: None,
            requested_at: 1, examined_at, status: status.into(), findings: None, notes: None,
        }
    }

    #[test]
    fn a_completed_examination_needs_its_date() {
        assert!(problem(&input("pf3", "completed", None)).is_some());
        assert!(problem(&input("pf3", "completed", Some(2))).is_none());
        assert!(problem(&input("pf3", "requested", None)).is_none());
        assert!(problem(&input("x-ray", "requested", None)).is_some());
    }
}
