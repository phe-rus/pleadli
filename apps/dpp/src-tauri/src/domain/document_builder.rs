//! Builds a document's content from the record. Nothing is typed in: every
//! line is read from the file, its charges, the decision and its review, or the
//! directions that came with a return. Which decisions produce which document
//! is here too, and only for documents the product documentation names: the
//! sanctioned charge sheet (RESEARCH.md §3/§6), the written reasons for a
//! decline (PRODUCT.md), and the directions on a return (RESEARCH.md §3).

use chrono::TimeZone;
use sqlx::SqlitePool;

use super::charging_reviews;
use super::decisions::Decision;
use super::document_content::{field, rich_text_blocks, Block, DocumentContent, ListItem, OFFICE};
use super::prosecution_files::{self, ProsecutionFile};
use super::prosecutor_profile;

pub const CHARGE_SHEET: &str = "charge_sheet";
pub const DIRECTIONS: &str = "directions_to_police";
pub const DECLINE_REASONS: &str = "decline_reasons";

/// The document a decision of this type produces, if any.
pub fn kind_for(decision_type: &str) -> Option<&'static str> {
    match decision_type {
        "sanction" | "threshold_charge" | "amend_charge" => Some(CHARGE_SHEET),
        "return_for_investigation" => Some(DIRECTIONS),
        "decline" => Some(DECLINE_REASONS),
        _ => None,
    }
}

pub fn title_for(kind: &str) -> &'static str {
    match kind {
        CHARGE_SHEET => "Charge Sheet",
        DIRECTIONS => "Directions on Return for Further Investigation",
        DECLINE_REASONS => "Written Reasons for Declining to Charge",
        _ => "Document",
    }
}

fn day(ms: i64) -> String {
    chrono::Utc.timestamp_millis_opt(ms).single().map(|d| d.format("%-d %B %Y").to_string()).unwrap_or_default()
}

fn name(last: &str, first: &str) -> String {
    format!("{last}, {first}")
}

fn dot(value: &Option<String>) -> String {
    value.clone().filter(|v| !v.trim().is_empty()).unwrap_or_else(|| "·".to_string())
}

struct Charge {
    offence: String,
    statutory_section: Option<String>,
    particulars: Option<String>,
    accused_person_id: Option<String>,
}

async fn charges_for(pool: &SqlitePool, file_id: &str, act: &[Decision]) -> Result<Vec<Charge>, sqlx::Error> {
    let counts: Vec<&str> = act.iter().filter_map(|d| d.charge_id.as_deref()).collect();
    let rows: Vec<(String, String, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT id, offence, statutory_section, particulars, accused_person_id FROM charges WHERE prosecution_file_id = ? ORDER BY created_at ASC, rowid ASC",
    )
    .bind(file_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .filter(|(id, ..)| counts.is_empty() || counts.contains(&id.as_str()))
        .map(|(_, offence, statutory_section, particulars, accused_person_id)| Charge { offence, statutory_section, particulars, accused_person_id })
        .collect())
}

async fn person_name(pool: &SqlitePool, id: &str) -> Result<Option<String>, sqlx::Error> {
    let row: Option<(String, String)> = sqlx::query_as("SELECT last_name, first_name FROM people WHERE id = ?").bind(id).fetch_optional(pool).await?;
    Ok(row.map(|(last, first)| name(&last, &first)))
}

async fn accused_names(pool: &SqlitePool, file_id: &str, charges: &[Charge], scoped: bool) -> Result<String, sqlx::Error> {
    let mut names = Vec::new();
    if scoped {
        for c in charges {
            if let Some(id) = &c.accused_person_id {
                if let Some(n) = person_name(pool, id).await? {
                    if !names.contains(&n) {
                        names.push(n);
                    }
                }
            }
        }
    }
    if names.is_empty() {
        let rows: Vec<(String, String)> = sqlx::query_as(
            "SELECT p.last_name, p.first_name FROM prosecution_file_people fp JOIN people p ON p.id = fp.person_id
              WHERE fp.prosecution_file_id = ? AND fp.role = 'accused' ORDER BY fp.rowid",
        )
        .bind(file_id)
        .fetch_all(pool)
        .await?;
        names = rows.into_iter().map(|(l, f)| name(&l, &f)).collect();
    }
    Ok(if names.is_empty() { "·".to_string() } else { names.join("; ") })
}

/// Who signs: the decision's own decider, else the installation's prosecutor.
async fn signatory(pool: &SqlitePool, decision: &Decision) -> Result<String, sqlx::Error> {
    let profile = prosecutor_profile::get_prosecutor_profile(pool).await?;
    Ok(match (&decision.decided_by, profile) {
        (Some(by), Some(p)) if p.name == *by => format!("{}{}", p.name, p.rank.map(|r| format!(", {r}")).unwrap_or_default()),
        (Some(by), _) => by.clone(),
        (None, Some(p)) => format!("{}{}", p.name, p.rank.map(|r| format!(", {r}")).unwrap_or_default()),
        (None, None) => String::new(),
    })
}

fn to_investigator(file: &ProsecutionFile, decision: &Decision) -> Block {
    Block::Fields {
        rows: vec![
            field("To", format!("The Investigating Officer{}", file.police_station.as_ref().map(|s| format!(", {s}")).unwrap_or_default())),
            field("Date", day(decision.decided_at)),
            field("Police reference", dot(&file.police_reference)),
            field("ODPP reg. no.", dot(&file.odpp_registration_number)),
            field("Matter", format!("{} ({})", file.title, prosecution_files::reference_of(file))),
        ],
    }
}

pub async fn build(pool: &SqlitePool, kind: &str, file: &ProsecutionFile, act: &[Decision]) -> Result<DocumentContent, sqlx::Error> {
    let decision = &act[0];
    let signed_by = signatory(pool, decision).await?;
    let mut blocks: Vec<Block> = Vec::new();

    match kind {
        CHARGE_SHEET => {
            let charges = charges_for(pool, &file.id, act).await?;
            let scoped = act.iter().any(|d| d.charge_id.is_some());
            let mut rows = vec![
                field("Police station", dot(&file.police_station)),
                field("Date", day(decision.decided_at)),
                field("Criminal register no.", dot(&file.police_reference)),
                field("ODPP reg. no.", dot(&file.odpp_registration_number)),
                field("Accused", accused_names(pool, &file.id, &charges, scoped).await?),
            ];
            if let Some(case) = file.court_case_number.as_ref().filter(|c| !c.trim().is_empty()) {
                rows.push(field("Court case no.", case.clone()));
            }
            blocks.push(Block::Fields { rows });

            if charges.is_empty() {
                blocks.push(Block::Note { text: "No charges recorded on this file.".to_string() });
            }
            for (index, charge) in charges.iter().enumerate() {
                blocks.push(Block::Heading { text: format!("Count {}: Statement of Offence", index + 1) });
                blocks.push(Block::Paragraph {
                    text: match &charge.statutory_section {
                        Some(section) if !section.trim().is_empty() => format!("{}, contrary to {}.", charge.offence, section),
                        _ => format!("{}.", charge.offence),
                    },
                });
                let particulars = rich_text_blocks(charge.particulars.as_deref());
                if !particulars.is_empty() {
                    blocks.push(Block::Heading { text: "Particulars of Offence".to_string() });
                    blocks.extend(particulars);
                }
            }

            let officer: Option<(String, String)> = sqlx::query_as(
                "SELECT p.last_name, p.first_name FROM statements s JOIN people p ON p.id = s.person_id
                  WHERE s.prosecution_file_id = ? AND s.statement_role = 'arresting_officer' ORDER BY s.rowid LIMIT 1",
            )
            .bind(&file.id)
            .fetch_optional(pool)
            .await?;
            blocks.push(Block::Signature {
                label: "Preferred by".to_string(),
                name: officer.map(|(l, f)| name(&l, &f)).unwrap_or_default(),
                caption: Some("Signature of preferring officer".to_string()),
            });
            blocks.push(Block::Signature {
                label: "Sanctioned by (signature, date, and stamp)".to_string(),
                name: signed_by,
                caption: Some("Signature of Prosecutor".to_string()),
            });
        }

        DIRECTIONS => {
            blocks.push(to_investigator(file, decision));
            blocks.push(Block::Paragraph { text: "The file is returned for further investigation. Before it is resubmitted, the following is to be done.".to_string() });
            let rows: Vec<(String, String, Option<String>)> = sqlx::query_as(
                "SELECT kind, instruction, person_id FROM directions WHERE decision_id = ? ORDER BY sort_order, rowid",
            )
            .bind(&decision.id)
            .fetch_all(pool)
            .await?;
            let mut items = Vec::new();
            for (kind, instruction, person_id) in rows {
                let label = direction_label(&kind);
                let title = match person_id {
                    Some(id) => match person_name(pool, &id).await? {
                        Some(n) => format!("{label}: {n}"),
                        None => label.to_string(),
                    },
                    None => label.to_string(),
                };
                items.push(ListItem { title: Some(title), text: instruction });
            }
            blocks.push(Block::List { ordered: true, items });
            let note = rich_text_blocks(decision.reasons.as_deref());
            if !note.is_empty() {
                blocks.push(Block::Heading { text: "Note".to_string() });
                blocks.extend(note);
            }
            blocks.push(Block::Signature { label: String::new(), name: signed_by, caption: Some("Signature, date and stamp".to_string()) });
        }

        DECLINE_REASONS => {
            blocks.push(Block::Note { text: "Privileged and confidential: between the Office of the Director of Public Prosecutions and the investigating agency.".to_string() });
            blocks.push(to_investigator(file, decision));

            let charges = charges_for(pool, &file.id, act).await?;
            if !charges.is_empty() {
                blocks.push(Block::Heading { text: "Charges declined".to_string() });
                blocks.push(Block::List {
                    ordered: true,
                    items: charges
                        .iter()
                        .map(|c| ListItem {
                            title: None,
                            text: match &c.statutory_section {
                                Some(s) if !s.trim().is_empty() => format!("{}, contrary to {}", c.offence, s),
                                _ => c.offence.clone(),
                            },
                        })
                        .collect(),
                });
            }

            if let Some(review_id) = &decision.review_id {
                let review = charging_reviews::get_with_assessments(pool, review_id).await.ok();
                if let Some(r) = review {
                    let mut lines = Vec::new();
                    let word = |o: &Option<String>| o.clone().unwrap_or_default().replace('_', " ");
                    if r.review.standard == "two_stage" {
                        if r.review.evidential_outcome.is_some() {
                            lines.push(format!("Evidential Test: {}", word(&r.review.evidential_outcome)));
                        }
                        if r.review.public_interest_outcome.is_some() {
                            lines.push(format!("Public Interest Test: {}", word(&r.review.public_interest_outcome)));
                        }
                    }
                    if !lines.is_empty() {
                        blocks.push(Block::Heading { text: "Assessment".to_string() });
                        blocks.push(Block::List { ordered: false, items: lines.into_iter().map(|text| ListItem { title: None, text }).collect() });
                    }
                    let findings: Vec<ListItem> = r
                        .assessments
                        .iter()
                        .filter(|a| a.finding != "unresolved" || a.note.is_some())
                        .map(|a| ListItem {
                            title: Some(criterion_label(&a.criterion).to_string()),
                            text: format!(
                                "{}{}",
                                match a.finding.as_str() {
                                    "favours" => "Favours charging",
                                    "against" => "Against charging",
                                    _ => "Unresolved",
                                },
                                a.note.as_ref().map(|n| format!(". {n}")).unwrap_or_default()
                            ),
                        })
                        .collect();
                    if !findings.is_empty() {
                        blocks.push(Block::Heading { text: "Findings".to_string() });
                        blocks.push(Block::List { ordered: false, items: findings });
                    }
                }
            }

            blocks.push(Block::Heading { text: "Reasons".to_string() });
            let reasons = rich_text_blocks(decision.reasons.as_deref());
            if reasons.is_empty() {
                blocks.push(Block::Note { text: "No reasons were recorded with this decision.".to_string() });
            } else {
                blocks.extend(reasons);
            }
            blocks.push(Block::Signature { label: String::new(), name: signed_by, caption: Some("Signature, date and stamp".to_string()) });
        }

        _ => {}
    }

    Ok(DocumentContent { office: OFFICE.to_string(), title: title_for(kind).to_string(), blocks, ..Default::default() })
}

fn direction_label(kind: &str) -> &'static str {
    match kind {
        "missing_material" => "What is missing",
        "investigation" => "Investigation required",
        "statement" => "Additional statement",
        "evidence" => "Additional evidence",
        "clarification" => "Clarification",
        "procedural" => "Procedural requirement",
        _ => "Direction",
    }
}

fn criterion_label(criterion: &str) -> &'static str {
    match criterion {
        "relevance" => "Relevance",
        "admissibility" => "Admissibility",
        "reliability" => "Reliability",
        "credibility" => "Credibility",
        "availability" => "Availability",
        "defence" => "Defence raised",
        "seriousness" => "Seriousness",
        "culpability" => "Culpability",
        "harm" => "Harm",
        "age" => "Age",
        "proportionality" => "Proportionality",
        "out_of_court_disposal" => "Out-of-court disposal",
        "sensitive_information" => "Sensitive information",
        "threshold_guilt" => "Reasonable grounds to believe guilt",
        "threshold_further_evidence" => "Further evidence is expected",
        "threshold_seriousness" => "Seriousness justifies charging now",
        "threshold_bail" => "Substantial grounds to object to bail",
        "threshold_public_interest" => "Public interest in charging",
        _ => "Criterion",
    }
}
