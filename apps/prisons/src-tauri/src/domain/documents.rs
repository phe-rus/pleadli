//! Issuing documents: the first print of a record's document gives it a number
//! from the facility's own document prefix, and every later print is a reprint
//! of that same number. A short verification code, computed from the number and
//! what it was issued for, lets anyone holding a printout check it against the
//! facility's register.
//!
//! The code proves the number belongs to that record at this facility. It is
//! not a signature: it carries no secret, and says so.

use chrono::Datelike;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::error::DomainError;
use super::time::{eat_datetime, now_ms};

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct IssuedDocument {
    pub id: String,
    pub number: String,
    pub kind: String,
    pub record_id: String,
    pub issued_at: i64,
    pub issued_by_name: String,
    pub issued_by_badge: Option<String>,
    pub reprints: i64,
    pub last_printed_at: Option<i64>,
    #[sqlx(skip)]
    pub verification: String,
}

const SELECT: &str = "SELECT id, number, kind, record_id, issued_at, issued_by_name, issued_by_badge, reprints, last_printed_at FROM issued_documents";

/// `XXXXX-XXXXX`, from the number, what it was issued for, when, and the
/// facility that issued it.
pub fn verification_code(number: &str, kind: &str, record_id: &str, issued_at: i64, facility: &str) -> String {
    let digest = Sha256::digest(format!("{number}|{kind}|{record_id}|{issued_at}|{facility}").as_bytes());
    let hex: String = digest.iter().take(5).map(|b| format!("{b:02X}")).collect();
    format!("{}-{}", &hex[..5], &hex[5..])
}

async fn facility_code(conn: &mut SqliteConnection) -> Result<String, sqlx::Error> {
    let code: Option<String> = sqlx::query_scalar("SELECT facility_number FROM facility_profile WHERE id = 'default'").fetch_one(&mut *conn).await?;
    Ok(code.unwrap_or_default())
}

async fn seal(conn: &mut SqliteConnection, mut doc: IssuedDocument) -> Result<IssuedDocument, sqlx::Error> {
    let facility = facility_code(conn).await?;
    doc.verification = verification_code(&doc.number, &doc.kind, &doc.record_id, doc.issued_at, &facility);
    Ok(doc)
}

pub async fn find(pool: &SqlitePool, kind: &str, record_id: &str) -> Result<Option<IssuedDocument>, sqlx::Error> {
    let mut conn = pool.acquire().await?;
    let found = sqlx::query_as::<_, IssuedDocument>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE kind = ? AND record_id = ?")))
        .bind(kind)
        .bind(record_id)
        .fetch_optional(&mut *conn)
        .await?;
    match found {
        Some(doc) => Ok(Some(seal(&mut conn, doc).await?)),
        None => Ok(None),
    }
}

async fn record_exists(conn: &mut SqliteConnection, kind: &str, record_id: &str) -> Result<(), DomainError> {
    let (sql, missing) = match kind {
        "reception_record" => ("SELECT COUNT(*) FROM prisoners WHERE id = ?", "That prisoner file"),
        "discharge_certificate" => ("SELECT COUNT(*) FROM releases WHERE prisoner_id = ?", "A discharge for that person"),
        "transfer_dossier" => ("SELECT COUNT(*) FROM transfers WHERE id = ?", "That transfer"),
        _ => return Err(DomainError::rejected("That kind of document is not available.")),
    };
    let count: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(sql.to_string())).bind(record_id).fetch_one(&mut *conn).await?;
    if count == 0 {
        return Err(DomainError::NotFound(missing));
    }
    Ok(())
}

/// The next number: `PREFIX/YEAR/0001`, the counter restarting each year. The
/// prefix is the facility's document prefix, else its facility code.
async fn next_number(conn: &mut SqliteConnection, now: i64) -> Result<String, sqlx::Error> {
    let (prefix, code): (Option<String>, Option<String>) =
        sqlx::query_as("SELECT document_prefix, facility_number FROM facility_profile WHERE id = 'default'").fetch_one(&mut *conn).await?;
    let prefix = prefix.filter(|p| !p.is_empty()).or(code.filter(|c| !c.is_empty())).unwrap_or_else(|| "DOC".to_string());
    let year = eat_datetime(now).year();
    sqlx::query("INSERT OR IGNORE INTO document_counters (year, next_value) VALUES (?, 1)").bind(year).execute(&mut *conn).await?;
    let seq: i64 = sqlx::query_scalar("SELECT next_value FROM document_counters WHERE year = ?").bind(year).fetch_one(&mut *conn).await?;
    sqlx::query("UPDATE document_counters SET next_value = next_value + 1 WHERE year = ?").bind(year).execute(&mut *conn).await?;
    Ok(format!("{prefix}/{year}/{seq:04}"))
}

/// Issues the document for a record, or records a reprint of the one already
/// issued. Either way the same number comes back, and the trail says which.
pub async fn issue(conn: &mut SqliteConnection, actor: &Actor, kind: &str, record_id: &str) -> Result<IssuedDocument, DomainError> {
    record_exists(conn, kind, record_id).await?;
    let now = now_ms();
    let existing = sqlx::query_as::<_, IssuedDocument>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE kind = ? AND record_id = ?")))
        .bind(kind)
        .bind(record_id)
        .fetch_optional(&mut *conn)
        .await?;

    let doc = if let Some(doc) = existing {
        sqlx::query("UPDATE issued_documents SET reprints = reprints + 1, last_printed_at = ? WHERE id = ?").bind(now).bind(&doc.id).execute(&mut *conn).await?;
        audit::record(conn, actor, AuditEntry::new("document.reprinted", "document", Some(&doc.id)).reason(&doc.number)).await?;
        IssuedDocument { reprints: doc.reprints + 1, last_printed_at: Some(now), ..doc }
    } else {
        let number = next_number(conn, now).await?;
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO issued_documents (id, number, kind, record_id, issued_at, issued_by, issued_by_name, issued_by_badge, last_printed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(&number)
        .bind(kind)
        .bind(record_id)
        .bind(now)
        .bind(actor.officer_id.as_deref())
        .bind(&actor.name)
        .bind(actor.badge_number.as_deref())
        .bind(now)
        .execute(&mut *conn)
        .await?;
        audit::record(conn, actor, AuditEntry::new("document.issued", "document", Some(&id)).reason(&number)).await?;
        IssuedDocument {
            id,
            number,
            kind: kind.to_string(),
            record_id: record_id.to_string(),
            issued_at: now,
            issued_by_name: actor.name.clone(),
            issued_by_badge: actor.badge_number.clone(),
            reprints: 0,
            last_printed_at: Some(now),
            verification: String::new(),
        }
    };
    Ok(seal(conn, doc).await?)
}

#[derive(Debug, Deserialize)]
pub struct VerifyInput {
    pub number: String,
    pub code: String,
}

/// Checks a number and code from a printout against this facility's register.
pub async fn verify(pool: &SqlitePool, input: &VerifyInput) -> Result<Option<IssuedDocument>, sqlx::Error> {
    let mut conn = pool.acquire().await?;
    let found = sqlx::query_as::<_, IssuedDocument>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE number = ? COLLATE NOCASE")))
        .bind(input.number.trim())
        .fetch_optional(&mut *conn)
        .await?;
    let Some(doc) = found else { return Ok(None) };
    let doc = seal(&mut conn, doc).await?;
    let entered: String = input.code.trim().to_uppercase().chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    let real: String = doc.verification.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    Ok((entered == real).then_some(doc))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::officers;
    use crate::domain::prisoners::{create_prisoner, CreatePrisonerInput};
    use sqlx::sqlite::SqlitePoolOptions;

    async fn setup() -> (SqlitePool, Actor, String) {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let mut tx = pool.begin().await.unwrap();
        let o = officers::create_first_admin(&mut tx, "OIC-1", "OIC", "correct-horse").await.unwrap();
        let actor = Actor::officer(o.id, o.badge_number, o.name, o.role, o.is_admin, None);
        let prisoner = create_prisoner(
            &mut tx,
            &actor,
            CreatePrisonerInput {
                first_name: "Moses".into(),
                last_name: "Kintu".into(),
                other_names: None,
                national_id: None,
                reference: None,
                status: "unconvicted".into(),
                admission_instrument_type: "remand_warrant".into(),
                admission_authority: None,
                admitted_at: now_ms() - 86_400_000,
                high_court_only_offence: false,
                date_of_birth: None,
                sex: None,
                education_level: None,
                nationality: None,
                offence: None,
                documents_pending: false,
                pending_document_type: None,
                notes: None,
            },
        )
        .await
        .unwrap();
        sqlx::query("UPDATE facility_profile SET name = 'Luzira', facility_number = 'UG-LUZ-001', document_prefix = 'LUZ' WHERE id = 'default'").execute(&mut *tx).await.unwrap();
        tx.commit().await.unwrap();
        (pool, actor, prisoner.id)
    }

    #[tokio::test]
    async fn the_first_print_issues_a_number_and_every_later_print_is_a_reprint_of_it() {
        let (pool, actor, prisoner) = setup().await;
        let mut tx = pool.begin().await.unwrap();
        let first = issue(&mut tx, &actor, "reception_record", &prisoner).await.unwrap();
        assert!(first.number.starts_with("LUZ/") && first.number.ends_with("/0001"), "{}", first.number);
        assert_eq!(first.reprints, 0);
        let again = issue(&mut tx, &actor, "reception_record", &prisoner).await.unwrap();
        assert_eq!((again.number.as_str(), again.reprints), (first.number.as_str(), 1));
        assert_eq!(again.verification, first.verification, "a reprint carries the same verification");
        tx.commit().await.unwrap();

        let actions: Vec<String> = sqlx::query_scalar("SELECT action FROM audit_log WHERE action LIKE 'document.%' ORDER BY seq").fetch_all(&pool).await.unwrap();
        assert_eq!(actions, ["document.issued", "document.reprinted"]);
    }

    #[tokio::test]
    async fn numbers_are_sequential_within_the_year_and_the_prefix_is_the_facilitys() {
        let (pool, actor, prisoner) = setup().await;
        let mut tx = pool.begin().await.unwrap();
        let a = issue(&mut tx, &actor, "reception_record", &prisoner).await.unwrap();
        // A transfer record to hang a second kind of document on.
        sqlx::query("INSERT INTO transfers (id, prisoner_id, direction, state, transferred_at, created_at) VALUES ('t1', ?, 'out', 'planned', 1, 1)").bind(&prisoner).execute(&mut *tx).await.unwrap();
        let b = issue(&mut tx, &actor, "transfer_dossier", "t1").await.unwrap();
        assert!(a.number.ends_with("/0001") && b.number.ends_with("/0002"), "{} {}", a.number, b.number);
        assert_ne!(a.verification, b.verification);
    }

    #[tokio::test]
    async fn only_real_records_and_known_kinds_can_be_issued() {
        let (pool, actor, prisoner) = setup().await;
        let mut tx = pool.begin().await.unwrap();
        assert!(issue(&mut tx, &actor, "passport", &prisoner).await.is_err());
        assert!(issue(&mut tx, &actor, "reception_record", "nobody").await.is_err());
        assert!(issue(&mut tx, &actor, "discharge_certificate", &prisoner).await.is_err(), "a person who was never discharged has no certificate");
        assert!(issue(&mut tx, &actor, "transfer_dossier", "nothing").await.is_err());
    }

    #[tokio::test]
    async fn a_printout_verifies_against_the_register_and_a_wrong_code_does_not() {
        let (pool, actor, prisoner) = setup().await;
        let mut tx = pool.begin().await.unwrap();
        let doc = issue(&mut tx, &actor, "reception_record", &prisoner).await.unwrap();
        tx.commit().await.unwrap();

        let ok = verify(&pool, &VerifyInput { number: doc.number.to_lowercase(), code: doc.verification.to_lowercase().replace('-', " ") }).await.unwrap();
        assert_eq!(ok.map(|d| d.record_id), Some(prisoner));
        assert!(verify(&pool, &VerifyInput { number: doc.number.clone(), code: "AAAAA-AAAAA".into() }).await.unwrap().is_none());
        assert!(verify(&pool, &VerifyInput { number: "LUZ/2026/9999".into(), code: doc.verification }).await.unwrap().is_none());
    }
}
