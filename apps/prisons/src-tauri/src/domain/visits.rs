//! Visits: the visitor register, the visit lifecycle and the facility's visit
//! rules (docs/prisons/RESEARCH.md 9 to 11.7, product-map 02 W7).
//!
//! Grounded facts: gate identification and search, reception registration,
//! then a supervised visit; a legal advisor or personal doctor is seen within
//! sight but not within hearing (s.64(3)); weekend and researcher visits need
//! special authorisation. Everything numeric (hours, days, party limits) is a
//! configurable rule because its source is secondary or unconfirmed (R-18).
//! Outcomes beyond attended or denied are UNKNOWN in the docs, so no_show and
//! cancelled are plain record states, not statutory ones.

use chrono::{Datelike, Timelike};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::{perm, Actor};
use super::error::DomainError;
use super::time::{self, now_ms, DAY_MS};

pub const PRIVILEGED_TYPES: &[&str] = &["legal_advisor", "personal_doctor"];

fn is_special(visit_type: &str) -> bool {
    visit_type.starts_with("special_authorization")
}

fn who(actor: &Actor) -> String {
    match &actor.badge_number {
        Some(badge) => format!("{} ({badge})", actor.name),
        None => actor.name.clone(),
    }
}

fn clean(value: Option<String>) -> Option<String> {
    value.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Visit {
    pub id: String,
    pub prisoner_id: String,
    pub visitor_id: Option<String>,
    pub visitor_name: String,
    pub visitor_identification: Option<String>,
    pub relationship: Option<String>,
    pub visited_at: i64,
    pub duration_minutes: i64,
    pub party_size: i64,
    pub supervising_officer: Option<String>,
    pub notes: Option<String>,
    pub visit_type: String,
    pub privileged: bool,
    pub status: String,
    pub authorized_by: Option<String>,
    pub decided_by: Option<String>,
    pub decided_at: Option<i64>,
    pub decision_reason: Option<String>,
    pub id_verified: bool,
    pub search_done: bool,
    pub checked_in_at: Option<i64>,
    pub checked_in_by: Option<String>,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub created_at: i64,
}

/// A visit joined with its prisoner's name: the facility-wide visit log.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct VisitListItem {
    #[sqlx(flatten)]
    #[serde(flatten)]
    pub visit: Visit,
    pub prisoner_first_name: String,
    pub prisoner_last_name: String,
    pub prisoner_other_names: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct VisitItem {
    pub id: String,
    pub visit_id: String,
    pub description: String,
    pub disposition: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Visitor {
    pub id: String,
    pub full_name: String,
    pub id_type: String,
    pub id_number: Option<String>,
    pub phone: Option<String>,
    pub relationship_default: Option<String>,
    pub created_at: i64,
}

/// A visitor as approved for one prisoner, with how often they came.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ApprovedVisitor {
    pub visitor_id: String,
    pub full_name: String,
    pub id_type: String,
    pub id_number: Option<String>,
    pub phone: Option<String>,
    pub relationship: Option<String>,
    pub status: String,
    pub note: Option<String>,
    pub approved_by: Option<String>,
    pub approved_at: i64,
    pub visits_completed: i64,
    pub last_visit_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisitRules {
    pub max_visitors_per_visit: i64,
    pub max_visitors_per_prisoner_per_day: i64,
    pub visiting_days: Vec<i64>,
    pub opens_minutes: i64,
    pub closes_minutes: i64,
    pub default_duration_minutes: i64,
    pub updated_at: Option<i64>,
    pub updated_by: Option<String>,
}

#[derive(FromRow)]
struct RulesRow {
    max_visitors_per_visit: i64,
    max_visitors_per_prisoner_per_day: i64,
    visiting_days: String,
    opens_minutes: i64,
    closes_minutes: i64,
    default_duration_minutes: i64,
    updated_at: Option<i64>,
    updated_by: Option<String>,
}

impl From<RulesRow> for VisitRules {
    fn from(row: RulesRow) -> Self {
        VisitRules {
            max_visitors_per_visit: row.max_visitors_per_visit,
            max_visitors_per_prisoner_per_day: row.max_visitors_per_prisoner_per_day,
            visiting_days: row.visiting_days.split(',').filter_map(|d| d.trim().parse().ok()).collect(),
            opens_minutes: row.opens_minutes,
            closes_minutes: row.closes_minutes,
            default_duration_minutes: row.default_duration_minutes,
            updated_at: row.updated_at,
            updated_by: row.updated_by,
        }
    }
}

const RULES_SQL: &str = "SELECT max_visitors_per_visit, max_visitors_per_prisoner_per_day, visiting_days, opens_minutes,
        closes_minutes, default_duration_minutes, updated_at, updated_by FROM visit_rules WHERE id = 'default'";

pub async fn get_rules(pool: &SqlitePool) -> Result<VisitRules, sqlx::Error> {
    Ok(sqlx::query_as::<_, RulesRow>(RULES_SQL).fetch_one(pool).await?.into())
}

async fn get_rules_conn(conn: &mut SqliteConnection) -> Result<VisitRules, sqlx::Error> {
    Ok(sqlx::query_as::<_, RulesRow>(RULES_SQL).fetch_one(&mut *conn).await?.into())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveVisitRulesInput {
    pub max_visitors_per_visit: i64,
    pub max_visitors_per_prisoner_per_day: i64,
    pub visiting_days: Vec<i64>,
    pub opens_minutes: i64,
    pub closes_minutes: i64,
    pub default_duration_minutes: i64,
}

pub async fn save_rules(conn: &mut SqliteConnection, actor: &Actor, input: SaveVisitRulesInput) -> Result<VisitRules, DomainError> {
    if input.max_visitors_per_visit < 1 || input.max_visitors_per_prisoner_per_day < input.max_visitors_per_visit {
        return Err(DomainError::rejected("The daily limit must be at least the limit for one visit, and both at least 1."));
    }
    if input.visiting_days.is_empty() || input.visiting_days.iter().any(|d| !(1..=7).contains(d)) {
        return Err(DomainError::rejected("Choose at least one visiting day."));
    }
    if input.opens_minutes < 0 || input.closes_minutes > 1440 || input.opens_minutes >= input.closes_minutes {
        return Err(DomainError::rejected("Visiting hours must open before they close."));
    }
    if !(5..=240).contains(&input.default_duration_minutes) {
        return Err(DomainError::rejected("A visit lasts between 5 and 240 minutes."));
    }
    let before = get_rules_conn(conn).await?;
    let mut days = input.visiting_days.clone();
    days.sort_unstable();
    days.dedup();
    let days_text = days.iter().map(i64::to_string).collect::<Vec<_>>().join(",");
    sqlx::query(
        "UPDATE visit_rules SET max_visitors_per_visit = ?, max_visitors_per_prisoner_per_day = ?, visiting_days = ?,
                opens_minutes = ?, closes_minutes = ?, default_duration_minutes = ?, updated_at = ?, updated_by = ?
         WHERE id = 'default'",
    )
    .bind(input.max_visitors_per_visit)
    .bind(input.max_visitors_per_prisoner_per_day)
    .bind(days_text)
    .bind(input.opens_minutes)
    .bind(input.closes_minutes)
    .bind(input.default_duration_minutes)
    .bind(now_ms())
    .bind(who(actor))
    .execute(&mut *conn)
    .await?;
    let after = get_rules_conn(conn).await?;
    audit::record(conn, actor, AuditEntry::new("visit.rules_saved", "visit_rules", Some("default")).before(&before).after(&after)).await?;
    Ok(after)
}

fn outside_visiting_hours(rules: &VisitRules, at: i64) -> bool {
    let local = time::eat_datetime(at);
    let day = local.weekday().number_from_monday() as i64;
    let minutes = (local.hour() * 60 + local.minute()) as i64;
    !rules.visiting_days.contains(&day) || minutes < rules.opens_minutes || minutes >= rules.closes_minutes
}

/// A visit needs someone with authority (the OIC) to approve it when it is a
/// special-authorisation type, or falls outside the facility's visiting days
/// and hours. A legal advisor or personal doctor is a standing entitlement,
/// so it is never held for authority.
fn needs_authority(rules: &VisitRules, visit_type: &str, visited_at: i64) -> bool {
    if PRIVILEGED_TYPES.contains(&visit_type) {
        return false;
    }
    is_special(visit_type) || outside_visiting_hours(rules, visited_at)
}

// ---------------------------------------------------------------------
// Visitors
// ---------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewVisitorInput {
    pub full_name: String,
    pub id_type: Option<String>,
    pub id_number: Option<String>,
    pub phone: Option<String>,
    pub relationship: Option<String>,
}

const SELECT_VISITOR: &str = "SELECT id, full_name, id_type, id_number, phone, relationship_default, created_at FROM visitors";

async fn get_visitor(conn: &mut SqliteConnection, id: &str) -> Result<Visitor, DomainError> {
    sqlx::query_as::<_, Visitor>(sqlx::AssertSqlSafe(format!("{SELECT_VISITOR} WHERE id = ?")))
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?
        .ok_or(DomainError::NotFound("That visitor"))
}

/// The same identity document is the same person: a second registration
/// reuses the existing visitor instead of creating a duplicate.
async fn find_or_create_visitor(conn: &mut SqliteConnection, actor: &Actor, input: NewVisitorInput) -> Result<Visitor, DomainError> {
    let full_name = input.full_name.trim().to_string();
    if full_name.is_empty() {
        return Err(DomainError::rejected("Enter the visitor's full name."));
    }
    let id_type = clean(input.id_type).unwrap_or_else(|| "national_id".to_string());
    let id_number = clean(input.id_number);
    let phone = clean(input.phone);
    let relationship = clean(input.relationship);

    if let Some(number) = &id_number {
        let existing: Option<String> = sqlx::query_scalar("SELECT id FROM visitors WHERE id_type = ? AND id_number = ? COLLATE NOCASE")
            .bind(&id_type)
            .bind(number)
            .fetch_optional(&mut *conn)
            .await?;
        if let Some(id) = existing {
            return get_visitor(conn, &id).await;
        }
    }

    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO visitors (id, full_name, id_type, id_number, phone, relationship_default) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&full_name)
        .bind(&id_type)
        .bind(&id_number)
        .bind(&phone)
        .bind(&relationship)
        .execute(&mut *conn)
        .await?;
    let visitor = get_visitor(conn, &id).await?;
    audit::record(conn, actor, AuditEntry::new("visitor.register", "visitor", Some(&id)).after(&visitor)).await?;
    Ok(visitor)
}

pub async fn search_visitors(pool: &SqlitePool, query: &str) -> Result<Vec<Visitor>, sqlx::Error> {
    let like = format!("%{}%", query.trim());
    sqlx::query_as::<_, Visitor>(sqlx::AssertSqlSafe(format!(
        "{SELECT_VISITOR} WHERE full_name LIKE ?1 OR id_number LIKE ?1 OR phone LIKE ?1 ORDER BY full_name COLLATE NOCASE LIMIT 50"
    )))
    .bind(like)
    .fetch_all(pool)
    .await
}

const SELECT_APPROVED: &str = "SELECT a.visitor_id, v.full_name, v.id_type, v.id_number, v.phone, a.relationship, a.status, a.note,
        a.approved_by, a.approved_at,
        (SELECT COUNT(*) FROM visits x WHERE x.visitor_id = a.visitor_id AND x.prisoner_id = a.prisoner_id AND x.status = 'completed') AS visits_completed,
        (SELECT MAX(x.visited_at) FROM visits x WHERE x.visitor_id = a.visitor_id AND x.prisoner_id = a.prisoner_id AND x.status = 'completed') AS last_visit_at
     FROM prisoner_approved_visitors a JOIN visitors v ON v.id = a.visitor_id";

pub async fn list_approved(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<ApprovedVisitor>, sqlx::Error> {
    sqlx::query_as::<_, ApprovedVisitor>(sqlx::AssertSqlSafe(format!("{SELECT_APPROVED} WHERE a.prisoner_id = ? ORDER BY v.full_name COLLATE NOCASE")))
        .bind(prisoner_id)
        .fetch_all(pool)
        .await
}

async fn get_approved(conn: &mut SqliteConnection, prisoner_id: &str, visitor_id: &str) -> Result<Option<ApprovedVisitor>, sqlx::Error> {
    sqlx::query_as::<_, ApprovedVisitor>(sqlx::AssertSqlSafe(format!("{SELECT_APPROVED} WHERE a.prisoner_id = ? AND a.visitor_id = ?")))
        .bind(prisoner_id)
        .bind(visitor_id)
        .fetch_optional(&mut *conn)
        .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveVisitorInput {
    pub visitor_id: Option<String>,
    pub new_visitor: Option<NewVisitorInput>,
    pub relationship: Option<String>,
    pub note: Option<String>,
}

/// Approves a visitor for one prisoner (idempotent). A suspended approval is
/// never silently reinstated here: it is lifted on purpose with
/// `set_approval_status`.
async fn ensure_approved(
    conn: &mut SqliteConnection,
    actor: &Actor,
    prisoner_id: &str,
    visitor: &Visitor,
    relationship: Option<String>,
    note: Option<String>,
) -> Result<ApprovedVisitor, DomainError> {
    if let Some(existing) = get_approved(conn, prisoner_id, &visitor.id).await? {
        if existing.status == "suspended" {
            return Err(DomainError::conflict(
                "VISITOR_SUSPENDED",
                format!("{} is suspended as a visitor for this prisoner. Reinstate them first.", visitor.full_name),
            ));
        }
        return Ok(existing);
    }
    let relationship = clean(relationship).or_else(|| visitor.relationship_default.clone());
    sqlx::query(
        "INSERT INTO prisoner_approved_visitors (prisoner_id, visitor_id, relationship, approved_by, approved_at, note) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(prisoner_id)
    .bind(&visitor.id)
    .bind(&relationship)
    .bind(who(actor))
    .bind(now_ms())
    .bind(clean(note))
    .execute(&mut *conn)
    .await?;
    let approved = get_approved(conn, prisoner_id, &visitor.id).await?.ok_or(DomainError::NotFound("That approval"))?;
    audit::record(conn, actor, AuditEntry::new("visitor.approve", "prisoner", Some(prisoner_id)).after(&approved)).await?;
    Ok(approved)
}

pub async fn approve_visitor(
    conn: &mut SqliteConnection,
    actor: &Actor,
    prisoner_id: &str,
    input: ApproveVisitorInput,
) -> Result<ApprovedVisitor, DomainError> {
    let visitor = match (input.visitor_id, input.new_visitor) {
        (Some(id), _) => get_visitor(conn, &id).await?,
        (None, Some(new)) => find_or_create_visitor(conn, actor, new).await?,
        (None, None) => return Err(DomainError::rejected("Choose a visitor or enter a new one.")),
    };
    ensure_approved(conn, actor, prisoner_id, &visitor, input.relationship, input.note).await
}

pub async fn set_approval_status(
    conn: &mut SqliteConnection,
    actor: &Actor,
    prisoner_id: &str,
    visitor_id: &str,
    status: &str,
    note: Option<String>,
) -> Result<ApprovedVisitor, DomainError> {
    if status != "active" && status != "suspended" {
        return Err(DomainError::rejected("A visitor is either active or suspended."));
    }
    let before = get_approved(conn, prisoner_id, visitor_id).await?.ok_or(DomainError::NotFound("That approval"))?;
    let note = clean(note);
    if status == "suspended" && note.is_none() {
        return Err(DomainError::rejected("Say why this visitor is suspended."));
    }
    sqlx::query("UPDATE prisoner_approved_visitors SET status = ?, note = ? WHERE prisoner_id = ? AND visitor_id = ?")
        .bind(status)
        .bind(&note)
        .bind(prisoner_id)
        .bind(visitor_id)
        .execute(&mut *conn)
        .await?;
    let after = get_approved(conn, prisoner_id, visitor_id).await?.ok_or(DomainError::NotFound("That approval"))?;
    let action = if status == "suspended" { "visitor.suspend" } else { "visitor.reinstate" };
    audit::record(conn, actor, AuditEntry::new(action, "prisoner", Some(prisoner_id)).before(&before).after(&after)).await?;
    Ok(after)
}

// ---------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVisitInput {
    pub prisoner_id: String,
    pub visitor_id: Option<String>,
    pub new_visitor: Option<NewVisitorInput>,
    /// Older callers send a bare name instead of a registered visitor.
    #[serde(default)]
    pub visitor_name: String,
    pub visitor_identification: Option<String>,
    pub relationship: Option<String>,
    pub visited_at: i64,
    pub duration_minutes: Option<i64>,
    pub party_size: Option<i64>,
    pub supervising_officer: Option<String>,
    pub notes: Option<String>,
    pub visit_type: String,
    /// Older callers send `authorized` or `attended`; new callers omit it and
    /// the lifecycle decides.
    pub status: Option<String>,
    pub authorized_by: Option<String>,
    /// An OIC's reason for booking beyond the party limits.
    pub over_limit_reason: Option<String>,
}

const SELECT_VISIT: &str = "SELECT * FROM visits";

async fn load(conn: &mut SqliteConnection, id: &str) -> Result<Visit, DomainError> {
    sqlx::query_as::<_, Visit>(sqlx::AssertSqlSafe(format!("{SELECT_VISIT} WHERE id = ?")))
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?
        .ok_or(DomainError::NotFound("That visit"))
}

fn legacy_status(status: &str) -> Option<&'static str> {
    match status {
        "authorized" => Some("scheduled"),
        "attended" => Some("completed"),
        "denied" => Some("denied"),
        _ => None,
    }
}

pub async fn create_visit(conn: &mut SqliteConnection, actor: &Actor, input: CreateVisitInput) -> Result<Visit, DomainError> {
    let rules = get_rules_conn(conn).await?;
    let privileged = PRIVILEGED_TYPES.contains(&input.visit_type.as_str());

    let (visitor, visitor_name, identification, relationship) = match (input.visitor_id.clone(), input.new_visitor) {
        (Some(id), _) => {
            let visitor = get_visitor(conn, &id).await?;
            let approval = ensure_approved(conn, actor, &input.prisoner_id, &visitor, input.relationship.clone(), None).await?;
            let name = visitor.full_name.clone();
            let ident = visitor.id_number.clone();
            (Some(visitor), name, ident, approval.relationship)
        }
        (None, Some(new)) => {
            let visitor = find_or_create_visitor(conn, actor, new).await?;
            let approval = ensure_approved(conn, actor, &input.prisoner_id, &visitor, input.relationship.clone(), None).await?;
            let name = visitor.full_name.clone();
            let ident = visitor.id_number.clone();
            (Some(visitor), name, ident, approval.relationship)
        }
        (None, None) => {
            let name = input.visitor_name.trim().to_string();
            if name.is_empty() {
                return Err(DomainError::rejected("Choose the visitor."));
            }
            (None, name, clean(input.visitor_identification), clean(input.relationship))
        }
    };

    let party_size = input.party_size.unwrap_or(1).max(1);
    let mut over_limit_reason: Option<String> = None;
    if !privileged {
        let day_start = time::start_of_day(input.visited_at);
        let already: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(party_size), 0) FROM visits
             WHERE prisoner_id = ? AND visited_at >= ? AND visited_at < ? AND status NOT IN ('denied', 'cancelled', 'no_show')",
        )
        .bind(&input.prisoner_id)
        .bind(day_start)
        .bind(day_start + DAY_MS)
        .fetch_one(&mut *conn)
        .await?;
        let message = if party_size > rules.max_visitors_per_visit {
            Some(format!("This facility allows {} visitors at a time.", rules.max_visitors_per_visit))
        } else if already + party_size > rules.max_visitors_per_prisoner_per_day {
            Some(format!(
                "This prisoner already has {already} visitors booked that day, and the limit is {}.",
                rules.max_visitors_per_prisoner_per_day
            ))
        } else {
            None
        };
        if let Some(message) = message {
            match clean(input.over_limit_reason.clone()) {
                Some(reason) if actor.can(perm::AUTHORISE_EXCEPTION) => over_limit_reason = Some(reason),
                _ => return Err(DomainError::conflict("VISIT_LIMIT", format!("{message} An Officer in Charge can authorise an exception."))),
            }
        }
    }

    let held = needs_authority(&rules, &input.visit_type, input.visited_at);
    let status = match input.status.as_deref().and_then(legacy_status) {
        Some(status) => status,
        None if held => "requested",
        None => "scheduled",
    };
    let (decided_by, decided_at) = if status == "requested" { (None, None) } else { (Some(who(actor)), Some(now_ms())) };

    // A privileged visit is not overheard, so nothing of what was said is kept.
    let notes = if privileged { None } else { clean(input.notes) };
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO visits (id, prisoner_id, visitor_id, visitor_name, visitor_identification, relationship, visited_at, duration_minutes,
                party_size, supervising_officer, notes, visit_type, privileged, status, authorized_by, decided_by, decided_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prisoner_id)
    .bind(visitor.as_ref().map(|v| v.id.clone()))
    .bind(&visitor_name)
    .bind(&identification)
    .bind(&relationship)
    .bind(input.visited_at)
    .bind(input.duration_minutes.unwrap_or(rules.default_duration_minutes).clamp(5, 240))
    .bind(party_size)
    .bind(clean(input.supervising_officer))
    .bind(&notes)
    .bind(&input.visit_type)
    .bind(privileged)
    .bind(status)
    .bind(clean(input.authorized_by))
    .bind(decided_by)
    .bind(decided_at)
    .execute(&mut *conn)
    .await?;

    let visit = load(conn, &id).await?;
    let authoriser = who(actor);
    let mut entry = AuditEntry::new("visit.create", "visit", Some(&id)).after(&visit);
    if let Some(reason) = over_limit_reason.as_deref() {
        entry = entry.reason(reason).authorised_by(&authoriser);
    }
    audit::record(conn, actor, entry).await?;
    Ok(visit)
}

fn wrong_state(visit: &Visit, wanted: &str) -> DomainError {
    DomainError::conflict("VISIT_STATE", format!("This visit is {}, so it cannot be {wanted}.", visit.status.replace('_', " ")))
}

async fn save_transition(
    conn: &mut SqliteConnection,
    actor: &Actor,
    before: &Visit,
    action: &str,
    reason: Option<&str>,
) -> Result<Visit, DomainError> {
    let after = load(conn, &before.id).await?;
    let mut entry = AuditEntry::new(action, "visit", Some(&before.id)).before(before).after(&after);
    if let Some(reason) = reason {
        entry = entry.reason(reason);
    }
    audit::record(conn, actor, entry).await?;
    Ok(after)
}

async fn require_authority_if_held(conn: &mut SqliteConnection, actor: &Actor, visit: &Visit) -> Result<(), DomainError> {
    if visit.status == "requested" {
        let rules = get_rules_conn(conn).await?;
        if needs_authority(&rules, &visit.visit_type, visit.visited_at) && !actor.can(perm::AUTHORISE_EXCEPTION) {
            return Err(DomainError::conflict(
                "NEEDS_OIC_AUTHORITY",
                "This visit needs the Officer in Charge to decide: it is a special authorisation or outside visiting hours.",
            ));
        }
    }
    Ok(())
}

pub async fn approve(conn: &mut SqliteConnection, actor: &Actor, id: &str) -> Result<Visit, DomainError> {
    let visit = load(conn, id).await?;
    if visit.status != "requested" {
        return Err(wrong_state(&visit, "approved"));
    }
    require_authority_if_held(conn, actor, &visit).await?;
    sqlx::query("UPDATE visits SET status = 'scheduled', decided_by = ?, decided_at = ?, authorized_by = COALESCE(authorized_by, ?) WHERE id = ?")
        .bind(who(actor))
        .bind(now_ms())
        .bind(who(actor))
        .bind(id)
        .execute(&mut *conn)
        .await?;
    save_transition(conn, actor, &visit, "visit.approve", None).await
}

/// Turning a visitor away: a request that is refused, or someone at the gate
/// who will not be identified or searched.
pub async fn deny(conn: &mut SqliteConnection, actor: &Actor, id: &str, reason: &str) -> Result<Visit, DomainError> {
    let visit = load(conn, id).await?;
    if !["requested", "scheduled", "checked_in"].contains(&visit.status.as_str()) {
        return Err(wrong_state(&visit, "denied"));
    }
    let reason = reason.trim();
    if reason.is_empty() {
        return Err(DomainError::rejected("Record why the visit is refused."));
    }
    require_authority_if_held(conn, actor, &visit).await?;
    sqlx::query("UPDATE visits SET status = 'denied', decided_by = ?, decided_at = ?, decision_reason = ? WHERE id = ?")
        .bind(who(actor))
        .bind(now_ms())
        .bind(reason)
        .bind(id)
        .execute(&mut *conn)
        .await?;
    save_transition(conn, actor, &visit, "visit.deny", Some(reason)).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroughtItem {
    pub description: String,
    pub disposition: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckInInput {
    pub id_verified: bool,
    pub search_done: bool,
    #[serde(default)]
    pub items: Vec<BroughtItem>,
}

/// The gate: photographic identification and the visitor search come before
/// anyone goes in (RESEARCH 9). A visitor who refuses either is turned away
/// with `deny`, not admitted.
pub async fn check_in(conn: &mut SqliteConnection, actor: &Actor, id: &str, input: CheckInInput) -> Result<Visit, DomainError> {
    let visit = load(conn, id).await?;
    if visit.status != "scheduled" {
        return Err(wrong_state(&visit, "checked in"));
    }
    if !input.id_verified || !input.search_done {
        return Err(DomainError::rejected(
            "Identification and the search must both be done before the visitor goes in. If either is refused, turn the visitor away.",
        ));
    }
    for item in &input.items {
        if item.description.trim().is_empty() {
            continue;
        }
        if !["handed_over", "held", "refused"].contains(&item.disposition.as_str()) {
            return Err(DomainError::rejected("Each item is handed over, held at the gate, or refused."));
        }
        sqlx::query("INSERT INTO visit_items (id, visit_id, description, disposition) VALUES (?, ?, ?, ?)")
            .bind(Uuid::new_v4().to_string())
            .bind(id)
            .bind(item.description.trim())
            .bind(&item.disposition)
            .execute(&mut *conn)
            .await?;
    }
    sqlx::query("UPDATE visits SET status = 'checked_in', id_verified = 1, search_done = 1, checked_in_at = ?, checked_in_by = ? WHERE id = ?")
        .bind(now_ms())
        .bind(who(actor))
        .bind(id)
        .execute(&mut *conn)
        .await?;
    save_transition(conn, actor, &visit, "visit.check_in", None).await
}

pub async fn start(conn: &mut SqliteConnection, actor: &Actor, id: &str) -> Result<Visit, DomainError> {
    let visit = load(conn, id).await?;
    if visit.status != "checked_in" {
        return Err(wrong_state(&visit, "started"));
    }
    sqlx::query("UPDATE visits SET status = 'in_progress', started_at = ? WHERE id = ?").bind(now_ms()).bind(id).execute(&mut *conn).await?;
    save_transition(conn, actor, &visit, "visit.start", None).await
}

pub async fn complete(conn: &mut SqliteConnection, actor: &Actor, id: &str, note: Option<String>) -> Result<Visit, DomainError> {
    let visit = load(conn, id).await?;
    if visit.status != "in_progress" {
        return Err(wrong_state(&visit, "completed"));
    }
    let note = if visit.privileged { None } else { clean(note) };
    sqlx::query(
        "UPDATE visits SET status = 'completed', ended_at = ?1,
                notes = CASE WHEN ?2 IS NULL THEN notes ELSE COALESCE(notes || char(10), '') || ?2 END
         WHERE id = ?3",
    )
    .bind(now_ms())
    .bind(note)
    .bind(id)
    .execute(&mut *conn)
    .await?;
    save_transition(conn, actor, &visit, "visit.complete", None).await
}

pub async fn no_show(conn: &mut SqliteConnection, actor: &Actor, id: &str) -> Result<Visit, DomainError> {
    let visit = load(conn, id).await?;
    if visit.status != "scheduled" {
        return Err(wrong_state(&visit, "marked as a no show"));
    }
    sqlx::query("UPDATE visits SET status = 'no_show' WHERE id = ?").bind(id).execute(&mut *conn).await?;
    save_transition(conn, actor, &visit, "visit.no_show", None).await
}

pub async fn cancel(conn: &mut SqliteConnection, actor: &Actor, id: &str, reason: &str) -> Result<Visit, DomainError> {
    let visit = load(conn, id).await?;
    if !["requested", "scheduled", "checked_in"].contains(&visit.status.as_str()) {
        return Err(wrong_state(&visit, "cancelled"));
    }
    let reason = reason.trim();
    if reason.is_empty() {
        return Err(DomainError::rejected("Say why the visit is cancelled."));
    }
    sqlx::query("UPDATE visits SET status = 'cancelled', decision_reason = ? WHERE id = ?").bind(reason).bind(id).execute(&mut *conn).await?;
    save_transition(conn, actor, &visit, "visit.cancel", Some(reason)).await
}

pub async fn list_items(pool: &SqlitePool, visit_id: &str) -> Result<Vec<VisitItem>, sqlx::Error> {
    sqlx::query_as::<_, VisitItem>("SELECT id, visit_id, description, disposition, created_at FROM visit_items WHERE visit_id = ? ORDER BY created_at")
        .bind(visit_id)
        .fetch_all(pool)
        .await
}

pub async fn list_for_prisoner(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<Visit>, sqlx::Error> {
    sqlx::query_as::<_, Visit>(sqlx::AssertSqlSafe(format!("{SELECT_VISIT} WHERE prisoner_id = ? ORDER BY visited_at DESC")))
        .bind(prisoner_id)
        .fetch_all(pool)
        .await
}

const SELECT_LIST: &str = "SELECT v.*, p.first_name AS prisoner_first_name, p.last_name AS prisoner_last_name, p.other_names AS prisoner_other_names
     FROM visits v JOIN prisoners p ON p.id = v.prisoner_id";

/// The whole facility's visit ledger, newest first. An empty query is the
/// whole log; a search term matches the visitor, their identification or the
/// prisoner's names.
pub async fn list_all(pool: &SqlitePool, query: &str) -> Result<Vec<VisitListItem>, sqlx::Error> {
    if query.trim().is_empty() {
        return sqlx::query_as::<_, VisitListItem>(sqlx::AssertSqlSafe(format!("{SELECT_LIST} ORDER BY v.visited_at DESC"))).fetch_all(pool).await;
    }
    let like = format!("%{}%", query.trim());
    sqlx::query_as::<_, VisitListItem>(sqlx::AssertSqlSafe(format!(
        "{SELECT_LIST}
         WHERE v.visitor_name LIKE ?1 OR v.visitor_identification LIKE ?1 OR p.first_name LIKE ?1 OR p.last_name LIKE ?1 OR p.other_names LIKE ?1
         ORDER BY v.visited_at DESC LIMIT 200"
    )))
    .bind(like)
    .fetch_all(pool)
    .await
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct VisitSearchRow {
    pub id: String,
    pub prisoner_id: String,
    pub first_name: String,
    pub last_name: String,
    pub visitor_name: String,
    pub visitor_identification: Option<String>,
    pub visit_type: String,
    pub visited_at: i64,
}

pub async fn search(pool: &SqlitePool, query: &str) -> Result<Vec<VisitSearchRow>, sqlx::Error> {
    let like = format!("%{query}%");
    sqlx::query_as::<_, VisitSearchRow>(
        "SELECT v.id, v.prisoner_id, p.first_name, p.last_name, v.visitor_name, v.visitor_identification, v.visit_type, v.visited_at
         FROM visits v JOIN prisoners p ON p.id = v.prisoner_id
         WHERE v.visitor_name LIKE ?1 OR v.visitor_identification LIKE ?1 OR p.first_name LIKE ?1 OR p.last_name LIKE ?1 OR p.other_names LIKE ?1
         ORDER BY v.visited_at DESC LIMIT 200",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    fn input(visit_type: &str, party: i64, at: i64) -> CreateVisitInput {
        CreateVisitInput {
            prisoner_id: "P-1".into(),
            visitor_id: None,
            new_visitor: None,
            visitor_name: "A Visitor".into(),
            visitor_identification: None,
            relationship: None,
            visited_at: at,
            duration_minutes: None,
            party_size: Some(party),
            supervising_officer: None,
            notes: Some("what was said".into()),
            visit_type: visit_type.into(),
            status: None,
            authorized_by: None,
            over_limit_reason: None,
        }
    }

    #[tokio::test]
    async fn gate_checks_are_required_and_privileged_visits_keep_no_notes() {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        sqlx::query("PRAGMA foreign_keys = OFF").execute(&pool).await.unwrap();
        let actor = Actor::officer("o1".into(), "B-1".into(), "Officer".into(), "officer".into(), false, None);
        let mut conn = pool.acquire().await.unwrap();

        // 2026-09-16 (Wednesday) 10:00 EAT, inside default visiting hours.
        let weekday_morning = 1_789_542_000_000;
        let privileged = create_visit(&mut conn, &actor, input("legal_advisor", 1, weekday_morning)).await.unwrap();
        assert!(privileged.privileged);
        assert_eq!(privileged.notes, None, "a privileged visit is not overheard, so nothing is kept");
        assert_eq!(privileged.status, "scheduled");

        let refused = check_in(&mut conn, &actor, &privileged.id, CheckInInput { id_verified: true, search_done: false, items: vec![] }).await;
        assert!(matches!(refused, Err(DomainError::Rejected(_))), "a visitor cannot go in without ID and search");

        let over = create_visit(&mut conn, &actor, input("ordinary", 4, weekday_morning)).await;
        assert!(matches!(over, Err(DomainError::Conflict { code: "VISIT_LIMIT", .. })), "an officer cannot exceed the party limit alone");
    }
}
