//! Station <-> DPP exchange, the station's half (docs/interchange/police-dpp.md).
//! A package is a claim, not a record: the station sends a referral only to a
//! DPP office that invited it and confirmed it, and what comes back (a receipt,
//! a decision notice) is held for a person to read. The same sealed file leaves
//! by hand (saved, carried, imported) or through the postbox; this module does
//! not care which.

use pleadli_interchange::envelope::{self, Body};
use pleadli_interchange::identity::{hex, unhex32, Identity, IdentityKind, PublicIdentity};
use pleadli_interchange::messages::{ChargeClaim, ExhibitClaim, PersonClaim, ReferralPayload, StatementClaim, KIND_DECISION_NOTICE, KIND_RECEIPT, KIND_REFERRAL};
use pleadli_interchange::pairing::{self, KIND_CONFIRMATION};
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

use super::error::DomainError;

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
fn bad(message: impl Into<String>) -> DomainError {
    DomainError::Invalid(message.into())
}
const DAMAGED: &str = "This station's identity is damaged.";

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StationIdentity {
    pub station_id: String,
    pub station_name: String,
    pub jurisdiction: Option<String>,
    #[sqlx(skip)]
    pub fingerprint: String,
}

#[derive(FromRow)]
struct IdentityRow {
    station_id: String,
    station_name: String,
    jurisdiction: Option<String>,
    verifying_key: String,
    encryption_key: String,
    signing_secret: String,
    encryption_secret: String,
}

async fn load_identity(pool: &SqlitePool) -> Result<Option<Identity>, DomainError> {
    let row: Option<IdentityRow> = sqlx::query_as("SELECT station_id, station_name, jurisdiction, verifying_key, encryption_key, signing_secret, encryption_secret FROM exchange_identity WHERE id = 'default'")
        .fetch_optional(pool)
        .await?;
    let Some(r) = row else { return Ok(None) };
    let public = PublicIdentity { id: r.station_id, kind: IdentityKind::PoliceStation, name: r.station_name, jurisdiction: r.jurisdiction, verifying_key: r.verifying_key, encryption_key: r.encryption_key };
    let signing = unhex32(&r.signing_secret).ok_or_else(|| bad(DAMAGED))?;
    let encryption = unhex32(&r.encryption_secret).ok_or_else(|| bad(DAMAGED))?;
    Identity::restore(public, signing, encryption).map(Some).ok_or_else(|| bad(DAMAGED))
}

async fn require_identity(pool: &SqlitePool) -> Result<Identity, DomainError> {
    load_identity(pool).await?.ok_or_else(|| bad("Set up this station's identity first."))
}

fn view(identity: &Identity) -> StationIdentity {
    StationIdentity { station_id: identity.public.id.clone(), station_name: identity.public.name.clone(), jurisdiction: identity.public.jurisdiction.clone(), fingerprint: identity.public.fingerprint() }
}

pub async fn get_identity(pool: &SqlitePool) -> Result<Option<StationIdentity>, DomainError> {
    Ok(load_identity(pool).await?.as_ref().map(view))
}

/// Once. The name is part of the fingerprint the office confirms, so it cannot change.
pub async fn create_identity(pool: &SqlitePool, station_name: &str, jurisdiction: Option<&str>) -> Result<StationIdentity, DomainError> {
    let name = station_name.trim();
    if name.is_empty() {
        return Err(bad("Name the station, as the DPP office knows it."));
    }
    if load_identity(pool).await?.is_some() {
        return Err(bad("This station already has an identity. It cannot be changed, because the office has confirmed its fingerprint."));
    }
    let identity = Identity::generate(IdentityKind::PoliceStation, name, jurisdiction.map(str::trim).filter(|j| !j.is_empty()));
    sqlx::query("INSERT INTO exchange_identity (id, station_id, station_name, jurisdiction, verifying_key, encryption_key, signing_secret, encryption_secret) VALUES ('default', ?, ?, ?, ?, ?, ?, ?)")
        .bind(&identity.public.id)
        .bind(&identity.public.name)
        .bind(&identity.public.jurisdiction)
        .bind(&identity.public.verifying_key)
        .bind(&identity.public.encryption_key)
        .bind(hex(&identity.signing_secret()))
        .bind(hex(&identity.encryption_secret()))
        .execute(pool)
        .await?;
    Ok(view(&identity))
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub id: String,
    pub office_name: String,
    pub office_jurisdiction: Option<String>,
    pub fingerprint: String,
    pub status: String,
    pub reason: Option<String>,
    pub responded_at: i64,
    pub trusted_at: Option<i64>,
}

pub async fn list_connections(pool: &SqlitePool) -> Result<Vec<Connection>, DomainError> {
    Ok(sqlx::query_as("SELECT id, office_name, office_jurisdiction, fingerprint, status, reason, responded_at, trusted_at FROM dpp_connections ORDER BY created_at DESC").fetch_all(pool).await?)
}

/// The station reads an invitation file from a DPP office and answers it. The
/// office is trusted only once it confirms the station back.
pub async fn accept_invite(pool: &SqlitePool, invite_file: &[u8], officer_in_charge: Option<&str>) -> Result<(Connection, Vec<u8>), DomainError> {
    let station = require_identity(pool).await?;
    let invite = pairing::read_invite(invite_file).map_err(|e| bad(e.to_string()))?;
    if invite.expires_at < now() {
        return Err(bad("That invitation has expired. Ask the office for a new one."));
    }
    if invite.office.kind != IdentityKind::DppOffice {
        return Err(bad("That invitation is not from a DPP office."));
    }
    let taken: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM dpp_connections WHERE id = ? OR (office_id = ? AND status IN ('answered', 'trusted'))")
        .bind(&invite.invite_id)
        .bind(&invite.office.id)
        .fetch_one(pool)
        .await?;
    if taken > 0 {
        return Err(bad("This station already has a connection to that office."));
    }
    let response = pairing::make_response(&station, &invite, officer_in_charge.map(str::trim).filter(|o| !o.is_empty())).map_err(|e| bad(e.to_string()))?;
    let o = &invite.office;
    sqlx::query("INSERT INTO dpp_connections (id, office_id, office_name, office_jurisdiction, office_verifying_key, office_encryption_key, fingerprint, status, responded_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'answered', ?)")
        .bind(&invite.invite_id)
        .bind(&o.id)
        .bind(&o.name)
        .bind(&o.jurisdiction)
        .bind(&o.verifying_key)
        .bind(&o.encryption_key)
        .bind(o.fingerprint())
        .bind(now())
        .execute(pool)
        .await?;
    let connection = sqlx::query_as("SELECT id, office_name, office_jurisdiction, fingerprint, status, reason, responded_at, trusted_at FROM dpp_connections WHERE id = ?").bind(&invite.invite_id).fetch_one(pool).await?;
    Ok((connection, response))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Imported {
    pub kind: String,
    pub message: String,
}

async fn office_public(pool: &SqlitePool, connection_id: &str) -> Result<(PublicIdentity, String), DomainError> {
    let row: Option<(String, String, Option<String>, String, String, String)> = sqlx::query_as("SELECT office_id, office_name, office_jurisdiction, office_verifying_key, office_encryption_key, status FROM dpp_connections WHERE id = ?")
        .bind(connection_id)
        .fetch_optional(pool)
        .await?;
    let (id, name, jurisdiction, verifying_key, encryption_key, status) = row.ok_or_else(|| DomainError::NotFound("No such connection.".into()))?;
    Ok((PublicIdentity { id, kind: IdentityKind::DppOffice, name, jurisdiction, verifying_key, encryption_key }, status))
}

/// A package from the office: its confirmation of the connection, a receipt for
/// a referral, or a decision notice. Refused unless sealed to this station,
/// signed by the office pinned from its invitation, and not seen before.
pub async fn import_package(pool: &SqlitePool, bytes: &[u8]) -> Result<Imported, DomainError> {
    let station = require_identity(pool).await?;
    let peeked = envelope::peek(bytes).map_err(|e| bad(e.to_string()))?;
    let header = peeked.header.clone();
    // Whatever carrier brought it, this institution decides for itself whether that kind of sender may send that kind of package.
    if let Err(why) = pleadli_interchange::authorization::check(header.from.kind, pleadli_interchange::identity::IdentityKind::PoliceStation, &header.kind) {
        return Err(bad(why));
    }
    if header.created_at > now() + 86_400_000 {
        return Err(bad("This package is dated in the future. Check the clock of the computer that sent it."));
    }
    let row: Option<(String, String)> = sqlx::query_as("SELECT id, status FROM dpp_connections WHERE office_id = ? ORDER BY (status = 'trusted') DESC, created_at DESC LIMIT 1")
        .bind(&header.from.id)
        .fetch_optional(pool)
        .await?;
    let Some((connection_id, status)) = row else {
        return Err(DomainError::Invalid("This package is from an office this station has not connected to. Nothing was kept.".into()));
    };
    let (office, _) = office_public(pool, &connection_id).await?;

    if header.kind == KIND_CONFIRMATION {
        let (_, confirmation) = pairing::read_confirmation(&station, &office, bytes).map_err(|e| bad(e.to_string()))?;
        // The office ended the connection. Its signature is the one this station pinned, so this is its own word:
        // the station stops treating it as trusted, and says why. A second copy of the same notice changes nothing.
        if confirmation.outcome == "revoked" {
            let message = format!("{} has ended this station's connection. Referrals can no longer be sent to it.", office.name);
            if status == "revoked" {
                return Ok(Imported { kind: KIND_CONFIRMATION.into(), message });
            }
            if status != "trusted" && status != "answered" {
                return Err(bad("That connection is not active."));
            }
            sqlx::query("UPDATE dpp_connections SET status = 'revoked', reason = ? WHERE id = ?").bind(&confirmation.reason).bind(&connection_id).execute(pool).await?;
            return Ok(Imported { kind: KIND_CONFIRMATION.into(), message });
        }
        if status != "answered" {
            return Err(bad("That connection is not waiting for a confirmation."));
        }
        let (next, message) = if confirmation.outcome == "trusted" { ("trusted", format!("{} has confirmed this station. Referrals can now be sent to it.", office.name)) } else { ("declined", format!("{} declined this station's answer.", office.name)) };
        sqlx::query("UPDATE dpp_connections SET status = ?, reason = ?, trusted_at = CASE WHEN ? = 'trusted' THEN ? ELSE NULL END WHERE id = ?")
            .bind(next)
            .bind(&confirmation.reason)
            .bind(next)
            .bind(now())
            .bind(&connection_id)
            .execute(pool)
            .await?;
        return Ok(Imported { kind: KIND_CONFIRMATION.into(), message });
    }
    if header.kind != KIND_RECEIPT && header.kind != KIND_DECISION_NOTICE {
        return Err(bad(format!("This station does not receive packages of kind '{}'.", header.kind)));
    }
    if status != "trusted" {
        return Err(bad("That office is not confirmed as trusted. Nothing was kept."));
    }
    let seen: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM exchange_incoming WHERE id = ?").bind(&header.id).fetch_one(pool).await?;
    if seen > 0 {
        return Err(bad("This package has already been received."));
    }
    let opened = envelope::open(&station, peeked, &office).map_err(|e| match e {
        envelope::PackageError::NotForThisRecipient => bad("This package is addressed to a different station."),
        envelope::PackageError::BadSignature => bad("The signature does not match the office this station trusts. Nothing was kept."),
        other => bad(other.to_string()),
    })?;
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    sqlx::query("INSERT INTO exchange_incoming (id, connection_id, kind, seq, in_reply_to, sent_at, received_at, package_sha256, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&opened.header.id)
        .bind(&connection_id)
        .bind(&opened.header.kind)
        .bind(opened.header.seq as i64)
        .bind(&opened.header.in_reply_to)
        .bind(opened.header.created_at)
        .bind(now())
        .bind(envelope::sha256_hex(bytes))
        .bind(serde_json::to_string(&opened.body.json).unwrap_or_default())
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE dpp_connections SET last_seq_in = MAX(last_seq_in, ?) WHERE id = ?").bind(opened.header.seq as i64).bind(&connection_id).execute(&mut *tx).await?;
    // The office's answer is applied to the referral it answers, in the same transaction as keeping the receipt:
    // accepted or rejected, never anything else, and only for a referral this station sent to this office.
    if opened.header.kind == KIND_RECEIPT {
        let outcome = opened.body.json.get("outcome").and_then(|v| v.as_str()).filter(|o| *o == "accepted" || *o == "rejected");
        if let (Some(outcome), Some(reply_to)) = (outcome, opened.header.in_reply_to.as_deref()) {
            sqlx::query("UPDATE referrals SET status = ? WHERE status NOT IN ('returned', 'sanctioned', 'declined') AND id = (SELECT referral_id FROM exchange_outgoing WHERE id = ? AND connection_id = ? AND kind = 'referral')")
                .bind(outcome)
                .bind(reply_to)
                .bind(&connection_id)
                .execute(&mut *tx)
                .await?;
        }
    }
    // The office's decision moves the referral on, so the list does not keep saying "accepted" after the file was
    // returned, sanctioned or declined. It applies to the latest referral this station sent for that case.
    if opened.header.kind == KIND_DECISION_NOTICE {
        let status = match opened.body.json.get("decisionType").and_then(|v| v.as_str()) {
            Some("return_for_investigation") => Some("returned"),
            Some("sanction") | Some("threshold_charge") => Some("sanctioned"),
            Some("decline") | Some("discontinue") | Some("nolle_prosequi") => Some("declined"),
            _ => None,
        };
        let reference = opened.body.json.get("policeReference").and_then(|v| v.as_str());
        if let (Some(status), Some(reference)) = (status, reference) {
            sqlx::query("UPDATE referrals SET status = ? WHERE id = (SELECT r.id FROM referrals r JOIN cases c ON c.id = r.case_id JOIN exchange_outgoing o ON o.referral_id = r.id AND o.kind = 'referral' AND o.connection_id = ? WHERE c.reference = ? AND r.status IN ('pending', 'accepted') ORDER BY r.referred_at DESC LIMIT 1)")
                .bind(status)
                .bind(&connection_id)
                .bind(reference)
                .execute(&mut *tx)
                .await?;
        }
    }
    tx.commit().await?;
    let what = if opened.header.kind == KIND_RECEIPT { "A receipt" } else { "A decision notice" };
    Ok(Imported { kind: opened.header.kind, message: format!("{what} from {} is waiting for you to read.", office.name) })
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Incoming {
    pub id: String,
    pub kind: String,
    pub in_reply_to: Option<String>,
    pub sent_at: i64,
    pub received_at: i64,
    pub payload: String,
    pub office_name: String,
}

pub async fn list_incoming(pool: &SqlitePool) -> Result<Vec<Incoming>, DomainError> {
    Ok(sqlx::query_as("SELECT i.id, i.kind, i.in_reply_to, i.sent_at, i.received_at, i.payload, c.office_name FROM exchange_incoming i JOIN dpp_connections c ON c.id = i.connection_id ORDER BY i.received_at DESC").fetch_all(pool).await?)
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Outgoing {
    pub id: String,
    pub kind: String,
    pub seq: i64,
    pub prepared_at: i64,
    pub exported_at: Option<i64>,
    pub route: Option<String>,
    pub office_name: String,
    pub police_reference: Option<String>,
}

pub async fn list_outgoing(pool: &SqlitePool) -> Result<Vec<Outgoing>, DomainError> {
    Ok(sqlx::query_as("SELECT o.id, o.kind, o.seq, o.prepared_at, o.exported_at, o.route, c.office_name, json_extract(o.payload, '$.policeReference') AS police_reference FROM exchange_outgoing o JOIN dpp_connections c ON c.id = o.connection_id ORDER BY o.prepared_at DESC").fetch_all(pool).await?)
}

/// The most file bytes one referral carries. A larger case is sent in more than one referral.
const MAX_REFERRAL_FILES_BYTES: usize = 40 * 1024 * 1024;

fn claim_role(role: &str) -> &'static str {
    match role {
        "suspect" | "accused" => "accused",
        "complainant" | "victim" => "complainant",
        _ => "witness",
    }
}

/// What the referral says, read from the station's own case records.
/// Everyone who gave a statement, or is charged, has to be on the case, or the DPP refuses the whole referral.
/// Said here, to the officer, before a referral exists, rather than after it has gone.
pub async fn check_ready_to_refer(pool: &SqlitePool, case_id: &str) -> Result<(), DomainError> {
    let on_case: Vec<String> = sqlx::query_scalar("SELECT person_id FROM case_people WHERE case_id = ?").bind(case_id).fetch_all(pool).await?;
    let speakers: Vec<(String, String, String)> = sqlx::query_as("SELECT DISTINCT s.person_id, p.first_name, p.last_name FROM statements s JOIN people p ON p.id = s.person_id WHERE s.case_id = ?").bind(case_id).fetch_all(pool).await?;
    if let Some((_, first, last)) = speakers.iter().find(|(id, _, _)| !on_case.contains(id)) {
        return Err(bad(format!("{first} {last} gave a statement on this case but is not listed on it. Add them to the case, for example as a witness, and refer again.")));
    }
    let accused: Vec<String> = sqlx::query_scalar("SELECT accused_person_id FROM charge_sheets WHERE case_id = ? AND accused_person_id IS NOT NULL").bind(case_id).fetch_all(pool).await?;
    if accused.iter().any(|id| !on_case.contains(id)) {
        return Err(bad("A charge names someone who is not listed on the case. Add them to the case and refer again."));
    }
    Ok(())
}

async fn referral_payload(pool: &SqlitePool, vault_root: &std::path::Path, referral_id: &str) -> Result<(ReferralPayload, Vec<(String, String, String, Vec<u8>)>), DomainError> {
    // Files travel with the record they are attached to (a statement's signed copy, an exhibit's photograph). Each is
    // opened from the sealed vault here, and the package carries its own SHA-256 so DPP checks it on opening.
    let mut files: Vec<(String, String, String, Vec<u8>)> = Vec::new();
    let mut total: usize = 0;
    let files_of = |entity_type: &'static str, entity_id: String| {
        let pool = pool.clone();
        let vault_root = vault_root.to_path_buf();
        async move {
            let mut found = Vec::new();
            for a in crate::domain::attachments::list_attachments(&pool, entity_type, &entity_id).await? {
                let Some((att, bytes)) = crate::domain::attachments::read_attachment(&pool, &vault_root, &a.id).await.map_err(|_| bad("A file attached to this case could not be opened, so the referral was not sent."))? else { continue };
                found.push((att.id, att.file_name, att.mime_type, bytes));
            }
            Ok::<_, DomainError>(found)
        }
    };
    let referral: Option<(String, i64, Option<String>, Option<String>)> = sqlx::query_as("SELECT case_id, referred_at, officer_name, notes FROM referrals WHERE id = ?").bind(referral_id).fetch_optional(pool).await?;
    let (case_id, referred_at, officer, notes) = referral.ok_or_else(|| DomainError::NotFound("No such referral.".into()))?;
    let (reference, summary): (String, String) = sqlx::query_as("SELECT reference, summary FROM cases WHERE id = ?").bind(&case_id).fetch_one(pool).await?;
    let station_name: String = sqlx::query_scalar("SELECT station_name FROM exchange_identity WHERE id = 'default'").fetch_one(pool).await?;
    // A file the DPP returned for further investigation comes back to the same file, not a new one: quote the DPP's
    // own file key from its latest decision notice on this case, if that notice was a return.
    let notices: Vec<String> = sqlx::query_scalar("SELECT payload FROM exchange_incoming WHERE kind = 'decision_notice' ORDER BY received_at DESC").fetch_all(pool).await?;
    let resubmission_of = notices.iter().filter_map(|p| serde_json::from_str::<serde_json::Value>(p).ok()).find(|v| v["policeReference"].as_str() == Some(reference.as_str())).and_then(|v| if v["decisionType"].as_str() == Some("return_for_investigation") { v["dppFileKey"].as_str().map(str::to_string) } else { None });

    let people: Vec<(String, String, String, String, Option<String>, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT p.id, cp.role, p.first_name, p.last_name, p.other_names, p.phone, p.national_id, p.address FROM case_people cp JOIN people p ON p.id = cp.person_id WHERE cp.case_id = ? ORDER BY cp.created_at",
    )
    .bind(&case_id)
    .fetch_all(pool)
    .await?;
    let people: Vec<PersonClaim> = people.into_iter().map(|(key, role, first_name, last_name, other_names, phone, national_id, address)| PersonClaim { key, role: claim_role(&role).into(), first_name, last_name, other_names, phone, national_id, address }).collect();

    let statements: Vec<(String, String, i64, String, Option<String>)> = sqlx::query_as("SELECT id, person_id, given_at, content, officer_name FROM statements WHERE case_id = ? ORDER BY given_at").bind(&case_id).fetch_all(pool).await?;
    let mut statement_claims = Vec::new();
    for (key, person_key, given_at, content, taken_by) in statements {
        let found = files_of("statement", key.clone()).await?;
        let file_ids = found.iter().map(|f| f.0.clone()).collect();
        for f in found {
            total += f.3.len();
            files.push(f);
        }
        statement_claims.push(StatementClaim { key, person_key, role: "witness".into(), given_at, content, taken_by, file_ids });
    }
    let statements = statement_claims;

    let exhibits: Vec<(String, String, Option<String>, i64, Option<String>)> = sqlx::query_as("SELECT id, description, identification_mark, recovered_at, recovered_from_location FROM exhibits WHERE case_id = ?").bind(&case_id).fetch_all(pool).await?;
    let mut exhibit_claims = Vec::new();
    for (key, description, identification_mark, recovered_at, recovered_from_location) in exhibits {
        let found = files_of("exhibit", key.clone()).await?;
        let file_ids = found.iter().map(|f| f.0.clone()).collect();
        for f in found {
            total += f.3.len();
            files.push(f);
        }
        exhibit_claims.push(ExhibitClaim { key, description, identification_mark, recovered_at: Some(recovered_at), recovered_from_location, file_ids });
    }
    let exhibits = exhibit_claims;
    if total > MAX_REFERRAL_FILES_BYTES {
        return Err(bad("The files attached to this case are too large for one referral (over 40 MB). Send fewer or smaller files."));
    }

    let charges: Vec<(Option<String>, String, String, String)> = sqlx::query_as("SELECT accused_person_id, offence, statutory_section, particulars FROM charge_sheets WHERE case_id = ?").bind(&case_id).fetch_all(pool).await?;
    let charges: Vec<ChargeClaim> = charges.into_iter().map(|(accused_person_key, offence, section, particulars)| ChargeClaim { accused_person_key, offence, statutory_section: Some(section), particulars: Some(particulars) }).collect();

    check_ready_to_refer(pool, &case_id).await?;

    Ok((ReferralPayload { police_reference: reference, station_name, referred_at, referring_officer: officer, summary, people, statements, exhibits, charges, resubmission_of, notes }, files))
}

/// Seals a referral to the one trusted office, for saving as a file or for the
/// postbox. Returns the package bytes and a file name. Sending twice makes a
/// second package (a new sequence number), never a silent overwrite.
pub async fn export_referral(pool: &SqlitePool, vault_root: &std::path::Path, referral_id: &str, route: &str) -> Result<(Vec<u8>, String), DomainError> {
    let station = require_identity(pool).await?;
    let connection: Option<String> = sqlx::query_scalar("SELECT id FROM dpp_connections WHERE status = 'trusted' ORDER BY trusted_at DESC LIMIT 1").fetch_optional(pool).await?;
    let connection_id = connection.ok_or_else(|| bad("No DPP office has confirmed this station yet. Connect to an office first."))?;
    let (office, _) = office_public(pool, &connection_id).await?;
    let (payload, files) = referral_payload(pool, vault_root, referral_id).await?;
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    let seq: i64 = sqlx::query_scalar("SELECT next_seq_out FROM dpp_connections WHERE id = ?").bind(&connection_id).fetch_one(&mut *tx).await?;
    sqlx::query("UPDATE dpp_connections SET next_seq_out = next_seq_out + 1 WHERE id = ?").bind(&connection_id).execute(&mut *tx).await?;
    let json = serde_json::to_value(&payload).map_err(|_| bad("Could not build the referral."))?;
    let (bytes, header) = envelope::seal(&station, &office, KIND_REFERRAL, seq as u64, None, &files.into_iter().fold(Body::new(json.clone()), |body, (id, name, mime, bytes)| body.with_file(&id, &name, &mime, bytes))).map_err(|e| bad(e.to_string()))?;
    sqlx::query("INSERT INTO exchange_outgoing (id, connection_id, kind, seq, referral_id, payload, prepared_at, exported_at, route) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&header.id)
        .bind(&connection_id)
        .bind(KIND_REFERRAL)
        .bind(seq)
        .bind(referral_id)
        .bind(serde_json::to_string(&json).unwrap_or_default())
        .bind(now())
        .bind(now())
        .bind(route)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    let safe: String = payload.police_reference.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    Ok((bytes, format!("referral-{}-{}.pxpkg", safe.trim_matches('-').to_lowercase(), seq)))
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_pool() -> SqlitePool {
        let dir = std::env::temp_dir().join(format!("pleadli-exchange-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = crate::db::startup(&dir, dir.join("vault")).await.ok().unwrap();
        db.pool
    }

    /// The office ends the connection. Its signed notice makes the station stop trusting it, keeps the office's reason,
    /// can arrive twice, and nothing can be sent to the office afterwards. A notice from any other office is refused.
    #[tokio::test]
    async fn an_office_that_ends_the_connection_is_no_longer_trusted_by_the_station() {
        let pool = test_pool().await;
        create_identity(&pool, "Revoke Test Police Station", Some("Kampala")).await.unwrap();
        let office = Identity::generate(IdentityKind::DppOffice, "Revoke Test DPP Office", Some("Kampala"));
        let (invite_file, invite) = pairing::make_invite(&office, "Revoke Test Police Station", i64::MAX).unwrap();
        let (_, response_file) = accept_invite(&pool, &invite_file, Some("OC Test")).await.unwrap();
        let response = pairing::read_response(&response_file).unwrap();
        let trusted = pairing::make_confirmation(&office, &response.station, &invite.invite_id, "trusted", None).unwrap();
        import_package(&pool, &trusted).await.unwrap();
        let state = |pool: SqlitePool| async move { sqlx::query_as::<_, (String, Option<String>)>("SELECT status, reason FROM dpp_connections").fetch_one(&pool).await.unwrap() };
        assert_eq!(state(pool.clone()).await.0, "trusted");

        // A notice signed by an office this station never connected to changes nothing.
        let stranger = Identity::generate(IdentityKind::DppOffice, "Some Other Office", None);
        let forged = pairing::make_confirmation(&stranger, &response.station, &invite.invite_id, "revoked", Some("Forged.")).unwrap();
        assert!(import_package(&pool, &forged).await.is_err());
        assert_eq!(state(pool.clone()).await.0, "trusted");

        let notice = pairing::make_confirmation(&office, &response.station, &invite.invite_id, "revoked", Some("Station key was lost.")).unwrap();
        let heard = import_package(&pool, &notice).await.unwrap();
        assert_eq!(heard.kind, KIND_CONFIRMATION);
        assert!(heard.message.contains("ended"), "{}", heard.message);
        assert_eq!(state(pool.clone()).await, ("revoked".to_string(), Some("Station key was lost.".to_string())));

        // The same notice again, or a newer copy, is accepted without changing anything or raising a failure.
        let again = pairing::make_confirmation(&office, &response.station, &invite.invite_id, "revoked", Some("Station key was lost.")).unwrap();
        assert_eq!(import_package(&pool, &again).await.unwrap().kind, KIND_CONFIRMATION);
        assert_eq!(state(pool.clone()).await.0, "revoked");

        // Nothing can be sent to an office that ended the connection.
        sqlx::query("INSERT INTO cases (id, reference, summary, status) VALUES ('c9', 'REV CRB 9/2026', 'Theft', 'open')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO referrals (id, case_id, destination_type, destination_name, referred_at, status, officer_name) VALUES ('r9', 'c9', 'dpp', 'DPP', 2, 'sent', 'IO')").execute(&pool).await.unwrap();
        assert!(export_referral(&pool, std::path::Path::new(""), "r9", "file").await.is_err());
    }

    /// The whole hand-over, with the office played by the shared contract:
    /// invite, answer, confirm, refer, receipt. Local, isolated data only.
    #[tokio::test]
    async fn a_referral_goes_to_the_dpp_and_its_receipt_comes_back() {
        let pool = test_pool().await;
        let station = create_identity(&pool, "Exchange Test Police Station", Some("Kampala")).await.unwrap();
        assert!(create_identity(&pool, "Another", None).await.is_err(), "identity is set once");

        // The office invites, the station answers.
        let office = Identity::generate(IdentityKind::DppOffice, "Exchange Test DPP Office", Some("Kampala"));
        let (invite_file, invite) = pairing::make_invite(&office, "Exchange Test Police Station", i64::MAX).unwrap();
        let (connection, response_file) = accept_invite(&pool, &invite_file, Some("OC Test")).await.unwrap();
        assert_eq!(connection.status, "answered");
        let response = pairing::read_response(&response_file).unwrap();
        assert_eq!(response.station.fingerprint(), station.fingerprint);

        // Nothing is sent before the office confirms.
        sqlx::query("INSERT INTO cases (id, reference, summary, status) VALUES ('c1', 'EXCH CRB 1/2026', 'Theft at a shop', 'open')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO people (id, first_name, last_name) VALUES ('p1', 'Moses', 'Ssekandi')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO case_people (id, case_id, person_id, role) VALUES ('cp1', 'c1', 'p1', 'accused')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO charge_sheets (id, case_id, accused_person_id, offence, statutory_section, particulars, charged_at, officer_name, station_name) VALUES ('cs1', 'c1', 'p1', 'Theft', 'Penal Code Act, section 254', 'Stole goods.', 1, 'IO', 'Exchange Test Police Station')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO referrals (id, case_id, destination_type, destination_name, referred_at, status, officer_name) VALUES ('r1', 'c1', 'dpp', 'DPP', 2, 'sent', 'IO')").execute(&pool).await.unwrap();
        assert!(export_referral(&pool, std::path::Path::new(""), "r1", "file").await.is_err());

        let confirmation = pairing::make_confirmation(&office, &response.station, &invite.invite_id, "trusted", None).unwrap();
        assert_eq!(import_package(&pool, &confirmation).await.unwrap().kind, KIND_CONFIRMATION);
        assert!(import_package(&pool, &confirmation).await.is_err(), "a confirmation is used once");

        // The referral is sealed to the office, who can open it and read the case.
        let (bytes, name) = export_referral(&pool, std::path::Path::new(""), "r1", "file").await.unwrap();
        assert!(name.ends_with(".pxpkg"));
        let peeked = envelope::peek(&bytes).unwrap();
        let opened = envelope::open(&office, peeked, &response.station).unwrap();
        let payload: ReferralPayload = serde_json::from_value(opened.body.json).unwrap();
        assert_eq!(payload.police_reference, "EXCH CRB 1/2026");
        assert_eq!(payload.people.len(), 1);
        assert_eq!(payload.people[0].role, "accused");
        assert_eq!(payload.charges[0].offence, "Theft");
        let other = Identity::generate(IdentityKind::DppOffice, "Another Office", None);
        assert!(envelope::open(&other, envelope::peek(&bytes).unwrap(), &response.station).is_err(), "sealed to one office only");

        // The office answers with a receipt; it is held once, and not twice.
        let receipt = pleadli_interchange::messages::ReceiptPayload { referral_package_id: opened.header.id.clone(), police_reference: payload.police_reference.clone(), outcome: "accepted".into(), dpp_reference: Some("DPP 7/2026".into()), received_at: 3, decided_at: 4, ..Default::default() };
        let (receipt_bytes, _) = envelope::seal(&office, &response.station, KIND_RECEIPT, 1, Some(&opened.header.id), &Body::new(serde_json::to_value(&receipt).unwrap())).unwrap();
        assert_eq!(import_package(&pool, &receipt_bytes).await.unwrap().kind, KIND_RECEIPT);
        assert!(import_package(&pool, &receipt_bytes).await.is_err(), "replay refused");
        // The office's answer is applied to the referral it answers.
        let status: String = sqlx::query_scalar("SELECT status FROM referrals WHERE id = 'r1'").fetch_one(&pool).await.unwrap();
        assert_eq!(status, "accepted", "a receipt sets the referral's status");
        let held = list_incoming(&pool).await.unwrap();
        assert_eq!(held.len(), 1);
        assert!(held[0].payload.contains("DPP 7/2026"));

        // The office then returns the file for investigation: the referral stops saying "accepted". A late or repeated
        // receipt cannot put it back.
        let notice = serde_json::json!({ "decisionType": "return_for_investigation", "policeReference": "EXCH CRB 1/2026", "directions": [] });
        let (notice_bytes, _) = envelope::seal(&office, &response.station, KIND_DECISION_NOTICE, 2, None, &Body::new(notice)).unwrap();
        assert_eq!(import_package(&pool, &notice_bytes).await.unwrap().kind, KIND_DECISION_NOTICE);
        let after: String = sqlx::query_scalar("SELECT status FROM referrals WHERE id = 'r1'").fetch_one(&pool).await.unwrap();
        assert_eq!(after, "returned", "a return moves the referral on");
        let late = pleadli_interchange::messages::ReceiptPayload { referral_package_id: opened.header.id.clone(), police_reference: payload.police_reference.clone(), outcome: "accepted".into(), received_at: 1, decided_at: 2, ..Default::default() };
        let (late_bytes, _) = envelope::seal(&office, &response.station, KIND_RECEIPT, 3, Some(&opened.header.id), &Body::new(serde_json::to_value(&late).unwrap())).unwrap();
        import_package(&pool, &late_bytes).await.unwrap();
        let still: String = sqlx::query_scalar("SELECT status FROM referrals WHERE id = 'r1'").fetch_one(&pool).await.unwrap();
        assert_eq!(still, "returned", "a late receipt does not undo it");

        // A stranger's package is refused.
        let stranger = Identity::generate(IdentityKind::DppOffice, "Stranger", None);
        let (forged, _) = envelope::seal(&stranger, &response.station, KIND_RECEIPT, 1, None, &Body::new(serde_json::json!({}))).unwrap();
        assert!(import_package(&pool, &forged).await.is_err());
        pool.close().await;
    }
}
