//! Stays and reception (docs/prisons/product-map/02 W1, 03 G.1).
//!
//! A stay is one continuous period a facility holds a person; it opens at
//! reception or arrival by transfer and closes at discharge or confirmed
//! transfer-out. Reception is the procedure that causes the admission
//! record: verify the instrument, decide, then search, inventory, screen,
//! inform, place and start the clocks, all in one transaction.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::error::DomainError;
use super::instruments::{self, ExpectInstrumentInput};
use super::prisoners::{self, CreatePrisonerInput, Prisoner};
use super::sentences::{self, SentenceEntry, SetSentenceInput};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Stay {
    pub id: String,
    pub prisoner_id: String,
    pub episode_id: String,
    pub entry_kind: String,
    pub entered_at: i64,
    pub exit_kind: Option<String>,
    pub exited_at: Option<i64>,
    pub exit_ref: Option<String>,
    pub created_at: i64,
}

pub async fn open_stay(conn: &mut SqliteConnection, prisoner_id: &str, episode_id: &str, entry_kind: &str, entered_at: i64) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO stays (id, prisoner_id, episode_id, entry_kind, entered_at) VALUES (?, ?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(prisoner_id)
        .bind(episode_id)
        .bind(entry_kind)
        .bind(entered_at)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

pub async fn close_open_stay(
    conn: &mut SqliteConnection,
    prisoner_id: &str,
    exit_kind: &str,
    exited_at: i64,
    exit_ref: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE stays SET exit_kind = ?, exited_at = ?, exit_ref = ? WHERE prisoner_id = ? AND exited_at IS NULL")
        .bind(exit_kind)
        .bind(exited_at)
        .bind(exit_ref)
        .bind(prisoner_id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

pub async fn list_stays(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<Stay>, sqlx::Error> {
    sqlx::query_as::<_, Stay>("SELECT * FROM stays WHERE prisoner_id = ? ORDER BY entered_at DESC")
        .bind(prisoner_id)
        .fetch_all(pool)
        .await
}

// ---------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Contact {
    pub id: String,
    pub prisoner_id: String,
    pub name: String,
    pub relationship: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub is_emergency: bool,
    pub notify_on_imprisonment: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactInput {
    pub name: String,
    pub relationship: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub is_emergency: bool,
    pub notify_on_imprisonment: bool,
}

pub async fn insert_contact(conn: &mut SqliteConnection, prisoner_id: &str, c: &ContactInput) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO prisoner_contacts (id, prisoner_id, name, relationship, phone, address, is_emergency, notify_on_imprisonment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(prisoner_id)
    .bind(c.name.trim())
    .bind(&c.relationship)
    .bind(&c.phone)
    .bind(&c.address)
    .bind(c.is_emergency)
    .bind(c.notify_on_imprisonment)
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn list_contacts(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<Contact>, sqlx::Error> {
    sqlx::query_as::<_, Contact>("SELECT * FROM prisoner_contacts WHERE prisoner_id = ? ORDER BY created_at ASC")
        .bind(prisoner_id)
        .fetch_all(pool)
        .await
}

// ---------------------------------------------------------------------
// Reception (W1)
// ---------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonInput {
    pub first_name: String,
    pub last_name: String,
    pub other_names: Option<String>,
    pub national_id: Option<String>,
    pub reference: Option<String>,
    pub sex: Option<String>,
    pub date_of_birth: Option<i64>,
    pub nationality: Option<String>,
    pub education_level: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceivedInstrumentInput {
    pub kind: String,
    pub issuing_authority: Option<String>,
    pub reference: Option<String>,
    pub issued_on: Option<i64>,
    pub authenticated: bool,
    pub verification_note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceptionInput {
    /// accept | accept_pending | refuse
    pub decision: String,
    pub refusal_ground: Option<String>,
    pub decision_reason: Option<String>,
    pub received_at: i64,
    pub person: PersonInput,
    /// convicted | unconvicted | civil
    pub legal_status: String,
    pub offence: Option<String>,
    pub high_court_only_offence: bool,
    pub instrument: ReceivedInstrumentInput,
    pub pending_document_type: Option<String>,
    pub sentence: Option<SentenceEntry>,
    pub search_done: bool,
    pub injuries_note: Option<String>,
    pub complaints_note: Option<String>,
    pub health_screen_note: Option<String>,
    pub rules_information_given: bool,
    pub property: Vec<String>,
    pub contacts: Vec<ContactInput>,
    pub placement: Option<String>,
    pub notes: Option<String>,
    #[serde(default)]
    pub photos: Option<super::prisoner_photos::ReceptionPhotos>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceptionResult {
    pub reception_id: String,
    pub decision: String,
    pub prisoner: Option<Prisoner>,
}

fn full_name(p: &PersonInput) -> String {
    [p.last_name.trim(), p.first_name.trim(), p.other_names.as_deref().unwrap_or("").trim()]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(", ")
}

pub async fn receive(conn: &mut SqliteConnection, actor: &Actor, input: ReceptionInput) -> Result<ReceptionResult, DomainError> {
    if input.person.first_name.trim().is_empty() || input.person.last_name.trim().is_empty() {
        return Err(DomainError::rejected("Enter the person's first and last name."));
    }
    if !matches!(input.decision.as_str(), "accept" | "accept_pending" | "refuse") {
        return Err(DomainError::rejected("Choose accept, accept with document pending, or refuse."));
    }
    if !matches!(input.legal_status.as_str(), "convicted" | "unconvicted" | "civil") {
        return Err(DomainError::rejected("Choose the legal category: convicted, unconvicted or civil."));
    }

    let reception_id = Uuid::new_v4().to_string();
    let person_name = full_name(&input.person);
    let refuse = input.decision == "refuse";

    if refuse {
        if input.decision_reason.as_deref().unwrap_or("").trim().is_empty() {
            return Err(DomainError::rejected("Record why reception is refused."));
        }
    } else {
        if input.instrument.kind.trim().is_empty() {
            return Err(DomainError::rejected("Choose the instrument the person arrived under."));
        }
        if input.decision == "accept" && !input.instrument.authenticated {
            return Err(DomainError::rejected(
                "The instrument has not been authenticated. Verify the seal or signature, or accept with the document pending.",
            ));
        }
        if input.decision == "accept_pending" && input.pending_document_type.as_deref().unwrap_or("").trim().is_empty() {
            return Err(DomainError::rejected("Say which document is still pending."));
        }
    }

    let mut prisoner_id: Option<String> = None;
    let mut created: Option<Prisoner> = None;

    if !refuse {
        let episode_id = Uuid::new_v4().simple().to_string();
        let create = CreatePrisonerInput {
            first_name: input.person.first_name.trim().to_string(),
            last_name: input.person.last_name.trim().to_string(),
            other_names: input.person.other_names.clone(),
            national_id: input.person.national_id.clone(),
            reference: input.person.reference.clone(),
            status: input.legal_status.clone(),
            admission_instrument_type: input.instrument.kind.clone(),
            admission_authority: input.instrument.issuing_authority.clone(),
            admitted_at: input.received_at,
            high_court_only_offence: input.high_court_only_offence,
            date_of_birth: input.person.date_of_birth,
            sex: input.person.sex.clone(),
            education_level: input.person.education_level.clone(),
            nationality: input.person.nationality.clone(),
            offence: input.offence.clone(),
            documents_pending: false,
            pending_document_type: None,
            notes: input.notes.clone(),
        };
        let prisoner = prisoners::insert_prisoner(conn, actor, create, &episode_id, "custody.admit").await?;
        open_stay(conn, &prisoner.id, &episode_id, "reception", input.received_at).await?;

        let received = instruments::record_instrument(
            conn,
            actor,
            instruments::RecordInstrumentInput {
                prisoner_id: prisoner.id.clone(),
                kind: input.instrument.kind.clone(),
                issuing_authority: input.instrument.issuing_authority.clone(),
                reference: input.instrument.reference.clone(),
                issued_on: input.instrument.issued_on,
                received_at: input.received_at,
                authenticated: input.instrument.authenticated,
                verification_note: input.instrument.verification_note.clone(),
                resolves_instrument_id: None,
            },
        )
        .await?;

        if input.decision == "accept_pending" {
            instruments::expect_instrument(
                conn,
                actor,
                ExpectInstrumentInput { prisoner_id: prisoner.id.clone(), kind: input.pending_document_type.clone().unwrap_or_default() },
            )
            .await?;
        }

        if input.legal_status == "convicted" {
            if let Some(entry) = &input.sentence {
                sentences::set_sentence(
                    conn,
                    actor,
                    SetSentenceInput {
                        prisoner_id: prisoner.id.clone(),
                        instrument_id: Some(received.id.clone()),
                        term_years: entry.term_years,
                        term_months: entry.term_months,
                        term_days: entry.term_days,
                        is_life: entry.is_life,
                        starts_on: entry.starts_on,
                        remission_forfeited_days: 0,
                        reason: None,
                    },
                )
                .await?;
            }
        }

        for description in input.property.iter().map(|d| d.trim()).filter(|d| !d.is_empty()) {
            sqlx::query("INSERT INTO property_records (id, prisoner_id, description, recorded_at) VALUES (?, ?, ?, ?)")
                .bind(Uuid::new_v4().to_string())
                .bind(&prisoner.id)
                .bind(description)
                .bind(input.received_at)
                .execute(&mut *conn)
                .await?;
        }

        for contact in input.contacts.iter().filter(|c| !c.name.trim().is_empty()) {
            insert_contact(conn, &prisoner.id, contact).await?;
        }

        if let Some(placement) = input.placement.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
            sqlx::query("UPDATE prisoners SET current_location = ? WHERE id = ?").bind(placement).bind(&prisoner.id).execute(&mut *conn).await?;
        }

        prisoner_id = Some(prisoner.id.clone());
        created = prisoners::get_prisoner_conn(conn, &prisoner.id).await?;
    }

    sqlx::query(
        "INSERT INTO receptions
            (id, prisoner_id, person_name, decision, refusal_ground, decision_reason, instrument_kind, search_done,
             injuries_note, complaints_note, health_screen_note, rules_information_given, received_at, decided_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&reception_id)
    .bind(&prisoner_id)
    .bind(&person_name)
    .bind(&input.decision)
    .bind(&input.refusal_ground)
    .bind(&input.decision_reason)
    .bind(&input.instrument.kind)
    .bind(input.search_done)
    .bind(&input.injuries_note)
    .bind(&input.complaints_note)
    .bind(&input.health_screen_note)
    .bind(input.rules_information_given)
    .bind(input.received_at)
    .bind(&actor.name)
    .execute(&mut *conn)
    .await?;

    audit::record(
        conn,
        actor,
        AuditEntry::new(if refuse { "reception.refused" } else { "reception.accepted" }, "reception", Some(&reception_id))
            .workflow(&reception_id)
            .after(&serde_json::json!({
                "personName": person_name,
                "decision": input.decision,
                "prisonerId": prisoner_id,
                "instrumentKind": input.instrument.kind,
                "refusalGround": input.refusal_ground,
            }))
            .reason(input.decision_reason.as_deref().unwrap_or("")),
    )
    .await?;

    Ok(ReceptionResult { reception_id, decision: input.decision, prisoner: created })
}

// ---------------------------------------------------------------------
// The prisoner file: "what do I need to know about this person right now"
// ---------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrisonerFile {
    pub prisoner: Prisoner,
    pub stays: Vec<Stay>,
    pub clocks: sentences::Clocks,
    pub sentence: Option<sentences::Sentence>,
    pub instruments: Vec<instruments::Instrument>,
    pub contacts: Vec<Contact>,
    pub obligations: Vec<super::obligations::Obligation>,
    pub next_court_at: Option<i64>,
    pub open_transfer: Option<super::transfers::Transfer>,
}

pub async fn prisoner_file(pool: &SqlitePool, id: &str) -> Result<PrisonerFile, DomainError> {
    let now = super::time::now_ms();
    let prisoner = prisoners::get_prisoner(pool, id).await?.ok_or(DomainError::NotFound("That prisoner"))?;
    let sentence = sentences::active_for(pool, id).await?;
    let clocks = sentences::compute_clocks(&prisoner, sentence.as_ref(), now);
    let next_court_at: Option<i64> =
        sqlx::query_scalar("SELECT MIN(production_date) FROM court_productions WHERE prisoner_id = ? AND state = 'scheduled'").bind(id).fetch_one(pool).await?;
    let open_transfer = super::transfers::list_for_prisoner(pool, id)
        .await?
        .into_iter()
        .find(|t| t.direction == "out" && matches!(t.state.as_str(), "preparing" | "in_transit"));
    Ok(PrisonerFile {
        stays: list_stays(pool, id).await?,
        instruments: instruments::list_for_prisoner(pool, id).await?,
        contacts: list_contacts(pool, id).await?,
        obligations: super::obligations::for_prisoner(pool, id, now).await?,
        prisoner,
        sentence,
        clocks,
        next_court_at,
        open_transfer,
    })
}
