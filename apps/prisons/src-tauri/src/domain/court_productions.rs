use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::error::DomainError;
use super::time::now_ms;

/// Court Production & Remand (docs/prisons/PRODUCT.md) — s.118's pre-session
/// list and s.67's reactive production orders. Each row is one production
/// event; "date last appeared in court" (one of s.118's three required
/// fields) is derived as the latest `production_date` for a prisoner, not
/// a separately maintained field.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CourtProduction {
    pub id: String,
    pub prisoner_id: String,
    pub court_reference: Option<String>,
    pub production_date: i64,
    pub purpose: Option<String>,
    pub production_method: String,
    /// scheduled | produced | not_produced | cancelled
    pub state: String,
    pub outcome: Option<String>,
    pub outcome_notes: Option<String>,
    pub next_date: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCourtProductionInput {
    pub prisoner_id: String,
    pub court_reference: Option<String>,
    pub production_date: i64,
    pub purpose: Option<String>,
    pub production_method: String,
}

/// A production dated in the future is scheduled ahead in the diary; one
/// dated now or earlier is a record of something that already happened.
pub async fn create_court_production(conn: &mut SqliteConnection, actor: &Actor, input: CreateCourtProductionInput) -> Result<CourtProduction, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    let state = if input.production_date > now_ms() { "scheduled" } else { "produced" };
    sqlx::query(
        "INSERT INTO court_productions (id, prisoner_id, court_reference, production_date, purpose, production_method, state)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prisoner_id)
    .bind(&input.court_reference)
    .bind(input.production_date)
    .bind(&input.purpose)
    .bind(&input.production_method)
    .bind(state)
    .execute(&mut *conn)
    .await?;

    let production = sqlx::query_as::<_, CourtProduction>("SELECT * FROM court_productions WHERE id = ?")
        .bind(&id)
        .fetch_one(&mut *conn)
        .await?;
    audit::record(conn, actor, AuditEntry::new("court.production", "court_production", Some(&id)).after(&production)).await?;
    Ok(production)
}

pub async fn list_for_prisoner(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<CourtProduction>, sqlx::Error> {
    sqlx::query_as::<_, CourtProduction>(
        "SELECT * FROM court_productions WHERE prisoner_id = ? ORDER BY production_date DESC",
    )
    .bind(prisoner_id)
    .fetch_all(pool)
    .await
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CourtProductionSearchRow {
    pub id: String,
    pub prisoner_id: String,
    pub first_name: String,
    pub last_name: String,
    pub court_reference: Option<String>,
    pub production_date: i64,
    pub production_method: String,
}

pub async fn search(pool: &SqlitePool, query: &str) -> Result<Vec<CourtProductionSearchRow>, sqlx::Error> {
    let like = format!("%{query}%");
    sqlx::query_as::<_, CourtProductionSearchRow>(
        "SELECT cp.id, cp.prisoner_id, p.first_name, p.last_name, cp.court_reference, cp.production_date, cp.production_method
         FROM court_productions cp JOIN prisoners p ON p.id = cp.prisoner_id
         WHERE cp.court_reference LIKE ?1 OR p.first_name LIKE ?1 OR p.last_name LIKE ?1 OR p.other_names LIKE ?1
         ORDER BY cp.production_date DESC LIMIT 200",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

/// Every in-custody prisoner alongside their most recent production date
/// (null if never produced) — the working data behind both the s.118
/// pre-session list and the Overview "upcoming/overdue" queue.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RemandListEntry {
    pub prisoner_id: String,
    pub first_name: String,
    pub last_name: String,
    pub admitted_at: i64,
    pub admission_authority: Option<String>,
    pub high_court_only_offence: bool,
    pub last_produced_at: Option<i64>,
}

pub async fn list_remand(pool: &SqlitePool) -> Result<Vec<RemandListEntry>, sqlx::Error> {
    sqlx::query_as::<_, RemandListEntry>(
        "SELECT
            p.id AS prisoner_id, p.first_name, p.last_name, p.admitted_at, p.admission_authority,
            p.high_court_only_offence,
            (SELECT MAX(cp.production_date) FROM court_productions cp WHERE cp.prisoner_id = p.id AND cp.state = 'produced') AS last_produced_at
         FROM prisoners p
         WHERE p.current_status = 'in_custody' AND p.status = 'unconvicted'
         ORDER BY p.admitted_at ASC",
    )
    .fetch_all(pool)
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CourtOutcomeInput {
    /// remanded | adjourned | committed_for_trial | bail_granted | acquitted |
    /// convicted | not_produced
    pub outcome: String,
    pub notes: Option<String>,
    pub next_date: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CourtOutcomeResult {
    pub production: CourtProduction,
    pub next_production: Option<CourtProduction>,
    /// What the officer must do next as a consequence: discharge | sentence.
    pub follow_up: Option<&'static str>,
}

/// Outcomes are applied, not just recorded (W3): a remand books the next
/// date, a conviction makes the prisoner convicted and asks for the sentence,
/// bail or acquittal points at discharge.
pub async fn record_outcome(
    conn: &mut SqliteConnection,
    actor: &Actor,
    id: &str,
    input: CourtOutcomeInput,
) -> Result<CourtOutcomeResult, DomainError> {
    let before = sqlx::query_as::<_, CourtProduction>("SELECT * FROM court_productions WHERE id = ?").bind(id).fetch_one(&mut *conn).await?;
    if before.state != "scheduled" && before.state != "produced" {
        return Err(DomainError::conflict("NOT_OPEN", "That production is closed."));
    }
    let outcomes = ["remanded", "adjourned", "committed_for_trial", "bail_granted", "acquitted", "convicted", "not_produced"];
    if !outcomes.contains(&input.outcome.as_str()) {
        return Err(DomainError::rejected("Choose what the court decided."));
    }
    let needs_date = matches!(input.outcome.as_str(), "remanded" | "adjourned" | "committed_for_trial");
    if needs_date && input.next_date.is_none() {
        return Err(DomainError::rejected("Enter the next court date."));
    }

    let state = if input.outcome == "not_produced" { "not_produced" } else { "produced" };
    sqlx::query("UPDATE court_productions SET state = ?, outcome = ?, outcome_notes = ?, next_date = ? WHERE id = ?")
        .bind(state)
        .bind(&input.outcome)
        .bind(&input.notes)
        .bind(input.next_date)
        .bind(id)
        .execute(&mut *conn)
        .await?;

    let mut next_production = None;
    if let (true, Some(next_date)) = (needs_date, input.next_date) {
        let next_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO court_productions (id, prisoner_id, court_reference, production_date, purpose, production_method, state)
             VALUES (?, ?, ?, ?, ?, ?, 'scheduled')",
        )
        .bind(&next_id)
        .bind(&before.prisoner_id)
        .bind(&before.court_reference)
        .bind(next_date)
        .bind(&before.purpose)
        .bind(&before.production_method)
        .execute(&mut *conn)
        .await?;
        next_production = Some(sqlx::query_as::<_, CourtProduction>("SELECT * FROM court_productions WHERE id = ?").bind(&next_id).fetch_one(&mut *conn).await?);
    }

    let mut follow_up = None;
    match input.outcome.as_str() {
        "convicted" => {
            let status: String = sqlx::query_scalar("SELECT status FROM prisoners WHERE id = ?").bind(&before.prisoner_id).fetch_one(&mut *conn).await?;
            if status != "convicted" {
                sqlx::query("UPDATE prisoners SET status = 'convicted' WHERE id = ?").bind(&before.prisoner_id).execute(&mut *conn).await?;
                audit::record(
                    conn,
                    actor,
                    AuditEntry::new("custody.legal_status_changed", "prisoner", Some(&before.prisoner_id))
                        .before(&serde_json::json!({ "status": status }))
                        .after(&serde_json::json!({ "status": "convicted" }))
                        .reason("court outcome: convicted"),
                )
                .await?;
            }
            follow_up = Some("sentence");
        }
        "bail_granted" | "acquitted" => follow_up = Some("discharge"),
        _ => {}
    }

    let production = sqlx::query_as::<_, CourtProduction>("SELECT * FROM court_productions WHERE id = ?").bind(id).fetch_one(&mut *conn).await?;
    audit::record(conn, actor, AuditEntry::new("court.outcome", "court_production", Some(id)).before(&before).after(&production)).await?;
    Ok(CourtOutcomeResult { production, next_production, follow_up })
}

/// Cancels a scheduled production (the court vacated the date).
pub async fn cancel(conn: &mut SqliteConnection, actor: &Actor, id: &str, reason: &str) -> Result<CourtProduction, DomainError> {
    if reason.trim().is_empty() {
        return Err(DomainError::rejected("Record why the production is cancelled."));
    }
    let before = sqlx::query_as::<_, CourtProduction>("SELECT * FROM court_productions WHERE id = ? AND state = 'scheduled'")
        .bind(id)
        .fetch_one(&mut *conn)
        .await?;
    sqlx::query("UPDATE court_productions SET state = 'cancelled', outcome_notes = ? WHERE id = ?").bind(reason.trim()).bind(id).execute(&mut *conn).await?;
    let after = sqlx::query_as::<_, CourtProduction>("SELECT * FROM court_productions WHERE id = ?").bind(id).fetch_one(&mut *conn).await?;
    audit::record(conn, actor, AuditEntry::new("court.cancelled", "court_production", Some(id)).before(&before).after(&after).reason(reason.trim())).await?;
    Ok(after)
}
