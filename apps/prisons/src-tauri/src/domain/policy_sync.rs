//! Estate defaults travelling from Head Office to facilities: the prisoner
//! numbering pattern and the uniform colour scheme. Head Office serves them on
//! `/api/network/v1/policy`; a facility pulls and applies them only where it has
//! not set its own (numbering also only while nobody has been admitted).

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::facilities;
use super::numbering::{self, UniformEntry};
use super::time::now_ms;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyPayload {
    pub pattern: String,
    pub reset: String,
    pub uniforms: Vec<UniformEntry>,
}

/// What the pulling facility says about its own numbering, so Head Office can
/// show which facilities have set and locked their own.
#[derive(Debug, Deserialize)]
pub struct PolicyReport {
    pub pattern: Option<String>,
    pub source: Option<String>,
    pub locked: Option<bool>,
}

/// Head Office side. `None` for an unknown, unverified or revoked facility,
/// which the caller turns into the uniform 401.
pub async fn serve_policy(pool: &SqlitePool, sync_token: &str, report: PolicyReport) -> Result<Option<PolicyPayload>, sqlx::Error> {
    let row: Option<(String, String)> = sqlx::query_as("SELECT id, status FROM facilities WHERE sync_token_hash = ?")
        .bind(facilities::hash_secret(sync_token))
        .fetch_optional(pool)
        .await?;
    let Some((facility_id, status)) = row else { return Ok(None) };
    if status != "active" {
        return Ok(None);
    }

    sqlx::query(
        "UPDATE facilities SET numbering_pattern = ?1, numbering_source = ?2, numbering_locked = ?3, numbering_reported_at = ?4, last_contact_at = ?4 WHERE id = ?5",
    )
    .bind(report.pattern.as_deref().map(|p| p.chars().take(60).collect::<String>()))
    .bind(report.source.as_deref().map(|s| s.chars().take(20).collect::<String>()))
    .bind(report.locked)
    .bind(now_ms())
    .bind(&facility_id)
    .execute(pool)
    .await?;

    let estate = numbering::get_estate_policy(pool).await?;
    Ok(Some(PolicyPayload { pattern: estate.pattern, reset: estate.reset, uniforms: estate.uniforms }))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyPullResult {
    pub numbering_applied: bool,
    pub numbering_kept_reason: Option<String>,
    pub uniforms_applied: usize,
}

/// Facility side. Reports the local state, then applies what Head Office sent
/// where the facility has not made its own choice.
pub async fn pull_policy(pool: &SqlitePool) -> Result<PolicyPullResult, String> {
    let ctx = facilities::get_peer_sync_context(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "This installation is not paired with a Head Office yet.".to_string())?;

    let config = numbering::get_config(pool).await.map_err(|e| e.to_string())?;
    let admitted = numbering::admitted_count(pool).await.map_err(|e| e.to_string())?;

    let response = super::peer::hq_client(pool, 20)
        .await?
        .get(format!("{}/api/network/v1/policy", ctx.hostname.trim_end_matches('/')))
        .bearer_auth(&ctx.sync_token)
        .query(&[("pattern", config.pattern.as_str()), ("source", config.source.as_str()), ("locked", if admitted > 0 { "true" } else { "false" })])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("Head Office did not accept the request. It may not have approved this facility yet.".to_string());
    }
    if !response.status().is_success() {
        return Err(format!("Head Office responded {}", response.status()));
    }
    let payload: PolicyPayload = response.json().await.map_err(|e| e.to_string())?;

    apply(pool, payload, &config.source, &config.pattern, admitted).await.map_err(|e| e.to_string())
}

async fn apply(pool: &SqlitePool, payload: PolicyPayload, local_source: &str, local_pattern: &str, admitted: i64) -> Result<PolicyPullResult, sqlx::Error> {
    let actor = Actor::system("policy sync");
    let mut tx = crate::db::begin_write(pool).await?;
    let mut result = PolicyPullResult { numbering_applied: false, numbering_kept_reason: None, uniforms_applied: 0 };

    if local_source == "facility" {
        result.numbering_kept_reason = Some("This facility set its own numbering.".to_string());
    } else if admitted > 0 {
        result.numbering_kept_reason = Some("People have already been admitted, so numbering is locked.".to_string());
    } else if numbering::validate(&payload.pattern, &payload.reset).is_err() {
        result.numbering_kept_reason = Some("Head Office sent a numbering pattern that cannot be used.".to_string());
    } else if payload.pattern != local_pattern || local_source != "head_office" {
        sqlx::query("UPDATE numbering_config SET pattern = ?, reset = ?, source = 'head_office', updated_at = ?, updated_by = 'Head Office' WHERE id = 'default'")
            .bind(&payload.pattern)
            .bind(&payload.reset)
            .bind(now_ms())
            .execute(&mut *tx)
            .await?;
        result.numbering_applied = true;
    }

    for entry in payload.uniforms.iter().filter(|e| numbering::CATEGORIES.contains(&e.category.as_str())) {
        if entry.colour.as_deref().is_some_and(|c| !numbering::PALETTE.contains(&c)) {
            continue;
        }
        let changed = sqlx::query(
            "UPDATE uniform_scheme SET colour = ?1, label = ?2, source = CASE WHEN ?1 IS NULL THEN NULL ELSE 'head_office' END, updated_at = ?3
             WHERE category = ?4 AND (source IS NULL OR source = 'head_office')
               AND (colour IS NOT ?1 OR label IS NOT ?2)",
        )
        .bind(&entry.colour)
        .bind(&entry.label)
        .bind(now_ms())
        .bind(&entry.category)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        result.uniforms_applied += changed as usize;
    }

    if result.numbering_applied || result.uniforms_applied > 0 {
        audit::record(
            &mut tx,
            &actor,
            AuditEntry::new("numbering.policy_applied", "numbering_config", Some("default")).after(&serde_json::json!({
                "numberingApplied": result.numbering_applied,
                "uniformsApplied": result.uniforms_applied,
                "pattern": payload.pattern,
            })),
        )
        .await?;
    }
    tx.commit().await?;
    Ok(result)
}
