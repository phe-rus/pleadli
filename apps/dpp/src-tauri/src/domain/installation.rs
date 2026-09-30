//! What first-launch setup decided (docs/platform/REVIEW-2026-09-28.md §5.4):
//! country, language, office or headquarters, protection level, the
//! institution's colour and crest, and the licence accepted. Written once, in
//! one transaction, together with the first people; changed later only by an
//! administrator.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use super::audit::{self, Entry};
use super::error::{clean, invalid, DomainError};
use super::staff::{self, PersonInput, Protection};
use super::totp;

pub const LANGUAGES: [&str; 4] = ["en", "sw", "de", "fr"];
pub const ACCENTS: [&str; 8] = ["gold", "green", "blue", "navy", "teal", "maroon", "purple", "slate"];
/// A 1 MB image grows by a third as a data URL.
const MAX_LOGO_CHARS: usize = 1_400_000;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub jurisdiction: String,
    pub language: String,
    pub model: String,
    pub office_name: String,
    pub region: Option<String>,
    pub protection: String,
    pub accent: String,
    pub logo: Option<String>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupInput {
    pub licence_version: String,
    pub jurisdiction: String,
    pub language: String,
    pub model: String,
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
}

/// What any screen may show before sign-in: enough to brand it, nothing more.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Brand {
    pub installed: bool,
    pub office_name: Option<String>,
    pub model: Option<String>,
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
    /// The one person an older, profile-only installation already knew.
    pub existing: Option<ExistingPerson>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExistingPerson {
    pub name: String,
    pub rank: Option<String>,
    pub flag: bool,
}

const SELECT: &str = "SELECT jurisdiction, language, model, office_name, region, protection, accent, logo, licence_version, licence_accepted_at, licence_accepted_by, completed_at, updated_at FROM installation WHERE id = 'this'";

pub async fn get(pool: &SqlitePool) -> Result<Option<Installation>, sqlx::Error> {
    sqlx::query_as::<_, Installation>(SELECT).fetch_optional(pool).await
}

pub async fn brand(pool: &SqlitePool) -> Result<Brand, sqlx::Error> {
    Ok(match get(pool).await? {
        Some(i) => Brand {
            installed: true,
            office_name: Some(i.office_name),
            model: Some(i.model),
            jurisdiction: Some(i.jurisdiction),
            language: Some(i.language),
            accent: Some(i.accent),
            logo: i.logo,
        },
        None => Brand { installed: false, office_name: None, model: None, jurisdiction: None, language: None, accent: None, logo: None },
    })
}

pub async fn setup_status(pool: &SqlitePool) -> Result<SetupStatus, sqlx::Error> {
    let installed = get(pool).await?.is_some();
    let existing = if installed {
        None
    } else {
        sqlx::query_as::<_, (String, Option<String>, bool)>("SELECT name, rank, is_dpp FROM staff WHERE role = 'administrator' ORDER BY created_at LIMIT 1")
            .fetch_optional(pool)
            .await?
            .map(|(name, rank, flag)| ExistingPerson { name, rank, flag })
    };
    Ok(SetupStatus { installed, existing })
}

fn check_common(language: &str, accent: &str, logo: &Option<String>, office_name: &str) -> Result<(), DomainError> {
    if !LANGUAGES.contains(&language) {
        return invalid("That language is not available.");
    }
    if !ACCENTS.contains(&accent) {
        return invalid("That colour is not available.");
    }
    if office_name.trim().is_empty() {
        return invalid("The office needs a name.");
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
    if input.model != "office" && input.model != "headquarters" {
        return invalid("Choose an office or headquarters.");
    }
    if input.licence_version.trim().is_empty() {
        return invalid("The licence has to be accepted.");
    }
    check_common(&input.language, &input.accent, &input.logo, &input.office_name)?;
    let admin = &input.administrator.person;
    if admin.role != "administrator" {
        return invalid("The first person is the administrator.");
    }
    if protection == Protection::None && !input.people.is_empty() {
        return invalid("With no sign-in, only one person uses the installation.");
    }
    let admin_totp = match (protection, &input.administrator.second_factor) {
        (Protection::Full, Some(f)) if totp::verify(&f.secret, &f.code) => Some(f.secret.clone()),
        (Protection::Full, Some(_)) => return invalid("The code from the phone is not right. Check the phone's time and try the new code."),
        (Protection::Full, None) => return invalid("Full protection needs the administrator's phone linked."),
        _ => None,
    };

    let now = chrono::Utc::now().timestamp_millis();
    let mut tx = pool.begin().await?;
    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM installation").fetch_optional(&mut *tx).await?;
    if exists.is_some() {
        return Err(DomainError::Forbidden("This installation is already set up.".to_string()));
    }

    // An older installation already has its one prosecutor as an administrator
    // (migration 0020): setup completes that person instead of adding a twin.
    let legacy: Option<String> = sqlx::query_scalar("SELECT id FROM staff WHERE role = 'administrator' ORDER BY created_at LIMIT 1").fetch_optional(&mut *tx).await?;
    let admin_id = match legacy {
        Some(id) => {
            let secret = match (protection, admin.secret.as_deref()) {
                (Protection::None, _) => None,
                (_, Some(s)) => staff::hash_secret(protection, s)?,
                (_, None) => return invalid("A PIN or password is required."),
            };
            if admin.name.trim().is_empty() {
                return invalid("A name is required.");
            }
            sqlx::query("UPDATE staff SET name = ?, rank = ?, is_dpp = ?, secret_kind = ?, secret_hash = ?, totp_secret = ?, active = 1, updated_at = ? WHERE id = ?")
                .bind(admin.name.trim())
                .bind(clean(admin.rank.clone()))
                .bind(admin.is_dpp)
                .bind(secret.as_ref().map(|s| s.0))
                .bind(secret.as_ref().map(|s| s.1.clone()))
                .bind(admin_totp.as_deref())
                .bind(now)
                .bind(&id)
                .execute(&mut *tx)
                .await?;
            id
        }
        None => staff::insert(&mut tx, protection, admin, admin_totp.as_deref()).await?,
    };
    for person in &input.people {
        staff::insert(&mut tx, protection, person, None).await?;
    }

    sqlx::query(
        "INSERT INTO installation (id, jurisdiction, language, model, office_name, region, protection, accent, logo,
                                   licence_version, licence_accepted_at, licence_accepted_by, completed_at, updated_at)
         VALUES ('this', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&input.jurisdiction)
    .bind(&input.language)
    .bind(&input.model)
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

    // The protection level replaces the old optional app lock.
    sqlx::query("DELETE FROM security_settings WHERE key = 'lock_hash'").execute(&mut *tx).await?;
    // Setup is done by the administrator, so they are the one acting now.
    staff::set_active_session(&mut tx, &admin_id).await?;
    audit::record(
        &mut tx,
        Entry::new("setup_completed").detail(format!("{} {}, {}, protection {}, {} people", input.jurisdiction, input.model, input.office_name.trim(), protection.as_str(), 1 + input.people.len())),
    )
    .await?;
    tx.commit().await?;
    Ok(get(pool).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn update(pool: &SqlitePool, input: UpdateInstallationInput) -> Result<Installation, DomainError> {
    check_common(&input.language, &input.accent, &input.logo, &input.office_name)?;
    let found = sqlx::query("UPDATE installation SET office_name = ?, region = ?, language = ?, accent = ?, logo = ?, updated_at = ? WHERE id = 'this'")
        .bind(input.office_name.trim())
        .bind(clean(input.region))
        .bind(&input.language)
        .bind(&input.accent)
        .bind(&input.logo)
        .bind(chrono::Utc::now().timestamp_millis())
        .execute(pool)
        .await?
        .rows_affected();
    if found == 0 {
        return invalid("This installation is not set up yet.");
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
        return invalid("This installation is not set up yet.");
    }
    let _ = audit::log(pool, Entry::new("installation_changed").detail(format!("country {jurisdiction}"))).await;
    Ok(get(pool).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// Changes the protection level. The administrator gives their own new PIN or
/// password for the new level; everyone else gets theirs from the
/// administrator in People before they can sign in again.
pub async fn set_protection(pool: &SqlitePool, admin_id: &str, level: Protection, secret: Option<&str>) -> Result<Installation, DomainError> {
    if level != Protection::None {
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
