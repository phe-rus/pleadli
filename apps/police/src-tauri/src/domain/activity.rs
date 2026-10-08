use serde::Serialize;
use sqlx::SqlitePool;

use super::search::full_name;
use super::{bonds, cases, charge_sheets, custody, incidents, referrals, shift_log, statements, station_diary, vehicles};

/// The cross-domain "what's happening" feed for Overview. Deliberately a
/// derived view, not a new table: each domain already exposes its own
/// recent rows via `list_*(pool, "")` (see `domain/search.rs`, which
/// merges the same domains for search — this reuses those exact calls,
/// just sorted by recency instead of relevance, and without a score).
/// Backup alerts are excluded: they already have their own dedicated,
/// more prominent live system (ringtone, modal, toolbar indicator).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityItem {
    pub id: String,
    pub entity_type: String,
    pub title: String,
    pub subtitle: String,
    pub occurred_at: i64,
    pub route: String,
}

const PER_DOMAIN_CAP: usize = 10;
const TOTAL_CAP: usize = 30;

pub async fn recent(pool: &SqlitePool) -> Result<Vec<ActivityItem>, sqlx::Error> {
    let mut items: Vec<ActivityItem> = Vec::new();

    let mut station_diary_items: Vec<ActivityItem> = station_diary::list_entries(pool, "")
        .await?
        .into_iter()
        .map(|e| ActivityItem {
            id: e.id.clone(),
            entity_type: "station_diary_entry".to_string(),
            title: format!("SD entry: {}", e.category.replace('_', " ")),
            subtitle: String::new(),
            occurred_at: e.created_at,
            route: format!("/sd-log?open={}", e.id),
        })
        .collect();
    station_diary_items.truncate(PER_DOMAIN_CAP);
    items.extend(station_diary_items);

    let mut incident_items: Vec<ActivityItem> = incidents::list_incidents(pool, "")
        .await?
        .into_iter()
        .map(|i| ActivityItem {
            id: i.id.clone(),
            entity_type: "incident".to_string(),
            title: i.summary.clone(),
            subtitle: i.location.clone().unwrap_or_default(),
            occurred_at: i.created_at,
            route: format!("/incidents?open={}", i.id),
        })
        .collect();
    incident_items.truncate(PER_DOMAIN_CAP);
    items.extend(incident_items);

    let mut statement_items: Vec<ActivityItem> = statements::list_statements(pool, "")
        .await?
        .into_iter()
        .map(|s| {
            let name = full_name(&s.person_first_name, &s.person_last_name, s.person_other_names.as_deref());
            ActivityItem {
                id: s.id.clone(),
                entity_type: "statement".to_string(),
                title: format!("Statement: {name}"),
                subtitle: s.officer_name.clone().unwrap_or_default(),
                occurred_at: s.created_at,
                route: format!("/statements?open={}", s.id),
            }
        })
        .collect();
    statement_items.truncate(PER_DOMAIN_CAP);
    items.extend(statement_items);

    let mut custody_items: Vec<ActivityItem> = custody::list_records(pool, "")
        .await?
        .into_iter()
        .map(|r| {
            let name = full_name(&r.person_first_name, &r.person_last_name, r.person_other_names.as_deref());
            ActivityItem {
                id: r.id.clone(),
                entity_type: "custody_record".to_string(),
                title: format!("Custody: {name}"),
                subtitle: r.location.clone().unwrap_or_default(),
                occurred_at: r.created_at,
                route: format!("/search/custody?open={}", r.id),
            }
        })
        .collect();
    custody_items.truncate(PER_DOMAIN_CAP);
    items.extend(custody_items);

    let mut bond_items: Vec<ActivityItem> = bonds::list_bonds(pool, "")
        .await?
        .into_iter()
        .map(|b| {
            let name = full_name(&b.person_first_name, &b.person_last_name, b.person_other_names.as_deref());
            ActivityItem {
                id: b.id.clone(),
                entity_type: "bond".to_string(),
                title: format!("Bond: {name}"),
                subtitle: b.surety_name.clone().unwrap_or_default(),
                occurred_at: b.created_at,
                route: format!("/search/bonds?open={}", b.id),
            }
        })
        .collect();
    bond_items.truncate(PER_DOMAIN_CAP);
    items.extend(bond_items);

    let mut charge_sheet_items: Vec<ActivityItem> = charge_sheets::list_charge_sheets(pool, "")
        .await?
        .into_iter()
        .map(|cs| {
            let name = cs
                .accused_first_name
                .as_deref()
                .map(|first| full_name(first, cs.accused_last_name.as_deref().unwrap_or(""), cs.accused_other_names.as_deref()));
            ActivityItem {
                id: cs.id.clone(),
                entity_type: "charge_sheet".to_string(),
                title: format!("Charge: {}", cs.offence),
                subtitle: name.unwrap_or(cs.case_reference.clone()),
                occurred_at: cs.created_at,
                route: format!("/legal-forms?open={}", cs.id),
            }
        })
        .collect();
    charge_sheet_items.truncate(PER_DOMAIN_CAP);
    items.extend(charge_sheet_items);

    let mut referral_items: Vec<ActivityItem> = referrals::list_referrals(pool, "")
        .await?
        .into_iter()
        .map(|r| ActivityItem {
            id: r.id.clone(),
            entity_type: "referral".to_string(),
            title: format!("Referral: {}", r.destination_name.clone().unwrap_or_else(|| r.destination_type.clone())),
            subtitle: r.case_reference.clone(),
            occurred_at: r.created_at,
            route: format!("/referrals?open={}", r.id),
        })
        .collect();
    referral_items.truncate(PER_DOMAIN_CAP);
    items.extend(referral_items);

    let mut case_items: Vec<ActivityItem> = cases::list_cases(pool, "")
        .await?
        .into_iter()
        .map(|c| ActivityItem {
            id: c.id.clone(),
            entity_type: "case".to_string(),
            title: c.reference.clone(),
            subtitle: c.summary.clone(),
            occurred_at: c.created_at,
            route: format!("/investigations/{}", c.id),
        })
        .collect();
    case_items.truncate(PER_DOMAIN_CAP);
    items.extend(case_items);

    let mut vehicle_items: Vec<ActivityItem> = vehicles::list_vehicles(pool, "")
        .await?
        .into_iter()
        .map(|v| {
            let owner = v
                .owner_first_name
                .as_deref()
                .map(|first| full_name(first, v.owner_last_name.as_deref().unwrap_or(""), v.owner_other_names.as_deref()));
            ActivityItem {
                id: v.id.clone(),
                entity_type: "vehicle".to_string(),
                title: v.plate_number.clone(),
                subtitle: owner.unwrap_or_default(),
                occurred_at: v.created_at,
                route: format!("/vehicles?open={}", v.id),
            }
        })
        .collect();
    vehicle_items.truncate(PER_DOMAIN_CAP);
    items.extend(vehicle_items);

    let mut check_in_items: Vec<ActivityItem> = shift_log::list_check_ins(pool, "")
        .await?
        .into_iter()
        .map(|c| ActivityItem {
            id: c.id.clone(),
            entity_type: "officer_check_in".to_string(),
            title: format!("{} checked in", c.officer_name),
            subtitle: if c.method == "remote_scan" { "Remote scan".to_string() } else { "Badge entry".to_string() },
            occurred_at: c.checked_in_at,
            route: format!("/roster?open={}", c.id),
        })
        .collect();
    check_in_items.truncate(PER_DOMAIN_CAP);
    items.extend(check_in_items);

    let mut handover_items: Vec<ActivityItem> = shift_log::list_handovers(pool, "")
        .await?
        .into_iter()
        .map(|h| ActivityItem {
            id: h.id.clone(),
            entity_type: "shift_handover".to_string(),
            title: format!("Handover to {}", h.incoming_officer_name),
            subtitle: h.outgoing_officer_name.clone().unwrap_or_default(),
            occurred_at: h.handed_over_at,
            route: format!("/roster?open={}", h.id),
        })
        .collect();
    handover_items.truncate(PER_DOMAIN_CAP);
    items.extend(handover_items);

    items.sort_by(|a, b| b.occurred_at.cmp(&a.occurred_at));
    items.truncate(TOTAL_CAP);

    Ok(items)
}
