//! Two-ended transfer (docs/prisons/product-map/02 W5, 03 G.1).
//!
//! A transfer is one continuing custody relationship (s.73(5): in transit the
//! person stays in the custody of the prison officer), so it never starts a
//! new episode. It moves the live record between facilities in two ends:
//!
//! * the sender **prepares** it, then **dispatches** it: the person is
//!   `in_transit`, the stay stays open, and a sealed **dossier** is produced;
//! * the receiver **imports** the dossier, verifies identity and property,
//!   places the person and **confirms**: their node opens the new stay and
//!   produces a **receipt**;
//! * the sender **imports the receipt**: only now does its stay close and the
//!   record become a read-only archive.
//!
//! The dossier and receipt are files, so this works with no network at all
//! (decision D9); the same payloads will ride the Exchange when it exists.
//! The dossier is sealed with a passphrase the sending OIC gives the receiving
//! OIC by another route. It is not yet signed by the node key (Exchange,
//! phase 6), and the receipt is not either: both are checked for consistency,
//! not authenticity.

use argon2::Argon2;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::attachments;
use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::custody::{self, Contact};
use super::error::DomainError;
use super::facility_profile;
use super::instruments::Instrument;
use super::prisoners::{self, CreatePrisonerInput, Prisoner};
use super::sentences::Sentence;
use super::time::now_ms;

const DOSSIER_FORMAT: &str = "pleadli-dossier/1";
const RECEIPT_FORMAT: &str = "pleadli-receipt/1";
const MIN_PASSPHRASE_CHARS: usize = 8;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Transfer {
    pub id: String,
    pub prisoner_id: Option<String>,
    /// out: this facility sends. in: this facility receives.
    pub direction: String,
    /// out: preparing | in_transit | confirmed | cancelled. in: arrived | confirmed.
    pub state: String,
    pub episode_id: Option<String>,
    pub person_name: Option<String>,
    pub other_prison_name: Option<String>,
    pub transferred_at: i64,
    pub ordering_authority: Option<String>,
    pub order_reference: Option<String>,
    pub reason: Option<String>,
    pub planned_at: Option<i64>,
    pub dispatched_at: Option<i64>,
    pub escort: Option<String>,
    pub transport: Option<String>,
    pub arrived_at: Option<i64>,
    pub confirmed_at: Option<i64>,
    pub checklist_json: Option<String>,
    pub dossier_digest: Option<String>,
    pub notes: Option<String>,
    pub created_at: i64,
}

macro_rules! select_transfers {
    ($tail:literal) => {
        concat!(
            "SELECT id, prisoner_id, direction, state, episode_id,
    COALESCE(person_name, (SELECT last_name || ', ' || first_name FROM prisoners WHERE prisoners.id = transfers.prisoner_id)) AS person_name,
    other_prison_name, transferred_at, ordering_authority, order_reference, reason, planned_at, dispatched_at, escort, transport,
    arrived_at, confirmed_at, checklist_json, dossier_digest, notes, created_at FROM transfers ",
            $tail
        )
    };
}

async fn get_conn(conn: &mut SqliteConnection, id: &str) -> Result<Transfer, sqlx::Error> {
    sqlx::query_as::<_, Transfer>(select_transfers!("WHERE id = ?")).bind(id).fetch_one(&mut *conn).await
}

pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Transfer>, sqlx::Error> {
    sqlx::query_as::<_, Transfer>(select_transfers!(
        "ORDER BY CASE state WHEN 'arrived' THEN 0 WHEN 'in_transit' THEN 1 WHEN 'preparing' THEN 2 ELSE 3 END, transferred_at DESC LIMIT 500"
    ))
    .fetch_all(pool)
    .await
}

pub async fn list_for_prisoner(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<Transfer>, sqlx::Error> {
    sqlx::query_as::<_, Transfer>(select_transfers!("WHERE prisoner_id = ? ORDER BY transferred_at DESC")).bind(prisoner_id).fetch_all(pool).await
}

// ---------------------------------------------------------------------
// Sender: prepare, checklist, cancel
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Checklist {
    pub property_statement: bool,
    pub documents_copied: bool,
    pub medical_summary: bool,
    pub family_informed: bool,
    pub transfer_letter: bool,
    pub court_conflicts_checked: bool,
    pub keep_in_area_noted: bool,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareTransferInput {
    pub prisoner_id: String,
    pub destination_name: String,
    pub order_reference: Option<String>,
    pub ordering_authority: Option<String>,
    pub reason: Option<String>,
    pub planned_at: Option<i64>,
    pub notes: Option<String>,
}

pub async fn prepare(conn: &mut SqliteConnection, actor: &Actor, input: PrepareTransferInput) -> Result<Transfer, DomainError> {
    if input.destination_name.trim().is_empty() {
        return Err(DomainError::rejected("Name the prison the person is going to."));
    }
    let prisoner = prisoners::get_prisoner_conn(conn, &input.prisoner_id).await?.ok_or(DomainError::NotFound("That prisoner"))?;
    if prisoner.current_status != "in_custody" {
        return Err(DomainError::rejected("Only someone in custody here can be prepared for transfer."));
    }
    let open: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM transfers WHERE prisoner_id = ? AND direction = 'out' AND state IN ('preparing', 'in_transit')",
    )
    .bind(&input.prisoner_id)
    .fetch_one(&mut *conn)
    .await?;
    if open > 0 {
        return Err(DomainError::conflict("TRANSFER_OPEN", "A transfer for this person is already open."));
    }

    let id = Uuid::new_v4().to_string();
    let planned = input.planned_at.unwrap_or_else(now_ms);
    sqlx::query(
        "INSERT INTO transfers
            (id, prisoner_id, direction, state, episode_id, other_prison_name, transferred_at, ordering_authority, order_reference,
             reason, planned_at, checklist_json, notes)
         VALUES (?, ?, 'out', 'preparing', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prisoner_id)
    .bind(&prisoner.episode_id)
    .bind(input.destination_name.trim())
    .bind(planned)
    .bind(&input.ordering_authority)
    .bind(&input.order_reference)
    .bind(&input.reason)
    .bind(planned)
    .bind(serde_json::to_string(&Checklist::default()).unwrap_or_default())
    .bind(&input.notes)
    .execute(&mut *conn)
    .await?;

    let transfer = get_conn(conn, &id).await?;
    audit::record(conn, actor, AuditEntry::new("transfer.prepared", "transfer", Some(&id)).workflow(&id).after(&transfer)).await?;
    Ok(transfer)
}

pub async fn update_checklist(conn: &mut SqliteConnection, actor: &Actor, id: &str, checklist: Checklist) -> Result<Transfer, DomainError> {
    let before = get_conn(conn, id).await?;
    if before.direction != "out" || before.state != "preparing" {
        return Err(DomainError::conflict("NOT_PREPARING", "The checklist can only change while a transfer is being prepared."));
    }
    sqlx::query("UPDATE transfers SET checklist_json = ? WHERE id = ?")
        .bind(serde_json::to_string(&checklist).unwrap_or_default())
        .bind(id)
        .execute(&mut *conn)
        .await?;
    let after = get_conn(conn, id).await?;
    audit::record(conn, actor, AuditEntry::new("transfer.checklist", "transfer", Some(id)).workflow(id).before(&before).after(&after)).await?;
    Ok(after)
}

pub async fn cancel(conn: &mut SqliteConnection, actor: &Actor, id: &str, reason: &str) -> Result<Transfer, DomainError> {
    if reason.trim().is_empty() {
        return Err(DomainError::rejected("Record why the transfer is cancelled."));
    }
    let before = get_conn(conn, id).await?;
    if before.direction != "out" || before.state != "preparing" {
        return Err(DomainError::conflict("NOT_PREPARING", "Only a transfer still being prepared can be cancelled."));
    }
    sqlx::query("UPDATE transfers SET state = 'cancelled', notes = COALESCE(notes || char(10), '') || ? WHERE id = ?")
        .bind(format!("Cancelled: {}", reason.trim()))
        .bind(id)
        .execute(&mut *conn)
        .await?;
    let after = get_conn(conn, id).await?;
    audit::record(conn, actor, AuditEntry::new("transfer.cancelled", "transfer", Some(id)).workflow(id).before(&before).after(&after).reason(reason.trim())).await?;
    Ok(after)
}

// ---------------------------------------------------------------------
// The dossier: what travels with the person
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DossierProperty {
    pub id: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DossierProduction {
    pub court_reference: Option<String>,
    pub production_date: i64,
    pub purpose: Option<String>,
    pub production_method: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DossierFile {
    pub instrument_id: String,
    pub file_name: String,
    pub content_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Dossier {
    pub format: String,
    pub transfer_id: String,
    pub episode_id: String,
    pub created_at: i64,
    pub from_facility: String,
    pub destination_name: Option<String>,
    pub order_reference: Option<String>,
    pub ordering_authority: Option<String>,
    pub departed_at: i64,
    pub prisoner: Prisoner,
    pub instruments: Vec<Instrument>,
    pub sentence: Option<Sentence>,
    pub contacts: Vec<Contact>,
    pub property: Vec<DossierProperty>,
    pub scheduled_productions: Vec<DossierProduction>,
    pub files: Vec<DossierFile>,
    pub checklist: Checklist,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Envelope {
    format: String,
    transfer_id: String,
    salt: String,
    nonce: String,
    ciphertext: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileExport {
    pub file_name: String,
    pub content_base64: String,
}

fn derive_key(passphrase: &str, salt: &[u8]) -> Result<[u8; 32], DomainError> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|_| DomainError::rejected("The passphrase could not be used."))?;
    Ok(key)
}

fn seal(dossier_json: &[u8], transfer_id: &str, passphrase: &str) -> Result<Vec<u8>, DomainError> {
    let mut salt = [0u8; 16];
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);
    let key = derive_key(passphrase, &salt)?;
    let cipher = ChaCha20Poly1305::new((&key).into());
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), Payload { msg: dossier_json, aad: transfer_id.as_bytes() })
        .map_err(|_| DomainError::rejected("The dossier could not be sealed."))?;
    let envelope = Envelope {
        format: DOSSIER_FORMAT.to_string(),
        transfer_id: transfer_id.to_string(),
        salt: B64.encode(salt),
        nonce: B64.encode(nonce),
        ciphertext: B64.encode(ciphertext),
    };
    serde_json::to_vec(&envelope).map_err(|_| DomainError::rejected("The dossier could not be written."))
}

fn open_envelope(bytes: &[u8], passphrase: &str) -> Result<(String, Vec<u8>), DomainError> {
    let unreadable = || DomainError::rejected("That is not a readable dossier, or the passphrase is wrong.");
    let envelope: Envelope = serde_json::from_slice(bytes).map_err(|_| unreadable())?;
    if envelope.format != DOSSIER_FORMAT {
        return Err(DomainError::rejected("That file is not a Pleadli transfer dossier, or is from an incompatible version."));
    }
    let salt = B64.decode(&envelope.salt).map_err(|_| unreadable())?;
    let nonce = B64.decode(&envelope.nonce).map_err(|_| unreadable())?;
    let ciphertext = B64.decode(&envelope.ciphertext).map_err(|_| unreadable())?;
    if nonce.len() != 12 {
        return Err(unreadable());
    }
    let key = derive_key(passphrase, &salt)?;
    let cipher = ChaCha20Poly1305::new((&key).into());
    let plain = cipher
        .decrypt(Nonce::from_slice(&nonce), Payload { msg: &ciphertext, aad: envelope.transfer_id.as_bytes() })
        .map_err(|_| unreadable())?;
    Ok((envelope.transfer_id, plain))
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn safe_fragment(s: &str) -> String {
    let cleaned: String = s.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    let trimmed = cleaned.trim_matches('-');
    if trimmed.is_empty() { "person".to_string() } else { trimmed.to_lowercase() }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DispatchInput {
    pub departed_at: i64,
    pub escort: Option<String>,
    pub transport: Option<String>,
    pub passphrase: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DispatchResult {
    pub transfer: Transfer,
    pub file: FileExport,
}

pub async fn dispatch(conn: &mut SqliteConnection, actor: &Actor, id: &str, input: DispatchInput) -> Result<DispatchResult, DomainError> {
    if input.passphrase.chars().count() < MIN_PASSPHRASE_CHARS {
        return Err(DomainError::rejected(format!("The dossier passphrase must be at least {MIN_PASSPHRASE_CHARS} characters.")));
    }
    let before = get_conn(conn, id).await?;
    if before.direction != "out" || before.state != "preparing" {
        return Err(DomainError::conflict("NOT_PREPARING", "Only a transfer being prepared can be dispatched."));
    }
    if before.order_reference.as_deref().unwrap_or("").trim().is_empty() && before.ordering_authority.as_deref().unwrap_or("").trim().is_empty() {
        return Err(DomainError::rejected("Record the order the transfer is made under (s.73(3)) before dispatch."));
    }
    let prisoner_id = before.prisoner_id.clone().ok_or(DomainError::NotFound("That prisoner"))?;
    let prisoner = prisoners::get_prisoner_conn(conn, &prisoner_id).await?.ok_or(DomainError::NotFound("That prisoner"))?;
    let episode_id = prisoner.episode_id.clone().unwrap_or_default();

    let instruments: Vec<Instrument> = sqlx::query_as::<_, Instrument>("SELECT * FROM instruments WHERE prisoner_id = ? AND status != 'superseded'")
        .bind(&prisoner_id)
        .fetch_all(&mut *conn)
        .await?;
    let sentence = super::sentences::active_for_conn(conn, &prisoner_id).await?;
    let contacts: Vec<Contact> = sqlx::query_as::<_, Contact>("SELECT * FROM prisoner_contacts WHERE prisoner_id = ?").bind(&prisoner_id).fetch_all(&mut *conn).await?;
    let property: Vec<DossierProperty> = sqlx::query_as::<_, (String, String)>(
        "SELECT id, description FROM property_records WHERE prisoner_id = ? AND returned_at IS NULL",
    )
    .bind(&prisoner_id)
    .fetch_all(&mut *conn)
    .await?
    .into_iter()
    .map(|(id, description)| DossierProperty { id, description })
    .collect();
    let scheduled_productions: Vec<DossierProduction> = sqlx::query_as::<_, (Option<String>, i64, Option<String>, String)>(
        "SELECT court_reference, production_date, purpose, production_method FROM court_productions WHERE prisoner_id = ? AND state = 'scheduled'",
    )
    .bind(&prisoner_id)
    .fetch_all(&mut *conn)
    .await?
    .into_iter()
    .map(|(court_reference, production_date, purpose, production_method)| DossierProduction { court_reference, production_date, purpose, production_method })
    .collect();

    let mut files = Vec::new();
    for instrument in &instruments {
        let docs: Vec<attachments::Attachment> = sqlx::query_as::<_, attachments::Attachment>(
            "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at
             FROM attachments WHERE entity_type = 'instrument' AND entity_id = ? AND voided_at IS NULL",
        )
        .bind(&instrument.id)
        .fetch_all(&mut *conn)
        .await?;
        for doc in docs {
            let bytes = std::fs::read(&doc.stored_path).map_err(|_| DomainError::rejected(format!("The file {} could not be read from the document store.", doc.file_name)))?;
            files.push(DossierFile { instrument_id: instrument.id.clone(), file_name: doc.file_name, content_base64: B64.encode(bytes) });
        }
    }

    let checklist: Checklist = before.checklist_json.as_deref().and_then(|j| serde_json::from_str(j).ok()).unwrap_or_default();
    let dossier = Dossier {
        format: DOSSIER_FORMAT.to_string(),
        transfer_id: id.to_string(),
        episode_id,
        created_at: now_ms(),
        from_facility: facility_profile::display_name(conn).await?,
        destination_name: before.other_prison_name.clone(),
        order_reference: before.order_reference.clone(),
        ordering_authority: before.ordering_authority.clone(),
        departed_at: input.departed_at,
        prisoner: prisoner.clone(),
        instruments,
        sentence,
        contacts,
        property,
        scheduled_productions,
        files,
        checklist,
    };
    let plain = serde_json::to_vec(&dossier).map_err(|_| DomainError::rejected("The dossier could not be written."))?;
    let sealed = seal(&plain, id, &input.passphrase)?;

    sqlx::query(
        "UPDATE transfers SET state = 'in_transit', dispatched_at = ?, transferred_at = ?, escort = ?, transport = ?,
                dossier_digest = ?, dossier_json = ? WHERE id = ?",
    )
    .bind(input.departed_at)
    .bind(input.departed_at)
    .bind(&input.escort)
    .bind(&input.transport)
    .bind(digest(&plain))
    .bind(String::from_utf8_lossy(&sealed).to_string())
    .bind(id)
    .execute(&mut *conn)
    .await?;

    prisoners::set_status(conn, actor, &prisoner_id, "in_transit", "transfer dispatched").await?;

    let transfer = get_conn(conn, id).await?;
    audit::record(conn, actor, AuditEntry::new("transfer.dispatched", "transfer", Some(id)).workflow(id).before(&before).after(&transfer)).await?;
    let file = FileExport {
        file_name: format!("dossier-{}-{}.pleadli-dossier", safe_fragment(&prisoner.last_name), &id[..8.min(id.len())]),
        content_base64: B64.encode(&sealed),
    };
    Ok(DispatchResult { transfer, file })
}

/// The sealed dossier again, for a sender whose first export failed or whose
/// file was lost. Still sealed with the same passphrase.
pub async fn export_dossier(pool: &SqlitePool, id: &str) -> Result<FileExport, DomainError> {
    let row: Option<(String, Option<String>, String)> =
        sqlx::query_as("SELECT direction, dossier_json, COALESCE(person_name, '') FROM transfers WHERE id = ?").bind(id).fetch_optional(pool).await?;
    let (direction, sealed, _) = row.ok_or(DomainError::NotFound("That transfer"))?;
    let sealed = sealed.filter(|_| direction == "out").ok_or(DomainError::rejected("There is no sealed dossier for that transfer."))?;
    Ok(FileExport { file_name: format!("dossier-{}.pleadli-dossier", &id[..8.min(id.len())]), content_base64: B64.encode(sealed.as_bytes()) })
}

// ---------------------------------------------------------------------
// Receiver: import, verify, confirm
// ---------------------------------------------------------------------

pub async fn import_dossier(conn: &mut SqliteConnection, actor: &Actor, content_base64: &str, passphrase: &str) -> Result<Transfer, DomainError> {
    let bytes = B64.decode(content_base64.trim()).map_err(|_| DomainError::rejected("That file could not be read."))?;
    let (transfer_id, plain) = open_envelope(&bytes, passphrase)?;
    let dossier: Dossier = serde_json::from_slice(&plain).map_err(|_| DomainError::rejected("That dossier is damaged."))?;
    if dossier.transfer_id != transfer_id {
        return Err(DomainError::rejected("That dossier is damaged."));
    }

    let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM transfers WHERE id = ?").bind(&transfer_id).fetch_one(&mut *conn).await?;
    if exists > 0 {
        return Err(DomainError::conflict("ALREADY_IMPORTED", "That dossier has already been imported here."));
    }

    let person_name = format!("{}, {}", dossier.prisoner.last_name, dossier.prisoner.first_name);
    sqlx::query(
        "INSERT INTO transfers
            (id, direction, state, episode_id, person_name, other_prison_name, transferred_at, ordering_authority, order_reference,
             arrived_at, checklist_json, dossier_digest, dossier_json)
         VALUES (?, 'in', 'arrived', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&transfer_id)
    .bind(&dossier.episode_id)
    .bind(&person_name)
    .bind(&dossier.from_facility)
    .bind(dossier.departed_at)
    .bind(&dossier.ordering_authority)
    .bind(&dossier.order_reference)
    .bind(now_ms())
    .bind(serde_json::to_string(&dossier.checklist).unwrap_or_default())
    .bind(digest(&plain))
    .bind(String::from_utf8_lossy(&plain).to_string())
    .execute(&mut *conn)
    .await?;

    let transfer = get_conn(conn, &transfer_id).await?;
    audit::record(conn, actor, AuditEntry::new("transfer.dossier_imported", "transfer", Some(&transfer_id)).workflow(&transfer_id).after(&transfer)).await?;
    Ok(transfer)
}

/// The dossier as the receiving officer reads it: everything except the
/// document files, which are large and are shown by name.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DossierPreview {
    pub transfer_id: String,
    pub episode_id: String,
    pub from_facility: String,
    pub order_reference: Option<String>,
    pub ordering_authority: Option<String>,
    pub departed_at: i64,
    pub prisoner: Prisoner,
    pub instruments: Vec<Instrument>,
    pub sentence: Option<Sentence>,
    pub contacts: Vec<Contact>,
    pub property: Vec<DossierProperty>,
    pub scheduled_productions: Vec<DossierProduction>,
    pub file_names: Vec<String>,
    pub checklist: Checklist,
    pub returning: bool,
}

async fn load_dossier(conn: &mut SqliteConnection, id: &str) -> Result<Dossier, DomainError> {
    let json: Option<String> = sqlx::query_scalar("SELECT dossier_json FROM transfers WHERE id = ? AND direction = 'in'").bind(id).fetch_optional(&mut *conn).await?.flatten();
    let json = json.ok_or(DomainError::NotFound("That dossier"))?;
    serde_json::from_str(&json).map_err(|_| DomainError::rejected("That dossier is damaged."))
}

pub async fn dossier_preview(pool: &SqlitePool, id: &str) -> Result<DossierPreview, DomainError> {
    let mut conn = pool.acquire().await?;
    let d = load_dossier(&mut conn, id).await?;
    let returning: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prisoners WHERE episode_id = ?").bind(&d.episode_id).fetch_one(&mut *conn).await?;
    Ok(DossierPreview {
        transfer_id: d.transfer_id,
        episode_id: d.episode_id,
        from_facility: d.from_facility,
        order_reference: d.order_reference,
        ordering_authority: d.ordering_authority,
        departed_at: d.departed_at,
        prisoner: d.prisoner,
        instruments: d.instruments,
        sentence: d.sentence,
        contacts: d.contacts,
        property: d.property,
        scheduled_productions: d.scheduled_productions,
        file_names: d.files.iter().map(|f| f.file_name.clone()).collect(),
        checklist: d.checklist,
        returning: returning > 0,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertyCheck {
    pub id: String,
    pub received: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmArrivalInput {
    pub identity_verified: bool,
    pub discrepancy_note: Option<String>,
    pub property: Vec<PropertyCheck>,
    pub placement: Option<String>,
    pub health_screen_note: Option<String>,
    pub received_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Receipt {
    format: String,
    transfer_id: String,
    episode_id: String,
    dossier_digest: String,
    received_by: String,
    received_at: i64,
    confirmed_by: String,
    property_not_received: Vec<String>,
    discrepancy_note: Option<String>,
}

pub async fn confirm_arrival(
    conn: &mut SqliteConnection,
    actor: &Actor,
    vault_root: &Path,
    id: &str,
    input: ConfirmArrivalInput,
) -> Result<Transfer, DomainError> {
    if !input.identity_verified {
        return Err(DomainError::rejected(
            "Verify the person's identity against the dossier before accepting. If it does not match, do not accept them; tell the sending facility.",
        ));
    }
    let before = get_conn(conn, id).await?;
    if before.direction != "in" || before.state != "arrived" {
        return Err(DomainError::conflict("NOT_ARRIVED", "That transfer is not awaiting confirmation."));
    }
    let dossier = load_dossier(conn, id).await?;
    let sender = dossier.from_facility.clone();

    let existing: Option<(String, String)> =
        sqlx::query_as("SELECT id, current_status FROM prisoners WHERE episode_id = ?").bind(&dossier.episode_id).fetch_optional(&mut *conn).await?;

    let local_id = match existing {
        Some((existing_id, status)) => {
            if status == "in_custody" {
                return Err(DomainError::conflict("ALREADY_HELD", "This person is already in custody here."));
            }
            prisoners::set_status(conn, actor, &existing_id, "in_custody", "returned by transfer").await?;
            sqlx::query("UPDATE sentences SET superseded_at = ? WHERE prisoner_id = ? AND superseded_at IS NULL")
                .bind(now_ms())
                .bind(&existing_id)
                .execute(&mut *conn)
                .await?;
            existing_id
        }
        None => {
            let p = &dossier.prisoner;
            let created = prisoners::insert_prisoner(
                conn,
                actor,
                CreatePrisonerInput {
                    first_name: p.first_name.clone(),
                    last_name: p.last_name.clone(),
                    other_names: p.other_names.clone(),
                    national_id: p.national_id.clone(),
                    // The receiving facility issues its own number; the sending facility's number is kept as the reference when none was written.
                    reference: p.reference.clone().or_else(|| p.prisoner_number.clone()),
                    status: p.status.clone(),
                    admission_instrument_type: p.admission_instrument_type.clone(),
                    admission_authority: p.admission_authority.clone(),
                    admitted_at: p.admitted_at,
                    high_court_only_offence: p.high_court_only_offence,
                    date_of_birth: p.date_of_birth,
                    sex: p.sex.clone(),
                    education_level: p.education_level.clone(),
                    nationality: p.nationality.clone(),
                    offence: p.offence.clone(),
                    documents_pending: false,
                    pending_document_type: None,
                    notes: p.notes.clone(),
                },
                &dossier.episode_id,
                "custody.transfer_in",
            )
            .await?;
            for contact in &dossier.contacts {
                custody::insert_contact(
                    conn,
                    &created.id,
                    &custody::ContactInput {
                        name: contact.name.clone(),
                        relationship: contact.relationship.clone(),
                        phone: contact.phone.clone(),
                        address: contact.address.clone(),
                        is_emergency: contact.is_emergency,
                        notify_on_imprisonment: contact.notify_on_imprisonment,
                    },
                )
                .await?;
            }
            created.id
        }
    };

    let mut instrument_map = std::collections::HashMap::new();
    for instrument in &dossier.instruments {
        let new_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO instruments
                (id, prisoner_id, kind, issuing_authority, reference, issued_on, received_at, authenticated, verification_note, verified_by, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&new_id)
        .bind(&local_id)
        .bind(&instrument.kind)
        .bind(&instrument.issuing_authority)
        .bind(&instrument.reference)
        .bind(instrument.issued_on)
        .bind(instrument.received_at)
        .bind(instrument.authenticated)
        .bind(&instrument.verification_note)
        .bind(format!("transfer dossier from {sender}"))
        .bind(&instrument.status)
        .execute(&mut *conn)
        .await?;
        instrument_map.insert(instrument.id.clone(), new_id);
    }
    super::instruments::sync_pending_flag(conn, &local_id).await?;

    for file in &dossier.files {
        let Some(new_instrument) = instrument_map.get(&file.instrument_id) else { continue };
        let bytes = B64.decode(&file.content_base64).map_err(|_| DomainError::rejected("A document in the dossier is damaged."))?;
        attachments::add_attachment_bytes(conn, actor, vault_root, "instrument", new_instrument, &file.file_name, &bytes)
            .await
            .map_err(|e| DomainError::rejected(e.to_string()))?;
    }

    if let Some(s) = &dossier.sentence {
        let instrument_id = s.instrument_id.as_ref().and_then(|old| instrument_map.get(old)).cloned();
        sqlx::query(
            "INSERT INTO sentences (id, prisoner_id, instrument_id, term_years, term_months, term_days, is_life, starts_on, remission_forfeited_days)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&local_id)
        .bind(instrument_id)
        .bind(s.term_years)
        .bind(s.term_months)
        .bind(s.term_days)
        .bind(s.is_life)
        .bind(s.starts_on)
        .bind(s.remission_forfeited_days)
        .execute(&mut *conn)
        .await?;
    }

    let received_ids: std::collections::HashSet<&str> = input.property.iter().filter(|c| c.received).map(|c| c.id.as_str()).collect();
    let mut not_received = Vec::new();
    for line in &dossier.property {
        if received_ids.contains(line.id.as_str()) {
            sqlx::query("INSERT INTO property_records (id, prisoner_id, description, recorded_at) VALUES (?, ?, ?, ?)")
                .bind(Uuid::new_v4().to_string())
                .bind(&local_id)
                .bind(&line.description)
                .bind(input.received_at)
                .execute(&mut *conn)
                .await?;
        } else {
            not_received.push(line.description.clone());
        }
    }

    for production in &dossier.scheduled_productions {
        sqlx::query(
            "INSERT INTO court_productions (id, prisoner_id, court_reference, production_date, purpose, production_method, state)
             VALUES (?, ?, ?, ?, ?, ?, 'scheduled')",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&local_id)
        .bind(&production.court_reference)
        .bind(production.production_date)
        .bind(&production.purpose)
        .bind(&production.production_method)
        .execute(&mut *conn)
        .await?;
    }

    if let Some(placement) = input.placement.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        sqlx::query("UPDATE prisoners SET current_location = ? WHERE id = ?").bind(placement).bind(&local_id).execute(&mut *conn).await?;
    }
    custody::open_stay(conn, &local_id, &dossier.episode_id, "transfer_in", input.received_at).await?;

    let receipt = Receipt {
        format: RECEIPT_FORMAT.to_string(),
        transfer_id: id.to_string(),
        episode_id: dossier.episode_id.clone(),
        dossier_digest: before.dossier_digest.clone().unwrap_or_default(),
        received_by: facility_profile::display_name(conn).await?,
        received_at: input.received_at,
        confirmed_by: actor.name.clone(),
        property_not_received: not_received.clone(),
        discrepancy_note: input.discrepancy_note.clone(),
    };
    let mut notes = Vec::new();
    if let Some(h) = input.health_screen_note.as_deref().filter(|n| !n.trim().is_empty()) {
        notes.push(format!("Health screening: {}", h.trim()));
    }
    if let Some(d) = input.discrepancy_note.as_deref().filter(|n| !n.trim().is_empty()) {
        notes.push(format!("Discrepancy: {}", d.trim()));
    }
    if !not_received.is_empty() {
        notes.push(format!("Property not received: {}", not_received.join(", ")));
    }
    sqlx::query("UPDATE transfers SET prisoner_id = ?, state = 'confirmed', confirmed_at = ?, receipt_json = ?, notes = ? WHERE id = ?")
        .bind(&local_id)
        .bind(input.received_at)
        .bind(serde_json::to_string(&receipt).unwrap_or_default())
        .bind((!notes.is_empty()).then(|| notes.join("\n")))
        .bind(id)
        .execute(&mut *conn)
        .await?;

    let after = get_conn(conn, id).await?;
    audit::record(conn, actor, AuditEntry::new("transfer.arrival_confirmed", "transfer", Some(id)).workflow(id).before(&before).after(&after)).await?;
    Ok(after)
}

pub async fn export_receipt(pool: &SqlitePool, id: &str) -> Result<FileExport, DomainError> {
    let json: Option<String> =
        sqlx::query_scalar("SELECT receipt_json FROM transfers WHERE id = ? AND direction = 'in' AND state = 'confirmed'").bind(id).fetch_optional(pool).await?.flatten();
    let json = json.ok_or(DomainError::rejected("That arrival has not been confirmed yet."))?;
    Ok(FileExport { file_name: format!("receipt-{}.pleadli-receipt", &id[..8.min(id.len())]), content_base64: B64.encode(json.as_bytes()) })
}

// ---------------------------------------------------------------------
// Sender: import the receipt, close the stay
// ---------------------------------------------------------------------

pub async fn import_receipt(conn: &mut SqliteConnection, actor: &Actor, content_base64: &str) -> Result<Transfer, DomainError> {
    let bytes = B64.decode(content_base64.trim()).map_err(|_| DomainError::rejected("That file could not be read."))?;
    let receipt: Receipt = serde_json::from_slice(&bytes).map_err(|_| DomainError::rejected("That is not a readable receipt."))?;
    if receipt.format != RECEIPT_FORMAT {
        return Err(DomainError::rejected("That file is not a Pleadli transfer receipt, or is from an incompatible version."));
    }
    let before = get_conn(conn, &receipt.transfer_id).await.map_err(|_| DomainError::rejected("This facility has no transfer that matches that receipt."))?;
    if before.direction != "out" {
        return Err(DomainError::rejected("That receipt is not for a transfer sent from here."));
    }
    if before.state == "confirmed" {
        return Err(DomainError::conflict("ALREADY_CONFIRMED", "That transfer has already been confirmed."));
    }
    if before.state != "in_transit" {
        return Err(DomainError::conflict("NOT_IN_TRANSIT", "That transfer is not in transit."));
    }
    if before.dossier_digest.as_deref() != Some(receipt.dossier_digest.as_str()) {
        return Err(DomainError::rejected("That receipt does not match the dossier that was sent. Do not close the record; check with the receiving facility."));
    }
    let prisoner_id = before.prisoner_id.clone().ok_or(DomainError::NotFound("That prisoner"))?;

    sqlx::query("UPDATE transfers SET state = 'confirmed', confirmed_at = ?, receipt_json = ? WHERE id = ?")
        .bind(receipt.received_at)
        .bind(String::from_utf8_lossy(&bytes).to_string())
        .bind(&receipt.transfer_id)
        .execute(&mut *conn)
        .await?;
    prisoners::set_status(conn, actor, &prisoner_id, "transferred_out", "transfer confirmed by receiving facility").await?;
    custody::close_open_stay(conn, &prisoner_id, "transfer_out", receipt.received_at, &receipt.transfer_id).await?;
    sqlx::query(
        "UPDATE property_records SET returned_at = ?, returned_note = ? WHERE prisoner_id = ? AND returned_at IS NULL",
    )
    .bind(receipt.received_at)
    .bind(format!("Transferred with the prisoner to {}", receipt.received_by))
    .bind(&prisoner_id)
    .execute(&mut *conn)
    .await?;

    let after = get_conn(conn, &receipt.transfer_id).await?;
    audit::record(conn, actor, AuditEntry::new("transfer.confirmed", "transfer", Some(&receipt.transfer_id)).workflow(&receipt.transfer_id).before(&before).after(&after)).await?;
    Ok(after)
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TransferSearchRow {
    pub id: String,
    pub prisoner_id: String,
    pub first_name: String,
    pub last_name: String,
    pub direction: String,
    pub other_prison_name: Option<String>,
    pub transferred_at: i64,
}

pub async fn search(pool: &SqlitePool, query: &str) -> Result<Vec<TransferSearchRow>, sqlx::Error> {
    let like = format!("%{query}%");
    sqlx::query_as::<_, TransferSearchRow>(
        "SELECT t.id, t.prisoner_id, p.first_name, p.last_name, t.direction, t.other_prison_name, t.transferred_at
         FROM transfers t JOIN prisoners p ON p.id = t.prisoner_id
         WHERE t.other_prison_name LIKE ?1 OR p.first_name LIKE ?1 OR p.last_name LIKE ?1 OR p.other_names LIKE ?1
         ORDER BY t.transferred_at DESC LIMIT 200",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}
