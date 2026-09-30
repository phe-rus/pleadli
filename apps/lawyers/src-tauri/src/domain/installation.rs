//! What first-launch setup decided (docs/lawyers/REVIEW-2026-09-30.md, 4.2):
//! country, language, alone or a firm, what kind of practice, its name and
//! region, protection level, colour and logo, the licence accepted, and the
//! kinds of work it does. Written once, in one transaction, with the first
//! people; changed later only by an administrator.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use super::audit::{self, Entry};
use super::error::{clean, invalid, DomainError};
use super::staff::{self, PersonInput, Protection};
use super::{totp, usages};

pub const LANGUAGES: [&str; 4] = ["en", "sw", "de", "fr"];
pub const ACCENTS: [&str; 8] = ["gold", "green", "blue", "navy", "teal", "maroon", "purple", "slate"];
pub const SETTINGS: [&str; 2] = ["alone", "firm"];
/// Private practice (any area), a government legal office (the Attorney
/// General's chambers, a ministry, a local government), a company's own legal
/// department, and a legal aid provider (a clinic, a paralegal service).
pub const PRACTICE_KINDS: [&str; 4] = ["private", "government", "in_house", "legal_aid"];
/// A 1 MB image grows by a third as a data URL.
const MAX_LOGO_CHARS: usize = 1_400_000;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub jurisdiction: String,
    pub language: String,
    pub setting: String,
    pub practice_kind: String,
    pub office_name: String,
    pub region: Option<String>,
    pub protection: String,
    pub accent: String,
    pub logo: Option<String>,
    /// The letterhead: what heads everything the practice files and sends.
    pub address: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    /// The practice's usual hourly rate in shillings, offered when time is billed.
    pub hourly_rate: Option<i64>,
    pub licence_version: String,
    pub licence_accepted_at: i64,
    pub licence_accepted_by: String,
    pub completed_at: i64,
    pub updated_at: i64,
}

impl Installation {
    pub fn protection_level(&self) -> Protection {
        Protection::parse(&self.protection).unwrap_or(Protection::Basic)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecondFactorInput {
    pub secret: String,
    pub code: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdministratorInput {
    #[serde(flatten)]
    pub person: PersonInput,
    #[serde(default)]
    pub second_factor: Option<SecondFactorInput>,
}

/// The practice's own answers, from the steps Lawyers adds to the shared setup.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeInput {
    pub setting: String,
    pub practice_kind: String,
    pub usages: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupInput {
    pub licence_version: String,
    pub jurisdiction: String,
    pub language: String,
    pub office_name: String,
    #[serde(default)]
    pub region: Option<String>,
    pub protection: String,
    pub accent: String,
    #[serde(default)]
    pub logo: Option<String>,
    pub administrator: AdministratorInput,
    #[serde(default)]
    pub people: Vec<PersonInput>,
    /// The shared setup package sends app-specific answers under `extra`.
    pub extra: PracticeInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInstallationInput {
    pub office_name: String,
    #[serde(default)]
    pub region: Option<String>,
    pub language: String,
    pub accent: String,
    #[serde(default)]
    pub logo: Option<String>,
    pub setting: String,
    pub practice_kind: String,
}

/// What any screen may show before sign-in: enough to brand it, nothing more.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Brand {
    pub installed: bool,
    pub office_name: Option<String>,
    pub setting: Option<String>,
    pub jurisdiction: Option<String>,
    pub language: Option<String>,
    pub accent: Option<String>,
    pub logo: Option<String>,
}

/// What setup needs to know about the data it is setting up.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    pub installed: bool,
    /// The one advocate an older, profile-only installation already knew.
    pub existing: Option<ExistingPerson>,
    /// Their firm's name from the old profile, to start the practice name with.
    pub existing_firm: Option<String>,
    /// Whether that older installation already holds matters (all criminal
    /// defence: the only kind the app had), so setup starts with that usage on.
    pub has_matters: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExistingPerson {
    pub name: String,
    pub rank: Option<String>,
    pub flag: bool,
}

const SELECT: &str = "SELECT jurisdiction, language, setting, practice_kind, office_name, region, protection, accent, logo, address, phone, email, hourly_rate, licence_version,
                             licence_accepted_at, licence_accepted_by, completed_at, updated_at FROM installation WHERE id = 'this'";

pub async fn get(pool: &SqlitePool) -> Result<Option<Installation>, sqlx::Error> {
    sqlx::query_as::<_, Installation>(SELECT).fetch_optional(pool).await
}

pub async fn brand(pool: &SqlitePool) -> Result<Brand, sqlx::Error> {
    Ok(match get(pool).await? {
        Some(i) => Brand {
            installed: true,
            office_name: Some(i.office_name),
            setting: Some(i.setting),
            jurisdiction: Some(i.jurisdiction),
            language: Some(i.language),
            accent: Some(i.accent),
            logo: i.logo,
        },
        None => Brand { installed: false, office_name: None, setting: None, jurisdiction: None, language: None, accent: None, logo: None },
    })
}

pub async fn setup_status(pool: &SqlitePool) -> Result<SetupStatus, sqlx::Error> {
    if get(pool).await?.is_some() {
        return Ok(SetupStatus { installed: true, existing: None, existing_firm: None, has_matters: false });
    }
    let existing = sqlx::query_as::<_, (String, Option<String>)>("SELECT name, title FROM staff WHERE is_admin = 1 ORDER BY created_at LIMIT 1")
        .fetch_optional(pool)
        .await?
        .map(|(name, rank)| ExistingPerson { name, rank, flag: false });
    let existing_firm: Option<String> = sqlx::query_scalar("SELECT firm FROM advocate_profile_before_staff LIMIT 1").fetch_optional(pool).await?.flatten();
    let matters: i64 = sqlx::query_scalar("SELECT count(*) FROM matters").fetch_one(pool).await?;
    Ok(SetupStatus { installed: false, existing, existing_firm, has_matters: matters > 0 })
}

fn check_common(language: &str, accent: &str, logo: &Option<String>, office_name: &str, setting: &str, practice_kind: &str) -> Result<(), DomainError> {
    if !LANGUAGES.contains(&language) {
        return invalid("That language is not available.");
    }
    if !ACCENTS.contains(&accent) {
        return invalid("That colour is not available.");
    }
    if office_name.trim().is_empty() {
        return invalid("The practice needs a name.");
    }
    if !SETTINGS.contains(&setting) {
        return invalid("Choose whether you work alone or in a firm.");
    }
    if !PRACTICE_KINDS.contains(&practice_kind) {
        return invalid("That kind of practice is not known.");
    }
    if let Some(logo) = logo {
        let ok_kind = ["data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,", "data:image/svg+xml;base64,"].iter().any(|p| logo.starts_with(p));
        if !ok_kind || logo.len() > MAX_LOGO_CHARS {
            return invalid("The logo must be a PNG, JPG, SVG or WebP image of at most 1 MB.");
        }
    }
    Ok(())
}

pub async fn complete_setup(pool: &SqlitePool, input: SetupInput) -> Result<Installation, DomainError> {
    let protection = Protection::parse(&input.protection).ok_or_else(|| DomainError::Invalid("That protection level is not known.".to_string()))?;
    if !(input.jurisdiction.len() == 2 && input.jurisdiction.bytes().all(|b| b.is_ascii_lowercase())) {
        return invalid("That country is not known.");
    }
    if input.licence_version.trim().is_empty() {
        return invalid("The licence has to be accepted.");
    }
    let practice = &input.extra;
    check_common(&input.language, &input.accent, &input.logo, &input.office_name, &practice.setting, &practice.practice_kind)?;
    usages::check(&practice.usages)?;
    let admin = &input.administrator.person;
    if admin.role == "accounts" {
        return invalid("The person setting up is an advocate or a paralegal.");
    }
    if protection == Protection::None && !input.people.is_empty() {
        return invalid("With no sign-in, only one person uses this copy.");
    }
    if practice.setting == "alone" && !input.people.is_empty() {
        return invalid("Working alone, you are the only person. Choose a firm to add people.");
    }
    let admin_totp = match (protection, &input.administrator.second_factor) {
        (Protection::Full, Some(f)) if totp::verify(&f.secret, &f.code) => Some(f.secret.clone()),
        (Protection::Full, Some(_)) => return invalid("The code from the phone is not right. Check the phone's time and try the new code."),
        (Protection::Full, None) => return invalid("Full protection needs your phone linked."),
        _ => None,
    };

    let now = chrono::Utc::now().timestamp_millis();
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM installation").fetch_optional(&mut *tx).await?;
    if exists.is_some() {
        return Err(DomainError::Forbidden("This copy is already set up.".to_string()));
    }

    // An older installation already has its advocate as an administrator
    // (migration 0008): setup completes that person instead of adding a twin.
    let legacy: Option<String> = sqlx::query_scalar("SELECT id FROM staff WHERE is_admin = 1 ORDER BY created_at LIMIT 1").fetch_optional(&mut *tx).await?;
    let admin_id = match legacy {
        Some(id) => {
            if admin.name.trim().is_empty() {
                return invalid("A name is required.");
            }
            let secret = match (protection, admin.secret.as_deref()) {
                (Protection::None, _) => None,
                (_, Some(s)) => staff::hash_secret(protection, s)?,
                (_, None) => return invalid("A PIN or password is required."),
            };
            sqlx::query("UPDATE staff SET name = ?, title = ?, role = ?, secret_kind = ?, secret_hash = ?, totp_secret = ?, active = 1, updated_at = ? WHERE id = ?")
                .bind(admin.name.trim())
                .bind(clean(admin.title.clone()))
                .bind(&admin.role)
                .bind(secret.as_ref().map(|s| s.0))
                .bind(secret.as_ref().map(|s| s.1.clone()))
                .bind(admin_totp.as_deref())
                .bind(now)
                .bind(&id)
                .execute(&mut *tx)
                .await?;
            id
        }
        None => {
            let first = PersonInput { is_admin: true, ..admin.clone() };
            staff::insert(&mut tx, protection, &first, admin_totp.as_deref()).await?
        }
    };
    for person in &input.people {
        let person = PersonInput { is_admin: false, ..person.clone() };
        staff::insert(&mut tx, protection, &person, None).await?;
    }
    usages::replace(&mut tx, &practice.usages).await?;

    sqlx::query(
        "INSERT INTO installation (id, jurisdiction, language, setting, practice_kind, office_name, region, protection, accent, logo,
                                   licence_version, licence_accepted_at, licence_accepted_by, completed_at, updated_at)
         VALUES ('this', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&input.jurisdiction)
    .bind(&input.language)
    .bind(&practice.setting)
    .bind(&practice.practice_kind)
    .bind(input.office_name.trim())
    .bind(clean(input.region.clone()))
    .bind(protection.as_str())
    .bind(&input.accent)
    .bind(&input.logo)
    .bind(input.licence_version.trim())
    .bind(now)
    .bind(admin.name.trim())
    .bind(now)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    // The protection level replaces the old optional PIN lock (spec 0001).
    sqlx::query("UPDATE app_lock SET enabled = 0, pin_hash = NULL, recovery_code_hash = NULL, failed_attempts = 0, locked_until = NULL").execute(&mut *tx).await?;
    // Whoever set it up is the one acting now.
    staff::set_active_session(&mut tx, &admin_id).await?;
    audit::record(
        &mut tx,
        Entry::new("setup_completed").detail(format!(
            "{} {} {}, {}, protection {}, {} people, {}",
            input.jurisdiction,
            practice.setting,
            practice.practice_kind,
            input.office_name.trim(),
            protection.as_str(),
            1 + input.people.len(),
            practice.usages.join(", ")
        )),
    )
    .await?;
    tx.commit().await?;
    Ok(get(pool).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn update(pool: &SqlitePool, input: UpdateInstallationInput) -> Result<Installation, DomainError> {
    check_common(&input.language, &input.accent, &input.logo, &input.office_name, &input.setting, &input.practice_kind)?;
    if input.setting == "alone" {
        let others: i64 = sqlx::query_scalar("SELECT count(*) FROM staff WHERE active = 1").fetch_one(pool).await?;
        if others > 1 {
            return invalid("Other people still use this copy. Make them inactive in People first.");
        }
    }
    let found = sqlx::query("UPDATE installation SET office_name = ?, region = ?, language = ?, accent = ?, logo = ?, setting = ?, practice_kind = ?, updated_at = ? WHERE id = 'this'")
        .bind(input.office_name.trim())
        .bind(clean(input.region))
        .bind(&input.language)
        .bind(&input.accent)
        .bind(&input.logo)
        .bind(&input.setting)
        .bind(&input.practice_kind)
        .bind(chrono::Utc::now().timestamp_millis())
        .execute(pool)
        .await?
        .rows_affected();
    if found == 0 {
        return invalid("This copy is not set up yet.");
    }
    let _ = audit::log(pool, Entry::new("installation_changed")).await;
    Ok(get(pool).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// Moves the installation to another country (development builds only; the
/// API refuses it in a release). The region is the new country's, or none.
pub async fn set_jurisdiction(pool: &SqlitePool, jurisdiction: &str, region: Option<String>) -> Result<Installation, DomainError> {
    if !(jurisdiction.len() == 2 && jurisdiction.bytes().all(|b| b.is_ascii_lowercase())) {
        return invalid("Choose a country.");
    }
    let found = sqlx::query("UPDATE installation SET jurisdiction = ?, region = ?, updated_at = ? WHERE id = 'this'")
        .bind(jurisdiction)
        .bind(clean(region))
        .bind(chrono::Utc::now().timestamp_millis())
        .execute(pool)
        .await?
        .rows_affected();
    if found == 0 {
        return invalid("This copy is not set up yet.");
    }
    let _ = audit::log(pool, Entry::new("installation_changed").detail(format!("country {jurisdiction}"))).await;
    Ok(get(pool).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// Changes the protection level. The administrator gives their own new PIN or
/// password for it; everyone else gets theirs from the administrator in People.
pub async fn set_protection(pool: &SqlitePool, admin_id: &str, level: Protection, secret: Option<&str>) -> Result<Installation, DomainError> {
    if level == Protection::None {
        let others: i64 = sqlx::query_scalar("SELECT count(*) FROM staff WHERE active = 1").fetch_one(pool).await?;
        if others > 1 {
            return invalid("With no sign-in only one person can use this copy. Make the others inactive first.");
        }
    } else {
        let secret = secret.ok_or_else(|| DomainError::Invalid("Give your new PIN or password.".to_string()))?;
        staff::set_secret(pool, level, admin_id, secret).await?;
        if level == Protection::Full {
            // A password without the phone: they link it at the next sign-in.
            staff::set_second_factor(pool, admin_id, None).await?;
        }
    }
    sqlx::query("UPDATE installation SET protection = ?, updated_at = ? WHERE id = 'this'").bind(level.as_str()).bind(chrono::Utc::now().timestamp_millis()).execute(pool).await?;
    let _ = audit::log(pool, Entry::new("protection_changed").detail(level.as_str())).await;
    Ok(get(pool).await?.ok_or(sqlx::Error::RowNotFound)?)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactsInput {
    pub address: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
}

/// The practice's letterhead: address, phone and email.
pub async fn set_contacts(pool: &SqlitePool, input: ContactsInput) -> Result<Installation, DomainError> {
    sqlx::query("UPDATE installation SET address = ?, phone = ?, email = ?, updated_at = ? WHERE id = 'this'")
        .bind(clean(input.address))
        .bind(clean(input.phone))
        .bind(clean(input.email))
        .bind(chrono::Utc::now().timestamp_millis())
        .execute(pool)
        .await?;
    let _ = audit::log(pool, Entry::new("installation_changed").detail("letterhead")).await;
    Ok(get(pool).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// A signature or stamp image: PNG, JPEG or WebP, small enough to travel in
/// every filed document. None removes it.
pub fn check_seal(image: &Option<String>) -> Result<(), DomainError> {
    if let Some(image) = image {
        let ok = ["data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,"].iter().any(|p| image.starts_with(p));
        if !ok || image.len() > 560_000 {
            return invalid("A signature or stamp is a PNG, JPG or WebP image of at most 400 KB.");
        }
    }
    Ok(())
}
