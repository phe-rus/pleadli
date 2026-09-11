use serde::Serialize;
use sqlx::SqlitePool;

use super::{
    attachments, bonds, cases, charge_sheets, custody, duty, exhibits, incidents, people, referrals, statements,
    station_assets, station_diary, vehicles,
};

/// Deterministic ranking, per the product decision: exact match on an
/// identifier/reference field outranks an exact name match, which outranks
/// an exact match on any other field, which outranks a partial match on
/// anything. No embeddings, no ML — every domain already does the actual
/// row filtering itself (via its own `LIKE`-based list function); this
/// module only decides *which* field explains the match and where it sits
/// in that ordering, then merges the 9 domains into one ranked list.
const EXACT_IDENTIFIER: i32 = 1000;
const EXACT_NAME: i32 = 800;
const EXACT_OTHER: i32 = 600;
const PARTIAL: i32 = 400;

/// Per domain, so one very common word can't flood every other domain's
/// results off the first page.
const PER_DOMAIN_CAP: usize = 8;
const TOTAL_CAP: usize = 30;

enum FieldKind {
    Identifier,
    Name,
    Other,
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
            FieldKind::Other => EXACT_OTHER,
        };
        Some((field_name.to_string(), value.to_string(), score))
    } else if value_lower.contains(query_lower) {
        Some((field_name.to_string(), value.to_string(), PARTIAL))
    } else {
        None
    }
}

/// Picks the best-explained match among a row's candidate fields — the
/// field/value pair the UI shows as "why this matched", not just the
/// highest-scoring one silently.
fn best_match(candidates: Vec<Option<(String, String, i32)>>) -> (String, Option<String>, i32) {
    match candidates.into_iter().flatten().max_by_key(|(_, _, score)| *score) {
        Some((field, value, score)) => (field, Some(value), score),
        None => ("id".to_string(), None, PARTIAL),
    }
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

pub(crate) fn full_name(first: &str, last: &str, other: Option<&str>) -> String {
    [Some(last), Some(first), other]
        .into_iter()
        .flatten()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(", ")
}

pub async fn search(pool: &SqlitePool, query: &str) -> Result<Vec<SearchResult>, sqlx::Error> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let query_lower = trimmed.to_lowercase();

    let mut scored: Vec<(i32, SearchResult)> = Vec::new();

    // People
    let mut people_results: Vec<(i32, SearchResult)> = people::search_people(pool, trimmed)
        .await?
        .into_iter()
        .map(|p| {
            let name = full_name(&p.first_name, &p.last_name, p.other_names.as_deref());
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Identifier, "nationalId", p.national_id.as_deref()),
                field_match(&query_lower, FieldKind::Identifier, "phone", p.phone.as_deref()),
                field_match(&query_lower, FieldKind::Name, "name", Some(&name)),
            ]);
            (
                score,
                SearchResult {
                    id: p.id.clone(),
                    entity_type: "person".to_string(),
                    title: name,
                    subtitle: p.phone.clone().unwrap_or_else(|| p.national_id.clone().unwrap_or_default()),
                    matched_on: MatchedOn { field, value },
                    route: format!("/search/people/{}", p.id),
                },
            )
        })
        .collect();
    people_results.truncate(PER_DOMAIN_CAP);
    scored.extend(people_results);

    // Cases
    let mut case_results: Vec<(i32, SearchResult)> = cases::list_cases(pool, trimmed)
        .await?
        .into_iter()
        .map(|c| {
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Identifier, "reference", Some(&c.reference)),
                field_match(&query_lower, FieldKind::Other, "summary", Some(&c.summary)),
            ]);
            (
                score,
                SearchResult {
                    id: c.id.clone(),
                    entity_type: "case".to_string(),
                    title: c.reference.clone(),
                    subtitle: c.summary.clone(),
                    matched_on: MatchedOn { field, value },
                    // The investigation workspace, not the bare edit drawer —
                    // it composes people/statements/custody/bonds/timeline,
                    // a strictly more useful landing spot than /intake.
                    route: format!("/investigations/{}", c.id),
                },
            )
        })
        .collect();
    case_results.truncate(PER_DOMAIN_CAP);
    scored.extend(case_results);

    // Incidents
    let mut incident_results: Vec<(i32, SearchResult)> = incidents::list_incidents(pool, trimmed)
        .await?
        .into_iter()
        .map(|i| {
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Other, "summary", Some(&i.summary)),
                field_match(&query_lower, FieldKind::Other, "location", i.location.as_deref()),
            ]);
            (
                score,
                SearchResult {
                    id: i.id.clone(),
                    entity_type: "incident".to_string(),
                    title: i.summary.clone(),
                    subtitle: i.location.clone().unwrap_or_default(),
                    matched_on: MatchedOn { field, value },
                    route: format!("/incidents?open={}", i.id),
                },
            )
        })
        .collect();
    incident_results.truncate(PER_DOMAIN_CAP);
    scored.extend(incident_results);

    // Statements
    let mut statement_results: Vec<(i32, SearchResult)> = statements::list_statements(pool, trimmed)
        .await?
        .into_iter()
        .map(|s| {
            let name = full_name(&s.person_first_name, &s.person_last_name, s.person_other_names.as_deref());
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Name, "person", Some(&name)),
                field_match(&query_lower, FieldKind::Other, "officerName", s.officer_name.as_deref()),
            ]);
            (
                score,
                SearchResult {
                    id: s.id.clone(),
                    entity_type: "statement".to_string(),
                    title: format!("Statement — {name}"),
                    subtitle: s.officer_name.clone().unwrap_or_default(),
                    matched_on: MatchedOn { field, value },
                    route: format!("/statements?open={}", s.id),
                },
            )
        })
        .collect();
    statement_results.truncate(PER_DOMAIN_CAP);
    scored.extend(statement_results);

    // Custody
    let mut custody_results: Vec<(i32, SearchResult)> = custody::list_records(pool, trimmed)
        .await?
        .into_iter()
        .map(|r| {
            let name = full_name(&r.person_first_name, &r.person_last_name, r.person_other_names.as_deref());
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Name, "person", Some(&name)),
                field_match(&query_lower, FieldKind::Other, "location", r.location.as_deref()),
            ]);
            (
                score,
                SearchResult {
                    id: r.id.clone(),
                    entity_type: "custody_record".to_string(),
                    title: format!("Custody — {name}"),
                    subtitle: r.location.clone().unwrap_or_default(),
                    matched_on: MatchedOn { field, value },
                    route: format!("/search/custody?open={}", r.id),
                },
            )
        })
        .collect();
    custody_results.truncate(PER_DOMAIN_CAP);
    scored.extend(custody_results);

    // Bonds
    let mut bond_results: Vec<(i32, SearchResult)> = bonds::list_bonds(pool, trimmed)
        .await?
        .into_iter()
        .map(|b| {
            let name = full_name(&b.person_first_name, &b.person_last_name, b.person_other_names.as_deref());
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Name, "person", Some(&name)),
                field_match(&query_lower, FieldKind::Other, "suretyName", b.surety_name.as_deref()),
            ]);
            (
                score,
                SearchResult {
                    id: b.id.clone(),
                    entity_type: "bond".to_string(),
                    title: format!("Bond — {name}"),
                    subtitle: b.surety_name.clone().unwrap_or_default(),
                    matched_on: MatchedOn { field, value },
                    route: format!("/search/bonds?open={}", b.id),
                },
            )
        })
        .collect();
    bond_results.truncate(PER_DOMAIN_CAP);
    scored.extend(bond_results);

    // Station Diary
    let mut sd_results: Vec<(i32, SearchResult)> = station_diary::list_entries(pool, trimmed)
        .await?
        .into_iter()
        .map(|entry| {
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Other, "category", Some(&entry.category)),
                field_match(&query_lower, FieldKind::Other, "content", None),
            ]);
            (
                score,
                SearchResult {
                    id: entry.id.clone(),
                    entity_type: "station_diary_entry".to_string(),
                    title: format!("SD entry — {}", entry.category.replace('_', " ")),
                    subtitle: String::new(),
                    matched_on: MatchedOn { field, value },
                    route: format!("/sd-log?open={}", entry.id),
                },
            )
        })
        .collect();
    sd_results.truncate(PER_DOMAIN_CAP);
    scored.extend(sd_results);

    // Duty Roster
    let mut duty_results: Vec<(i32, SearchResult)> = duty::list_assignments(pool, trimmed)
        .await?
        .into_iter()
        .map(|d| {
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Name, "officerName", Some(&d.officer_name)),
                field_match(&query_lower, FieldKind::Other, "unit", d.unit.as_deref()),
            ]);
            (
                score,
                SearchResult {
                    id: d.id.clone(),
                    entity_type: "duty_assignment".to_string(),
                    title: d.officer_name.clone(),
                    subtitle: d.unit.clone().unwrap_or_default(),
                    matched_on: MatchedOn { field, value },
                    route: format!("/roster?open={}", d.id),
                },
            )
        })
        .collect();
    duty_results.truncate(PER_DOMAIN_CAP);
    scored.extend(duty_results);

    // Station Assets (Armory / Impounded — same table, category picks the route)
    let mut asset_results: Vec<(i32, SearchResult)> = station_assets::list_assets(pool, trimmed)
        .await?
        .into_iter()
        .map(|a| {
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Identifier, "itemIdentifier", a.item_identifier.as_deref()),
                field_match(&query_lower, FieldKind::Other, "description", Some(&a.description)),
                field_match(&query_lower, FieldKind::Other, "holderName", a.holder_name.as_deref()),
            ]);
            let base = if a.category == "armory" { "/stores/armory" } else { "/stores/impounded" };
            (
                score,
                SearchResult {
                    id: a.id.clone(),
                    entity_type: "station_asset".to_string(),
                    title: a.description.clone(),
                    subtitle: a.holder_name.clone().unwrap_or_default(),
                    matched_on: MatchedOn { field, value },
                    route: format!("{base}?open={}", a.id),
                },
            )
        })
        .collect();
    asset_results.truncate(PER_DOMAIN_CAP);
    scored.extend(asset_results);

    // Vehicles — searchable by plate number the same way a person is
    // searchable by national ID (product ask: look someone up "by number
    // plate").
    let mut vehicle_results: Vec<(i32, SearchResult)> = vehicles::list_vehicles(pool, trimmed)
        .await?
        .into_iter()
        .map(|v| {
            let owner = v
                .owner_first_name
                .as_deref()
                .map(|first| full_name(first, v.owner_last_name.as_deref().unwrap_or(""), v.owner_other_names.as_deref()));
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Identifier, "plateNumber", Some(&v.plate_number)),
                field_match(&query_lower, FieldKind::Other, "make", v.make.as_deref()),
                field_match(&query_lower, FieldKind::Other, "model", v.model.as_deref()),
            ]);
            (
                score,
                SearchResult {
                    id: v.id.clone(),
                    entity_type: "vehicle".to_string(),
                    title: v.plate_number.clone(),
                    subtitle: owner.unwrap_or_else(|| {
                        [v.make.as_deref(), v.model.as_deref()].into_iter().flatten().collect::<Vec<_>>().join(" ")
                    }),
                    matched_on: MatchedOn { field, value },
                    route: format!("/vehicles?open={}", v.id),
                },
            )
        })
        .collect();
    vehicle_results.truncate(PER_DOMAIN_CAP);
    scored.extend(vehicle_results);

    // Exhibits
    let mut exhibit_results: Vec<(i32, SearchResult)> = exhibits::list_exhibits(pool, trimmed)
        .await?
        .into_iter()
        .map(|e| {
            let name = e
                .person_first_name
                .as_deref()
                .map(|first| full_name(first, e.person_last_name.as_deref().unwrap_or(""), e.person_other_names.as_deref()));
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Identifier, "identificationMark", e.identification_mark.as_deref()),
                field_match(&query_lower, FieldKind::Other, "description", Some(&e.description)),
                field_match(&query_lower, FieldKind::Other, "storageLocation", e.storage_location.as_deref()),
            ]);
            (
                score,
                SearchResult {
                    id: e.id.clone(),
                    entity_type: "exhibit".to_string(),
                    title: e.description.clone(),
                    subtitle: name.unwrap_or_else(|| e.case_reference.clone().unwrap_or_default()),
                    matched_on: MatchedOn { field, value },
                    route: format!("/evidence?open={}", e.id),
                },
            )
        })
        .collect();
    exhibit_results.truncate(PER_DOMAIN_CAP);
    scored.extend(exhibit_results);

    // Charge Sheets (PF53)
    let mut charge_sheet_results: Vec<(i32, SearchResult)> = charge_sheets::list_charge_sheets(pool, trimmed)
        .await?
        .into_iter()
        .map(|cs| {
            let name = cs
                .accused_first_name
                .as_deref()
                .map(|first| full_name(first, cs.accused_last_name.as_deref().unwrap_or(""), cs.accused_other_names.as_deref()));
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Other, "offence", Some(&cs.offence)),
                field_match(&query_lower, FieldKind::Identifier, "caseReference", Some(&cs.case_reference)),
                // The underlying list query also filters by the accused's
                // name (see charge_sheets::list_charge_sheets) — without
                // this candidate, a name-only match fell through to a
                // meaningless {field: "id", value: null} default.
                field_match(&query_lower, FieldKind::Name, "accused", name.as_deref()),
            ]);
            (
                score,
                SearchResult {
                    id: cs.id.clone(),
                    entity_type: "charge_sheet".to_string(),
                    title: format!("Charge — {}", cs.offence),
                    subtitle: name.unwrap_or(cs.case_reference.clone()),
                    matched_on: MatchedOn { field, value },
                    route: format!("/legal-forms?open={}", cs.id),
                },
            )
        })
        .collect();
    charge_sheet_results.truncate(PER_DOMAIN_CAP);
    scored.extend(charge_sheet_results);

    // Referrals & Dispatches (unified — see docs/police/PRODUCT.md)
    let mut referral_results: Vec<(i32, SearchResult)> = referrals::list_referrals(pool, trimmed)
        .await?
        .into_iter()
        .map(|r| {
            let (field, value, score) = best_match(vec![
                field_match(&query_lower, FieldKind::Other, "destinationName", r.destination_name.as_deref()),
                field_match(&query_lower, FieldKind::Identifier, "caseReference", Some(&r.case_reference)),
            ]);
            (
                score,
                SearchResult {
                    id: r.id.clone(),
                    entity_type: "referral".to_string(),
                    title: format!("Referral — {}", r.destination_name.clone().unwrap_or_else(|| r.destination_type.clone())),
                    subtitle: r.case_reference.clone(),
                    matched_on: MatchedOn { field, value },
                    route: format!("/referrals?open={}", r.id),
                },
            )
        })
        .collect();
    referral_results.truncate(PER_DOMAIN_CAP);
    scored.extend(referral_results);

    // Files — filename/metadata match only (attachments::search_attachments
    // deliberately doesn't do document-content search yet). Each result
    // routes to the record the file is actually attached to, reusing the
    // same route shape every other domain above already uses.
    let attachment_rows = attachments::search_attachments(pool, trimmed).await?;
    let mut attachment_results: Vec<(i32, SearchResult)> = Vec::new();
    for a in attachment_rows.into_iter().take(PER_DOMAIN_CAP) {
        let (field, value, score) = best_match(vec![field_match(
            &query_lower,
            FieldKind::Other,
            "fileName",
            Some(&a.file_name),
        )]);
        let route = attachments::resolve_entity_route(pool, &a.entity_type, &a.entity_id).await?;
        attachment_results.push((
            score,
            SearchResult {
                id: a.id.clone(),
                entity_type: "attachment".to_string(),
                title: a.file_name.clone(),
                subtitle: format!("Attached to a {}", a.entity_type.replace('_', " ")),
                matched_on: MatchedOn { field, value },
                route,
            },
        ));
    }
    scored.extend(attachment_results);

    scored.sort_by(|a, b| b.0.cmp(&a.0));
    scored.truncate(TOTAL_CAP);

    Ok(scored.into_iter().map(|(_, result)| result).collect())
}
