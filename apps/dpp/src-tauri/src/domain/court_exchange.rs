//! DPP -> Court exchange, the office's half (docs/interchange/dpp-court.md).
//! The office answers a registry's invitation, files a prosecution file to the
//! one registry that confirmed it, and reads the receipt that carries the
//! court's own case number. Same rule as with the police: a package is a claim,
//! and nothing the registry sends changes a file except the court number it
//! gives, once, for a filing this office made.

use pleadli_interchange::envelope::{self, Body};
use pleadli_interchange::identity::{IdentityKind, PublicIdentity};
use pleadli_interchange::messages::{FilingCharge, FilingParty, FilingPayload, FilingReceiptPayload, WithdrawalPayload, KIND_FILING, KIND_FILING_RECEIPT, KIND_WITHDRAWAL};
use pleadli_interchange::pairing::{self, KIND_CONFIRMATION};
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

use super::error::DomainError;
use super::interchange::require_identity;

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
fn bad<T>(message: impl Into<String>) -> Result<T, DomainError> {
    Err(DomainError::Invalid(message.into()))
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CourtLink {
    pub id: String,
    pub court_name: String,
    pub court_jurisdiction: Option<String>,
    pub fingerprint: String,
    pub status: String,
    pub reason: Option<String>,
    pub responded_at: i64,
    pub trusted_at: Option<i64>,
}

pub async fn list_links(pool: &SqlitePool) -> Result<Vec<CourtLink>, DomainError> {
    Ok(sqlx::query_as("SELECT id, court_name, court_jurisdiction, fingerprint, status, CASE WHEN status = 'revoked' THEN revoked_reason ELSE reason END AS reason, responded_at, trusted_at FROM court_links ORDER BY created_at DESC").fetch_all(pool).await?)
}

/// Reads a registry's invitation file and answers it. The registry becomes
/// trusted only when it confirms this office back.
pub async fn accept_invite(pool: &SqlitePool, invite_file: &[u8], contact: Option<&str>) -> Result<(CourtLink, Vec<u8>), DomainError> {
    let me = require_identity(pool).await?;
    let invite = pairing::read_invite(invite_file).map_err(|e| DomainError::Invalid(e.to_string()))?;
    if invite.expires_at < now() {
        return bad("That invitation has expired. Ask the registry for a new one.");
    }
    if invite.office.kind != IdentityKind::CourtRegistry {
        return bad("That invitation is not from a court registry.");
    }
    let taken: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM court_links WHERE id = ? OR (court_id = ? AND status IN ('answered', 'trusted'))").bind(&invite.invite_id).bind(&invite.office.id).fetch_one(pool).await?;
    if taken > 0 {
        return bad("This office already has a connection to that registry.");
    }
    let response = pairing::make_response(&me, &invite, contact.map(str::trim).filter(|c| !c.is_empty())).map_err(|e| DomainError::Invalid(e.to_string()))?;
    let c = &invite.office;
    sqlx::query("INSERT INTO court_links (id, court_id, court_name, court_jurisdiction, court_verifying_key, court_encryption_key, fingerprint, status, responded_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'answered', ?)")
        .bind(&invite.invite_id)
        .bind(&c.id)
        .bind(&c.name)
        .bind(&c.jurisdiction)
        .bind(&c.verifying_key)
        .bind(&c.encryption_key)
        .bind(c.fingerprint())
        .bind(now())
        .execute(pool)
        .await?;
    let link = sqlx::query_as("SELECT id, court_name, court_jurisdiction, fingerprint, status, CASE WHEN status = 'revoked' THEN revoked_reason ELSE reason END AS reason, responded_at, trusted_at FROM court_links WHERE id = ?").bind(&invite.invite_id).fetch_one(pool).await?;
    Ok((link, response))
}

async fn court_public(pool: &SqlitePool, link_id: &str) -> Result<(PublicIdentity, String), DomainError> {
    let row: (String, String, Option<String>, String, String, String) = sqlx::query_as("SELECT court_id, court_name, court_jurisdiction, court_verifying_key, court_encryption_key, status FROM court_links WHERE id = ?").bind(link_id).fetch_one(pool).await?;
    let (id, name, jurisdiction, verifying_key, encryption_key, status) = row;
    Ok((PublicIdentity { id, kind: IdentityKind::CourtRegistry, name, jurisdiction, verifying_key, encryption_key }, status))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Imported {
    pub kind: String,
    pub message: String,
}

/// What the registry sends back: its confirmation of the connection, or the
/// receipt for a filing (which carries the court's number).
pub async fn import_package(pool: &SqlitePool, bytes: &[u8]) -> Result<Imported, DomainError> {
    let me = require_identity(pool).await?;
    let peeked = envelope::peek(bytes).map_err(|e| DomainError::Invalid(e.to_string()))?;
    let header = peeked.header.clone();
    // Whatever carrier brought it, this institution decides for itself whether that kind of sender may send that kind of package.
    if let Err(why) = pleadli_interchange::authorization::check(header.from.kind, pleadli_interchange::identity::IdentityKind::DppOffice, &header.kind) {
        return bad(why);
    }
    if header.created_at > now() + 86_400_000 {
        return bad("This package is dated in the future. Check the clock of the computer that sent it.");
    }
    let row: Option<(String, String)> = sqlx::query_as("SELECT id, status FROM court_links WHERE court_id = ? ORDER BY (status = 'trusted') DESC, created_at DESC LIMIT 1").bind(&header.from.id).fetch_optional(pool).await?;
    let Some((link_id, status)) = row else { return bad("This package is from a registry this office has not connected to. Nothing was kept.") };
    let (court, _) = court_public(pool, &link_id).await?;

    if header.kind == KIND_CONFIRMATION {
        let (_, confirmation) = pairing::read_confirmation(&me, &court, bytes).map_err(|e| DomainError::Invalid(e.to_string()))?;
        // The registry ending the connection. Signed by it, so it is taken as its word; ending twice changes nothing.
        if confirmation.outcome == "revoked" {
            let why = confirmation.reason.clone().unwrap_or_default();
            if !pleadli_node_core::hub::set_revoked(pool, super::relay::COURTS, &link_id, &why, &["trusted", "answered"]).await? {
                return bad("That connection is not active.");
            }
            return Ok(Imported { kind: KIND_CONFIRMATION.into(), message: format!("{} has ended its connection with this office. Nothing more will be accepted from it.", court.name) });
        }
        if status != "answered" {
            return bad("That connection is not waiting for a confirmation.");
        }
        let trusted = confirmation.outcome == "trusted";
        sqlx::query("UPDATE court_links SET status = ?, reason = ?, trusted_at = CASE WHEN ? THEN ? ELSE NULL END WHERE id = ?").bind(if trusted { "trusted" } else { "declined" }).bind(&confirmation.reason).bind(trusted).bind(now()).bind(&link_id).execute(pool).await?;
        let message = if trusted { format!("{} has confirmed this office. Files can now be filed to it.", court.name) } else { format!("{} declined this office's answer.", court.name) };
        return Ok(Imported { kind: KIND_CONFIRMATION.into(), message });
    }
    if header.kind != KIND_FILING_RECEIPT {
        return bad(format!("This office does not receive packages of kind '{}' from a court registry.", header.kind));
    }
    if status != "trusted" {
        return bad(if status == "revoked" { "That registry has ended its connection with this office. Nothing was kept." } else { "That registry is not confirmed as trusted. Nothing was kept." });
    }
    let seen: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM court_incoming WHERE id = ?").bind(&header.id).fetch_one(pool).await?;
    if seen > 0 {
        return bad("This package has already been received.");
    }
    let opened = envelope::open(&me, peeked, &court).map_err(|e| match e {
        envelope::PackageError::NotForThisRecipient => DomainError::Invalid("This package is addressed to a different office.".into()),
        envelope::PackageError::BadSignature => DomainError::Invalid("The signature does not match the registry this office trusts. Nothing was kept.".into()),
        other => DomainError::Invalid(other.to_string()),
    })?;
    let receipt: FilingReceiptPayload = serde_json::from_value(opened.body.json.clone()).map_err(|_| DomainError::Invalid("The receipt inside the package could not be read.".into()))?;
    // Only a receipt for a filing this office sent to this registry counts.
    let sent: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM court_outgoing WHERE id = ? AND link_id = ? AND prosecution_file_id = ?").bind(&receipt.filing_package_id).bind(&link_id).bind(&receipt.dpp_file_key).fetch_one(pool).await?;
    if sent == 0 {
        return bad("That receipt answers a filing this office did not send to this registry.");
    }
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    sqlx::query("INSERT INTO court_incoming (id, link_id, kind, seq, in_reply_to, sent_at, received_at, package_sha256, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&opened.header.id)
        .bind(&link_id)
        .bind(KIND_FILING_RECEIPT)
        .bind(opened.header.seq as i64)
        .bind(&opened.header.in_reply_to)
        .bind(opened.header.created_at)
        .bind(now())
        .bind(envelope::sha256_hex(bytes))
        .bind(serde_json::to_string(&opened.body.json).unwrap_or_default())
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE court_links SET last_seq_in = MAX(last_seq_in, ?) WHERE id = ?").bind(opened.header.seq as i64).bind(&link_id).execute(&mut *tx).await?;
    let message = if receipt.outcome == "withdrawal_recorded" {
        format!("{} recorded the withdrawal of case {}.", court.name, receipt.court_number.as_deref().unwrap_or("(no number)"))
    } else if receipt.outcome == "accepted" {
        if let Some(number) = receipt.court_number.as_deref().filter(|n| !n.trim().is_empty()) {
            sqlx::query("UPDATE prosecution_files SET court_case_number = ? WHERE id = ?").bind(number.trim()).bind(&receipt.dpp_file_key).execute(&mut *tx).await?;
        }
        format!("{} registered the case as {}.", court.name, receipt.court_number.as_deref().unwrap_or("(no number given)"))
    } else {
        format!("{} returned the filing: {}", court.name, receipt.reason.as_deref().unwrap_or("no reason given"))
    };
    // The court's answer joins the file's own record of what was filed, so the file shows it without opening the exchange page.
    if receipt.outcome == "accepted" || receipt.outcome == "withdrawal_recorded" {
        let what = if receipt.outcome == "accepted" { "Filing accepted by the court" } else { "Withdrawal recorded by the court" };
        sqlx::query("INSERT INTO filings (id, prosecution_file_id, what, court, filed_at, receipt, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(&receipt.dpp_file_key)
            .bind(what)
            .bind(&court.name)
            .bind(receipt.decided_at)
            .bind(receipt.court_number.as_deref())
            .bind("From the court's receipt.")
            .bind(Some("court receipt"))
            .bind(now())
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(Imported { kind: KIND_FILING_RECEIPT.into(), message })
}

fn full_name(last: &str, first: &str, other: Option<&str>) -> String {
    [Some(last), Some(first), other].into_iter().flatten().filter(|s| !s.trim().is_empty()).collect::<Vec<_>>().join(" ")
}

async fn filing_payload(pool: &SqlitePool, file_id: &str, court_level: &str, filed_by: Option<&str>) -> Result<FilingPayload, DomainError> {
    let file: Option<(String, Option<String>, Option<String>, Option<String>)> = sqlx::query_as("SELECT title, odpp_registration_number, police_reference, notes FROM prosecution_files WHERE id = ?").bind(file_id).fetch_optional(pool).await?;
    let (title, reference, police_reference, notes) = file.ok_or_else(|| DomainError::NotFound("No such prosecution file.".into()))?;
    let people: Vec<(String, String, String, String, Option<String>)> = sqlx::query_as("SELECT p.id, fp.role, p.first_name, p.last_name, p.other_names FROM prosecution_file_people fp JOIN people p ON p.id = fp.person_id WHERE fp.prosecution_file_id = ? ORDER BY fp.created_at").bind(file_id).fetch_all(pool).await?;
    let parties = people
        .into_iter()
        .filter(|(_, role, ..)| matches!(role.as_str(), "accused" | "complainant" | "victim" | "witness"))
        .map(|(key, role, first, last, other)| FilingParty { key, role: if role == "victim" { "complainant".into() } else { role }, name: full_name(&last, &first, other.as_deref()), custody: None, custody_place: None })
        .collect::<Vec<_>>();
    let charges = super::charges::list_for_file(pool, file_id).await?.into_iter().map(|c| FilingCharge { accused_key: c.accused_person_id, offence: c.offence, statutory_section: c.statutory_section, particulars: c.particulars }).collect::<Vec<_>>();
    if !parties.iter().any(|p| p.role == "accused") {
        return bad("A file needs at least one accused before it can be filed to a court.");
    }
    if charges.is_empty() {
        return bad("A file needs at least one charge before it can be filed to a court.");
    }
    Ok(FilingPayload { dpp_file_key: file_id.to_string(), dpp_reference: reference, police_reference, title: title.clone(), court_level: court_level.to_string(), summary: title, parties, charges, filed_at: now(), filed_by: filed_by.map(str::to_string), notes })
}

/// Seals a prosecution file to the one confirmed registry, for saving as a
/// file or for the postbox. Filing again makes a new package, never an overwrite.
pub async fn export_filing(pool: &SqlitePool, file_id: &str, court_level: &str, filed_by: Option<&str>, route: &str) -> Result<(Vec<u8>, String), DomainError> {
    if !matches!(court_level, "magistrate" | "high") {
        return bad("The court level is a magistrates court or the High Court.");
    }
    let me = require_identity(pool).await?;
    let link_id: Option<String> = sqlx::query_scalar("SELECT id FROM court_links WHERE status = 'trusted' ORDER BY trusted_at DESC LIMIT 1").fetch_optional(pool).await?;
    let Some(link_id) = link_id else {
        let ended: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM court_links WHERE status = 'revoked'").fetch_one(pool).await?;
        return bad(if ended > 0 { "The connection with the court registry has ended. Connect to a registry again before filing." } else { "No court registry has confirmed this office yet. Connect to a registry first." });
    };
    let (court, _) = court_public(pool, &link_id).await?;
    let payload = filing_payload(pool, file_id, court_level, filed_by).await?;
    let json = serde_json::to_value(&payload).map_err(|_| DomainError::Invalid("Could not build the filing.".into()))?;
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    let seq: i64 = sqlx::query_scalar("SELECT next_seq_out FROM court_links WHERE id = ?").bind(&link_id).fetch_one(&mut *tx).await?;
    sqlx::query("UPDATE court_links SET next_seq_out = next_seq_out + 1 WHERE id = ?").bind(&link_id).execute(&mut *tx).await?;
    let (bytes, header) = envelope::seal(&me, &court, KIND_FILING, seq as u64, None, &Body::new(json.clone())).map_err(|e| DomainError::Invalid(e.to_string()))?;
    sqlx::query("INSERT INTO court_outgoing (id, link_id, prosecution_file_id, kind, seq, payload, prepared_at, route) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&header.id)
        .bind(&link_id)
        .bind(file_id)
        .bind(KIND_FILING)
        .bind(seq)
        .bind(serde_json::to_string(&json).unwrap_or_default())
        .bind(now())
        .bind(route)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    let safe: String = payload.title.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    Ok((bytes, format!("filing-{}-{}.pxpkg", safe.trim_matches('-').to_lowercase(), seq)))
}

/// The paper route: an office whose court registry is not on Pleadli hands over
/// the printed file with this sheet on top. It is built from the file's own
/// parties and charges, names the registry, lists what is attached, and leaves
/// a line for the registry to write the court's own number on, which the office
/// then types onto the file. A draft document: the prosecutor reads it, issues
/// it (which seals and stamps it like any other paper) and prints it.
pub async fn filing_sheet(pool: &SqlitePool, file_id: &str, court_level: &str, court_name: &str, filed_by: Option<&str>) -> Result<super::documents::Document, DomainError> {
    use super::document_content::{field, Block, DocumentContent, ListItem, OFFICE};
    if court_name.trim().is_empty() {
        return bad("Name the court registry this sheet is for.");
    }
    let p = filing_payload(pool, file_id, court_level, filed_by).await?;
    let level = if court_level == "high" { "High Court" } else { "Magistrates court" };
    let mut blocks = vec![
        Block::Paragraph { text: format!("To the Registrar, {}.", court_name.trim()) },
        Block::Fields {
            rows: vec![
                field("Case", p.title.clone()),
                field("Court level", level.to_string()),
                field("Police reference", p.police_reference.clone().unwrap_or_else(|| "·".to_string())),
                field("ODPP reference", p.dpp_reference.clone().unwrap_or_else(|| "·".to_string())),
            ],
        },
    ];
    let accused: Vec<String> = p.parties.iter().filter(|x| x.role == "accused").map(|x| match (&x.custody, &x.custody_place) {
        (Some(c), Some(place)) => format!("{} ({}, {})", x.name, c.replace('_', " "), place),
        (Some(c), None) => format!("{} ({})", x.name, c.replace('_', " ")),
        _ => x.name.clone(),
    }).collect();
    blocks.push(Block::Heading { text: "Accused".to_string() });
    blocks.push(Block::List { ordered: true, items: accused.into_iter().map(|t| ListItem { title: None, text: t }).collect() });
    blocks.push(Block::Heading { text: "Charges".to_string() });
    if p.charges.is_empty() {
        blocks.push(Block::Note { text: "No charges are recorded on this file.".to_string() });
    } else {
        blocks.push(Block::List {
            ordered: true,
            items: p.charges.iter().map(|c| ListItem { title: Some(c.offence.clone()), text: c.statutory_section.clone().unwrap_or_default() }).collect(),
        });
    }
    blocks.push(Block::Paragraph { text: format!("Summary: {}", p.summary) });
    blocks.push(Block::Heading { text: "Enclosed".to_string() });
    blocks.push(Block::Paragraph { text: "The charge sheet or indictment, the witness statements and the exhibits listed in the index of papers, as printed from this file.".to_string() });
    blocks.push(Block::Signature { label: "Filed by".to_string(), name: p.filed_by.clone().unwrap_or_default(), caption: Some("For the Director of Public Prosecutions".to_string()) });
    blocks.push(Block::Heading { text: "For the registry".to_string() });
    blocks.push(Block::Fields {
        rows: vec![field("Court case number", "................................".to_string()), field("Date received", "................................".to_string())],
    });
    let content = DocumentContent { office: OFFICE.to_string(), title: "Filing sheet".to_string(), blocks, ..Default::default() };
    super::documents::create_draft(
        pool,
        super::documents::DraftInput { prosecution_file_id: file_id.to_string(), decision_id: None, kind: "filing_sheet".to_string(), title: "Filing sheet".to_string(), content },
    )
    .await
}

/// Tells the court a filed case is withdrawn or discontinued. Only a file the
/// court has numbered can be withdrawn: the court must know which case it means.
pub async fn export_withdrawal(pool: &SqlitePool, file_id: &str, decision: &str, reason: Option<&str>, decided_by: Option<&str>, route: &str) -> Result<(Vec<u8>, String), DomainError> {
    if !matches!(decision, "nolle_prosequi" | "discontinue") {
        return bad("A withdrawal is a nolle prosequi or a discontinuance.");
    }
    let me = require_identity(pool).await?;
    let number: Option<Option<String>> = sqlx::query_scalar("SELECT court_case_number FROM prosecution_files WHERE id = ?").bind(file_id).fetch_optional(pool).await?;
    let Some(number) = number else { return Err(DomainError::NotFound("File not found.".into())) };
    let Some(court_number) = number.filter(|n| !n.trim().is_empty()) else { return bad("This file has no court case number yet, so there is no case at the court to withdraw.") };
    let link_id: Option<String> = sqlx::query_scalar("SELECT id FROM court_links WHERE status = 'trusted' ORDER BY trusted_at DESC LIMIT 1").fetch_optional(pool).await?;
    let Some(link_id) = link_id else {
        let ended: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM court_links WHERE status = 'revoked'").fetch_one(pool).await?;
        return bad(if ended > 0 { "The connection with the court registry has ended. Connect to a registry again before filing." } else { "No court registry has confirmed this office yet. Connect to a registry first." });
    };
    let (court, _) = court_public(pool, &link_id).await?;
    let payload = WithdrawalPayload { dpp_file_key: file_id.to_string(), court_number: court_number.trim().to_string(), decision: decision.to_string(), reason: reason.map(|r| r.trim().to_string()).filter(|r| !r.is_empty()), decided_at: now(), decided_by: decided_by.map(str::to_string) };
    let json = serde_json::to_value(&payload).map_err(|_| DomainError::Invalid("Could not build the withdrawal.".into()))?;
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    let seq: i64 = sqlx::query_scalar("SELECT next_seq_out FROM court_links WHERE id = ?").bind(&link_id).fetch_one(&mut *tx).await?;
    sqlx::query("UPDATE court_links SET next_seq_out = next_seq_out + 1 WHERE id = ?").bind(&link_id).execute(&mut *tx).await?;
    let (bytes, header) = envelope::seal(&me, &court, KIND_WITHDRAWAL, seq as u64, None, &Body::new(json.clone())).map_err(|e| DomainError::Invalid(e.to_string()))?;
    sqlx::query("INSERT INTO court_outgoing (id, link_id, prosecution_file_id, kind, seq, payload, prepared_at, route) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&header.id)
        .bind(&link_id)
        .bind(file_id)
        .bind(KIND_WITHDRAWAL)
        .bind(seq)
        .bind(serde_json::to_string(&json).unwrap_or_default())
        .bind(now())
        .bind(route)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    let safe: String = court_number.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    Ok((bytes, format!("withdrawal-{}-{}.pxpkg", safe.trim_matches('-').to_lowercase(), seq)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use pleadli_interchange::identity::Identity;

    /// The office's half with the court registry played by the shared contract.
    #[tokio::test]
    async fn a_file_is_filed_to_the_court_and_the_court_number_comes_back() {
        let dir = std::env::temp_dir().join(format!("pleadli-dpp-court-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let pool = crate::db::startup(&dir, None).await.ok().unwrap().pool;
        super::super::interchange::create_identity(&pool, "Court Exchange Test DPP", Some("Kampala".to_string())).await.unwrap();

        let court = Identity::generate(IdentityKind::CourtRegistry, "Court Exchange Test Registry", Some("Kampala"));
        let (invite_file, invite) = pairing::make_invite(&court, "Court Exchange Test DPP", i64::MAX).unwrap();
        let (link, answer) = accept_invite(&pool, &invite_file, Some("State Attorney")).await.unwrap();
        assert_eq!(link.status, "answered");
        let response = pairing::read_response(&answer).unwrap();

        sqlx::query("INSERT INTO prosecution_files (id, title, police_reference, current_status, received_at) VALUES ('f1', 'Uganda v Ssekandi', 'EXCH CRB 1/2026', 'under_review', 1)").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO people (id, first_name, last_name) VALUES ('p1', 'Moses', 'Ssekandi'), ('p2', 'Grace', 'Nakato')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO prosecution_file_people (id, prosecution_file_id, person_id, role) VALUES ('a', 'f1', 'p1', 'accused'), ('b', 'f1', 'p2', 'complainant')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO charges (id, prosecution_file_id, accused_person_id, offence, statutory_section) VALUES ('c1', 'f1', 'p1', 'Theft', 'Penal Code Act, section 254')").execute(&pool).await.unwrap();
        assert!(export_filing(&pool, "f1", "magistrate", None, "file").await.is_err(), "nothing is filed before the registry confirms");

        let confirmation = pairing::make_confirmation(&court, &response.station, &invite.invite_id, "trusted", None).unwrap();
        assert_eq!(import_package(&pool, &confirmation).await.unwrap().kind, KIND_CONFIRMATION);

        let (bytes, name) = export_filing(&pool, "f1", "magistrate", Some("State Attorney"), "file").await.unwrap();
        assert!(name.ends_with(".pxpkg"));
        let opened = envelope::open(&court, envelope::peek(&bytes).unwrap(), &response.station).unwrap();
        let filing: FilingPayload = serde_json::from_value(opened.body.json).unwrap();
        assert_eq!((filing.dpp_file_key.as_str(), filing.parties.len(), filing.charges[0].offence.as_str()), ("f1", 2, "Theft"));
        assert!(export_filing(&pool, "f1", "tribunal", None, "file").await.is_err(), "level is checked");

        // The registry accepts and gives its number; the file then carries it.
        let receipt = FilingReceiptPayload { filing_package_id: opened.header.id.clone(), dpp_file_key: "f1".into(), outcome: "accepted".into(), court_number: Some("CO 12/2026".into()), received_at: 3, decided_at: 4, ..Default::default() };
        let seal = |seq: u64, r: &FilingReceiptPayload| envelope::seal(&court, &response.station, KIND_FILING_RECEIPT, seq, Some(&opened.header.id), &Body::new(serde_json::to_value(r).unwrap())).unwrap().0;
        let receipt_bytes = seal(1, &receipt);
        assert_eq!(import_package(&pool, &receipt_bytes).await.unwrap().kind, KIND_FILING_RECEIPT);
        let number: Option<String> = sqlx::query_scalar("SELECT court_case_number FROM prosecution_files WHERE id = 'f1'").fetch_one(&pool).await.unwrap();
        assert_eq!(number.as_deref(), Some("CO 12/2026"));
        assert!(import_package(&pool, &receipt_bytes).await.is_err(), "replay refused");
        let unknown = FilingReceiptPayload { filing_package_id: "not-sent".into(), ..receipt.clone() };
        assert!(import_package(&pool, &seal(2, &unknown)).await.is_err(), "a receipt for a filing never sent is refused");

        // The case is later withdrawn: the court learns it by its own number.
        assert!(export_withdrawal(&pool, "f1", "settled", None, None, "file").await.is_err(), "the kind of withdrawal is checked");
        let (wd_bytes, wd_name) = export_withdrawal(&pool, "f1", "nolle_prosequi", Some("Complainant withdrew"), Some("State Attorney"), "file").await.unwrap();
        assert!(wd_name.starts_with("withdrawal-co-12-2026"));
        let wd_open = envelope::open(&court, envelope::peek(&wd_bytes).unwrap(), &response.station).unwrap();
        let wd: WithdrawalPayload = serde_json::from_value(wd_open.body.json).unwrap();
        assert_eq!((wd.court_number.as_str(), wd.decision.as_str(), wd.dpp_file_key.as_str()), ("CO 12/2026", "nolle_prosequi", "f1"));
        let wd_receipt = FilingReceiptPayload { filing_package_id: wd_open.header.id.clone(), dpp_file_key: "f1".into(), outcome: "withdrawal_recorded".into(), court_number: Some("CO 12/2026".into()), received_at: 6, decided_at: 7, ..Default::default() };
        let msg = import_package(&pool, &seal(3, &wd_receipt)).await.unwrap().message;
        assert!(msg.contains("recorded the withdrawal"), "{msg}");
        let kept: Vec<(String, Option<String>)> = sqlx::query_as("SELECT what, receipt FROM filings WHERE prosecution_file_id = 'f1' ORDER BY created_at, what").fetch_all(&pool).await.unwrap();
        assert!(kept.iter().any(|(w, r)| w.starts_with("Filing accepted") && r.as_deref() == Some("CO 12/2026")), "{kept:?}");
        assert!(kept.iter().any(|(w, _)| w.starts_with("Withdrawal recorded")), "{kept:?}");
        pool.close().await;
    }

    /// The paper route needs no registry link: the sheet is built from the file alone.
    #[tokio::test]
    async fn a_filing_sheet_is_built_from_the_file_for_a_registry_that_is_not_on_pleadli() {
        let dir = std::env::temp_dir().join(format!("pleadli-dpp-sheet-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let pool = crate::db::startup(&dir, None).await.ok().unwrap().pool;
        sqlx::query("INSERT INTO prosecution_files (id, title, police_reference, current_status, received_at) VALUES ('f1', 'Uganda v Kasozi', 'WANDEGEYA CRB 90/2026', 'under_review', 1)").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO people (id, first_name, last_name) VALUES ('p1', 'Peter', 'Kasozi')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO prosecution_file_people (id, prosecution_file_id, person_id, role) VALUES ('a', 'f1', 'p1', 'accused')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO charges (id, prosecution_file_id, accused_person_id, offence, statutory_section) VALUES ('c1', 'f1', 'p1', 'Robbery', 'Penal Code Act, section 285')").execute(&pool).await.unwrap();
        assert!(filing_sheet(&pool, "f1", "magistrate", "  ", None).await.is_err(), "the registry must be named");
        let doc = filing_sheet(&pool, "f1", "magistrate", "Nakawa Chief Magistrates Court", Some("State Attorney")).await.unwrap();
        assert_eq!(doc.kind, "filing_sheet");
        let text = serde_json::to_string(&doc.content).unwrap();
        assert!(text.contains("Nakawa Chief Magistrates Court") && text.contains("Robbery") && text.contains("Kasozi") && text.contains("Court case number"));
        pool.close().await;
    }

    /// The registry ends its connection: the office reads the signed notice, keeps the reason, refuses to file to it,
    /// and a notice signed by someone else changes nothing.
    #[tokio::test]
    async fn a_registry_that_ends_its_connection_is_no_longer_filed_to() {
        let dir = std::env::temp_dir().join(format!("pleadli-dpp-court-revoke-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let pool = crate::db::startup(&dir, None).await.ok().unwrap().pool;
        super::super::interchange::create_identity(&pool, "Court Revoke Test DPP", Some("Kampala".to_string())).await.unwrap();
        let court = Identity::generate(IdentityKind::CourtRegistry, "Court Revoke Test Registry", Some("Kampala"));
        let (invite_file, invite) = pairing::make_invite(&court, "Court Revoke Test DPP", i64::MAX).unwrap();
        let (link, answer) = accept_invite(&pool, &invite_file, None).await.unwrap();
        let response = pairing::read_response(&answer).unwrap();
        let sign = |who: &Identity, outcome: &str, reason: Option<&str>| pairing::make_confirmation(who, &response.station, &invite.invite_id, outcome, reason).unwrap();
        import_package(&pool, &sign(&court, "trusted", None)).await.unwrap();

        let stranger = Identity::generate(IdentityKind::CourtRegistry, "Stranger", None);
        assert!(import_package(&pool, &sign(&stranger, "revoked", Some("Forged."))).await.is_err());
        let status = || sqlx::query_scalar::<_, String>("SELECT status FROM court_links WHERE id = ?").bind(link.id.clone()).fetch_one(&pool);
        assert_eq!(status().await.unwrap(), "trusted", "a notice signed by someone else ended nothing");

        import_package(&pool, &sign(&court, "revoked", Some("Registry closed."))).await.unwrap();
        assert_eq!(status().await.unwrap(), "revoked");
        let why: Option<String> = sqlx::query_scalar("SELECT revoked_reason FROM court_links WHERE id = ?").bind(&link.id).fetch_one(&pool).await.unwrap();
        assert_eq!(why.as_deref(), Some("Registry closed."));
        import_package(&pool, &sign(&court, "revoked", Some("Again."))).await.unwrap();
        assert!(export_filing(&pool, "f1", "magistrate", None, "file").await.is_err(), "nothing is filed to a registry that ended the connection");
        pool.close().await;
    }
}
