//! Report documents (docs/prisons/product-map/05 N and O).
//!
//! The node builds a report from the records; the screen never assembles one,
//! so a printed report and its stored snapshot cannot disagree with the
//! database. `build` only reads. `generate` builds inside the caller's write
//! transaction, stores the snapshot with its hash and audits it.
//!
//! Escapes, recaptures and deaths in custody are not recorded by this system
//! yet, so no report states a figure for them (unknown is not zero).

use chrono::Datelike;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::error::DomainError;
use super::facility_profile;
use super::time::{eat_datetime, now_ms, DAY_MS};

/// Bumped whenever a report's layout or the meaning of a figure changes, so a
/// stored report says which definition produced it.
pub const TEMPLATE_VERSION: i64 = 1;

const MAX_PERIOD_DAYS: i64 = 366;
const MAX_ROWS: i64 = 5000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    MonthlyReturn,
    AdmissionRegister,
    DischargeRegister,
    TransferRegister,
    VisitorsRegister,
    RemandList,
    NetworkRegister,
}

impl Kind {
    pub fn parse(code: &str) -> Result<Kind, DomainError> {
        Ok(match code {
            "monthly_return" => Kind::MonthlyReturn,
            "admission_register" => Kind::AdmissionRegister,
            "discharge_register" => Kind::DischargeRegister,
            "transfer_register" => Kind::TransferRegister,
            "visitors_register" => Kind::VisitorsRegister,
            "remand_list" => Kind::RemandList,
            "network_register" => Kind::NetworkRegister,
            _ => return Err(DomainError::rejected("That is not a report this system produces.")),
        })
    }

    fn code(self) -> &'static str {
        match self {
            Kind::MonthlyReturn => "monthly_return",
            Kind::AdmissionRegister => "admission_register",
            Kind::DischargeRegister => "discharge_register",
            Kind::TransferRegister => "transfer_register",
            Kind::VisitorsRegister => "visitors_register",
            Kind::RemandList => "remand_list",
            Kind::NetworkRegister => "network_register",
        }
    }

    fn title(self) -> &'static str {
        match self {
            Kind::MonthlyReturn => "Monthly return",
            Kind::AdmissionRegister => "Admission register",
            Kind::DischargeRegister => "Discharge register",
            Kind::TransferRegister => "Transfer register",
            Kind::VisitorsRegister => "Visitors' register",
            Kind::RemandList => "List of prisoners awaiting trial",
            Kind::NetworkRegister => "Facility register",
        }
    }

    fn prefix(self) -> &'static str {
        match self {
            Kind::MonthlyReturn => "MR",
            Kind::AdmissionRegister => "AR",
            Kind::DischargeRegister => "DR",
            Kind::TransferRegister => "TR",
            Kind::VisitorsRegister => "VR",
            Kind::RemandList => "RL",
            Kind::NetworkRegister => "FR",
        }
    }

    fn takes_period(self) -> bool {
        !matches!(self, Kind::RemandList | Kind::NetworkRegister)
    }

    fn head_office_only(self) -> bool {
        matches!(self, Kind::NetworkRegister)
    }
}

/// Head Office holds no prisoners of its own and a facility has no other
/// facility to report on, so each kind belongs to one kind of installation.
pub fn check_available(kind: Kind, head_office: bool) -> Result<(), DomainError> {
    if kind.head_office_only() == head_office {
        Ok(())
    } else if head_office {
        Err(DomainError::rejected("Head Office holds no prisoner records, so it does not produce this report."))
    } else {
        Err(DomainError::rejected("Only Head Office produces this report."))
    }
}

/// `to` is exclusive: the first instant after the period.
#[derive(Debug, Clone, Copy)]
pub struct Period {
    pub from: i64,
    pub to: i64,
}

pub fn resolve_period(kind: Kind, from: Option<i64>, to: Option<i64>) -> Result<Option<Period>, DomainError> {
    if !kind.takes_period() {
        return Ok(None);
    }
    let (Some(from), Some(to)) = (from, to) else {
        return Err(DomainError::rejected("Choose the period this report covers."));
    };
    if to <= from {
        return Err(DomainError::rejected("The period must end after it starts."));
    }
    if to - from > MAX_PERIOD_DAYS * DAY_MS {
        return Err(DomainError::rejected("A report covers at most one year."));
    }
    Ok(Some(Period { from, to }))
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LabeledCount {
    pub label: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
struct Rows<T> {
    rows: Vec<T>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct HeldCounts {
    held: i64,
    convicted: i64,
    unconvicted: i64,
    civil: i64,
    male: i64,
    female: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PopulationStatement {
    held: i64,
    convicted: i64,
    unconvicted: i64,
    civil: i64,
    male: i64,
    female: i64,
    /// Held people whose sex is not recorded, so the sexes always add up to `held`.
    sex_not_recorded: i64,
    in_transit: i64,
    capacity: Option<i64>,
    age_groups: Vec<LabeledCount>,
    nationality: Vec<LabeledCount>,
    education: Vec<LabeledCount>,
    offence_type: Vec<LabeledCount>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Complaints {
    raised: i64,
    resolved: i64,
    open_now: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MonthlyReturn {
    population: PopulationStatement,
    admissions: Vec<LabeledCount>,
    admission_instruments: Vec<LabeledCount>,
    discharges: Vec<LabeledCount>,
    transfers_out: i64,
    transfers_in: i64,
    court_productions: Vec<LabeledCount>,
    visits: Vec<LabeledCount>,
    visit_types: Vec<LabeledCount>,
    health_events: Vec<LabeledCount>,
    complaints: Complaints,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct AdmissionRow {
    id: String,
    prisoner_number: Option<String>,
    first_name: String,
    last_name: String,
    other_names: Option<String>,
    status: String,
    admission_instrument_type: String,
    admission_authority: Option<String>,
    offence: Option<String>,
    admitted_at: i64,
    current_status: String,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct DischargeRow {
    id: String,
    prisoner_id: String,
    prisoner_number: Option<String>,
    first_name: String,
    last_name: String,
    release_type: String,
    released_at: i64,
    ordered_by: Option<String>,
    authorised_by: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct TransferRow {
    id: String,
    direction: String,
    state: String,
    person_name: Option<String>,
    prisoner_number: Option<String>,
    other_prison_name: Option<String>,
    order_reference: Option<String>,
    ordering_authority: Option<String>,
    reason: Option<String>,
    transferred_at: i64,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct VisitRow {
    id: String,
    visited_at: i64,
    prisoner_number: Option<String>,
    prisoner_first_name: String,
    prisoner_last_name: String,
    visitor_name: String,
    relationship: Option<String>,
    visit_type: String,
    status: String,
    party_size: i64,
    started_at: Option<i64>,
    ended_at: Option<i64>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct RemandRow {
    prisoner_id: String,
    prisoner_number: Option<String>,
    first_name: String,
    last_name: String,
    offence: Option<String>,
    admitted_at: i64,
    admission_authority: Option<String>,
    high_court_only_offence: bool,
    last_produced_at: Option<i64>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct NetworkRow {
    id: String,
    name: String,
    facility_number: String,
    region: String,
    location: String,
    status: String,
    last_synced_at: Option<i64>,
    officer_count: i64,
    held_at_last_sync: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Issuer {
    pub name: Option<String>,
    pub facility_number: Option<String>,
    pub location: Option<String>,
    pub region: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportDocument {
    pub kind: String,
    pub title: String,
    pub period_from: Option<i64>,
    pub period_to: Option<i64>,
    pub as_at: i64,
    pub issuer: Issuer,
    pub body: Value,
}

fn value<T: Serialize>(body: &T) -> Value {
    serde_json::to_value(body).unwrap_or(Value::Null)
}

async fn counts(conn: &mut SqliteConnection, sql: &'static str) -> Result<Vec<LabeledCount>, sqlx::Error> {
    sqlx::query_as::<_, LabeledCount>(sql).fetch_all(&mut *conn).await
}

async fn counts_in(conn: &mut SqliteConnection, sql: &'static str, period: Period) -> Result<Vec<LabeledCount>, sqlx::Error> {
    sqlx::query_as::<_, LabeledCount>(sql).bind(period.from).bind(period.to).fetch_all(&mut *conn).await
}

async fn scalar_in(conn: &mut SqliteConnection, sql: &'static str, period: Period) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(sql).bind(period.from).bind(period.to).fetch_one(&mut *conn).await
}

async fn population(conn: &mut SqliteConnection) -> Result<PopulationStatement, sqlx::Error> {
    let held: HeldCounts = sqlx::query_as(
        "SELECT COUNT(*) AS held,
                COALESCE(SUM(status = 'convicted'), 0) AS convicted,
                COALESCE(SUM(status = 'unconvicted'), 0) AS unconvicted,
                COALESCE(SUM(status = 'civil'), 0) AS civil,
                COALESCE(SUM(sex = 'male'), 0) AS male,
                COALESCE(SUM(sex = 'female'), 0) AS female
         FROM prisoners WHERE current_status = 'in_custody'",
    )
    .fetch_one(&mut *conn)
    .await?;
    let in_transit: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prisoners WHERE current_status = 'in_transit'").fetch_one(&mut *conn).await?;
    let capacity = facility_profile::get_conn(conn).await?.approved_capacity;

    // The age bands are the ones UPS publishes its population statistics by.
    let age_groups = counts(
        conn,
        "SELECT CASE
            WHEN date_of_birth IS NULL THEN 'Not recorded'
            WHEN CAST((julianday('now') - julianday(date(date_of_birth / 1000, 'unixepoch'))) / 365.25 AS INTEGER) <= 17 THEN 'Aged 17 and under'
            WHEN CAST((julianday('now') - julianday(date(date_of_birth / 1000, 'unixepoch'))) / 365.25 AS INTEGER) <= 36 THEN 'Aged 18 to 36'
            WHEN CAST((julianday('now') - julianday(date(date_of_birth / 1000, 'unixepoch'))) / 365.25 AS INTEGER) <= 54 THEN 'Aged 37 to 54'
            ELSE 'Aged 55 and over'
        END AS label, COUNT(*) AS count FROM prisoners WHERE current_status = 'in_custody' GROUP BY label ORDER BY label",
    )
    .await?;
    let nationality = counts(
        conn,
        "SELECT COALESCE(nationality, 'not_recorded') AS label, COUNT(*) AS count FROM prisoners
         WHERE current_status = 'in_custody' GROUP BY label ORDER BY label",
    )
    .await?;
    let education = counts(
        conn,
        "SELECT COALESCE(education_level, 'not_recorded') AS label, COUNT(*) AS count FROM prisoners
         WHERE current_status = 'in_custody' GROUP BY label ORDER BY label",
    )
    .await?;
    // Offences are free text, so this groups by keyword and is indicative only.
    let offence_type = counts(
        conn,
        "SELECT CASE
            WHEN offence IS NULL THEN 'Not recorded'
            WHEN LOWER(offence) LIKE '%terroris%' THEN 'Terrorism'
            WHEN LOWER(offence) LIKE '%treason%' THEN 'Treason'
            WHEN LOWER(offence) LIKE '%murder%' THEN 'Murder'
            WHEN LOWER(offence) LIKE '%aggravated robbery%' THEN 'Aggravated robbery'
            WHEN LOWER(offence) LIKE '%rape%' THEN 'Rape'
            ELSE 'Other'
        END AS label, COUNT(*) AS count FROM prisoners WHERE current_status = 'in_custody' GROUP BY label ORDER BY label",
    )
    .await?;

    Ok(PopulationStatement {
        held: held.held,
        convicted: held.convicted,
        unconvicted: held.unconvicted,
        civil: held.civil,
        male: held.male,
        female: held.female,
        sex_not_recorded: held.held - held.male - held.female,
        in_transit,
        capacity,
        age_groups,
        nationality,
        education,
        offence_type,
    })
}

async fn monthly_return(conn: &mut SqliteConnection, period: Period) -> Result<MonthlyReturn, sqlx::Error> {
    Ok(MonthlyReturn {
        population: population(conn).await?,
        admissions: counts_in(
            conn,
            "SELECT status AS label, COUNT(*) AS count FROM prisoners WHERE admitted_at >= ?1 AND admitted_at < ?2 GROUP BY status ORDER BY status",
            period,
        )
        .await?,
        admission_instruments: counts_in(
            conn,
            "SELECT admission_instrument_type AS label, COUNT(*) AS count FROM prisoners
             WHERE admitted_at >= ?1 AND admitted_at < ?2 GROUP BY admission_instrument_type ORDER BY admission_instrument_type",
            period,
        )
        .await?,
        // A correction after an erroneous release puts the person back in
        // custody; it is not a discharge.
        discharges: counts_in(
            conn,
            "SELECT release_type AS label, COUNT(*) AS count FROM releases
             WHERE released_at >= ?1 AND released_at < ?2 AND release_type <> 'erroneous_release_correction'
             GROUP BY release_type ORDER BY release_type",
            period,
        )
        .await?,
        transfers_out: scalar_in(
            conn,
            "SELECT COUNT(*) FROM transfers WHERE direction = 'out' AND state IN ('in_transit', 'confirmed') AND transferred_at >= ?1 AND transferred_at < ?2",
            period,
        )
        .await?,
        transfers_in: scalar_in(
            conn,
            "SELECT COUNT(*) FROM transfers WHERE direction = 'in' AND state IN ('arrived', 'confirmed') AND transferred_at >= ?1 AND transferred_at < ?2",
            period,
        )
        .await?,
        court_productions: counts_in(
            conn,
            "SELECT state AS label, COUNT(*) AS count FROM court_productions WHERE production_date >= ?1 AND production_date < ?2 GROUP BY state ORDER BY state",
            period,
        )
        .await?,
        visits: counts_in(
            conn,
            "SELECT status AS label, COUNT(*) AS count FROM visits WHERE visited_at >= ?1 AND visited_at < ?2 GROUP BY status ORDER BY status",
            period,
        )
        .await?,
        visit_types: counts_in(
            conn,
            "SELECT visit_type AS label, COUNT(*) AS count FROM visits WHERE visited_at >= ?1 AND visited_at < ?2 GROUP BY visit_type ORDER BY visit_type",
            period,
        )
        .await?,
        health_events: counts_in(
            conn,
            "SELECT event_type AS label, COUNT(*) AS count FROM health_events WHERE occurred_at >= ?1 AND occurred_at < ?2 GROUP BY event_type ORDER BY event_type",
            period,
        )
        .await?,
        complaints: Complaints {
            raised: scalar_in(conn, "SELECT COUNT(*) FROM requests WHERE raised_at >= ?1 AND raised_at < ?2", period).await?,
            resolved: scalar_in(conn, "SELECT COUNT(*) FROM requests WHERE resolved_at >= ?1 AND resolved_at < ?2", period).await?,
            open_now: sqlx::query_scalar("SELECT COUNT(*) FROM requests WHERE resolved_at IS NULL").fetch_one(&mut *conn).await?,
        },
    })
}

async fn admission_register(conn: &mut SqliteConnection, period: Period) -> Result<Vec<AdmissionRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, prisoner_number, first_name, last_name, other_names, status, admission_instrument_type, admission_authority,
                offence, admitted_at, current_status
         FROM prisoners WHERE admitted_at >= ?1 AND admitted_at < ?2 ORDER BY admitted_at ASC, created_at ASC LIMIT ?3",
    )
    .bind(period.from)
    .bind(period.to)
    .bind(MAX_ROWS)
    .fetch_all(&mut *conn)
    .await
}

async fn discharge_register(conn: &mut SqliteConnection, period: Period) -> Result<Vec<DischargeRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT r.id, r.prisoner_id, p.prisoner_number, p.first_name, p.last_name, r.release_type, r.released_at, r.ordered_by, r.authorised_by
         FROM releases r JOIN prisoners p ON p.id = r.prisoner_id
         WHERE r.released_at >= ?1 AND r.released_at < ?2 ORDER BY r.released_at ASC LIMIT ?3",
    )
    .bind(period.from)
    .bind(period.to)
    .bind(MAX_ROWS)
    .fetch_all(&mut *conn)
    .await
}

async fn transfer_register(conn: &mut SqliteConnection, period: Period) -> Result<Vec<TransferRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT t.id, t.direction, t.state, COALESCE(t.person_name, TRIM(p.first_name || ' ' || p.last_name)) AS person_name,
                p.prisoner_number, t.other_prison_name, t.order_reference, t.ordering_authority, t.reason, t.transferred_at
         FROM transfers t LEFT JOIN prisoners p ON p.id = t.prisoner_id
         WHERE t.transferred_at >= ?1 AND t.transferred_at < ?2 AND t.state <> 'cancelled'
         ORDER BY t.transferred_at ASC LIMIT ?3",
    )
    .bind(period.from)
    .bind(period.to)
    .bind(MAX_ROWS)
    .fetch_all(&mut *conn)
    .await
}

async fn visitors_register(conn: &mut SqliteConnection, period: Period) -> Result<Vec<VisitRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT v.id, v.visited_at, p.prisoner_number, p.first_name AS prisoner_first_name, p.last_name AS prisoner_last_name,
                v.visitor_name, v.relationship, v.visit_type, v.status, v.party_size, v.started_at, v.ended_at
         FROM visits v JOIN prisoners p ON p.id = v.prisoner_id
         WHERE v.visited_at >= ?1 AND v.visited_at < ?2 ORDER BY v.visited_at ASC LIMIT ?3",
    )
    .bind(period.from)
    .bind(period.to)
    .bind(MAX_ROWS)
    .fetch_all(&mut *conn)
    .await
}

async fn remand_list(conn: &mut SqliteConnection) -> Result<Vec<RemandRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT p.id AS prisoner_id, p.prisoner_number, p.first_name, p.last_name, p.offence, p.admitted_at, p.admission_authority,
                p.high_court_only_offence,
                (SELECT MAX(cp.production_date) FROM court_productions cp WHERE cp.prisoner_id = p.id AND cp.state = 'produced') AS last_produced_at
         FROM prisoners p WHERE p.current_status = 'in_custody' AND p.status = 'unconvicted' ORDER BY p.admitted_at ASC",
    )
    .fetch_all(&mut *conn)
    .await
}

/// The prisoner counts here are the last ones a facility reported, not a
/// live view of its records, so the register says when that was.
async fn network_register(conn: &mut SqliteConnection) -> Result<Vec<NetworkRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT f.id, f.name, f.facility_number, f.region, f.location, f.status, f.last_synced_at,
                (SELECT COUNT(*) FROM facility_officers o WHERE o.facility_id = f.id) AS officer_count,
                (SELECT COUNT(*) FROM prisoners p WHERE p.facility_id = f.id AND p.current_status = 'in_custody') AS held_at_last_sync
         FROM facilities f ORDER BY f.region, f.name",
    )
    .fetch_all(&mut *conn)
    .await
}

fn required(period: Option<Period>) -> Result<Period, DomainError> {
    period.ok_or_else(|| DomainError::rejected("Choose the period this report covers."))
}

pub async fn build(conn: &mut SqliteConnection, kind: Kind, period: Option<Period>) -> Result<ReportDocument, DomainError> {
    let as_at = now_ms();
    let body = match kind {
        Kind::MonthlyReturn => value(&monthly_return(conn, required(period)?).await?),
        Kind::AdmissionRegister => value(&Rows { rows: admission_register(conn, required(period)?).await? }),
        Kind::DischargeRegister => value(&Rows { rows: discharge_register(conn, required(period)?).await? }),
        Kind::TransferRegister => value(&Rows { rows: transfer_register(conn, required(period)?).await? }),
        Kind::VisitorsRegister => value(&Rows { rows: visitors_register(conn, required(period)?).await? }),
        Kind::RemandList => value(&Rows { rows: remand_list(conn).await? }),
        Kind::NetworkRegister => value(&Rows { rows: network_register(conn).await? }),
    };
    let issuer = if kind.head_office_only() {
        Issuer { name: Some("Head Office".to_string()), facility_number: None, location: None, region: None }
    } else {
        let profile = facility_profile::get_conn(conn).await?;
        Issuer { name: profile.name, facility_number: profile.facility_number, location: profile.location, region: profile.region }
    };
    Ok(ReportDocument {
        kind: kind.code().to_string(),
        title: kind.title().to_string(),
        period_from: period.map(|p| p.from),
        period_to: period.map(|p| p.to),
        as_at,
        issuer,
        body,
    })
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ReportRecord {
    pub id: String,
    pub reference: String,
    pub kind: String,
    pub title: String,
    pub period_from: Option<i64>,
    pub period_to: Option<i64>,
    pub template_version: i64,
    pub content_hash: String,
    pub generated_by_name: String,
    pub generated_at: i64,
    /// Set once the OIC has attested it (`returns.rs`). Never changes after.
    pub attested_at: Option<i64>,
    pub attested_by_name: Option<String>,
    pub attested_by_badge: Option<String>,
    /// What the officer affirmed, as worded when they attested.
    pub attestation_statement: Option<String>,
    /// `queued` (waiting for Head Office) or `acknowledged`; `None` if it has
    /// not been submitted.
    pub submission: Option<String>,
    pub acknowledged_at: Option<i64>,
    pub submission_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedReport {
    #[serde(flatten)]
    pub record: ReportRecord,
    pub document: Value,
}

macro_rules! select_record {
    ($tail:literal) => {
        concat!(
            "SELECT g.id, g.reference, g.kind, g.title, g.period_from, g.period_to, g.template_version, g.content_hash, g.generated_by_name, g.generated_at,
                    a.attested_at, a.attested_by_name, a.attested_by_badge, a.statement AS attestation_statement,
                    CASE WHEN s.report_id IS NULL THEN NULL WHEN s.acknowledged_at IS NULL THEN 'queued' ELSE 'acknowledged' END AS submission,
                    s.acknowledged_at, s.last_error AS submission_error
             FROM generated_reports g
             LEFT JOIN return_attestations a ON a.report_id = g.id
             LEFT JOIN return_submissions s ON s.report_id = g.id ",
            $tail
        )
    };
}

pub async fn generate(conn: &mut SqliteConnection, actor: &Actor, kind: Kind, period: Option<Period>) -> Result<GeneratedReport, DomainError> {
    let document = build(conn, kind, period).await?;
    store(conn, actor, kind.prefix(), &document).await
}

/// Numbers, fingerprints and stores a finished document, and audits it. Every
/// report that is issued, whether the node built it or an officer composed it,
/// goes through here, so a reference and a hash mean the same thing for all.
pub(super) async fn store(conn: &mut SqliteConnection, actor: &Actor, prefix: &str, document: &ReportDocument) -> Result<GeneratedReport, DomainError> {
    let content = serde_json::to_string(document).map_err(|e| DomainError::rejected(e.to_string()))?;
    let content_hash = format!("{:x}", Sha256::digest(content.as_bytes()));

    let year = eat_datetime(document.as_at).year();
    let stem = format!("{prefix}-{year}-");
    let taken: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM generated_reports WHERE reference LIKE ?").bind(format!("{stem}%")).fetch_one(&mut *conn).await?;
    let reference = format!("{stem}{:04}", taken + 1);
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO generated_reports
            (id, reference, kind, title, period_from, period_to, template_version, content_json, content_hash, generated_by_id, generated_by_name, generated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&reference)
    .bind(&document.kind)
    .bind(&document.title)
    .bind(document.period_from)
    .bind(document.period_to)
    .bind(TEMPLATE_VERSION)
    .bind(&content)
    .bind(&content_hash)
    .bind(&actor.officer_id)
    .bind(&actor.name)
    .bind(document.as_at)
    .execute(&mut *conn)
    .await?;

    let record: ReportRecord =
        sqlx::query_as(select_record!("WHERE g.id = ?")).bind(&id).fetch_one(&mut *conn).await?;
    audit::record(conn, actor, AuditEntry::new("report.generate", "report", Some(&id)).after(&record)).await?;
    Ok(GeneratedReport { record, document: value(document) })
}

/// The full-screen trend view (docs/prisons/product-map/05 N): every
/// recorded event, plus the prisoner population profiled the way UPS
/// publishes national statistics. Derived entirely from existing records,
/// nothing tracked separately, so this screen can never add a figure the
/// registers do not already hold.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryStatement {
    admission_timestamps: Vec<i64>,
    release_timestamps: Vec<i64>,
    transfer_timestamps: Vec<i64>,
    visit_timestamps: Vec<i64>,
    court_production_timestamps: Vec<i64>,
    health_event_timestamps: Vec<i64>,
    prisoner_category_counts: Vec<LabeledCount>,
    custody_status_counts: Vec<LabeledCount>,
    release_type_counts: Vec<LabeledCount>,
    transfer_direction_counts: Vec<LabeledCount>,
    health_event_type_counts: Vec<LabeledCount>,
    admission_year_counts: Vec<LabeledCount>,
    admission_month_counts: Vec<LabeledCount>,
    prisoner_age_group_counts: Vec<LabeledCount>,
    prisoner_sex_counts: Vec<LabeledCount>,
    prisoner_education_counts: Vec<LabeledCount>,
    prisoner_nationality_counts: Vec<LabeledCount>,
    prisoner_offence_type_counts: Vec<LabeledCount>,
    prisoner_sentence_category_counts: Vec<LabeledCount>,
    facility_population_counts: Vec<LabeledCount>,
    facility_in_custody_counts: Vec<LabeledCount>,
}

async fn timestamp_list(conn: &mut SqliteConnection, sql: &'static str) -> Result<Vec<i64>, sqlx::Error> {
    sqlx::query_scalar(sql).fetch_all(&mut *conn).await
}

pub async fn summary(conn: &mut SqliteConnection) -> Result<SummaryStatement, sqlx::Error> {
    let age_groups = counts(
        conn,
        "SELECT CASE
            WHEN date_of_birth IS NULL THEN 'Not recorded'
            WHEN CAST((julianday('now') - julianday(date(date_of_birth / 1000, 'unixepoch'))) / 365.25 AS INTEGER) <= 17 THEN 'Aged 17 and under'
            WHEN CAST((julianday('now') - julianday(date(date_of_birth / 1000, 'unixepoch'))) / 365.25 AS INTEGER) <= 36 THEN 'Aged 18 to 36'
            WHEN CAST((julianday('now') - julianday(date(date_of_birth / 1000, 'unixepoch'))) / 365.25 AS INTEGER) <= 54 THEN 'Aged 37 to 54'
            ELSE 'Aged 55 and over'
        END AS label, COUNT(*) AS count FROM prisoners WHERE current_status = 'in_custody' GROUP BY label ORDER BY label",
    )
    .await?;
    let nationality = counts(
        conn,
        "SELECT COALESCE(nationality, 'not_recorded') AS label, COUNT(*) AS count FROM prisoners
         WHERE current_status = 'in_custody' GROUP BY label ORDER BY label",
    )
    .await?;
    let education = counts(
        conn,
        "SELECT COALESCE(education_level, 'not_recorded') AS label, COUNT(*) AS count FROM prisoners
         WHERE current_status = 'in_custody' GROUP BY label ORDER BY label",
    )
    .await?;
    let offence_type = counts(
        conn,
        "SELECT CASE
            WHEN offence IS NULL THEN 'Not recorded'
            WHEN LOWER(offence) LIKE '%terroris%' THEN 'Terrorism'
            WHEN LOWER(offence) LIKE '%treason%' THEN 'Treason'
            WHEN LOWER(offence) LIKE '%murder%' THEN 'Murder'
            WHEN LOWER(offence) LIKE '%aggravated robbery%' THEN 'Aggravated robbery'
            WHEN LOWER(offence) LIKE '%rape%' THEN 'Rape'
            ELSE 'Other'
        END AS label, COUNT(*) AS count FROM prisoners WHERE current_status = 'in_custody' GROUP BY label ORDER BY label",
    )
    .await?;
    Ok(SummaryStatement {
        admission_timestamps: timestamp_list(conn, "SELECT admitted_at FROM prisoners ORDER BY admitted_at").await?,
        release_timestamps: timestamp_list(conn, "SELECT released_at FROM releases ORDER BY released_at").await?,
        transfer_timestamps: timestamp_list(
            conn,
            "SELECT transferred_at FROM transfers WHERE state <> 'cancelled' ORDER BY transferred_at",
        )
        .await?,
        visit_timestamps: timestamp_list(conn, "SELECT visited_at FROM visits ORDER BY visited_at").await?,
        court_production_timestamps: timestamp_list(conn, "SELECT production_date FROM court_productions ORDER BY production_date").await?,
        health_event_timestamps: timestamp_list(conn, "SELECT occurred_at FROM health_events ORDER BY occurred_at").await?,
        prisoner_category_counts: counts(
            conn,
            "SELECT status AS label, COUNT(*) AS count FROM prisoners GROUP BY status ORDER BY status",
        )
        .await?,
        custody_status_counts: counts(
            conn,
            "SELECT current_status AS label, COUNT(*) AS count FROM prisoners GROUP BY current_status ORDER BY current_status",
        )
        .await?,
        release_type_counts: counts(
            conn,
            "SELECT release_type AS label, COUNT(*) AS count FROM releases WHERE release_type <> 'erroneous_release_correction'
             GROUP BY release_type ORDER BY release_type",
        )
        .await?,
        transfer_direction_counts: counts(
            conn,
            "SELECT direction AS label, COUNT(*) AS count FROM transfers WHERE state <> 'cancelled' GROUP BY direction ORDER BY direction",
        )
        .await?,
        health_event_type_counts: counts(
            conn,
            "SELECT event_type AS label, COUNT(*) AS count FROM health_events GROUP BY event_type ORDER BY event_type",
        )
        .await?,
        admission_year_counts: counts(
            conn,
            "SELECT strftime('%Y', datetime(admitted_at / 1000, 'unixepoch')) AS label, COUNT(*) AS count FROM prisoners
             GROUP BY label ORDER BY label",
        )
        .await?,
        admission_month_counts: counts(
            conn,
            "SELECT strftime('%Y-%m', datetime(admitted_at / 1000, 'unixepoch')) AS label, COUNT(*) AS count FROM prisoners
             GROUP BY label ORDER BY label",
        )
        .await?,
        prisoner_age_group_counts: age_groups,
        prisoner_sex_counts: counts(
            conn,
            "SELECT COALESCE(sex, 'not_recorded') AS label, COUNT(*) AS count FROM prisoners
             WHERE current_status = 'in_custody' GROUP BY label ORDER BY label",
        )
        .await?,
        prisoner_education_counts: education,
        prisoner_nationality_counts: nationality,
        prisoner_offence_type_counts: offence_type,
        prisoner_sentence_category_counts: counts(
            conn,
            "SELECT CASE status
                WHEN 'convicted' THEN 'Convicted (Sentenced)'
                WHEN 'unconvicted' THEN 'Unconvicted (Remand)'
                WHEN 'civil' THEN 'Civil (debtor)'
                ELSE status
            END AS label, COUNT(*) AS count FROM prisoners GROUP BY label ORDER BY label",
        )
        .await?,
        facility_population_counts: counts(
            conn,
            "SELECT COALESCE(f.name, 'Not assigned') AS label, COUNT(*) AS count
             FROM prisoners p LEFT JOIN facilities f ON f.id = p.facility_id
             GROUP BY COALESCE(f.name, 'Not assigned') ORDER BY label",
        )
        .await?,
        facility_in_custody_counts: counts(
            conn,
            "SELECT COALESCE(f.name, 'Not assigned') AS label, COUNT(*) AS count
             FROM prisoners p LEFT JOIN facilities f ON f.id = p.facility_id
             WHERE p.current_status = 'in_custody'
             GROUP BY COALESCE(f.name, 'Not assigned') ORDER BY label",
        )
        .await?,
    })
}

pub async fn list(pool: &SqlitePool) -> Result<Vec<ReportRecord>, sqlx::Error> {
    sqlx::query_as(select_record!("ORDER BY g.generated_at DESC LIMIT 200")).fetch_all(pool).await
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<GeneratedReport>, DomainError> {
    let record: Option<ReportRecord> =
        sqlx::query_as(select_record!("WHERE g.id = ?")).bind(id).fetch_optional(pool).await?;
    let Some(record) = record else { return Ok(None) };
    let content: String = sqlx::query_scalar("SELECT content_json FROM generated_reports WHERE id = ?").bind(id).fetch_one(pool).await?;
    let document = serde_json::from_str(&content).map_err(|e| DomainError::rejected(e.to_string()))?;
    Ok(Some(GeneratedReport { record, document }))
}
