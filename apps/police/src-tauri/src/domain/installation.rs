//! What this installation is, made once at first launch: a Station or a
//! Command (HQ). See docs/police/HQ-FACILITY.md.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use super::error::DomainError;
use super::officers::{self, CreateOfficerInput, Officer};
use super::sessions;

pub const COMMAND_LEVELS: [&str; 3] = ["region", "district", "headquarters"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationState {
    /// Whether first-launch setup has been done.
    pub installed: bool,
    pub mode: Option<String>,
    pub command_level: Option<String>,
    /// No administrator can sign in yet (a new installation, or an existing
    /// one whose officers have no badge): setup is the only thing available.
    pub needs_administrator: bool,
    /// Who needs what to sign in: `badge_only` or `password`. A Command is
    /// always `password`, whatever the policy row says.
    pub auth_mode: String,
    pub name: Option<String>,
    /// Officers already on the books, offered as the administrator when an
    /// older installation is set up.
    pub existing_officers: Vec<ExistingOfficer>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExistingOfficer {
    pub id: String,
    pub name: String,
    pub rank: Option<String>,
    pub badge_number: Option<String>,
}

pub async fn mode(pool: &SqlitePool) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar("SELECT mode FROM installation WHERE id = 'default'").fetch_optional(pool).await
}

/// The sign-in requirement in force. A Command always needs a password.
pub async fn effective_auth_mode(pool: &SqlitePool) -> Result<String, sqlx::Error> {
    let policy: String = sqlx::query_scalar("SELECT mode FROM auth_policy WHERE id = 'default'").fetch_one(pool).await?;
    if mode(pool).await?.as_deref() == Some("command") && policy == "badge_only" {
        return Ok("password".to_string());
    }
    Ok(policy)
}

pub async fn state(pool: &SqlitePool) -> Result<InstallationState, sqlx::Error> {
    let row: Option<(String, Option<String>)> = sqlx::query_as("SELECT mode, command_level FROM installation WHERE id = 'default'").fetch_optional(pool).await?;
    let (mode, command_level) = match row {
        Some((mode, level)) => (Some(mode), level),
        None => (None, None),
    };
    let admins: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM officers WHERE role = 'admin' AND active = 1 AND badge_number IS NOT NULL").fetch_one(pool).await?;
    let name: Option<String> = match mode.as_deref() {
        Some("station") => sqlx::query_scalar("SELECT name FROM station_profile WHERE id = 'default'").fetch_optional(pool).await?.flatten(),
        _ => None,
    };
    let existing: Vec<ExistingOfficer> = if mode.is_none() {
        sqlx::query_as::<_, (String, String, Option<String>, Option<String>)>("SELECT id, name, rank, badge_number FROM officers WHERE active = 1 ORDER BY name")
            .fetch_all(pool)
            .await?
            .into_iter()
            .map(|(id, name, rank, badge_number)| ExistingOfficer { id, name, rank, badge_number })
            .collect()
    } else {
        Vec::new()
    };
    Ok(InstallationState {
        installed: mode.is_some(),
        auth_mode: effective_auth_mode(pool).await?,
        needs_administrator: admins == 0,
        mode,
        command_level,
        name,
        existing_officers: existing,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdministratorInput {
    /// An officer already on the books to make the administrator, or none
    /// to create one.
    pub existing_officer_id: Option<String>,
    pub name: Option<String>,
    pub rank: Option<String>,
    pub badge_number: String,
    /// Required, at least 8 characters: an administrator always signs in with a
    /// password, on a Station on badges too.
    pub password: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationSetupInput {
    pub station_name: String,
    pub region: Option<String>,
    pub district: Option<String>,
    pub division: Option<String>,
    pub administrator: AdministratorInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandSetupInput {
    pub command_name: String,
    pub level: String,
    pub administrator: AdministratorInput,
}

/// Makes the administrator officer: an existing one is given the admin role and
/// the badge typed; otherwise a new one is created.
async fn make_administrator(pool: &SqlitePool, input: &AdministratorInput, with_password: bool) -> Result<Officer, DomainError> {
    let badge = input.badge_number.trim();
    if badge.is_empty() {
        return Err(DomainError::rejected("The administrator needs a badge number."));
    }
    let password = input.password.as_deref().map(str::trim).filter(|p| !p.is_empty());
    if with_password && password.is_none_or(|p| p.chars().count() < 8) {
        return Err(DomainError::rejected("A password of at least 8 characters is needed."));
    }
    let password = if with_password { password.map(str::to_string) } else { None };

    if let Some(id) = &input.existing_officer_id {
        let existing = officers::get_officer(pool, id).await?.ok_or_else(|| DomainError::rejected("That officer is not on the books."))?;
        let update = officers::UpdateOfficerInput {
            badge_number: Some(badge.to_string()),
            name: existing.name,
            rank: existing.rank,
            post: existing.post,
            role: "admin".to_string(),
            active: true,
            notes: existing.notes,
            person_id: existing.person_id,
            password,
        };
        return officers::update_officer(pool, id, update).await.map_err(Into::into);
    }

    let name = input.name.as_deref().map(str::trim).unwrap_or_default();
    if name.is_empty() {
        return Err(DomainError::rejected("The administrator needs a name."));
    }
    officers::create_officer(
        pool,
        CreateOfficerInput {
            badge_number: Some(badge.to_string()),
            name: name.to_string(),
            rank: input.rank.clone(),
            post: None,
            role: "admin".to_string(),
            notes: None,
            person_id: None,
            password,
        },
    )
    .await
    .map_err(Into::into)
}

async fn refuse_if_installed(pool: &SqlitePool) -> Result<(), DomainError> {
    if mode(pool).await?.is_some() {
        return Err(DomainError::rejected("This installation is already set up."));
    }
    Ok(())
}

/// Sets up a Station: names it, records where it sits, makes the first
/// administrator, and signs them in. Returns the session token and officer.
pub async fn setup_station(pool: &SqlitePool, input: StationSetupInput) -> Result<(String, Officer), DomainError> {
    refuse_if_installed(pool).await?;
    let name = input.station_name.trim();
    if name.is_empty() {
        return Err(DomainError::rejected("The station needs a name."));
    }
    let admin = make_administrator(pool, &input.administrator, true).await?;

    sqlx::query(
        "INSERT INTO station_profile (id, name) VALUES ('default', ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name",
    )
    .bind(name)
    .execute(pool)
    .await?;
    super::units::save_chain(
        pool,
        super::units::SaveChainInput { region: input.region, district: input.district, division: input.division },
    )
    .await?;
    sqlx::query("INSERT INTO installation (id, mode) VALUES ('default', 'station')").execute(pool).await?;
    super::auth::record_event(pool, Some(&admin), Some(admin.badge_number.as_deref().unwrap_or_default()), "installed", Some("Station set up")).await?;

    let token = sessions::create(pool, &admin.id).await?;
    Ok((token, admin))
}

/// Sets up a Command (HQ). Its administrator has a badge and a password.
pub async fn setup_command(pool: &SqlitePool, input: CommandSetupInput) -> Result<(String, Officer), DomainError> {
    refuse_if_installed(pool).await?;
    let name = input.command_name.trim();
    if name.is_empty() {
        return Err(DomainError::rejected("The command needs a name."));
    }
    if !COMMAND_LEVELS.contains(&input.level.as_str()) {
        return Err(DomainError::rejected("Choose region, district or headquarters."));
    }
    let admin = make_administrator(pool, &input.administrator, true).await?;

    // The command's name is held on its own unit, the same tree a station
    // places itself in.
    sqlx::query("INSERT INTO station_profile (id, name) VALUES ('default', ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name")
        .bind(name)
        .execute(pool)
        .await?;
    sqlx::query("INSERT INTO installation (id, mode, command_level) VALUES ('default', 'command', ?)").bind(&input.level).execute(pool).await?;
    super::auth::record_event(pool, Some(&admin), admin.badge_number.as_deref(), "installed", Some("Command set up")).await?;

    let token = sessions::create(pool, &admin.id).await?;
    Ok((token, admin))
}

/// Dev builds only: flips an installed installation between Station and
/// Command. A Command signs in with a password, so the administrator making the
/// change must already have one, or they could not sign in again. Compiled out
/// of release builds.
#[cfg(debug_assertions)]
pub async fn set_dev_mode(pool: &SqlitePool, officer_id: &str, new_mode: &str) -> Result<(), DomainError> {
    if !["station", "command"].contains(&new_mode) {
        return Err(DomainError::rejected("Choose station or command."));
    }
    if mode(pool).await?.is_none() {
        return Err(DomainError::rejected("Set this installation up first."));
    }
    if new_mode == "command" {
        let has_password: bool = sqlx::query_scalar("SELECT COALESCE(password_hash, '') <> '' FROM officers WHERE id = ?")
            .bind(officer_id)
            .fetch_optional(pool)
            .await?
            .unwrap_or(false);
        if !has_password {
            return Err(DomainError::rejected("A command signs in with a password. Give your account a password first (Officers), then switch."));
        }
    }
    sqlx::query("UPDATE installation SET mode = ?, command_level = CASE WHEN ? = 'command' THEN COALESCE(command_level, 'district') ELSE NULL END WHERE id = 'default'")
        .bind(new_mode)
        .bind(new_mode)
        .execute(pool)
        .await?;
    Ok(())
}

// ---- Setup from the shared flow: a name, a protection level, an administrator
// with a secret (and an authenticator when the protection is full), and the
// other officers. Station or command, the same screens.

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedFactor {
    pub secret: String,
    pub code: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedPerson {
    pub name: String,
    pub rank: Option<String>,
    pub role: String,
    /// The badge number.
    pub identifier: Option<String>,
    pub secret: Option<String>,
    pub second_factor: Option<SharedFactor>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedSetup {
    pub office_name: String,
    pub region: Option<String>,
    /// `office` (a station) or `headquarters` (a command).
    pub model: String,
    /// `basic` (a 6-digit PIN) or `full` (a password and an authenticator code).
    pub protection: String,
    pub administrator: SharedPerson,
    #[serde(default)]
    pub people: Vec<SharedPerson>,
}

fn check_shared_secret(protection: &str, secret: Option<&str>, who: &str) -> Result<String, DomainError> {
    let s = secret.map(str::trim).unwrap_or_default();
    if protection == "basic" {
        if !(s.len() == 6 && s.chars().all(|c| c.is_ascii_digit())) {
            return Err(DomainError::rejected(&format!("{who} needs a PIN of exactly 6 digits.")));
        }
    } else if s.chars().count() < 8 {
        return Err(DomainError::rejected(&format!("{who} needs a password of at least 8 characters.")));
    }
    Ok(s.to_string())
}

pub async fn setup_shared(pool: &SqlitePool, input: SharedSetup) -> Result<(String, Officer), DomainError> {
    refuse_if_installed(pool).await?;
    let name = input.office_name.trim();
    if name.is_empty() {
        return Err(DomainError::rejected("The office needs a name."));
    }
    if !["basic", "full"].contains(&input.protection.as_str()) {
        return Err(DomainError::rejected("Choose a PIN, or a password with an authenticator."));
    }
    let command = match input.model.as_str() {
        "office" => false,
        "headquarters" => true,
        _ => return Err(DomainError::rejected("Choose a station or a headquarters.")),
    };
    let admin_in = &input.administrator;
    let badge = admin_in.identifier.as_deref().map(str::trim).filter(|b| !b.is_empty()).ok_or_else(|| DomainError::rejected("The administrator needs a badge number."))?;
    if admin_in.name.trim().is_empty() {
        return Err(DomainError::rejected("The administrator needs a name."));
    }
    let admin_secret = check_shared_secret(&input.protection, admin_in.secret.as_deref(), "The administrator")?;
    let factor = if input.protection == "full" {
        let f = admin_in.second_factor.as_ref().ok_or_else(|| DomainError::rejected("Link the authenticator app before finishing."))?;
        if !super::totp::verify(&f.secret, &f.code) {
            return Err(DomainError::rejected("The code from the phone is not right."));
        }
        Some(f.secret.clone())
    } else {
        None
    };
    let mut others = Vec::new();
    for p in &input.people {
        if p.name.trim().is_empty() {
            continue;
        }
        let b = p.identifier.as_deref().map(str::trim).filter(|b| !b.is_empty()).ok_or_else(|| DomainError::rejected(&format!("{} needs a badge number.", p.name.trim())))?;
        let s = check_shared_secret(&input.protection, p.secret.as_deref(), p.name.trim())?;
        others.push((p, b.to_string(), s));
    }

    let admin = officers::create_officer(
        pool,
        CreateOfficerInput { badge_number: Some(badge.to_string()), name: admin_in.name.trim().to_string(), rank: admin_in.rank.clone(), post: None, role: "admin".to_string(), notes: None, person_id: None, password: Some(admin_secret) },
    )
    .await?;
    if let Some(key) = &factor {
        sqlx::query("UPDATE officers SET totp_secret = ? WHERE id = ?").bind(key).bind(&admin.id).execute(pool).await?;
    }
    for (p, b, s) in others {
        let role = if p.role == "admin" { "officer".to_string() } else { p.role.clone() };
        officers::create_officer(pool, CreateOfficerInput { badge_number: Some(b), name: p.name.trim().to_string(), rank: p.rank.clone(), post: None, role, notes: None, person_id: None, password: Some(s) }).await?;
    }

    sqlx::query("INSERT INTO station_profile (id, name) VALUES ('default', ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name").bind(name).execute(pool).await?;
    if command {
        sqlx::query("INSERT INTO installation (id, mode, command_level) VALUES ('default', 'command', 'headquarters')").execute(pool).await?;
    } else {
        super::units::save_chain(pool, super::units::SaveChainInput { region: input.region.clone(), district: None, division: None }).await?;
        sqlx::query("INSERT INTO installation (id, mode) VALUES ('default', 'station')").execute(pool).await?;
    }
    let policy = if input.protection == "basic" { "pin" } else { "full" };
    sqlx::query("UPDATE auth_policy SET mode = ?, updated_at = ? WHERE id = 'default'").bind(policy).bind(super::time::now_ms()).execute(pool).await?;
    super::auth::record_event(pool, Some(&admin), admin.badge_number.as_deref(), "installed", Some(if command { "Command set up" } else { "Station set up" })).await?;

    let token = sessions::create(pool, &admin.id).await?;
    Ok((token, admin))
}
