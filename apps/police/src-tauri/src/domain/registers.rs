//! Register numbers: the Station Diary and the Crime Record Book, each counted
//! from 1 at the start of every year. The next number is taken on the
//! caller's own connection, inside the transaction that writes the entry, so a
//! failed write gives the number back and two entries never share one.

use serde::Serialize;
use sqlx::{SqliteConnection, SqlitePool};

pub const SD: &str = "sd";
pub const CRB: &str = "crb";

/// The year the station is in. Uganda is UTC+3 all year; the counter turns over
/// at local midnight, not at UTC midnight.
const YEAR_SQL: &str = "SELECT CAST(strftime('%Y', 'now', '+3 hours') AS INTEGER)";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterNumber {
    pub number: i64,
    pub year: i64,
    /// How it would be cited, for a form to offer: `CRB 12/2026`, preceded by
    /// the station's name when it has one.
    pub reference: String,
}

pub fn citation(kind: &str, number: i64, year: i64, station: Option<&str>) -> String {
    let label = if kind == CRB { "CRB" } else { "SD" };
    match station.map(str::trim).filter(|s| !s.is_empty()) {
        Some(name) if kind == CRB => format!("{name} {label} {number}/{year}"),
        _ => format!("{label} {number}/{year}"),
    }
}

/// Takes the next number in a register. Call inside a transaction.
pub async fn take_next(conn: &mut SqliteConnection, kind: &str) -> Result<(i64, i64), sqlx::Error> {
    let year: i64 = sqlx::query_scalar(YEAR_SQL).fetch_one(&mut *conn).await?;
    sqlx::query(
        "INSERT INTO register_counters (kind, year, last_number) VALUES (?, ?, 1)
         ON CONFLICT(kind, year) DO UPDATE SET last_number = last_number + 1",
    )
    .bind(kind)
    .bind(year)
    .execute(&mut *conn)
    .await?;
    let number: i64 = sqlx::query_scalar("SELECT last_number FROM register_counters WHERE kind = ? AND year = ?")
        .bind(kind)
        .bind(year)
        .fetch_one(&mut *conn)
        .await?;
    Ok((number, year))
}

/// What the next number would be, without taking it.
pub async fn peek_next(pool: &SqlitePool, kind: &str) -> Result<RegisterNumber, sqlx::Error> {
    let year: i64 = sqlx::query_scalar(YEAR_SQL).fetch_one(pool).await?;
    let last: Option<i64> = sqlx::query_scalar("SELECT last_number FROM register_counters WHERE kind = ? AND year = ?")
        .bind(kind)
        .bind(year)
        .fetch_optional(pool)
        .await?;
    let number = last.unwrap_or(0) + 1;
    let station: Option<String> = sqlx::query_scalar("SELECT name FROM station_profile WHERE id = 'default'")
        .fetch_optional(pool)
        .await?
        .flatten();
    Ok(RegisterNumber { number, year, reference: citation(kind, number, year, station.as_deref()) })
}
