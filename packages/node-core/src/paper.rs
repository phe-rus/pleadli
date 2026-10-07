//! Paper that can be checked. The law works on paper; the application is there
//! to make the paper simple to produce. Whenever a piece of paperwork leaves the
//! application (printed, or saved as PDF or Word), the exact wording on the page
//! is recorded under a short code, and the code and a QR are printed on it.
//! Whoever holds the paper can later look the code up and read, word for word,
//! what was printed, so a paper that was altered by hand, or never came from
//! this office, shows itself.
//!
//! Printing the same wording again gives the same code: a code names one
//! wording of one record, not one press of the Print button. A changed record
//! printed again gets a new code, and the old code still answers with the
//! wording it was printed with. Rows are never updated or deleted
//! (`TABLE_SQL`).

use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqlitePool};

/// The table and its guards. An application puts this in one of its own
/// migrations, as with the audit trail.
pub const TABLE_SQL: &str = "CREATE TABLE paper_prints (
    code TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    reference TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    body_sha256 TEXT NOT NULL,
    printed_by TEXT,
    printed_at INTEGER NOT NULL
);

CREATE INDEX paper_prints_entity ON paper_prints (entity_type, entity_id, printed_at);

CREATE TRIGGER paper_prints_no_update BEFORE UPDATE ON paper_prints
BEGIN SELECT RAISE(ABORT, 'A printed paper is never changed.'); END;

CREATE TRIGGER paper_prints_no_delete BEFORE DELETE ON paper_prints
BEGIN SELECT RAISE(ABORT, 'A printed paper is never changed.'); END;";

/// What a paper says, as the application lays it out.
pub struct PaperInput<'a> {
    pub entity_type: &'a str,
    pub entity_id: &'a str,
    pub reference: Option<&'a str>,
    pub title: &'a str,
    pub body: &'a str,
    pub printed_by: Option<&'a str>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PaperPrint {
    pub code: String,
    pub entity_type: String,
    pub entity_id: String,
    pub reference: Option<String>,
    pub title: String,
    pub body: String,
    pub body_sha256: String,
    pub printed_by: Option<String>,
    pub printed_at: i64,
}

/// The code and QR to put on the page.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stamp {
    pub code: String,
    pub qr: Option<String>,
    pub printed_at: i64,
}

pub fn sha256(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

/// How a code is printed: three groups of four, easy to read out and type.
pub fn display(code: &str) -> String {
    code.as_bytes().chunks(4).map(|c| String::from_utf8_lossy(c).into_owned()).collect::<Vec<_>>().join("-")
}

/// A typed code with spaces, dashes or lower case still finds the paper.
pub fn normalise(typed: &str) -> String {
    typed.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_uppercase()
}

fn qr(code: &str, reference: Option<&str>) -> Option<String> {
    let text = match reference {
        Some(r) if !r.is_empty() => format!("PLEADLI {r} {}", display(code)),
        _ => format!("PLEADLI {}", display(code)),
    };
    qrcode::QrCode::new(text.as_bytes())
        .ok()
        .map(|q| q.render::<qrcode::render::svg::Color>().quiet_zone(false).min_dimensions(96, 96).build())
}

/// Records the paper (or finds the identical wording already recorded) and
/// returns what to print on it.
pub async fn stamp(pool: &SqlitePool, input: PaperInput<'_>) -> Result<Stamp, sqlx::Error> {
    let body_sha = sha256(input.body);
    let existing: Option<(String, i64)> = sqlx::query_as(
        "SELECT code, printed_at FROM paper_prints WHERE entity_type = ? AND entity_id = ? AND body_sha256 = ? AND title = ? AND reference IS ?",
    )
    .bind(input.entity_type)
    .bind(input.entity_id)
    .bind(&body_sha)
    .bind(input.title)
    .bind(input.reference)
    .fetch_optional(pool)
    .await?;
    if let Some((code, printed_at)) = existing {
        return Ok(Stamp { qr: qr(&code, input.reference), code, printed_at });
    }

    let printed_at = chrono::Utc::now().timestamp_millis();
    let seed = format!(
        "{}|{}|{}|{}|{}|{}",
        input.entity_type,
        input.entity_id,
        input.reference.unwrap_or(""),
        input.title,
        body_sha,
        uuid::Uuid::new_v4()
    );
    let code = sha256(&seed)[..12].to_uppercase();
    sqlx::query(
        "INSERT INTO paper_prints (code, entity_type, entity_id, reference, title, body, body_sha256, printed_by, printed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&code)
    .bind(input.entity_type)
    .bind(input.entity_id)
    .bind(input.reference)
    .bind(input.title)
    .bind(input.body)
    .bind(&body_sha)
    .bind(input.printed_by)
    .bind(printed_at)
    .execute(pool)
    .await?;
    Ok(Stamp { qr: qr(&code, input.reference), code, printed_at })
}

/// The paper a code was printed on, word for word, or nothing.
pub async fn verify(pool: &SqlitePool, typed_code: &str) -> Result<Option<PaperPrint>, sqlx::Error> {
    let code = normalise(typed_code);
    if code.len() != 12 {
        return Ok(None);
    }
    sqlx::query_as::<_, PaperPrint>("SELECT * FROM paper_prints WHERE code = ?").bind(code).fetch_optional(pool).await
}

/// The last time this record left the application, to tell whether it has
/// changed since.
pub async fn last_print(pool: &SqlitePool, entity_type: &str, entity_id: &str) -> Result<Option<PaperPrint>, sqlx::Error> {
    sqlx::query_as::<_, PaperPrint>("SELECT * FROM paper_prints WHERE entity_type = ? AND entity_id = ? ORDER BY printed_at DESC LIMIT 1")
        .bind(entity_type)
        .bind(entity_id)
        .fetch_optional(pool)
        .await
}

/// Every version of this record that left the application, newest first.
pub async fn history(pool: &SqlitePool, entity_type: &str, entity_id: &str) -> Result<Vec<PaperPrint>, sqlx::Error> {
    sqlx::query_as::<_, PaperPrint>("SELECT * FROM paper_prints WHERE entity_type = ? AND entity_id = ? ORDER BY printed_at DESC")
        .bind(entity_type)
        .bind(entity_id)
        .fetch_all(pool)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn pool() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(TABLE_SQL).execute(&pool).await.unwrap();
        pool
    }

    fn input<'a>(body: &'a str) -> PaperInput<'a> {
        PaperInput { entity_type: "statement", entity_id: "s1", reference: Some("CRB 12/2026"), title: "Statement", body, printed_by: Some("A. Officer") }
    }

    #[tokio::test]
    async fn same_wording_same_code_changed_wording_new_code() {
        let pool = pool().await;
        let a = stamp(&pool, input("I saw him.")).await.unwrap();
        let b = stamp(&pool, input("I saw him.")).await.unwrap();
        let c = stamp(&pool, input("I saw them.")).await.unwrap();
        assert_eq!(a.code, b.code);
        assert_ne!(a.code, c.code);
        assert_eq!(a.code.len(), 12);
        assert!(a.qr.is_some());
        // The old code still answers with the old wording.
        assert_eq!(verify(&pool, &a.code).await.unwrap().unwrap().body, "I saw him.");
        assert_eq!(last_print(&pool, "statement", "s1").await.unwrap().unwrap().code, c.code);
        let versions = history(&pool, "statement", "s1").await.unwrap();
        assert_eq!(versions.len(), 2);
        assert_eq!(versions[0].code, c.code);
        pool.close().await;
    }

    #[tokio::test]
    async fn typed_codes_are_forgiving_and_wrong_codes_reveal_nothing() {
        let pool = pool().await;
        let a = stamp(&pool, input("Text")).await.unwrap();
        let typed = display(&a.code).to_lowercase().replace('-', " ");
        assert!(verify(&pool, &typed).await.unwrap().is_some());
        assert!(verify(&pool, "0000-0000-0000").await.unwrap().is_none());
        assert!(verify(&pool, "short").await.unwrap().is_none());
        pool.close().await;
    }

    #[tokio::test]
    async fn printed_papers_cannot_be_changed() {
        let pool = pool().await;
        let a = stamp(&pool, input("Text")).await.unwrap();
        assert!(sqlx::query("UPDATE paper_prints SET body = 'x' WHERE code = ?").bind(&a.code).execute(&pool).await.is_err());
        assert!(sqlx::query("DELETE FROM paper_prints").execute(&pool).await.is_err());
        pool.close().await;
    }
}
