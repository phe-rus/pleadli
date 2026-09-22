//! The defence side of a plea negotiation (`migrations/0006`). What is recorded is
//! what only the defence can: where the negotiation stands, and the steps and
//! dates on this side. The explanation of the agreement to the accused is a
//! required step before an agreement counts as reached, because the research found
//! that duty to fall on the advocate or a justice of the peace (never the
//! prosecutor). The Rules' primary text was not re-read when this was written.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{check_timestamp, clean, invalid, DomainError};
use super::matters::require_open;
use pleadli_node_core::db::begin_write;

pub const STATUSES: [&str; 5] = ["considering", "negotiating", "agreed", "confirmed", "abandoned"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Plea {
    pub id: String,
    pub matter_id: String,
    pub status: String,
    pub summary: Option<String>,
    pub explained_on: Option<i64>,
    pub explained_by: Option<String>,
    pub signed_on: Option<i64>,
    pub confirmed_on: Option<i64>,
    pub abandoned_reason: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PleaInput {
    pub status: String,
    pub summary: Option<String>,
    pub explained_on: Option<i64>,
    pub explained_by: Option<String>,
    pub signed_on: Option<i64>,
    pub confirmed_on: Option<i64>,
    pub abandoned_reason: Option<String>,
}

pub async fn get(pool: &SqlitePool, matter_id: &str) -> Result<Option<Plea>, sqlx::Error> {
    sqlx::query_as::<_, Plea>("SELECT id, matter_id, status, summary, explained_on, explained_by, signed_on, confirmed_on, abandoned_reason, created_at, updated_at FROM plea_negotiations WHERE matter_id = ?")
        .bind(matter_id)
        .fetch_optional(pool)
        .await
}

fn check(input: &PleaInput) -> Result<(), DomainError> {
    if !STATUSES.contains(&input.status.as_str()) {
        return invalid("Choose where the negotiation stands.");
    }
    for (day, what) in [(input.explained_on, "The day the agreement was explained"), (input.signed_on, "The day it was signed"), (input.confirmed_on, "The day it was confirmed before the court")] {
        if let Some(day) = day {
            check_timestamp(day, what)?;
        }
    }
    if let Some(by) = &input.explained_by {
        if !matches!(by.as_str(), "advocate" | "justice_of_the_peace") {
            return invalid("The agreement is explained by the advocate or a justice of the peace.");
        }
    }
    let explained = input.explained_on.is_some() && input.explained_by.is_some();
    match input.status.as_str() {
        "agreed" | "confirmed" if !explained => return invalid("Record when and by whom the agreement was explained to the accused before it counts as reached."),
        "confirmed" => {
            let (Some(signed), Some(confirmed)) = (input.signed_on, input.confirmed_on) else {
                return invalid("Record when the agreement was signed and when it was confirmed before the court.");
            };
            if confirmed < signed {
                return invalid("It cannot be confirmed before it was signed.");
            }
            if let Some(explained_on) = input.explained_on {
                if signed < explained_on {
                    return invalid("It cannot be signed before it was explained to the accused.");
                }
            }
        }
        "abandoned" if clean(input.abandoned_reason.clone()).is_none() => return invalid("Say why the negotiation was abandoned."),
        _ => {}
    }
    Ok(())
}

pub async fn save(pool: &SqlitePool, matter_id: &str, input: PleaInput) -> Result<Plea, DomainError> {
    check(&input)?;
    let mut tx = begin_write(pool).await?;
    require_open(&mut tx, matter_id).await?;
    let existing: Option<String> = sqlx::query_scalar("SELECT id FROM plea_negotiations WHERE matter_id = ?").bind(matter_id).fetch_optional(&mut *tx).await?;
    match existing {
        Some(id) => {
            sqlx::query(
                "UPDATE plea_negotiations SET status = ?, summary = ?, explained_on = ?, explained_by = ?, signed_on = ?, confirmed_on = ?, abandoned_reason = ?,
                    updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?",
            )
            .bind(&input.status)
            .bind(clean(input.summary))
            .bind(input.explained_on)
            .bind(&input.explained_by)
            .bind(input.signed_on)
            .bind(input.confirmed_on)
            .bind(clean(input.abandoned_reason))
            .bind(id)
            .execute(&mut *tx)
            .await?;
        }
        None => {
            sqlx::query("INSERT INTO plea_negotiations (id, matter_id, status, summary, explained_on, explained_by, signed_on, confirmed_on, abandoned_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(Uuid::new_v4().to_string())
                .bind(matter_id)
                .bind(&input.status)
                .bind(clean(input.summary))
                .bind(input.explained_on)
                .bind(&input.explained_by)
                .bind(input.signed_on)
                .bind(input.confirmed_on)
                .bind(clean(input.abandoned_reason))
                .execute(&mut *tx)
                .await?;
        }
    }
    audit::record(&mut tx, Entry::new("plea_updated").subject("matter", matter_id).scope(matter_id).detail(&input.status)).await?;
    tx.commit().await?;
    Ok(get(pool, matter_id).await?.ok_or(sqlx::Error::RowNotFound)?)
}
