//! The legal rules the app applies, as versioned data.
//!
//! A pack is one country's rules: each with its own citation, a status, and who reviewed it and
//! when. The pack that ships inside the app is the starting point; a newer pack can be imported by
//! an administrator (and, later, pushed from Pleadli Cloud) without a new release. Every version
//! stays in the table. A rule with status `draft` is the team's working reading and says so on screen.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

pub const DEFAULT_COUNTRY: &str = "UG";
const BUILT_IN: &str = include_str!("../../rules/uganda.json");
const STATUSES: &[&str] = &["draft", "sourced", "reviewed"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,
    pub title: String,
    pub kind: String,
    #[serde(default)]
    pub terms: Vec<String>,
    #[serde(default)]
    pub exceptions: Vec<String>,
    pub value: Option<i64>,
    pub text: Option<String>,
    pub citation: Option<String>,
    pub status: String,
    pub reviewed_by: Option<String>,
    pub reviewed_on: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pack {
    pub country: String,
    pub name: String,
    pub version: i64,
    pub updated_on: String,
    pub rules: Vec<Rule>,
}

impl Pack {
    pub fn rule(&self, id: &str) -> Option<&Rule> {
        self.rules.iter().find(|r| r.id == id)
    }
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// Why a pack cannot be used, or None. A rule marked reviewed must say who reviewed it and when,
/// so "reviewed" can never be claimed without a name behind it.
pub fn problem(pack: &Pack) -> Option<String> {
    if pack.country.trim().is_empty() || pack.version < 1 {
        return Some("A pack needs a country and a version of 1 or more.".into());
    }
    for rule in &pack.rules {
        if rule.id.trim().is_empty() {
            return Some("Every rule needs an id.".into());
        }
        if !STATUSES.contains(&rule.status.as_str()) {
            return Some(format!("Rule {} has an unknown status. Use draft, sourced or reviewed.", rule.id));
        }
        if rule.status == "reviewed" && (rule.reviewed_by.as_deref().unwrap_or("").is_empty() || rule.reviewed_on.as_deref().unwrap_or("").is_empty()) {
            return Some(format!("Rule {} is marked reviewed but does not say who reviewed it and when.", rule.id));
        }
        if rule.status != "draft" && rule.citation.as_deref().unwrap_or("").is_empty() {
            return Some(format!("Rule {} is marked {} but has no citation.", rule.id, rule.status));
        }
    }
    None
}

fn built_in() -> Pack {
    serde_json::from_str(BUILT_IN).expect("the pack inside the app is valid JSON")
}

/// Make sure the pack that ships with the app is in the table.
pub async fn ensure_built_in(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let pack = built_in();
    sqlx::query(
        "INSERT OR IGNORE INTO rule_packs (id, country, version, body, source, imported_at) VALUES (?, ?, ?, ?, 'built in', ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&pack.country)
    .bind(pack.version)
    .bind(BUILT_IN)
    .bind(now())
    .execute(pool)
    .await?;
    Ok(())
}

/// The rules in force: the highest version loaded for the country.
pub async fn active(pool: &SqlitePool, country: &str) -> Result<Pack, sqlx::Error> {
    let body: Option<String> = sqlx::query_scalar("SELECT body FROM rule_packs WHERE country = ? ORDER BY version DESC LIMIT 1")
        .bind(country)
        .fetch_optional(pool)
        .await?;
    Ok(body.and_then(|b| serde_json::from_str(&b).ok()).unwrap_or_else(built_in))
}

/// Load a newer pack. It must be valid and have a higher version than the one in force.
pub async fn import(pool: &SqlitePool, json: &str, imported_by: &str) -> Result<Pack, String> {
    let pack: Pack = serde_json::from_str(json).map_err(|e| format!("This is not a rules pack: {e}"))?;
    if let Some(reason) = problem(&pack) {
        return Err(reason);
    }
    let current = active(pool, &pack.country).await.map_err(|e| e.to_string())?;
    if pack.version <= current.version {
        return Err(format!("The pack in force is version {}. Load a pack with a higher version number.", current.version));
    }
    sqlx::query("INSERT INTO rule_packs (id, country, version, body, source, imported_at, imported_by) VALUES (?, ?, ?, ?, 'imported', ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(&pack.country)
        .bind(pack.version)
        .bind(json)
        .bind(now())
        .bind(imported_by)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(pack)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_built_in_pack_is_valid() {
        assert!(problem(&built_in()).is_none());
    }

    #[test]
    fn reviewed_needs_a_name_and_a_citation() {
        let mut pack = built_in();
        pack.rules[0].status = "reviewed".into();
        assert!(problem(&pack).is_some());
        pack.rules[0].citation = Some("Penal Code Act".into());
        pack.rules[0].reviewed_by = Some("A. Advocate".into());
        pack.rules[0].reviewed_on = Some("2026-12-01".into());
        assert!(problem(&pack).is_none());
    }
}
