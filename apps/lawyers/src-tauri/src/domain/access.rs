//! Restricted matters: an information barrier inside a firm.
//!
//! A restricted matter, and everything under it (hearings, tasks, documents,
//! time, fee notes), is seen only by the people listed for it. Nobody is let in
//! by role: an administrator who is not listed cannot read it, though they can
//! change who is listed, so a barrier set by mistake can be repaired without
//! opening the file. Every change is on the audit trail.
//!
//! Lists are filtered with [`visible`], a SQL fragment that reads the person
//! acting in this request (`request::actor`). Nobody acting (a request that
//! carries no sign-in) sees unrestricted matters only.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use super::audit::{self, Entry};
use super::error::{invalid, DomainError};
use super::request;
use pleadli_node_core::db::begin_write;

/// The condition that makes matter `alias` visible to the person acting now.
/// The staff id goes in as a quoted literal made only of letters, digits and
/// dashes (ids are generated, never typed), so nothing can be injected.
pub fn visible(alias: &str) -> String {
    match request::actor() {
        Some(a) if a.id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') => {
            format!("({alias}.restricted = 0 OR EXISTS (SELECT 1 FROM matter_access x WHERE x.matter_id = {alias}.id AND x.staff_id = '{}'))", a.id)
        }
        _ => format!("{alias}.restricted = 0"),
    }
}

/// Whether the person acting may see this matter. An unknown matter is "yes",
/// so the caller's own not-found answer applies and nothing is learned.
pub async fn can_see(pool: &SqlitePool, matter_id: &str) -> Result<bool, sqlx::Error> {
    let sql = format!("SELECT COUNT(*) FROM matters m WHERE m.id = ? AND NOT {}", visible("m"));
    let hidden: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).bind(matter_id).fetch_one(pool).await?;
    Ok(hidden == 0)
}

/// The condition that makes a row whose matter is in column `col` (for example `t.matter_id`) visible to the person
/// acting now. A row that belongs to no matter (`NULL`) is visible. `col` is always a fixed column name written in
/// this crate, never input.
pub fn on(col: &str) -> String {
    format!("({col} IS NULL OR EXISTS (SELECT 1 FROM matters hm WHERE hm.id = {col} AND {}))", visible("hm"))
}

/// Whether the person acting is in the finance scope: the accounts role, or an administrator of the practice. This is the
/// only thing that opens the firm-wide client-money totals. It is a different question from matter access: being in it lets
/// someone read an aggregate balance (including money attributable to restricted matters) and nothing about those matters.
pub fn finance_scope() -> bool {
    request::actor().is_some_and(|a| a.role == "accounts" || a.is_admin)
}

/// Refuses, with the same "not found" as an unknown matter, when the matter is restricted and the person acting is not
/// listed for it. Used wherever a matter id arrives in a request body, which the router's gate cannot see.
pub async fn require(pool: &SqlitePool, matter_id: &str) -> Result<(), DomainError> {
    if can_see(pool, matter_id).await? {
        Ok(())
    } else {
        Err(DomainError::NotFound("Matter not found.".into()))
    }
}

/// Where each kind of record keeps the matter it belongs to. A fixed list: names here go into SQL.
const OWNERS: &[(&str, &str)] = &[
    ("party", "parties"),
    ("parties", "parties"),
    ("matter_event", "matter_events"),
    ("events", "matter_events"),
    ("filing", "filings"),
    ("filings", "filings"),
    ("paper", "papers"),
    ("papers", "papers"),
    ("bill_of_costs", "bills_of_costs"),
    ("bills", "bills_of_costs"),
    ("fee_note", "fee_notes"),
    ("fee-notes", "fee_notes"),
    ("hearing", "hearings"),
    ("hearings", "hearings"),
    ("task", "tasks"),
    ("tasks", "tasks"),
    ("note", "matter_notes"),
    ("notes", "matter_notes"),
    ("time", "time_entries"),
    ("document", "documents"),
    ("documents", "documents"),
    ("ledger_entry", "ledger_entries"),
    ("ledger", "ledger_entries"),
    ("register_entry", "register_entries"),
    ("registers", "register_entries"),
    ("matter", "matters"),
];

/// Whether a record of this kind (named as an audit subject or as the first path segment of a by-id route) belongs to
/// a matter the person acting may not see. A kind not in the list, or an unknown id, is not hidden.
pub async fn record_hidden(pool: &SqlitePool, kind: &str, id: &str) -> Result<bool, sqlx::Error> {
    let Some((_, table)) = OWNERS.iter().find(|(k, _)| *k == kind) else { return Ok(false) };
    let sql = if *table == "matters" {
        format!("SELECT COUNT(*) FROM matters m WHERE m.id = ? AND NOT {}", visible("m"))
    } else {
        format!("SELECT COUNT(*) FROM {table} t JOIN matters m ON m.id = t.matter_id WHERE t.id = ? AND NOT {}", visible("m"))
    };
    let n: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).bind(id).fetch_one(pool).await?;
    Ok(n > 0)
}

/// A condition on a table that names its subject by kind and id (the audit trail, printed papers, handwriting): true
/// for rows about anything the person acting may see. Built from the same list as [`record_hidden`].
pub fn entity_shown(kind_col: &str, id_col: &str) -> String {
    let mut parts = Vec::new();
    for (kind, table) in OWNERS {
        let hidden = if *table == "matters" {
            format!("SELECT m.id FROM matters m WHERE NOT {}", visible("m"))
        } else {
            format!("SELECT t.id FROM {table} t JOIN matters m ON m.id = t.matter_id WHERE NOT {}", visible("m"))
        };
        parts.push(format!("NOT ({kind_col} = '{kind}' AND {id_col} IN ({hidden}))"));
    }
    format!("({})", parts.join(" AND "))
}

/// Ids of the matters the person acting may not see.
pub async fn hidden_matters(pool: &SqlitePool) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT m.id FROM matters m WHERE m.restricted = 1 AND NOT {}", visible("m")))).fetch_all(pool).await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Access {
    pub restricted: bool,
    pub staff_ids: Vec<String>,
    /// The people listed, with names, so a screen need not guess who an id is.
    pub staff: Vec<Person>,
    /// Every change of who may see this matter, newest first.
    pub history: Vec<AccessEvent>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Person {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AccessEvent {
    pub at: i64,
    pub actor: Option<String>,
    /// `matter_access_changed`, or `matter_access_recovered` when an administrator not on the list changed it.
    pub action: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessInput {
    pub restricted: bool,
    #[serde(default)]
    pub staff_ids: Vec<String>,
    /// Required when an administrator who is not listed for the matter changes it (the emergency repair of a barrier).
    #[serde(default)]
    pub reason: Option<String>,
}

/// Who may see the matter. Only someone who may see it, or an administrator
/// (to repair a barrier), can ask; the people are listed by id.
pub async fn get(pool: &SqlitePool, matter_id: &str) -> Result<Access, DomainError> {
    let admin = request::actor().is_some_and(|a| a.is_admin);
    if !admin && !can_see(pool, matter_id).await? {
        return Err(DomainError::NotFound("Matter not found.".into()));
    }
    let restricted: Option<i64> = sqlx::query_scalar("SELECT restricted FROM matters WHERE id = ?").bind(matter_id).fetch_optional(pool).await?;
    let Some(restricted) = restricted else { return Err(DomainError::NotFound("Matter not found.".into())) };
    read(pool, matter_id, restricted == 1).await
}

async fn read(pool: &SqlitePool, matter_id: &str, restricted: bool) -> Result<Access, DomainError> {
    let staff: Vec<Person> = sqlx::query_as("SELECT s.id, s.name FROM matter_access x JOIN staff s ON s.id = x.staff_id WHERE x.matter_id = ? ORDER BY s.name").bind(matter_id).fetch_all(pool).await?;
    let history: Vec<AccessEvent> = sqlx::query_as("SELECT at, actor, action, detail FROM audit_log WHERE scope_id = ? AND action IN ('matter_access_changed', 'matter_access_recovered') ORDER BY seq DESC LIMIT 100").bind(matter_id).fetch_all(pool).await?;
    Ok(Access { restricted, staff_ids: staff.iter().map(|p| p.id.clone()).collect(), staff, history })
}

/// Restricts a matter to the listed people (who must be active staff), or lifts
/// the restriction. The advocate acting must stay on the list unless lifting it,
/// so a barrier cannot lock out the person who set it by accident; an
/// administrator who is not on the file may change the list without being on it.
pub async fn set(pool: &SqlitePool, matter_id: &str, input: AccessInput) -> Result<Access, DomainError> {
    let actor = request::actor().ok_or_else(|| DomainError::Forbidden("Sign in to change who may see a matter.".into()))?;
    let mut tx = begin_write(pool).await?;
    let found: Option<i64> = sqlx::query_scalar("SELECT 1 FROM matters WHERE id = ?").bind(matter_id).fetch_optional(&mut *tx).await?;
    if found.is_none() {
        return Err(DomainError::NotFound("Matter not found.".into()));
    }
    let on_list: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM matters m WHERE m.id = ? AND (m.restricted = 0 OR EXISTS (SELECT 1 FROM matter_access x WHERE x.matter_id = m.id AND x.staff_id = ?))")
        .bind(matter_id)
        .bind(&actor.id)
        .fetch_one(&mut *tx)
        .await?;
    if on_list == 0 && !actor.is_admin {
        return Err(DomainError::NotFound("Matter not found.".into()));
    }
    // An administrator who is not listed may still repair the barrier, but not silently: it needs a reason, and it is
    // recorded under its own action so the people on the matter can see it happened.
    let recovery = on_list == 0;
    let reason = input.reason.as_deref().map(str::trim).filter(|r| !r.is_empty()).map(str::to_string);
    if recovery && reason.is_none() {
        return invalid("You are not listed for this matter. Say why you are changing who may see it; this is recorded.");
    }
    let before: Vec<String> = sqlx::query_scalar("SELECT staff_id FROM matter_access WHERE matter_id = ?").bind(matter_id).fetch_all(&mut *tx).await?;
    let mut ids: Vec<String> = input.staff_ids.iter().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
    ids.sort();
    ids.dedup();
    if input.restricted {
        if ids.is_empty() {
            return invalid("Name at least one person who may see a restricted matter.");
        }
        for id in &ids {
            let ok: Option<i64> = sqlx::query_scalar("SELECT 1 FROM staff WHERE id = ? AND active = 1").bind(id).fetch_optional(&mut *tx).await?;
            if ok.is_none() {
                return invalid("Everyone listed must be an active member of the practice.");
            }
        }
        if !actor.is_admin && !ids.contains(&actor.id) {
            return invalid("You must stay on the list yourself, or you would lose the matter.");
        }
    } else {
        ids.clear();
    }
    sqlx::query("DELETE FROM matter_access WHERE matter_id = ?").bind(matter_id).execute(&mut *tx).await?;
    for id in &ids {
        sqlx::query("INSERT INTO matter_access (matter_id, staff_id) VALUES (?, ?)").bind(matter_id).bind(id).execute(&mut *tx).await?;
    }
    sqlx::query("UPDATE matters SET restricted = ? WHERE id = ?").bind(input.restricted as i64).bind(matter_id).execute(&mut *tx).await?;
    // The people added and removed are named on the trail, which only those who may see the matter can read (an
    // administrator repairing the barrier reads just these entries, through the access screen).
    let mut names = std::collections::HashMap::new();
    for id in before.iter().chain(ids.iter()) {
        let n: Option<String> = sqlx::query_scalar("SELECT name FROM staff WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
        names.insert(id.clone(), n.unwrap_or_else(|| "someone".to_string()));
    }
    let list = |wanted: Vec<&String>| wanted.iter().map(|i| names[*i].clone()).collect::<Vec<_>>().join(", ");
    let added = list(ids.iter().filter(|i| !before.contains(i)).collect());
    let removed = list(before.iter().filter(|i| !ids.contains(i)).collect());
    let mut detail = if input.restricted { format!("restricted to {} people", ids.len()) } else { "restriction lifted".to_string() };
    if !added.is_empty() {
        detail.push_str(&format!("; added: {added}"));
    }
    if !removed.is_empty() {
        detail.push_str(&format!("; removed: {removed}"));
    }
    if let Some(reason) = &reason {
        detail.push_str(&format!("; reason: {reason}"));
    }
    let action = if recovery { "matter_access_recovered" } else { "matter_access_changed" };
    audit::record(&mut tx, Entry::new(action).subject("matter", matter_id).scope(matter_id).detail(detail)).await?;
    tx.commit().await?;
    read(pool, matter_id, input.restricted).await
}

/// Whether a matter with this id exists at all, hidden or not. Only the router's gate uses it, to answer an unknown
/// matter exactly as a hidden one.
pub async fn matter_exists(pool: &SqlitePool, id: &str) -> Result<bool, sqlx::Error> {
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM matters WHERE id = ?").bind(id).fetch_one(pool).await?;
    Ok(n > 0)
}

/// Whether this first path segment names records that belong to a matter (or matters themselves).
pub fn is_owned_kind(kind: &str) -> bool {
    OWNERS.iter().any(|(k, _)| *k == kind)
}

/// Whether no record of this kind has this id. The router's gate answers a missing record as it answers a hidden one,
/// before the request body is read, so a malformed body cannot be used to tell the two apart. A kind that is not a
/// by-id family (or is a matter, which has its own check) is never "missing".
pub async fn record_missing(pool: &SqlitePool, kind: &str, id: &str) -> Result<bool, sqlx::Error> {
    let Some((_, table)) = OWNERS.iter().find(|(k, _)| *k == kind) else { return Ok(false) };
    if *table == "matters" {
        return Ok(false);
    }
    let n: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT COUNT(*) FROM {table} WHERE id = ?"))).bind(id).fetch_one(pool).await?;
    Ok(n == 0)
}
