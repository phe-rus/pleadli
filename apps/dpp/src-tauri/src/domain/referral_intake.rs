//! Reading what a station sent, and turning it into DPP records only when a
//! person says so.
//!
//! A referral that has passed the checks in `interchange::import_package` is
//! held in `incoming_packages`, apart from the records. This module lets the
//! prosecutor look at it (what it claims, who says so, what it would create),
//! and then accept it, which creates the file, the people, the statements, the
//! evidence, the proposed charges and the documents in one transaction, or
//! reject it with a reason. Either way a receipt is queued for the station.

use pleadli_interchange::messages::ReferralPayload;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::collections::HashMap;
use std::path::Path;
use uuid::Uuid;

use super::attachments;
use super::audit::{self, Entry};
use super::error::{clean, invalid, DomainError};
use super::interchange;
use super::prosecution_files;
use super::vault;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct IncomingSummary {
    pub id: String,
    pub connection_id: String,
    pub station_name: Option<String>,
    pub seq: i64,
    pub sent_at: i64,
    pub received_at: i64,
    pub status: String,
    pub police_reference: Option<String>,
    pub decided_at: Option<i64>,
    pub decided_by: Option<String>,
    pub reject_reason: Option<String>,
    pub prosecution_file_id: Option<String>,
    pub resubmission: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMeta {
    pub id: String,
    pub name: String,
    pub mime: String,
    pub sha256: String,
    pub size: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonMatch {
    pub person_key: String,
    pub existing_person_id: String,
    pub existing_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResubmissionTarget {
    pub file_id: String,
    pub title: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingDetail {
    #[serde(flatten)]
    pub summary: IncomingSummary,
    /// The fingerprint of the key that signed it: what this office confirmed.
    pub sender_fingerprint: String,
    pub package_sha256: String,
    pub connection_state: String,
    pub payload: ReferralPayload,
    pub files: Vec<FileMeta>,
    /// People in the referral whose national ID matches someone already here.
    pub matches: Vec<PersonMatch>,
    pub resubmission_target: Option<ResubmissionTarget>,
    /// The station's package numbers between the last one accepted and this one
    /// that this office has never seen.
    pub missing_before: i64,
    /// The station names itself differently in the referral than it did when it
    /// was connected.
    pub name_differs: bool,
}

const SUMMARY_SELECT: &str = "SELECT p.id, p.connection_id, c.station_name, p.seq, p.sent_at, p.received_at, p.status,
        json_extract(p.payload, '$.policeReference') AS police_reference, p.decided_at, p.decided_by, p.reject_reason, p.prosecution_file_id,
        (json_extract(p.payload, '$.resubmissionOf') IS NOT NULL) AS resubmission
   FROM incoming_packages p JOIN police_connections c ON c.id = p.connection_id";

pub async fn list_incoming(pool: &SqlitePool) -> Result<Vec<IncomingSummary>, DomainError> {
    Ok(sqlx::query_as::<_, IncomingSummary>(sqlx::AssertSqlSafe(format!("{SUMMARY_SELECT} WHERE p.kind = 'referral' ORDER BY (p.status = 'received') DESC, p.received_at DESC")))
        .fetch_all(pool)
        .await?)
}

pub async fn get_incoming(pool: &SqlitePool, id: &str) -> Result<IncomingDetail, DomainError> {
    let summary = sqlx::query_as::<_, IncomingSummary>(sqlx::AssertSqlSafe(format!("{SUMMARY_SELECT} WHERE p.id = ?")))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| DomainError::NotFound("Package not found.".to_string()))?;
    let (payload_text, files_text, fingerprint, sha): (String, String, String, String) =
        sqlx::query_as("SELECT payload, files, sender_fingerprint, package_sha256 FROM incoming_packages WHERE id = ?").bind(id).fetch_one(pool).await?;
    let payload: ReferralPayload = serde_json::from_str(&payload_text).map_err(|_| DomainError::Invalid("The stored referral could not be read.".to_string()))?;
    let files: Vec<FileMeta> = serde_json::from_str(&files_text).unwrap_or_default();
    let connection = interchange::get_connection(pool, &summary.connection_id).await?;

    let mut matches = Vec::new();
    for person in &payload.people {
        let Some(national_id) = person.national_id.as_deref().map(str::trim).filter(|n| !n.is_empty()) else { continue };
        if let Some((existing, first, last)) = sqlx::query_as::<_, (String, String, String)>("SELECT id, first_name, last_name FROM people WHERE national_id = ? LIMIT 1").bind(national_id).fetch_optional(pool).await? {
            matches.push(PersonMatch { person_key: person.key.clone(), existing_person_id: existing, existing_name: format!("{last}, {first}") });
        }
    }
    let resubmission_target = match &payload.resubmission_of {
        Some(file_id) => sqlx::query_as::<_, (String, String, String)>("SELECT id, title, current_status FROM prosecution_files WHERE id = ? AND police_connection_id = ?")
            .bind(file_id)
            .bind(&summary.connection_id)
            .fetch_optional(pool)
            .await?
            .map(|(file_id, title, status)| ResubmissionTarget { file_id, title, status }),
        None => None,
    };
    let last_accepted: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(seq), 0) FROM incoming_packages WHERE connection_id = ? AND seq < ?").bind(&summary.connection_id).bind(summary.seq).fetch_one(pool).await?;
    let name_differs = connection.station_name.as_deref().is_some_and(|n| !n.eq_ignore_ascii_case(payload.station_name.trim()));
    Ok(IncomingDetail {
        sender_fingerprint: fingerprint,
        package_sha256: sha,
        connection_state: connection.state,
        payload,
        files,
        matches,
        resubmission_target,
        missing_before: (summary.seq - last_accepted - 1).max(0),
        name_differs,
        summary,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceptInput {
    pub title: Option<String>,
    pub odpp_registration_number: Option<String>,
    /// For each person key in the referral: an existing person to use instead of
    /// creating one. Absent or null means a new person.
    #[serde(default)]
    pub person_matches: HashMap<String, Option<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Accepted {
    pub file_id: String,
    pub attached: usize,
    pub attachments_failed: usize,
}

fn default_title(p: &ReferralPayload) -> String {
    let accused: Vec<&str> = p.people.iter().filter(|x| x.role == "accused").map(|x| x.last_name.trim()).filter(|n| !n.is_empty()).collect();
    match (accused.is_empty(), p.charges.first()) {
        (false, Some(charge)) => format!("State vs. {}: {}", accused.join(" and "), charge.offence.trim().to_lowercase()),
        (false, None) => format!("State vs. {}", accused.join(" and ")),
        _ => p.police_reference.clone(),
    }
}

pub async fn accept_referral(pool: &SqlitePool, vault_root: &Path, package_id: &str, input: AcceptInput) -> Result<Accepted, DomainError> {
    let detail = get_incoming(pool, package_id).await?;
    if detail.summary.status != "received" {
        return invalid("This package has already been decided.");
    }
    if detail.connection_state != "trusted" {
        return invalid("The station's connection is no longer trusted, so this cannot be accepted.");
    }
    let payload = &detail.payload;
    let by = sqlx::query_scalar::<_, String>("SELECT name FROM prosecutor_profile WHERE id = 'default'").fetch_optional(pool).await?;
    let title = clean(input.title).unwrap_or_else(|| default_title(payload));
    let registration = clean(input.odpp_registration_number);

    // A resubmission is a return coming back to the file it left, from the
    // station that referred it. It is never a new file.
    let target = match &payload.resubmission_of {
        Some(_) => match &detail.resubmission_target {
            Some(t) if t.status == "returned_for_investigation" => Some(t.file_id.clone()),
            Some(_) => return invalid("The file this resubmission names is not waiting with the station."),
            None => return invalid("This resubmission names a file that this station did not refer."),
        },
        None => None,
    };
    let answers: Option<String> = match &target {
        Some(file_id) => sqlx::query_scalar("SELECT id FROM decisions WHERE prosecution_file_id = ? AND decision_type = 'return_for_investigation' ORDER BY decided_at DESC, created_at DESC, rowid DESC LIMIT 1").bind(file_id).fetch_optional(pool).await?,
        None => None,
    };

    let station_name = detail.summary.station_name.clone().unwrap_or_default();
    let note = |taken_by: &Option<String>| format!("Received from {station_name} ({}){}", payload.police_reference, taken_by.as_ref().map(|t| format!(", taken by {t}")).unwrap_or_default());
    let file_id = target.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
    let received_at = detail.summary.received_at;
    let mut attach: Vec<(String, &'static str, String)> = Vec::new();
    let mut claimed_files = std::collections::HashSet::new();

    let mut tx = pool.begin().await?;
    if target.is_none() {
        sqlx::query("INSERT INTO prosecution_files (id, odpp_registration_number, title, police_station, police_reference, received_at, notes, police_connection_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(&file_id)
            .bind(&registration)
            .bind(&title)
            .bind(&payload.station_name)
            .bind(&payload.police_reference)
            .bind(received_at)
            .bind(clean(payload.notes.clone()))
            .bind(&detail.summary.connection_id)
            .execute(&mut *tx)
            .await?;
    }
    let material_summary = {
        let mut s = payload.summary.trim().to_string();
        s.push_str(&format!("\n\n{} statements, {} exhibits, {} proposed charges, {} files.", payload.statements.len(), payload.exhibits.len(), payload.charges.len(), detail.files.len()));
        s
    };
    sqlx::query("INSERT INTO referrals (id, prosecution_file_id, police_station, police_reference, received_at, material_summary, is_resubmission, notes, answers_decision_id, source_package_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(&file_id)
        .bind(&payload.station_name)
        .bind(&payload.police_reference)
        .bind(received_at)
        .bind(&material_summary)
        .bind(target.is_some())
        .bind(clean(payload.referring_officer.clone().map(|o| format!("Referred by {o}"))))
        .bind(&answers)
        .bind(package_id)
        .execute(&mut *tx)
        .await?;

    let mut person_ids: HashMap<&str, String> = HashMap::new();
    for person in &payload.people {
        let chosen = input.person_matches.get(&person.key).cloned().flatten();
        let person_id = match chosen {
            Some(existing) => {
                let found: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM people WHERE id = ?").bind(&existing).fetch_one(&mut *tx).await?;
                if found == 0 {
                    return Err(DomainError::NotFound("A person chosen to match does not exist.".to_string()));
                }
                existing
            }
            None => {
                let id = Uuid::new_v4().to_string();
                sqlx::query("INSERT INTO people (id, first_name, last_name, other_names, phone, national_id, address) VALUES (?, ?, ?, ?, ?, ?, ?)")
                    .bind(&id)
                    .bind(person.first_name.trim())
                    .bind(person.last_name.trim())
                    .bind(clean(person.other_names.clone()))
                    .bind(clean(person.phone.clone()))
                    .bind(clean(person.national_id.clone()))
                    .bind(clean(person.address.clone()))
                    .execute(&mut *tx)
                    .await?;
                id
            }
        };
        let linked: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prosecution_file_people WHERE prosecution_file_id = ? AND person_id = ? AND role = ?").bind(&file_id).bind(&person_id).bind(&person.role).fetch_one(&mut *tx).await?;
        if linked == 0 {
            sqlx::query("INSERT INTO prosecution_file_people (id, prosecution_file_id, person_id, role) VALUES (?, ?, ?, ?)").bind(Uuid::new_v4().to_string()).bind(&file_id).bind(&person_id).bind(&person.role).execute(&mut *tx).await?;
        }
        person_ids.insert(person.key.as_str(), person_id);
    }
    for statement in &payload.statements {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO statements (id, prosecution_file_id, person_id, statement_role, content, given_at, source_note) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(&id)
            .bind(&file_id)
            .bind(&person_ids[statement.person_key.as_str()])
            .bind(&statement.role)
            .bind(clean(Some(statement.content.clone())))
            .bind(statement.given_at)
            .bind(note(&statement.taken_by))
            .execute(&mut *tx)
            .await?;
        for f in &statement.file_ids {
            claimed_files.insert(f.clone());
            attach.push((f.clone(), "statement", id.clone()));
        }
    }
    for exhibit in &payload.exhibits {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO evidence_items (id, prosecution_file_id, category, description, identification_mark, recovered_from_location, source_note) VALUES (?, ?, 'exhibit', ?, ?, ?, ?)")
            .bind(&id)
            .bind(&file_id)
            .bind(clean(Some(exhibit.description.clone())))
            .bind(clean(exhibit.identification_mark.clone()))
            .bind(clean(exhibit.recovered_from_location.clone()))
            .bind(note(&None))
            .execute(&mut *tx)
            .await?;
        for f in &exhibit.file_ids {
            claimed_files.insert(f.clone());
            attach.push((f.clone(), "evidence_item", id.clone()));
        }
    }
    for charge in &payload.charges {
        sqlx::query("INSERT INTO charges (id, prosecution_file_id, accused_person_id, offence, statutory_section, particulars) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(Uuid::new_v4().to_string())
            .bind(&file_id)
            .bind(charge.accused_person_key.as_deref().and_then(|k| person_ids.get(k)))
            .bind(charge.offence.trim())
            .bind(clean(charge.statutory_section.clone()))
            .bind(clean(charge.particulars.clone()))
            .execute(&mut *tx)
            .await?;
    }
    for f in &detail.files {
        if !claimed_files.contains(&f.id) {
            attach.push((f.id.clone(), "prosecution_file", file_id.clone()));
        }
    }
    if target.is_some() {
        prosecution_files::recompute_status(&mut tx, &file_id).await?;
    }
    let registration_for_receipt: Option<String> = sqlx::query_scalar("SELECT odpp_registration_number FROM prosecution_files WHERE id = ?").bind(&file_id).fetch_one(&mut *tx).await?;
    sqlx::query("UPDATE incoming_packages SET status = 'accepted', decided_at = ?, decided_by = ?, prosecution_file_id = ? WHERE id = ?").bind(chrono::Utc::now().timestamp_millis()).bind(&by).bind(&file_id).bind(package_id).execute(&mut *tx).await?;
    interchange::record_receipt(&mut tx, &detail.summary.connection_id, package_id, payload, "accepted", Some((&file_id, registration_for_receipt.as_deref())), None, received_at, by.clone()).await?;
    audit::record(&mut tx, Entry::new(if target.is_some() { "resubmission_accepted" } else { "referral_accepted" }).subject("incoming_package", package_id).file(&file_id).detail(format!("{} from {station_name}", payload.police_reference))).await?;
    tx.commit().await?;

    // The files come last: they are sealed one by one, and a failure on one must
    // not undo records already made. It is recorded, and the file stays in the
    // incoming vault so it is not lost.
    let (mut attached, mut failed) = (0, 0);
    for (package_file, entity_type, entity_id) in &attach {
        let Some(meta) = detail.files.iter().find(|f| &f.id == package_file) else { continue };
        let relative = format!("incoming/{package_id}/{package_file}.enc");
        let outcome = match vault::read(vault_root, &relative, &format!("{package_id}/{package_file}")) {
            Ok(bytes) if vault::sha256_hex(&bytes) == meta.sha256 => attachments::add_attachment_bytes(pool, vault_root, entity_type, entity_id, &meta.name, &bytes).await.map(|_| ()).map_err(|e| e.to_string()),
            Ok(_) => Err("the file does not match its hash".to_string()),
            Err(e) => Err(e.to_string()),
        };
        match outcome {
            Ok(()) => {
                attached += 1;
                let _ = vault::shred_file(&vault_root.join(&relative));
            }
            Err(e) => {
                failed += 1;
                let _ = audit::log(pool, Entry::new("attachment_import_failed").subject("incoming_package", package_id).detail(format!("{}: {e}", meta.name))).await;
            }
        }
    }
    Ok(Accepted { file_id, attached, attachments_failed: failed })
}

pub async fn reject_referral(pool: &SqlitePool, vault_root: &Path, package_id: &str, reason: &str) -> Result<(), DomainError> {
    let detail = get_incoming(pool, package_id).await?;
    if detail.summary.status != "received" {
        return invalid("This package has already been decided.");
    }
    if reason.trim().is_empty() {
        return invalid("Say why the referral is being rejected: the station is told.");
    }
    let by = sqlx::query_scalar::<_, String>("SELECT name FROM prosecutor_profile WHERE id = 'default'").fetch_optional(pool).await?;
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE incoming_packages SET status = 'rejected', decided_at = ?, decided_by = ?, reject_reason = ? WHERE id = ?").bind(chrono::Utc::now().timestamp_millis()).bind(&by).bind(reason.trim()).bind(package_id).execute(&mut *tx).await?;
    interchange::record_receipt(&mut tx, &detail.summary.connection_id, package_id, &detail.payload, "rejected", None, Some(reason.trim()), detail.summary.received_at, by).await?;
    audit::record(&mut tx, Entry::new("referral_rejected").subject("incoming_package", package_id).detail(format!("{}: {}", detail.payload.police_reference, reason.trim()))).await?;
    tx.commit().await?;
    for f in &detail.files {
        let _ = vault::shred_file(&vault_root.join(format!("incoming/{package_id}/{}.enc", f.id)));
    }
    Ok(())
}
