//! The audit trail. The chain itself is `packages/node-core` (`audit`); what is
//! this application's own is who is recorded as acting (the signed-in officer)
//! and which requests count as events: every write that succeeded, every
//! refusal of an officer who lacked the right, and every export, which is
//! where records leave the station. It records what happened and who did it,
//! never the content of a record.

use pleadli_node_core::audit as chain;
use sqlx::SqlitePool;

pub use chain::{AuditEntry, Entry, Verification};

use super::sessions::Actor;

/// A path segment that names one record rather than a kind of record.
fn is_record_id(segment: &str) -> bool {
    segment.parse::<uuid::Uuid>().is_ok() || (!segment.is_empty() && segment.chars().all(|c| c.is_ascii_digit()))
}

/// `POST /api/cases/<uuid>/people` becomes the action `POST /cases/:id/people`,
/// the subject kind `cases`, the subject `<uuid>`, and the case it belongs to.
pub struct Event {
    pub action: String,
    pub subject_type: Option<String>,
    pub subject_id: Option<String>,
    pub scope_id: Option<String>,
}

/// Whether a request is one the trail records, and if so what it says.
/// `status` is the response's; `path` is the path only, never the query string
/// (a search term is content, not an event).
pub fn classify(method: &str, path: &str, status: u16) -> Option<Event> {
    let path = path.strip_prefix("/api").unwrap_or(path);
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    let first = *segments.first()?;
    // Orchestra is the licence and backup service, not station records.
    if first == "orchestra" {
        return None;
    }
    // Reading a file to preview an import, or matching names against it, changes nothing.
    if first == "import" && segments.get(1).is_some_and(|s| *s != "bulk") {
        return None;
    }
    let is_write = matches!(method, "POST" | "PUT" | "PATCH" | "DELETE");
    let is_export = method == "GET" && first == "export";
    let recorded = (is_write && (200..300).contains(&status)) || ((is_write || is_export) && status == 403) || (is_export && (200..300).contains(&status));
    if !recorded {
        return None;
    }
    let shape: Vec<String> = segments.iter().map(|s| if is_record_id(s) { ":id".to_string() } else { s.to_string() }).collect();
    let id = segments.iter().skip(1).find(|s| is_record_id(s)).map(|s| s.to_string());
    let outcome = if status == 403 { " (refused)" } else { "" };
    Some(Event {
        action: format!("{method} /{}{outcome}", shape.join("/")),
        subject_type: Some(first.to_string()),
        scope_id: if first == "cases" { id.clone() } else { None },
        subject_id: id,
    })
}

pub async fn log(pool: &SqlitePool, actor: Option<&Actor>, event: &Event) -> Result<(), sqlx::Error> {
    let who = actor.map(|a| match &a.badge_number {
        Some(badge) => format!("{} ({badge})", a.name),
        None => a.name.clone(),
    });
    let mut entry = Entry::new(&event.action);
    if let Some(kind) = &event.subject_type {
        entry.subject_type = Some(kind.as_str());
    }
    entry.subject_id = event.subject_id.as_deref();
    entry.scope_id = event.scope_id.as_deref();
    chain::log(pool, who.as_deref(), entry).await
}

/// For an event the router never sees: a native command that writes a file.
pub async fn log_event(pool: &SqlitePool, actor: &Actor, action: &str, subject: Option<(&str, &str)>, scope: Option<&str>) -> Result<(), sqlx::Error> {
    let event = Event {
        action: action.to_string(),
        subject_type: subject.map(|(kind, _)| kind.to_string()),
        subject_id: subject.map(|(_, id)| id.to_string()),
        scope_id: scope.map(str::to_string),
    };
    log(pool, Some(actor), &event).await
}

pub async fn recent(pool: &SqlitePool, case_id: Option<&str>, limit: i64) -> Result<Vec<AuditEntry>, sqlx::Error> {
    chain::recent(pool, case_id, limit).await
}

pub async fn verify(pool: &SqlitePool) -> Result<Verification, sqlx::Error> {
    chain::verify(pool).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_migration_holds_the_crates_table_verbatim() {
        assert!(include_str!("../../migrations/0043_audit_log.sql").contains(chain::TABLE_SQL));
    }

    #[test]
    fn writes_exports_and_refusals_are_events_reads_and_searches_are_not() {
        let id = "6f1c2f3e-0a54-4c8e-9a39-3a7b5d0f6c11";
        let e = classify("POST", &format!("/api/cases/{id}/people"), 200).unwrap();
        assert_eq!(e.action, "POST /cases/:id/people");
        assert_eq!(e.scope_id.as_deref(), Some(id));
        assert!(classify("GET", "/api/cases", 200).is_none());
        assert!(classify("GET", "/api/search", 200).is_none());
        assert!(classify("POST", "/api/cases", 422).is_none(), "a rejected write changed nothing");
        assert!(classify("GET", "/api/export/pdf", 200).is_some());
        assert!(classify("PUT", "/api/rules/x", 403).unwrap().action.ends_with("(refused)"));
        assert!(classify("POST", "/api/orchestra/activate", 200).is_none());
        assert!(classify("POST", "/api/import/parse", 200).is_none());
        assert!(classify("POST", "/api/import/bulk", 200).is_some());
    }
}
