//! Attested returns (docs/prisons/product-map/02 W14, 03 tier T2). A monthly
//! return is generated (`reports`, immutable), checked here, attested by the
//! OIC, and submitted to Head Office as an aggregate: counts only, no rows.
//!
//! The facility authors the return and Head Office owns the copy it receives,
//! so each keeps its own record. Submission is queued and sent when Head
//! Office can be reached; nothing here blocks local work.
//!
//! The checks are what "validate against the records" means today: the return
//! must add up to itself, must have been generated after its period closed,
//! and the period's events must still be the ones the return counted. A
//! return that fails is never attested; the remedy is to generate a new one.
//! Population is stated as at generation, not at period end, so the checks
//! require generation after the period closes to keep the two close.


use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::error::DomainError;
use super::facilities;
use super::inbox;
use super::reports::{self, Kind, Period, ReportDocument};
use super::exchange::IngestError;
use super::time::now_ms;

/// What the OIC affirms. Stored with each attestation, so a later change of
/// wording never rewrites what an earlier officer agreed to.
pub const STATEMENT: &str =
    "I certify that the figures in this return were produced from this facility's records and are correct to the best of my knowledge.";

/// The sections of a monthly return that count events inside the period. They
/// are the ones that must come out the same if the return is rebuilt now.
const EVENT_SECTIONS: [(&str, &str); 9] = [
    ("admissions", "Admissions by status"),
    ("admissionInstruments", "Admissions by instrument"),
    ("discharges", "Discharges"),
    ("transfersOut", "Transfers out"),
    ("transfersIn", "Transfers in"),
    ("courtProductions", "Court productions"),
    ("visits", "Visits"),
    ("visitTypes", "Visits by type"),
    ("healthEvents", "Health events"),
];

/// Splits of the held population that must each add up to the total held.
const POPULATION_SPLITS: [(&str, &str); 4] = [
    ("ageGroups", "Age groups"),
    ("nationality", "Nationality"),
    ("education", "Education"),
    ("offenceType", "Offence type"),
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub id: String,
    pub label: String,
    /// `pass`, `fail` (blocks attestation) or `note` (shown, does not block).
    pub outcome: &'static str,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Checks {
    pub passed: bool,
    pub checks: Vec<Check>,
    /// The words the officer affirms by attesting, so the screen shows exactly them.
    pub statement: &'static str,
}

#[derive(Debug, FromRow)]
struct Stored {
    reference: String,
    kind: String,
    content_json: String,
    content_hash: String,
}

async fn load(conn: &mut SqliteConnection, report_id: &str) -> Result<Stored, DomainError> {
    let stored: Option<Stored> = sqlx::query_as(
        "SELECT reference, kind, content_json, content_hash FROM generated_reports WHERE id = ?",
    )
    .bind(report_id)
    .fetch_optional(&mut *conn)
    .await?;
    let stored = stored.ok_or(DomainError::NotFound("That report"))?;
    if stored.kind != "monthly_return" {
        return Err(DomainError::rejected("Only a monthly return is attested and submitted. Registers are printed."));
    }
    Ok(stored)
}

fn pass(id: &str, label: &str) -> Check {
    Check { id: id.to_string(), label: label.to_string(), outcome: "pass", detail: None }
}

fn fail(id: &str, label: &str, detail: String) -> Check {
    Check { id: id.to_string(), label: label.to_string(), outcome: "fail", detail: Some(detail) }
}

fn total(section: &Value) -> i64 {
    section.as_array().map_or(0, |rows| rows.iter().filter_map(|row| row.get("count").and_then(Value::as_i64)).sum())
}

fn count_of(value: &Value, key: &str) -> i64 {
    value.get(key).and_then(Value::as_i64).unwrap_or(0)
}

/// Runs every check against a stored return. Nothing is written.
pub async fn checks(conn: &mut SqliteConnection, report_id: &str) -> Result<Checks, DomainError> {
    let stored = load(conn, report_id).await?;
    let document: ReportDocument = serde_json::from_str(&stored.content_json).map_err(|_| DomainError::rejected("This return cannot be read."))?;
    let (Some(from), Some(to)) = (document.period_from, document.period_to) else {
        return Err(DomainError::rejected("This return does not name the period it covers."));
    };
    let mut out: Vec<Check> = Vec::new();

    let intact = format!("{:x}", Sha256::digest(stored.content_json.as_bytes())) == stored.content_hash;
    out.push(if intact {
        pass("intact", "The figures are exactly as generated")
    } else {
        fail("intact", "The figures are exactly as generated", "The stored return does not match its fingerprint.".to_string())
    });

    out.push(if document.as_at >= to {
        pass("period_closed", "Generated after the period closed")
    } else {
        fail("period_closed", "Generated after the period closed", "This return was generated before its period ended, so later events are missing. Generate it again once the period is over.".to_string())
    });

    let population = document.body.get("population").cloned().unwrap_or(Value::Null);
    let held = count_of(&population, "held");
    let by_status = count_of(&population, "convicted") + count_of(&population, "unconvicted") + count_of(&population, "civil");
    out.push(if by_status == held {
        pass("status_split", "Convicted, unconvicted and civil add up to the number held")
    } else {
        fail("status_split", "Convicted, unconvicted and civil add up to the number held", format!("They add up to {by_status}, but {held} are held."))
    });
    for (key, label) in POPULATION_SPLITS {
        let sum = total(population.get(key).unwrap_or(&Value::Null));
        let id = format!("split_{key}");
        let label = format!("{label} add up to the number held");
        out.push(if sum == held { pass(&id, &label) } else { fail(&id, &label, format!("They add up to {sum}, but {held} are held.")) });
    }

    // Rebuild the period from the records as they stand now. The event
    // sections must match what was counted; a difference means records for
    // the period were entered or changed after generation.
    let live = reports::build(conn, Kind::MonthlyReturn, Some(Period { from, to })).await?;
    let mut changed: Vec<&str> = Vec::new();
    for (key, label) in EVENT_SECTIONS {
        if document.body.get(key) != live.body.get(key) {
            changed.push(label);
        }
    }
    for key in ["raised", "resolved"] {
        let was = document.body.get("complaints").map_or(0, |c| count_of(c, key));
        let now = live.body.get("complaints").map_or(0, |c| count_of(c, key));
        if was != now {
            changed.push(if key == "raised" { "Complaints raised" } else { "Complaints resolved" });
        }
    }
    out.push(if changed.is_empty() {
        pass("records_unchanged", "The period's records have not changed since")
    } else {
        fail(
            "records_unchanged",
            "The period's records have not changed since",
            format!("These no longer match the records: {}. Generate the return again.", changed.join(", ")),
        )
    });

    if population.get("capacity").is_none_or(Value::is_null) {
        out.push(Check {
            id: "capacity".to_string(),
            label: "Approved capacity is recorded".to_string(),
            outcome: "note",
            detail: Some("No approved capacity is set, so this return cannot state occupancy.".to_string()),
        });
    }
    out.push(Check {
        id: "population_as_at".to_string(),
        label: "Population is as at generation".to_string(),
        outcome: "note",
        detail: Some("The numbers held are counted on the day the return was generated, not at the end of the period.".to_string()),
    });

    let passed = out.iter().all(|c| c.outcome != "fail");
    Ok(Checks { passed, checks: out, statement: STATEMENT })
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Attestation {
    pub report_id: String,
    pub content_hash: String,
    pub statement: String,
    pub attested_by_name: String,
    pub attested_by_badge: Option<String>,
    pub attested_at: i64,
}

pub async fn get_attestation(conn: &mut SqliteConnection, report_id: &str) -> Result<Option<Attestation>, sqlx::Error> {
    sqlx::query_as(
        "SELECT report_id, content_hash, statement, attested_by_name, attested_by_badge, attested_at FROM return_attestations WHERE report_id = ?",
    )
    .bind(report_id)
    .fetch_optional(conn)
    .await
}

/// The OIC affirms the return. Runs the checks again inside the same
/// transaction, so what is attested is what was checked. One attestation per
/// return, and it cannot be undone: a wrong return is replaced, not edited.
pub async fn attest(conn: &mut SqliteConnection, actor: &Actor, report_id: &str) -> Result<Attestation, DomainError> {
    let stored = load(conn, report_id).await?;
    if get_attestation(conn, report_id).await?.is_some() {
        return Err(DomainError::conflict("ALREADY_ATTESTED", "This return is already attested."));
    }
    if !checks(conn, report_id).await?.passed {
        return Err(DomainError::conflict("RETURN_CHECKS_FAILED", "This return does not pass its checks, so it cannot be attested."));
    }
    let attested_at = now_ms();
    sqlx::query(
        "INSERT INTO return_attestations (report_id, content_hash, statement, attested_by_id, attested_by_name, attested_by_badge, attested_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(report_id)
    .bind(&stored.content_hash)
    .bind(STATEMENT)
    .bind(&actor.officer_id)
    .bind(&actor.name)
    .bind(&actor.badge_number)
    .bind(attested_at)
    .execute(&mut *conn)
    .await?;
    let attestation = get_attestation(conn, report_id).await?.ok_or(DomainError::NotFound("That attestation"))?;
    audit::record(conn, actor, AuditEntry::new("report.attest", "report", Some(report_id)).after(&serde_json::json!({ "reference": stored.reference, "contentHash": stored.content_hash }))).await?;
    Ok(attestation)
}

/// Queues an attested return for Head Office. It is sent by `send_queued`,
/// right away when Head Office can be reached and otherwise when it can.
pub async fn submit(conn: &mut SqliteConnection, actor: &Actor, report_id: &str) -> Result<(), DomainError> {
    let stored = load(conn, report_id).await?;
    if get_attestation(conn, report_id).await?.is_none() {
        return Err(DomainError::rejected("Attest the return before submitting it."));
    }
    let (state, facility): (Option<String>, Option<String>) =
        sqlx::query_as("SELECT connection_state, facility_id FROM peer_sync_config WHERE id = 'default'").fetch_one(&mut *conn).await?;
    if state.as_deref() != Some("connected") || facility.is_none() {
        return Err(DomainError::conflict("NOT_CONNECTED", "This facility is not connected to Head Office. Print the attested return and send it by hand."));
    }
    let enabled: Option<bool> = sqlx::query_scalar("SELECT enabled FROM sync_classes WHERE class = 'returns'").fetch_optional(&mut *conn).await?;
    if enabled != Some(true) {
        return Err(DomainError::conflict("RETURNS_OFF", "Sending returns to Head Office is switched off in Settings."));
    }
    let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM return_submissions WHERE report_id = ?").bind(report_id).fetch_optional(&mut *conn).await?;
    if exists.is_some() {
        return Err(DomainError::conflict("ALREADY_SUBMITTED", "This return has already been submitted."));
    }
    sqlx::query("INSERT INTO return_submissions (report_id, queued_at, queued_by_name) VALUES (?, ?, ?)")
        .bind(report_id)
        .bind(now_ms())
        .bind(&actor.name)
        .execute(&mut *conn)
        .await?;
    audit::record(conn, actor, AuditEntry::new("report.submit", "report", Some(report_id)).after(&serde_json::json!({ "reference": stored.reference }))).await?;
    Ok(())
}

/// A return as it travels: the exact document text that was attested, so Head
/// Office can check the hash, and who attested it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReturnPackage {
    pub reference: String,
    pub kind: String,
    pub title: String,
    pub period_from: i64,
    pub period_to: i64,
    pub template_version: i64,
    /// The document as generated, byte for byte, because the hash is over it.
    pub content: String,
    pub content_hash: String,
    pub statement: String,
    pub attested_by_name: String,
    pub attested_by_badge: Option<String>,
    pub attested_at: i64,
}

async fn package(pool: &SqlitePool, report_id: &str) -> Result<ReturnPackage, sqlx::Error> {
    let row: (String, String, String, i64, i64, i64, String, String, String, String, Option<String>, i64) = sqlx::query_as(
        "SELECT g.reference, g.kind, g.title, g.period_from, g.period_to, g.template_version, g.content_json, g.content_hash,
                a.statement, a.attested_by_name, a.attested_by_badge, a.attested_at
         FROM generated_reports g JOIN return_attestations a ON a.report_id = g.id WHERE g.id = ?",
    )
    .bind(report_id)
    .fetch_one(pool)
    .await?;
    Ok(ReturnPackage {
        reference: row.0,
        kind: row.1,
        title: row.2,
        period_from: row.3,
        period_to: row.4,
        template_version: row.5,
        content: row.6,
        content_hash: row.7,
        statement: row.8,
        attested_by_name: row.9,
        attested_by_badge: row.10,
        attested_at: row.11,
    })
}

async fn record_attempt(pool: &SqlitePool, report_id: &str, error: Option<&str>) {
    let _ = sqlx::query("UPDATE return_submissions SET attempts = attempts + 1, last_attempt_at = ?, last_error = ? WHERE report_id = ?")
        .bind(now_ms())
        .bind(error)
        .bind(report_id)
        .execute(pool)
        .await;
}

/// Sends every queued return, oldest first. A return Head Office did not
/// acknowledge stays queued with the reason; an unreachable Head Office is not
/// an error the officer has to act on. Returns how many were acknowledged.
pub async fn send_queued(pool: &SqlitePool) -> Result<(usize, Option<String>), String> {
    let ctx = facilities::get_peer_sync_context(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "This installation is not connected to a Head Office yet.".to_string())?;
    let waiting: Vec<String> = sqlx::query_scalar("SELECT report_id FROM return_submissions WHERE acknowledged_at IS NULL ORDER BY queued_at")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    if waiting.is_empty() {
        return Ok((0, None));
    }
    let client = super::peer::hq_client(pool, 30).await?;
    let url = format!("{}/api/network/v1/returns", ctx.hostname.trim_end_matches('/'));

    // A return Head Office does not take is not a quiet success: it is reported
    // back so the round is recorded as not having gone through, and it stays
    // queued to be tried again.
    let mut acknowledged = 0;
    let mut failure: Option<String> = None;
    for report_id in waiting {
        let package = package(pool, &report_id).await.map_err(|e| e.to_string())?;
        let response = match client.post(&url).bearer_auth(&ctx.sync_token).json(&package).send().await {
            Ok(response) => response,
            Err(e) => {
                record_attempt(pool, &report_id, Some(&format!("Head Office could not be reached: {e}"))).await;
                return Err(e.to_string());
            }
        };
        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            let message = "Head Office did not accept this return. The connection may have been revoked, or the return is not valid.";
            record_attempt(pool, &report_id, Some(message)).await;
            failure.get_or_insert_with(|| format!("{message} (401)"));
            continue;
        }
        if !status.is_success() {
            let message = format!("Head Office responded {status}.");
            record_attempt(pool, &report_id, Some(&message)).await;
            failure.get_or_insert(message);
            continue;
        }
        let body: Value = response.json().await.map_err(|e| e.to_string())?;
        match body.get("status").and_then(Value::as_str) {
            Some("acknowledged") => {
                let mut tx = crate::db::begin_write(pool).await.map_err(|e| e.to_string())?;
                sqlx::query("UPDATE return_submissions SET acknowledged_at = ?, attempts = attempts + 1, last_attempt_at = ?, last_error = NULL WHERE report_id = ?")
                    .bind(now_ms())
                    .bind(now_ms())
                    .bind(&report_id)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
                audit::record(&mut tx, &Actor::system("returns exchange"), AuditEntry::new("report.acknowledged", "report", Some(&report_id)).after(&serde_json::json!({ "reference": package.reference })))
                    .await
                    .map_err(|e| e.to_string())?;
                tx.commit().await.map_err(|e| e.to_string())?;
                acknowledged += 1;
            }
            // Valid, but this facility is not yet verified by Head Office.
            _ => {
                let message = "Head Office has not yet verified this facility.";
                record_attempt(pool, &report_id, Some(message)).await;
                failure.get_or_insert_with(|| message.to_string());
            }
        }
    }
    Ok((acknowledged, failure))
}

/// Head Office side: accept one attested return from a facility. The facility
/// is resolved from the bearer token, never from the payload. The hash must
/// match the text sent, and the period and kind named must be the ones in the
/// document, so a package cannot say one thing and carry another. Sending the
/// same reference twice is acknowledged as already applied.
pub async fn receive(pool: &SqlitePool, sync_token: &str, package: ReturnPackage) -> Result<Value, IngestError> {
    let row: Option<(String, String, String)> = sqlx::query_as("SELECT id, name, status FROM facilities WHERE sync_token_hash = ?")
        .bind(facilities::hash_secret(sync_token))
        .fetch_optional(pool)
        .await?;
    let (facility_id, facility_name, status) = row.ok_or(IngestError::Invalid)?;
    match status.as_str() {
        "active" => {}
        "pending_verification" => return Ok(serde_json::json!({ "status": "pending_verification" })),
        _ => return Err(IngestError::Invalid),
    }

    let intact = format!("{:x}", Sha256::digest(package.content.as_bytes())) == package.content_hash;
    let document: Option<ReportDocument> = serde_json::from_str(&package.content).ok();
    let consistent = document.as_ref().is_some_and(|d| {
        d.kind == "monthly_return" && d.period_from == Some(package.period_from) && d.period_to == Some(package.period_to)
    });
    let complete = !package.reference.trim().is_empty() && !package.attested_by_name.trim().is_empty() && !package.statement.trim().is_empty();
    if package.kind != "monthly_return" || !intact || !consistent || !complete || package.period_to <= package.period_from {
        return Err(IngestError::Invalid);
    }

    let mut tx = crate::db::begin_write(pool).await?;
    let inserted = sqlx::query(
        "INSERT OR IGNORE INTO received_returns
            (id, facility_id, reference, kind, title, period_from, period_to, template_version, content_json, content_hash,
             statement, attested_by_name, attested_by_badge, attested_at, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&facility_id)
    .bind(&package.reference)
    .bind(&package.kind)
    .bind(&package.title)
    .bind(package.period_from)
    .bind(package.period_to)
    .bind(package.template_version)
    .bind(&package.content)
    .bind(&package.content_hash)
    .bind(&package.statement)
    .bind(&package.attested_by_name)
    .bind(&package.attested_by_badge)
    .bind(package.attested_at)
    .bind(now_ms())
    .execute(&mut *tx)
    .await?
    .rows_affected();

    super::estate::touch_contact(&mut *tx, &facility_id).await?;
    if inserted > 0 {
        audit::record(
            &mut tx,
            &Actor::system("network return"),
            AuditEntry::new("network.return_received", "facility", Some(&facility_id)).after(&serde_json::json!({ "reference": package.reference, "attestedBy": package.attested_by_name })),
        )
        .await?;
        let subject = format!("{facility_name} sent its return {}", package.reference);
        inbox::notify(
            &mut tx,
            inbox::Event {
                kind: "return",
                origin: "system",
                source: &facility_name,
                subject: &subject,
                body: Some("Attested by the officer in charge. Open Reports to read it."),
                route: Some("/reports"),
                permission: Some(super::authz::perm::HQ_REPORTS),
            },
        )
        .await?;
    }
    tx.commit().await?;
    Ok(serde_json::json!({ "status": "acknowledged", "reference": package.reference, "alreadyApplied": inserted == 0 }))
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ReceivedReturn {
    pub id: String,
    pub facility_id: String,
    pub facility_name: String,
    pub reference: String,
    pub title: String,
    pub period_from: i64,
    pub period_to: i64,
    pub template_version: i64,
    pub content_hash: String,
    pub attested_by_name: String,
    pub attested_by_badge: Option<String>,
    pub attested_at: i64,
    pub received_at: i64,
    /// A later attested return for the same facility and period replaces it
    /// for consolidation. It is kept, and still readable.
    pub superseded: bool,
}

macro_rules! select_received {
    ($tail:literal) => {
        concat!(
            "SELECT r.id, r.facility_id, f.name AS facility_name, r.reference, r.title, r.period_from, r.period_to, r.template_version, r.content_hash,
                    r.attested_by_name, r.attested_by_badge, r.attested_at, r.received_at,
                    EXISTS (SELECT 1 FROM received_returns n WHERE n.facility_id = r.facility_id AND n.period_from = r.period_from
                            AND n.period_to = r.period_to AND (n.attested_at > r.attested_at OR (n.attested_at = r.attested_at AND n.rowid > r.rowid))) AS superseded
             FROM received_returns r JOIN facilities f ON f.id = r.facility_id ",
            $tail
        )
    };
}

pub async fn list_received(pool: &SqlitePool) -> Result<Vec<ReceivedReturn>, sqlx::Error> {
    sqlx::query_as(select_received!("ORDER BY r.received_at DESC LIMIT 500")).fetch_all(pool).await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceivedReturnDocument {
    #[serde(flatten)]
    pub record: ReceivedReturn,
    pub statement: String,
    pub document: Value,
}

impl ReceivedReturnDocument {
    /// The received return in the shape a stored report opens in, so Head
    /// Office reads and prints it on the same page a facility's own return
    /// uses. "Produced by" is the officer who attested it.
    pub fn into_report(self) -> reports::GeneratedReport {
        let generated_at = self.document.get("asAt").and_then(Value::as_i64).unwrap_or(self.record.received_at);
        let r = self.record;
        reports::GeneratedReport {
            record: reports::ReportRecord {
                id: r.id,
                reference: r.reference,
                kind: "monthly_return".to_string(),
                title: r.title,
                period_from: Some(r.period_from),
                period_to: Some(r.period_to),
                template_version: r.template_version,
                content_hash: r.content_hash,
                generated_by_name: r.attested_by_name.clone(),
                generated_at,
                attested_at: Some(r.attested_at),
                attested_by_name: Some(r.attested_by_name),
                attested_by_badge: r.attested_by_badge,
                attestation_statement: Some(self.statement),
                submission: Some("acknowledged".to_string()),
                acknowledged_at: Some(r.received_at),
                submission_error: None,
            },
            document: self.document,
        }
    }
}

pub async fn get_received(pool: &SqlitePool, id: &str) -> Result<Option<ReceivedReturnDocument>, DomainError> {
    let record: Option<ReceivedReturn> = sqlx::query_as(select_received!("WHERE r.id = ?")).bind(id).fetch_optional(pool).await?;
    let Some(record) = record else { return Ok(None) };
    let (content, statement): (String, String) =
        sqlx::query_as("SELECT content_json, statement FROM received_returns WHERE id = ?").bind(id).fetch_one(pool).await?;
    let document = serde_json::from_str(&content).map_err(|e| DomainError::rejected(e.to_string()))?;
    Ok(Some(ReceivedReturnDocument { record, statement, document }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::authz::perm;
    use crate::domain::officers;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    async fn oic(pool: &SqlitePool) -> Actor {
        let mut tx = pool.begin().await.unwrap();
        let o = officers::create_first_admin(&mut tx, "OIC-1", "Okello", "correct-horse").await.unwrap();
        tx.commit().await.unwrap();
        Actor::officer(o.id, o.badge_number, o.name, "oic".to_string(), o.is_admin, None)
    }

    fn ms(year: i32, month: u32, day: u32) -> i64 {
        chrono::NaiveDate::from_ymd_opt(year, month, day).unwrap().and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp_millis()
    }

    fn january() -> Period {
        Period { from: ms(2020, 1, 1), to: ms(2020, 2, 1) }
    }

    async fn admit(pool: &SqlitePool, id: &str, day: u32) {
        sqlx::query("INSERT INTO prisoners (id, first_name, last_name, admission_instrument_type, admitted_at, sex) VALUES (?, 'A', 'B', 'warrant', ?, 'male')")
            .bind(id)
            .bind(ms(2020, 1, day))
            .execute(pool)
            .await
            .unwrap();
    }

    async fn generate(pool: &SqlitePool, actor: &Actor, period: Period) -> String {
        let mut conn = pool.acquire().await.unwrap();
        reports::generate(&mut conn, actor, Kind::MonthlyReturn, Some(period)).await.unwrap().record.id
    }

    async fn attest_id(pool: &SqlitePool, actor: &Actor, id: &str) -> Result<Attestation, DomainError> {
        let mut conn = pool.acquire().await.unwrap();
        attest(&mut conn, actor, id).await
    }

    async fn connect(pool: &SqlitePool, host: &str, token: &str) {
        sqlx::query("UPDATE peer_sync_config SET hq_hostname = ?, facility_id = 'fac-1', sync_token = ?, connection_state = 'connected' WHERE id = 'default'")
            .bind(host)
            .bind(token)
            .execute(pool)
            .await
            .unwrap();
    }

    async fn add_facility(pool: &SqlitePool, status: &str, token: &str) {
        sqlx::query(
            "INSERT INTO facilities (id, name, facility_number, location, region, head_officer_name, status, verification_code_hash, verification_expires_at, verifying_officer_email, sync_token_hash)
             VALUES ('fac-1', 'Luzira', 'F-1', 'Kampala', 'Central', 'OIC', ?, 'h', 0, 'a@example.org', ?)",
        )
        .bind(status)
        .bind(facilities::hash_secret(token))
        .execute(pool)
        .await
        .unwrap();
    }

    #[test]
    fn only_the_oic_may_attest() {
        assert!(crate::domain::authz::role_permissions("oic", false).contains(perm::REPORT_ATTEST));
        for role in ["officer", "records", "facility_admin"] {
            assert!(!crate::domain::authz::role_permissions(role, true).contains(perm::REPORT_ATTEST), "{role} must not attest");
        }
    }

    #[tokio::test]
    async fn a_return_for_a_closed_period_passes_and_is_attested_once_and_for_good() {
        let pool = pool().await;
        let actor = oic(&pool).await;
        admit(&pool, "p1", 5).await;
        let id = generate(&pool, &actor, january()).await;

        let mut conn = pool.acquire().await.unwrap();
        let result = checks(&mut conn, &id).await.unwrap();
        assert!(result.passed, "{:?}", result.checks);
        drop(conn);

        let attestation = attest_id(&pool, &actor, &id).await.unwrap();
        assert_eq!((attestation.attested_by_name.as_str(), attestation.statement.as_str()), ("Okello", STATEMENT));
        assert_eq!(attestation.attested_by_badge.as_deref(), Some("OIC-1"));

        assert!(matches!(attest_id(&pool, &actor, &id).await, Err(DomainError::Conflict { .. })), "a second attestation must be refused");
        assert!(sqlx::query("UPDATE return_attestations SET attested_by_name = 'x'").execute(&pool).await.is_err(), "an attestation is immutable");
        assert!(sqlx::query("DELETE FROM return_attestations").execute(&pool).await.is_err());

        let listed = reports::list(&pool).await.unwrap();
        assert_eq!(listed[0].attested_by_name.as_deref(), Some("Okello"));
        assert_eq!(listed[0].submission, None);
    }

    #[tokio::test]
    async fn a_return_generated_before_its_period_ended_cannot_be_attested() {
        let pool = pool().await;
        let actor = oic(&pool).await;
        let now = now_ms();
        let id = generate(&pool, &actor, Period { from: now - 1000, to: now + 86_400_000 }).await;

        let mut conn = pool.acquire().await.unwrap();
        let result = checks(&mut conn, &id).await.unwrap();
        assert!(!result.passed);
        assert!(result.checks.iter().any(|c| c.id == "period_closed" && c.outcome == "fail"));
        assert!(matches!(attest(&mut conn, &actor, &id).await, Err(DomainError::Conflict { .. })));
        assert!(get_attestation(&mut conn, &id).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn records_entered_after_generation_stop_the_attestation_until_it_is_generated_again() {
        let pool = pool().await;
        let actor = oic(&pool).await;
        admit(&pool, "p1", 5).await;
        let id = generate(&pool, &actor, january()).await;

        admit(&pool, "late", 20).await;
        let mut conn = pool.acquire().await.unwrap();
        let result = checks(&mut conn, &id).await.unwrap();
        drop(conn);
        let drift = result.checks.iter().find(|c| c.id == "records_unchanged").unwrap();
        assert_eq!(drift.outcome, "fail");
        assert!(drift.detail.as_deref().unwrap().contains("Admissions"));
        assert!(attest_id(&pool, &actor, &id).await.is_err());

        let again = generate(&pool, &actor, january()).await;
        assert!(attest_id(&pool, &actor, &again).await.is_ok(), "a corrected return passes");
    }

    #[tokio::test]
    async fn only_a_monthly_return_is_attested() {
        let pool = pool().await;
        let actor = oic(&pool).await;
        let mut conn = pool.acquire().await.unwrap();
        let register = reports::generate(&mut conn, &actor, Kind::AdmissionRegister, Some(january())).await.unwrap().record.id;
        assert!(attest(&mut conn, &actor, &register).await.is_err());
    }

    #[tokio::test]
    async fn a_return_is_submitted_only_when_attested_and_connected_and_only_once() {
        let pool = pool().await;
        let actor = oic(&pool).await;
        let id = generate(&pool, &actor, january()).await;
        let mut conn = pool.acquire().await.unwrap();

        assert!(submit(&mut conn, &actor, &id).await.is_err(), "not attested yet");
        attest(&mut conn, &actor, &id).await.unwrap();
        assert!(matches!(submit(&mut conn, &actor, &id).await, Err(DomainError::Conflict { code: "NOT_CONNECTED", .. })));

        sqlx::query("UPDATE peer_sync_config SET hq_hostname = 'https://hq.example.org', facility_id = 'fac-1', sync_token = 'tok', connection_state = 'connected' WHERE id = 'default'")
            .execute(&mut *conn)
            .await
            .unwrap();
        sqlx::query("UPDATE sync_classes SET enabled = 0 WHERE class = 'returns'").execute(&mut *conn).await.unwrap();
        assert!(matches!(submit(&mut conn, &actor, &id).await, Err(DomainError::Conflict { code: "RETURNS_OFF", .. })));
        sqlx::query("UPDATE sync_classes SET enabled = 1 WHERE class = 'returns'").execute(&mut *conn).await.unwrap();

        submit(&mut conn, &actor, &id).await.unwrap();
        assert!(matches!(submit(&mut conn, &actor, &id).await, Err(DomainError::Conflict { code: "ALREADY_SUBMITTED", .. })));
        drop(conn);
        assert_eq!(reports::list(&pool).await.unwrap()[0].submission.as_deref(), Some("queued"));
        assert_eq!(crate::domain::connectivity::pending(&pool).await.unwrap().returns, 1);
    }

    #[tokio::test]
    async fn head_office_accepts_only_what_is_intact_and_whole_and_only_once() {
        let facility = pool().await;
        let actor = oic(&facility).await;
        let id = generate(&facility, &actor, january()).await;
        attest_id(&facility, &actor, &id).await.unwrap();
        let good = package(&facility, &id).await.unwrap();

        let hq = pool().await;
        add_facility(&hq, "active", "tok").await;

        let first = receive(&hq, "tok", good.clone()).await.unwrap();
        assert_eq!((first["status"].as_str(), first["alreadyApplied"].as_bool()), (Some("acknowledged"), Some(false)));
        let again = receive(&hq, "tok", good.clone()).await.unwrap();
        assert_eq!(again["alreadyApplied"].as_bool(), Some(true));
        assert_eq!(list_received(&hq).await.unwrap().len(), 1);

        // Head Office opens it as a stored report, with who attested and what they affirmed.
        let stored = list_received(&hq).await.unwrap().remove(0);
        let opened = get_received(&hq, &stored.id).await.unwrap().unwrap().into_report();
        assert_eq!((opened.record.kind.as_str(), opened.record.attested_by_name.as_deref(), opened.record.attestation_statement.as_deref()), ("monthly_return", Some("Okello"), Some(STATEMENT)));
        assert_eq!(opened.record.content_hash, good.content_hash);

        let mut altered = good.clone();
        altered.reference = "MR-2020-0002".into();
        altered.content = altered.content.replace("\"held\":0", "\"held\":99");
        assert_ne!(altered.content, good.content, "the test must change the figures");
        assert!(matches!(receive(&hq, "tok", altered).await, Err(IngestError::Invalid)), "the hash must match the text");
        let mut wrong_period = good.clone();
        wrong_period.reference = "MR-2020-0003".into();
        wrong_period.period_from += 1;
        assert!(matches!(receive(&hq, "tok", wrong_period).await, Err(IngestError::Invalid)), "the package must not disagree with its document");
        let mut unattested = good.clone();
        unattested.reference = "MR-2020-0004".into();
        unattested.attested_by_name = " ".into();
        assert!(matches!(receive(&hq, "tok", unattested).await, Err(IngestError::Invalid)));
        assert!(matches!(receive(&hq, "not-the-token", good.clone()).await, Err(IngestError::Invalid)));
        assert_eq!(list_received(&hq).await.unwrap().len(), 1, "nothing invalid was stored");

        assert!(sqlx::query("UPDATE received_returns SET attested_by_name = 'x'").execute(&hq).await.is_err(), "the received copy is immutable");
    }

    #[tokio::test]
    async fn an_unverified_facility_is_told_so_and_nothing_is_stored() {
        let facility = pool().await;
        let actor = oic(&facility).await;
        let id = generate(&facility, &actor, january()).await;
        attest_id(&facility, &actor, &id).await.unwrap();
        let hq = pool().await;
        add_facility(&hq, "pending_verification", "tok").await;
        let outcome = receive(&hq, "tok", package(&facility, &id).await.unwrap()).await.unwrap();
        assert_eq!(outcome["status"].as_str(), Some("pending_verification"));
        assert!(list_received(&hq).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_later_return_for_the_same_period_supersedes_the_earlier_one() {
        let facility = pool().await;
        let actor = oic(&facility).await;
        let hq = pool().await;
        add_facility(&hq, "active", "tok").await;
        for _ in 0..2 {
            let id = generate(&facility, &actor, january()).await;
            attest_id(&facility, &actor, &id).await.unwrap();
            receive(&hq, "tok", package(&facility, &id).await.unwrap()).await.unwrap();
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
        let mut received = list_received(&hq).await.unwrap();
        received.sort_by_key(|r| r.reference.clone());
        assert_eq!(received.iter().map(|r| r.superseded).collect::<Vec<_>>(), [true, false]);
        assert!(get_received(&hq, &received[0].id).await.unwrap().is_some());
    }

    /// The real path: a facility submits over HTTP to a Head Office router.
    #[tokio::test]
    async fn a_submitted_return_reaches_head_office_and_is_acknowledged_and_an_unreachable_one_waits() {
        let dir = std::env::temp_dir().join(format!("pleadli-returns-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let hq_pool = SqlitePoolOptions::new().max_connections(4).connect_with(crate::db::connect_options(&dir.join("hq.db"))).await.unwrap();
        sqlx::migrate!("./migrations").run(&hq_pool).await.unwrap();
        add_facility(&hq_pool, "active", "tok").await;
        let hq_node = crate::node::Node::new(hq_pool.clone(), dir.join("vault"), dir.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, crate::api::network::router(hq_node)).await.unwrap() });

        let facility = pool().await;
        let actor = oic(&facility).await;
        let id = generate(&facility, &actor, january()).await;
        attest_id(&facility, &actor, &id).await.unwrap();

        // Head Office is not reachable at first: the return waits, with a reason.
        connect(&facility, "http://127.0.0.1:1", "tok").await;
        submit(&mut *facility.acquire().await.unwrap(), &actor, &id).await.unwrap();
        assert!(send_queued(&facility).await.is_err());
        let waiting = &reports::list(&facility).await.unwrap()[0];
        assert_eq!(waiting.submission.as_deref(), Some("queued"));
        assert!(waiting.submission_error.as_deref().unwrap().contains("could not be reached"));

        // Then it is reachable: the return goes and Head Office acknowledges it.
        connect(&facility, &format!("http://{address}"), "tok").await;
        assert_eq!(send_queued(&facility).await.unwrap(), (1, None));
        let sent = &reports::list(&facility).await.unwrap()[0];
        assert_eq!(sent.submission.as_deref(), Some("acknowledged"));
        assert!(sent.acknowledged_at.is_some() && sent.submission_error.is_none());
        assert_eq!(send_queued(&facility).await.unwrap(), (0, None), "an acknowledged return is not sent again");

        let received = list_received(&hq_pool).await.unwrap();
        assert_eq!((received.len(), received[0].facility_name.as_str(), received[0].attested_by_name.as_str()), (1, "Luzira", "Okello"));
        assert_eq!(crate::domain::connectivity::pending(&facility).await.unwrap().returns, 0);
    }
}
