use serde::Serialize;
use sqlx::SqlitePool;

use super::{court_productions, health_events, programmes, property_records, prisoners, releases, requests, transfers, visits};

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

    let mut court_production_results: Vec<(i32, SearchResult)> = court_productions::search(pool, trimmed)
        .await?
        .into_iter()
        .map(|cp| {
            let name = full_name(&cp.first_name, &cp.last_name, None);
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Identifier, "courtReference", cp.court_reference.as_deref()),
                field_match(&query_lower, FieldKind::Name, "name", Some(&name)),
            ]);
            (
                score,
                SearchResult {
                    id: cp.id.clone(),
                    entity_type: "court_production".to_string(),
                    title: name,
                    subtitle: format!("{} production", cp.production_method),
                    matched_on: MatchedOn { field, value },
                    route: format!("/prisoners/{}", cp.prisoner_id),
                },
            )
        })
        .collect();
    court_production_results.truncate(PER_DOMAIN_CAP);
    scored.extend(court_production_results);

    let mut health_event_results: Vec<(i32, SearchResult)> = health_events::search(pool, trimmed)
        .await?
        .into_iter()
        .map(|he| {
            let name = full_name(&he.first_name, &he.last_name, None);
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Name, "facilityName", he.facility_name.as_deref()),
                field_match(&query_lower, FieldKind::Name, "name", Some(&name)),
            ]);
            (
                score,
                SearchResult {
                    id: he.id.clone(),
                    entity_type: "health_event".to_string(),
                    title: name,
                    subtitle: he.facility_name.clone().unwrap_or_else(|| he.event_type.clone()),
                    matched_on: MatchedOn { field, value },
                    route: format!("/prisoners/{}", he.prisoner_id),
                },
            )
        })
        .collect();
    health_event_results.truncate(PER_DOMAIN_CAP);
    scored.extend(health_event_results);

    let mut programme_results: Vec<(i32, SearchResult)> = programmes::search(pool, trimmed)
        .await?
        .into_iter()
        .map(|pp| {
            let name = full_name(&pp.first_name, &pp.last_name, None);
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Identifier, "certificateReference", pp.certificate_reference.as_deref()),
                field_match(&query_lower, FieldKind::Name, "programmeName", Some(&pp.programme_name)),
                field_match(&query_lower, FieldKind::Name, "name", Some(&name)),
            ]);
            (
                score,
                SearchResult {
                    id: pp.id.clone(),
                    entity_type: "programme_participation".to_string(),
                    title: name,
                    subtitle: pp.programme_name.clone(),
                    matched_on: MatchedOn { field, value },
                    route: format!("/prisoners/{}", pp.prisoner_id),
                },
            )
        })
        .collect();
    programme_results.truncate(PER_DOMAIN_CAP);
    scored.extend(programme_results);

    let mut property_record_results: Vec<(i32, SearchResult)> = property_records::search(pool, trimmed)
        .await?
        .into_iter()
        .map(|pr| {
            let name = full_name(&pr.first_name, &pr.last_name, None);
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Name, "description", Some(&pr.description)),
                field_match(&query_lower, FieldKind::Name, "name", Some(&name)),
            ]);
            (
                score,
                SearchResult {
                    id: pr.id.clone(),
                    entity_type: "property_record".to_string(),
                    title: name,
                    subtitle: pr.description.clone(),
                    matched_on: MatchedOn { field, value },
                    route: format!("/prisoners/{}", pr.prisoner_id),
                },
            )
        })
        .collect();
    property_record_results.truncate(PER_DOMAIN_CAP);
    scored.extend(property_record_results);

    let mut release_results: Vec<(i32, SearchResult)> = releases::search(pool, trimmed)
        .await?
        .into_iter()
        .map(|r| {
            let name = full_name(&r.first_name, &r.last_name, None);
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Name, "releaseType", Some(&r.release_type)),
                field_match(&query_lower, FieldKind::Name, "name", Some(&name)),
            ]);
            (
                score,
                SearchResult {
                    id: r.id.clone(),
                    entity_type: "release".to_string(),
                    title: name,
                    subtitle: r.release_type.clone(),
                    matched_on: MatchedOn { field, value },
                    route: format!("/prisoners/{}", r.prisoner_id),
                },
            )
        })
        .collect();
    release_results.truncate(PER_DOMAIN_CAP);
    scored.extend(release_results);

    let mut request_results: Vec<(i32, SearchResult)> = requests::search(pool, trimmed)
        .await?
        .into_iter()
        .map(|r| {
            let name = match (r.prisoner_first_name.as_deref(), r.prisoner_last_name.as_deref()) {
                (Some(first), Some(last)) => full_name(first, last, None),
                _ => "Unlinked request".to_string(),
            };
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Name, "category", Some(&r.category)),
                field_match(&query_lower, FieldKind::Name, "description", Some(&r.description)),
                field_match(&query_lower, FieldKind::Name, "name", Some(&name)),
            ]);
            let route = match r.prisoner_id.as_deref() {
                Some(prisoner_id) => format!("/prisoners/{}", prisoner_id),
                None => "/requests".to_string(),
            };
            (
                score,
                SearchResult {
                    id: r.id.clone(),
                    entity_type: "request".to_string(),
                    title: name,
                    subtitle: r.category.clone(),
                    matched_on: MatchedOn { field, value },
                    route,
                },
            )
        })
        .collect();
    request_results.truncate(PER_DOMAIN_CAP);
    scored.extend(request_results);

    let mut transfer_results: Vec<(i32, SearchResult)> = transfers::search(pool, trimmed)
        .await?
        .into_iter()
        .map(|t| {
            let name = full_name(&t.first_name, &t.last_name, None);
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Name, "otherPrisonName", t.other_prison_name.as_deref()),
                field_match(&query_lower, FieldKind::Name, "name", Some(&name)),
            ]);
            let subtitle = match t.other_prison_name.as_deref() {
                Some(other) => format!("Transfer {} · {}", t.direction, other),
                None => format!("Transfer {}", t.direction),
            };
            (
                score,
                SearchResult {
                    id: t.id.clone(),
                    entity_type: "transfer".to_string(),
                    title: name,
                    subtitle,
                    matched_on: MatchedOn { field, value },
                    route: format!("/prisoners/{}", t.prisoner_id),
                },
            )
        })
        .collect();
    transfer_results.truncate(PER_DOMAIN_CAP);
    scored.extend(transfer_results);

    let mut visit_results: Vec<(i32, SearchResult)> = visits::search(pool, trimmed)
        .await?
        .into_iter()
        .map(|v| {
            let name = full_name(&v.first_name, &v.last_name, None);
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Identifier, "visitorIdentification", v.visitor_identification.as_deref()),
                field_match(&query_lower, FieldKind::Name, "visitorName", Some(&v.visitor_name)),
                field_match(&query_lower, FieldKind::Name, "name", Some(&name)),
            ]);
            (
                score,
                SearchResult {
                    id: v.id.clone(),
                    entity_type: "visit".to_string(),
                    title: name,
                    subtitle: format!("{} visit · {}", v.visit_type, v.visitor_name),
                    matched_on: MatchedOn { field, value },
                    route: format!("/prisoners/{}", v.prisoner_id),
                },
            )
        })
        .collect();
    visit_results.truncate(PER_DOMAIN_CAP);
    scored.extend(visit_results);

    scored.sort_by(|a, b| b.0.cmp(&a.0));
    scored.truncate(TOTAL_CAP);

    Ok(scored.into_iter().map(|(_, r)| r).collect())
}
