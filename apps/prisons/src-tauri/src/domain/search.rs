use serde::Serialize;
use sqlx::SqlitePool;

use super::prisoners;

const EXACT_IDENTIFIER: i32 = 1000;
const EXACT_NAME: i32 = 800;
const PARTIAL: i32 = 400;
const PER_DOMAIN_CAP: usize = 20;
const TOTAL_CAP: usize = 30;

enum FieldKind {
    Identifier,
    Name,
}

fn field_match(query_lower: &str, kind: FieldKind, field_name: &str, value: Option<&str>) -> Option<(String, String, i32)> {
    let value = value?;
    if value.is_empty() {
        return None;
    }
    let value_lower = value.to_lowercase();
    if value_lower == query_lower {
        let score = match kind {
            FieldKind::Identifier => EXACT_IDENTIFIER,
            FieldKind::Name => EXACT_NAME,
        };
        Some((field_name.to_string(), value.to_string(), score))
    } else if value_lower.contains(query_lower) {
        Some((field_name.to_string(), value.to_string(), PARTIAL))
    } else {
        None
    }
}

fn best_match(candidates: Vec<Option<(String, String, i32)>>) -> (String, Option<String>, i32) {
    match candidates.into_iter().flatten().max_by_key(|(_, _, score)| *score) {
        Some((field, value, score)) => (field, Some(value), score),
        None => ("id".to_string(), None, PARTIAL),
    }
}

fn full_name(first: &str, last: &str, other: Option<&str>) -> String {
    [Some(last), Some(first), other]
        .into_iter()
        .flatten()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(", ")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchedOn {
    pub field: String,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub id: String,
    pub entity_type: String,
    pub title: String,
    pub subtitle: String,
    pub matched_on: MatchedOn,
    pub route: String,
}

pub async fn search(pool: &SqlitePool, query: &str) -> Result<Vec<SearchResult>, sqlx::Error> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let query_lower = trimmed.to_lowercase();

    let mut scored: Vec<(i32, SearchResult)> = Vec::new();

    let mut prisoner_results: Vec<(i32, SearchResult)> = prisoners::list_prisoners(pool, trimmed)
        .await?
        .into_iter()
        .map(|p| {
            let name = full_name(&p.first_name, &p.last_name, p.other_names.as_deref());
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Identifier, "nationalId", p.national_id.as_deref()),
                field_match(&query_lower, FieldKind::Identifier, "reference", p.reference.as_deref()),
                field_match(&query_lower, FieldKind::Name, "name", Some(&name)),
            ]);
            (
                score,
                SearchResult {
                    id: p.id.clone(),
                    entity_type: "prisoner".to_string(),
                    title: name,
                    subtitle: p.reference.clone().unwrap_or_else(|| p.current_status.clone()),
                    matched_on: MatchedOn { field, value },
                    route: format!("/prisoners?open={}", p.id),
                },
            )
        })
        .collect();
    prisoner_results.truncate(PER_DOMAIN_CAP);
    scored.extend(prisoner_results);

    scored.sort_by(|a, b| b.0.cmp(&a.0));
    scored.truncate(TOTAL_CAP);

    Ok(scored.into_iter().map(|(_, r)| r).collect())
}
