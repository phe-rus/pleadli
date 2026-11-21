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

/// What an office may change on one rule. Everything else about it (its id
/// and what kind of rule it is) belongs to the code that applies it, so it stays as shipped.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleEdit {
    pub value: Option<i64>,
    pub terms: Option<Vec<String>>,
    pub exceptions: Option<Vec<String>>,
    pub text: Option<String>,
    pub citation: Option<String>,
    pub status: String,
    pub reviewed_by: Option<String>,
    pub reviewed_on: Option<String>,
    pub note: Option<String>,
}

fn blank_to_none(text: Option<String>) -> Option<String> {
    text.map(|t| t.trim().to_string()).filter(|t| !t.is_empty())
}

/// Change one rule in the pack in force. The result is saved as the next version of the pack (the
/// earlier versions stay in the table), so who changed what, and when, is never lost. Marking a rule
/// reviewed fills in the reviewer from whoever is signed in, and today's date, unless given.
pub async fn update_rule(pool: &SqlitePool, rule_id: &str, edit: RuleEdit, edited_by: &str, today: &str) -> Result<Pack, String> {
    let mut pack = active(pool, DEFAULT_COUNTRY).await.map_err(|e| e.to_string())?;
    let rule = pack.rules.iter_mut().find(|r| r.id == rule_id).ok_or_else(|| "There is no such rule.".to_string())?;

    if rule.kind == "number" {
        match edit.value {
            Some(v) if v > 0 => rule.value = Some(v),
            _ => return Err("This rule is a number of hours or days. Enter a number above zero.".into()),
        }
    }
    if rule.kind == "offence_list" {
        let clean = |list: Option<Vec<String>>| list.unwrap_or_default().into_iter().map(|t| t.trim().to_lowercase()).filter(|t| !t.is_empty()).collect::<Vec<_>>();
        rule.terms = clean(edit.terms);
        rule.exceptions = clean(edit.exceptions);
        if rule.terms.is_empty() {
            return Err("An offence list needs at least one offence.".into());
        }
    }
    if rule.kind != "number" {
        rule.text = blank_to_none(edit.text);
    }
    rule.citation = blank_to_none(edit.citation);
    rule.note = blank_to_none(edit.note);
    rule.status = edit.status;
    if rule.status == "reviewed" {
        rule.reviewed_by = blank_to_none(edit.reviewed_by).or_else(|| Some(edited_by.to_string()));
        rule.reviewed_on = blank_to_none(edit.reviewed_on).or_else(|| Some(today.to_string()));
    } else {
        rule.reviewed_by = None;
        rule.reviewed_on = None;
    }

    pack.version += 1;
    pack.updated_on = today.to_string();
    if let Some(reason) = problem(&pack) {
        return Err(reason);
    }
    let body = serde_json::to_string(&pack).map_err(|e| e.to_string())?;
    sqlx::query("INSERT INTO rule_packs (id, country, version, body, source, imported_at, imported_by) VALUES (?, ?, ?, ?, 'edited in the app', ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(&pack.country)
        .bind(pack.version)
        .bind(body)
        .bind(now())
        .bind(edited_by)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(pack)
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_pool() -> SqlitePool {
        let dir = std::env::temp_dir().join(format!("pleadli-rules-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        crate::db::startup(&dir, dir.join("vault")).await.ok().unwrap().pool
    }

    fn edit(value: Option<i64>, status: &str) -> RuleEdit {
        RuleEdit { value, terms: None, exceptions: None, text: None, citation: Some("Police Act, s. 25".into()), status: status.into(), reviewed_by: None, reviewed_on: None, note: None }
    }

    #[tokio::test]
    async fn an_office_can_change_a_rule_and_the_old_version_is_kept() {
        let pool = test_pool().await;
        ensure_built_in(&pool).await.unwrap();
        let before = active(&pool, DEFAULT_COUNTRY).await.unwrap();

        let pack = update_rule(&pool, "custody.limit_hours", edit(Some(72), "reviewed"), "Legal Officer", "2026-12-01").await.unwrap();
        assert_eq!(pack.version, before.version + 1);
        let rule = pack.rule("custody.limit_hours").unwrap();
        assert_eq!(rule.value, Some(72));
        assert_eq!(rule.reviewed_by.as_deref(), Some("Legal Officer"), "the signed-in officer is the reviewer unless one is named");
        assert_eq!(rule.reviewed_on.as_deref(), Some("2026-12-01"));
        assert_eq!(active(&pool, DEFAULT_COUNTRY).await.unwrap().version, pack.version);
        let kept: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM rule_packs WHERE country = ?").bind(DEFAULT_COUNTRY).fetch_one(&pool).await.unwrap();
        assert!(kept >= 2, "the earlier version stays in the table");

        // Refused: a number that is not above zero, an unknown rule, "sourced" without a citation.
        assert!(update_rule(&pool, "custody.limit_hours", edit(Some(0), "sourced"), "x", "2026-12-01").await.is_err());
        assert!(update_rule(&pool, "no.such.rule", edit(Some(1), "draft"), "x", "2026-12-01").await.is_err());
        let mut no_citation = edit(Some(48), "sourced");
        no_citation.citation = None;
        assert!(update_rule(&pool, "custody.limit_hours", no_citation, "x", "2026-12-01").await.is_err());

        // An offence list keeps its offences, lower-cased and trimmed, and cannot be emptied.
        let mut list = edit(None, "draft");
        list.terms = Some(vec!["  Murder ".into(), "".into(), "Treason".into()]);
        let pack = update_rule(&pool, "bond.not_police_bailable", list, "x", "2026-12-01").await.unwrap();
        assert_eq!(pack.rule("bond.not_police_bailable").unwrap().terms, vec!["murder", "treason"]);
        let mut empty = edit(None, "draft");
        empty.terms = Some(vec![]);
        assert!(update_rule(&pool, "bond.not_police_bailable", empty, "x", "2026-12-01").await.is_err());
        pool.close().await;
    }

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
