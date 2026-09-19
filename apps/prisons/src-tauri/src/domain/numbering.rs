//! Prisoner numbering and uniform colours.
//!
//! No official Uganda Prisons Service numbering format or uniform colour
//! arrangement was found in public sources (docs/prisons/RESEARCH.md), so the
//! default pattern is provisional and every colour starts unset. A facility
//! (or Head Office, for the whole estate) sets its own. Numbering is locked
//! the moment anyone has been admitted, because a number already written on a
//! person's file must never change meaning; colours only affect display and
//! are never locked.

use chrono::Datelike;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::error::DomainError;
use super::facility_profile;
use super::time::{eat_datetime, now_ms};

pub const DEFAULT_PATTERN: &str = "{SEQ:4}/{YEAR}";
pub const RESETS: &[&str] = &["yearly", "never"];
pub const CATEGORIES: &[&str] = &["unconvicted", "convicted", "civil"];
pub const PALETTE: &[&str] = &["blue", "yellow", "maroon", "white", "orange", "green", "grey", "black", "red", "purple"];

const MAX_PATTERN_LEN: usize = 40;
const MAX_NUMBER_LEN: usize = 40;

#[derive(Debug, PartialEq)]
enum Part {
    Lit(String),
    Seq(usize),
    Year,
    Yy,
    Month,
    Fac,
}

fn parse(pattern: &str) -> Result<Vec<Part>, String> {
    let mut parts = Vec::new();
    let mut literal = String::new();
    let mut chars = pattern.chars();
    while let Some(c) = chars.next() {
        match c {
            '{' => {
                let mut token = String::new();
                loop {
                    match chars.next() {
                        Some('}') => break,
                        Some(t) => token.push(t),
                        None => return Err("A { in the pattern is never closed with }.".to_string()),
                    }
                }
                if !literal.is_empty() {
                    parts.push(Part::Lit(std::mem::take(&mut literal)));
                }
                parts.push(match token.as_str() {
                    "SEQ" => Part::Seq(1),
                    "YEAR" => Part::Year,
                    "YY" => Part::Yy,
                    "MONTH" => Part::Month,
                    "FAC" => Part::Fac,
                    other => match other.strip_prefix("SEQ:").and_then(|n| n.parse::<usize>().ok()) {
                        Some(n) if (1..=9).contains(&n) => Part::Seq(n),
                        _ => return Err(format!("{{{other}}} is not a known part. Use SEQ, SEQ:n (n from 1 to 9), YEAR, YY, MONTH or FAC.")),
                    },
                });
            }
            '}' => return Err("A } in the pattern has no matching {.".to_string()),
            c if c.is_ascii_alphanumeric() || matches!(c, '/' | '-' | '.' | '_' | ' ') => literal.push(c),
            other => return Err(format!("\"{other}\" cannot be used. Letters, digits, / - . _ and spaces only.")),
        }
    }
    if !literal.is_empty() {
        parts.push(Part::Lit(literal));
    }
    Ok(parts)
}

/// Returns a plain message for the officer when the pattern or its reset rule
/// cannot produce unique numbers.
pub fn validate(pattern: &str, reset: &str) -> Result<(), DomainError> {
    let pattern = pattern.trim();
    if pattern.is_empty() || pattern.chars().count() > MAX_PATTERN_LEN {
        return Err(DomainError::rejected(format!("The pattern must be 1 to {MAX_PATTERN_LEN} characters.")));
    }
    if !RESETS.contains(&reset) {
        return Err(DomainError::rejected("Choose whether the counter restarts every year or never."));
    }
    let parts = parse(pattern).map_err(DomainError::rejected)?;
    if !parts.iter().any(|p| matches!(p, Part::Seq(_))) {
        return Err(DomainError::rejected("The pattern needs a {SEQ} or {SEQ:4} part, or every person would get the same number."));
    }
    if reset == "yearly" && !parts.iter().any(|p| matches!(p, Part::Year | Part::Yy)) {
        return Err(DomainError::rejected(
            "A counter that restarts every year needs {YEAR} or {YY} in the pattern, or two years would issue the same number.",
        ));
    }
    let longest = render_parts(&parts, 999_999_999, 2099, 12, "FACILITY-00");
    if longest.chars().count() > MAX_NUMBER_LEN {
        return Err(DomainError::rejected(format!("Numbers from this pattern can grow longer than {MAX_NUMBER_LEN} characters.")));
    }
    Ok(())
}

fn render_parts(parts: &[Part], seq: i64, year: i32, month: u32, facility: &str) -> String {
    let mut out = String::new();
    for part in parts {
        match part {
            Part::Lit(text) => out.push_str(text),
            Part::Seq(width) => out.push_str(&format!("{seq:0width$}", width = *width)),
            Part::Year => out.push_str(&year.to_string()),
            Part::Yy => out.push_str(&format!("{:02}", year.rem_euclid(100))),
            Part::Month => out.push_str(&format!("{month:02}")),
            Part::Fac => out.push_str(facility),
        }
    }
    out
}

fn facility_token(facility_number: Option<&str>) -> String {
    facility_number.map(str::trim).filter(|n| !n.is_empty()).unwrap_or("FAC").to_string()
}

/// Two example numbers for the live preview in settings.
pub fn preview(pattern: &str, facility_number: Option<&str>) -> Vec<String> {
    let Ok(parts) = parse(pattern) else { return Vec::new() };
    let dt = eat_datetime(now_ms());
    let fac = facility_token(facility_number);
    [1, 2].iter().map(|seq| render_parts(&parts, *seq, dt.year(), dt.month(), &fac)).collect()
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct NumberingConfig {
    pub pattern: String,
    pub reset: String,
    pub source: String,
    pub updated_at: Option<i64>,
    pub updated_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UniformEntry {
    pub category: String,
    pub colour: Option<String>,
    pub label: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NumberingView {
    pub config: NumberingConfig,
    pub preview: Vec<String>,
    pub locked: bool,
    pub admitted_count: i64,
    pub facility_number: Option<String>,
    pub uniforms: Vec<UniformEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NumberingInput {
    pub pattern: String,
    pub reset: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UniformInput {
    pub category: String,
    pub colour: Option<String>,
    pub label: Option<String>,
}

/// People this installation itself has admitted. Rows Head Office holds for
/// other facilities (legacy snapshots) carry a facility id and do not count.
pub async fn admitted_count(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT COUNT(*) FROM prisoners WHERE facility_id IS NULL").fetch_one(pool).await
}

async fn admitted_count_conn(conn: &mut SqliteConnection) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT COUNT(*) FROM prisoners WHERE facility_id IS NULL").fetch_one(&mut *conn).await
}

pub async fn get_config(pool: &SqlitePool) -> Result<NumberingConfig, sqlx::Error> {
    sqlx::query_as::<_, NumberingConfig>("SELECT pattern, reset, source, updated_at, updated_by FROM numbering_config WHERE id = 'default'")
        .fetch_one(pool)
        .await
}

async fn get_config_conn(conn: &mut SqliteConnection) -> Result<NumberingConfig, sqlx::Error> {
    sqlx::query_as::<_, NumberingConfig>("SELECT pattern, reset, source, updated_at, updated_by FROM numbering_config WHERE id = 'default'")
        .fetch_one(&mut *conn)
        .await
}

pub async fn list_uniforms(pool: &SqlitePool) -> Result<Vec<UniformEntry>, sqlx::Error> {
    sqlx::query_as::<_, UniformEntry>("SELECT category, colour, label, source FROM uniform_scheme ORDER BY rowid")
        .fetch_all(pool)
        .await
}

async fn list_uniforms_conn(conn: &mut SqliteConnection) -> Result<Vec<UniformEntry>, sqlx::Error> {
    sqlx::query_as::<_, UniformEntry>("SELECT category, colour, label, source FROM uniform_scheme ORDER BY rowid")
        .fetch_all(&mut *conn)
        .await
}

pub async fn view(pool: &SqlitePool) -> Result<NumberingView, sqlx::Error> {
    let config = get_config(pool).await?;
    let profile = facility_profile::get(pool).await?;
    let admitted = admitted_count(pool).await?;
    Ok(NumberingView {
        preview: preview(&config.pattern, profile.facility_number.as_deref()),
        config,
        locked: admitted > 0,
        admitted_count: admitted,
        facility_number: profile.facility_number,
        uniforms: list_uniforms(pool).await?,
    })
}

pub async fn save_config(conn: &mut SqliteConnection, actor: &Actor, input: NumberingInput) -> Result<NumberingConfig, DomainError> {
    let admitted = admitted_count_conn(conn).await?;
    if admitted > 0 {
        return Err(DomainError::conflict(
            "NUMBERING_LOCKED",
            format!("Numbering is locked because {admitted} people have already been admitted here. It can only be set before the first admission."),
        ));
    }
    let pattern = input.pattern.trim().to_string();
    validate(&pattern, &input.reset)?;
    let before = get_config_conn(conn).await?;
    sqlx::query("UPDATE numbering_config SET pattern = ?, reset = ?, source = 'facility', updated_at = ?, updated_by = ? WHERE id = 'default'")
        .bind(&pattern)
        .bind(&input.reset)
        .bind(now_ms())
        .bind(&actor.name)
        .execute(&mut *conn)
        .await?;
    let after = get_config_conn(conn).await?;
    audit::record(conn, actor, AuditEntry::new("numbering.config_saved", "numbering_config", Some("default")).before(&before).after(&after)).await?;
    Ok(after)
}

fn check_uniform(entry: &UniformInput) -> Result<(), DomainError> {
    if !CATEGORIES.contains(&entry.category.as_str()) {
        return Err(DomainError::rejected("That is not a prisoner category."));
    }
    if let Some(colour) = &entry.colour {
        if !PALETTE.contains(&colour.as_str()) {
            return Err(DomainError::rejected("Choose a colour from the palette."));
        }
    }
    if entry.label.as_deref().is_some_and(|l| l.chars().count() > 60) {
        return Err(DomainError::rejected("A uniform label can be at most 60 characters."));
    }
    Ok(())
}

fn clean_label(entry: &UniformInput) -> Option<String> {
    entry.label.as_deref().map(str::trim).filter(|l| !l.is_empty()).map(str::to_string)
}

pub async fn save_uniforms(conn: &mut SqliteConnection, actor: &Actor, entries: Vec<UniformInput>) -> Result<Vec<UniformEntry>, DomainError> {
    for entry in &entries {
        check_uniform(entry)?;
    }
    let before = list_uniforms_conn(conn).await?;
    for entry in &entries {
        let source = entry.colour.as_ref().map(|_| "facility");
        sqlx::query("UPDATE uniform_scheme SET colour = ?, label = ?, source = ?, updated_at = ? WHERE category = ?")
            .bind(&entry.colour)
            .bind(clean_label(entry))
            .bind(source)
            .bind(now_ms())
            .bind(&entry.category)
            .execute(&mut *conn)
            .await?;
    }
    let after = list_uniforms_conn(conn).await?;
    audit::record(conn, actor, AuditEntry::new("numbering.uniforms_saved", "uniform_scheme", None).before(&before).after(&after)).await?;
    Ok(after)
}

/// Issues the next prisoner number, inside the caller's write transaction so
/// two receptions can never share one. Skips any number already taken (for
/// example after a restore) rather than failing an admission.
pub(crate) async fn next_number(conn: &mut SqliteConnection) -> Result<String, sqlx::Error> {
    let config = get_config_conn(conn).await?;
    let parts = parse(&config.pattern).or_else(|_| parse(DEFAULT_PATTERN)).unwrap_or_default();
    let facility_number = facility_profile::get_conn(conn).await?.facility_number;
    let fac = facility_token(facility_number.as_deref());
    let dt = eat_datetime(now_ms());
    let scope = if config.reset == "yearly" { format!("y{}", dt.year()) } else { "all".to_string() };

    let mut candidate = String::new();
    for _ in 0..1000 {
        let seq: i64 = sqlx::query_scalar(
            "INSERT INTO numbering_counters (scope_key, next_value) VALUES (?, 2)
             ON CONFLICT (scope_key) DO UPDATE SET next_value = next_value + 1
             RETURNING next_value - 1",
        )
        .bind(&scope)
        .fetch_one(&mut *conn)
        .await?;
        candidate = render_parts(&parts, seq, dt.year(), dt.month(), &fac);
        let taken: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM prisoners WHERE prisoner_number = ?)")
            .bind(&candidate)
            .fetch_one(&mut *conn)
            .await?;
        if !taken {
            break;
        }
    }
    Ok(candidate)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FacilityNumbering {
    pub facility_id: String,
    pub name: String,
    pub status: String,
    pub pattern: Option<String>,
    pub source: Option<String>,
    pub locked: Option<bool>,
    pub reported_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EstatePolicy {
    pub pattern: String,
    pub reset: String,
    pub preview: Vec<String>,
    pub uniforms: Vec<UniformEntry>,
    pub updated_at: Option<i64>,
    pub updated_by: Option<String>,
    pub facilities: Vec<FacilityNumbering>,
}

#[derive(FromRow)]
struct EstateRow {
    pattern: String,
    reset: String,
    uniform_json: String,
    updated_at: Option<i64>,
    updated_by: Option<String>,
}

pub fn estate_uniforms(json: &str) -> Vec<UniformEntry> {
    let stored: Vec<UniformEntry> = serde_json::from_str(json).unwrap_or_default();
    CATEGORIES
        .iter()
        .map(|category| {
            stored
                .iter()
                .find(|e| e.category == *category)
                .cloned()
                .unwrap_or(UniformEntry { category: category.to_string(), colour: None, label: None, source: None })
        })
        .collect()
}

async fn estate_row(pool: &SqlitePool) -> Result<EstateRow, sqlx::Error> {
    sqlx::query_as("SELECT pattern, reset, uniform_json, updated_at, updated_by FROM hq_estate_policy WHERE id = 'default'")
        .fetch_one(pool)
        .await
}

pub async fn get_estate_policy(pool: &SqlitePool) -> Result<EstatePolicy, sqlx::Error> {
    let row = estate_row(pool).await?;
    let facilities: Vec<(String, String, String, Option<String>, Option<String>, Option<bool>, Option<i64>)> = sqlx::query_as(
        "SELECT id, name, status, numbering_pattern, numbering_source, numbering_locked, numbering_reported_at
         FROM facilities ORDER BY name",
    )
    .fetch_all(pool)
    .await?;
    Ok(EstatePolicy {
        preview: preview(&row.pattern, None),
        uniforms: estate_uniforms(&row.uniform_json),
        pattern: row.pattern,
        reset: row.reset,
        updated_at: row.updated_at,
        updated_by: row.updated_by,
        facilities: facilities
            .into_iter()
            .map(|(facility_id, name, status, pattern, source, locked, reported_at)| FacilityNumbering {
                facility_id,
                name,
                status,
                pattern,
                source,
                locked,
                reported_at,
            })
            .collect(),
    })
}

pub async fn save_estate_config(conn: &mut SqliteConnection, actor: &Actor, input: NumberingInput) -> Result<(), DomainError> {
    let pattern = input.pattern.trim().to_string();
    validate(&pattern, &input.reset)?;
    let before: (String, String) = sqlx::query_as("SELECT pattern, reset FROM hq_estate_policy WHERE id = 'default'").fetch_one(&mut *conn).await?;
    sqlx::query("UPDATE hq_estate_policy SET pattern = ?, reset = ?, updated_at = ?, updated_by = ? WHERE id = 'default'")
        .bind(&pattern)
        .bind(&input.reset)
        .bind(now_ms())
        .bind(&actor.name)
        .execute(&mut *conn)
        .await?;
    audit::record(
        conn,
        actor,
        AuditEntry::new("numbering.estate_config_saved", "hq_estate_policy", Some("default"))
            .before(&serde_json::json!({ "pattern": before.0, "reset": before.1 }))
            .after(&serde_json::json!({ "pattern": pattern, "reset": input.reset })),
    )
    .await?;
    Ok(())
}

pub async fn save_estate_uniforms(conn: &mut SqliteConnection, actor: &Actor, entries: Vec<UniformInput>) -> Result<(), DomainError> {
    for entry in &entries {
        check_uniform(entry)?;
    }
    let json: String = sqlx::query_scalar("SELECT uniform_json FROM hq_estate_policy WHERE id = 'default'").fetch_one(&mut *conn).await?;
    let before = estate_uniforms(&json);
    let mut next = before.clone();
    for entry in &entries {
        if let Some(slot) = next.iter_mut().find(|e| e.category == entry.category) {
            slot.colour = entry.colour.clone();
            slot.label = clean_label(entry);
        }
    }
    sqlx::query("UPDATE hq_estate_policy SET uniform_json = ?, updated_at = ?, updated_by = ? WHERE id = 'default'")
        .bind(serde_json::to_string(&next).unwrap_or_else(|_| "[]".to_string()))
        .bind(now_ms())
        .bind(&actor.name)
        .execute(&mut *conn)
        .await?;
    audit::record(conn, actor, AuditEntry::new("numbering.estate_uniforms_saved", "hq_estate_policy", Some("default")).before(&before).after(&next)).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pattern_rules_keep_numbers_unique() {
        assert!(validate("{SEQ:4}/{YEAR}", "yearly").is_ok());
        assert!(validate("{FAC}-{SEQ}", "never").is_ok());
        assert!(validate("{YEAR}", "yearly").is_err(), "no sequence part");
        assert!(validate("{SEQ:4}", "yearly").is_err(), "yearly reset without a year part would repeat numbers");
        assert!(validate("{SEQ:4}/{BAD}", "never").is_err());
        assert!(validate("{SEQ:4}#", "never").is_err());
    }

    #[test]
    fn rendering_pads_and_fills_parts() {
        let parts = parse("{FAC}/{SEQ:4}/{YY}").unwrap();
        assert_eq!(render_parts(&parts, 7, 2026, 9, "UPS-001"), "UPS-001/0007/26");
    }
}
