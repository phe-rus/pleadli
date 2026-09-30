//! The people of the practice, and who is signed in.
//!
//! The role is what the law lets a person do, not a job title: only an
//! `advocate` conducts proceedings, signs, files or issues (Advocates Act
//! s.64 and s.66: nobody else may act for a party or draw an instrument about
//! property or proceedings for a fee; s.67: the drawer's name goes on it). A
//! `paralegal` (a clerk, legal assistant or student) drafts for an advocate to
//! sign. `accounts` keeps the practice's money. Running the installation
//! (people, settings) is `is_admin`, separate from the role, so a paralegal who
//! works alone still administers their own copy.
//!
//! A PIN or password is kept only as an Argon2id hash; which of the two follows
//! the protection level (a 6-digit PIN for basic, 12+ characters and an
//! authenticator for full). With no protection nobody signs in and the first
//! administrator is always the person acting.

use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};

use super::error::{check_date, clean, invalid, DomainError};

pub const ROLES: [&str; 3] = ["advocate", "paralegal", "accounts"];
pub const MIN_PASSWORD: usize = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Protection {
    None,
    Basic,
    Full,
}

impl Protection {
    pub fn parse(text: &str) -> Option<Self> {
        match text {
            "none" => Some(Protection::None),
            "basic" => Some(Protection::Basic),
            "full" => Some(Protection::Full),
            _ => None,
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Protection::None => "none",
            Protection::Basic => "basic",
            Protection::Full => "full",
        }
    }
    /// The kind of secret a person needs under this level.
    pub fn secret_kind(self) -> Option<&'static str> {
        match self {
            Protection::None => None,
            Protection::Basic => Some("pin"),
            Protection::Full => Some("password"),
        }
    }
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Staff {
    pub id: String,
    pub name: String,
    pub title: Option<String>,
    pub role: String,
    pub is_admin: bool,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub practising_number: Option<String>,
    pub certificate_expires_on: Option<i64>,
    pub secret_kind: Option<String>,
    pub has_second_factor: bool,
    pub active: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

/// The person acting, as the rest of the app sees them.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Actor {
    pub id: String,
    pub name: String,
    pub title: Option<String>,
    pub role: String,
    pub is_admin: bool,
}

/// What the sign-in screen may show before anyone signs in: a name to pick.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInPerson {
    pub id: String,
    pub name: String,
    pub rank: Option<String>,
    pub secret_kind: String,
    pub needs_enrolment: bool,
}

/// A new person. `rank` is what the shared setup screens call a title.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonInput {
    pub name: String,
    #[serde(default, alias = "rank")]
    pub title: Option<String>,
    pub role: String,
    #[serde(default)]
    pub is_admin: bool,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub secret: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStaffInput {
    pub name: String,
    #[serde(default)]
    pub title: Option<String>,
    pub role: String,
    #[serde(default)]
    pub is_admin: bool,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub practising_number: Option<String>,
    #[serde(default)]
    pub certificate_expires_on: Option<i64>,
    pub active: bool,
}

macro_rules! select_staff {
    ($rest:literal) => {
        concat!(
            "SELECT id, name, title, role, is_admin, phone, email, practising_number, certificate_expires_on, secret_kind,
                    totp_secret IS NOT NULL AS has_second_factor, active, created_at, updated_at FROM staff ",
            $rest
        )
    };
}

macro_rules! select_actor {
    ($rest:literal) => {
        concat!("SELECT id, name, title, role, is_admin FROM staff ", $rest)
    };
}

pub fn hash_secret(protection: Protection, secret: &str) -> Result<Option<(&'static str, String)>, DomainError> {
    let Some(kind) = protection.secret_kind() else { return Ok(None) };
    match kind {
        "pin" if !(secret.len() == 6 && secret.bytes().all(|b| b.is_ascii_digit())) => return invalid("A PIN is exactly 6 digits."),
        "password" if secret.chars().count() < MIN_PASSWORD => return invalid(&format!("A password needs at least {MIN_PASSWORD} characters.")),
        _ => {}
    }
    let hash = Argon2::default()
        .hash_password(secret.as_bytes(), &SaltString::generate(&mut OsRng))
        .map_err(|_| DomainError::Invalid("That PIN or password could not be used.".to_string()))?
        .to_string();
    Ok(Some((kind, hash)))
}

pub fn secret_matches(hash: &str, secret: &str) -> bool {
    PasswordHash::new(hash).map(|parsed| Argon2::default().verify_password(secret.as_bytes(), &parsed).is_ok()).unwrap_or(false)
}

fn check_person(name: &str, role: &str) -> Result<(), DomainError> {
    if name.trim().is_empty() {
        return invalid("A name is required.");
    }
    if !ROLES.contains(&role) {
        return invalid("That role is not known.");
    }
    Ok(())
}

pub async fn list(pool: &SqlitePool) -> Result<Vec<Staff>, sqlx::Error> {
    sqlx::query_as::<_, Staff>(select_staff!("ORDER BY active DESC, is_admin DESC, role = 'advocate' DESC, name COLLATE NOCASE")).fetch_all(pool).await
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Staff>, sqlx::Error> {
    sqlx::query_as::<_, Staff>(select_staff!("WHERE id = ?")).bind(id).fetch_optional(pool).await
}

pub async fn actor(pool: &SqlitePool, id: &str) -> Result<Option<Actor>, sqlx::Error> {
    sqlx::query_as::<_, Actor>(select_actor!("WHERE id = ? AND active = 1")).bind(id).fetch_optional(pool).await
}

/// The first active administrator: the person acting when nobody signs in.
pub async fn first_administrator(pool: &SqlitePool) -> Result<Option<Actor>, sqlx::Error> {
    sqlx::query_as::<_, Actor>(select_actor!("WHERE is_admin = 1 AND active = 1 ORDER BY created_at LIMIT 1")).fetch_optional(pool).await
}

/// People who can sign in under this level: active, with the right kind of secret.
pub async fn sign_in_list(pool: &SqlitePool, protection: Protection) -> Result<Vec<SignInPerson>, sqlx::Error> {
    let Some(kind) = protection.secret_kind() else { return Ok(Vec::new()) };
    let rows: Vec<(String, String, Option<String>, bool)> = sqlx::query_as(
        "SELECT id, name, title, totp_secret IS NULL FROM staff WHERE active = 1 AND secret_kind = ? AND secret_hash IS NOT NULL ORDER BY name COLLATE NOCASE",
    )
    .bind(kind)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, name, rank, no_factor)| SignInPerson { id, name, rank, secret_kind: kind.to_string(), needs_enrolment: protection == Protection::Full && no_factor })
        .collect())
}

pub struct Credentials {
    pub secret_kind: Option<String>,
    pub secret_hash: Option<String>,
    pub totp_secret: Option<String>,
}

pub async fn credentials(pool: &SqlitePool, id: &str) -> Result<Option<Credentials>, sqlx::Error> {
    let row: Option<(Option<String>, Option<String>, Option<String>)> =
        sqlx::query_as("SELECT secret_kind, secret_hash, totp_secret FROM staff WHERE id = ? AND active = 1").bind(id).fetch_optional(pool).await?;
    Ok(row.map(|(secret_kind, secret_hash, totp_secret)| Credentials { secret_kind, secret_hash, totp_secret }))
}

pub async fn set_second_factor(pool: &SqlitePool, id: &str, secret: Option<&str>) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE staff SET totp_secret = ?, updated_at = ? WHERE id = ?").bind(secret).bind(chrono::Utc::now().timestamp_millis()).bind(id).execute(pool).await?;
    Ok(())
}

/// Adds a person inside a transaction the caller owns.
pub async fn insert(conn: &mut SqliteConnection, protection: Protection, input: &PersonInput, totp: Option<&str>) -> Result<String, DomainError> {
    check_person(&input.name, &input.role)?;
    let secret = match (protection, input.secret.as_deref()) {
        (Protection::None, _) => None,
        (_, Some(s)) => hash_secret(protection, s)?,
        (_, None) => return invalid("A PIN or password is required."),
    };
    let id = format!("staff-{}", uuid::Uuid::new_v4().simple());
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query(
        "INSERT INTO staff (id, name, title, role, is_admin, phone, email, secret_kind, secret_hash, totp_secret, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
    )
    .bind(&id)
    .bind(input.name.trim())
    .bind(clean(input.title.clone()))
    .bind(&input.role)
    .bind(input.is_admin)
    .bind(clean(input.phone.clone()))
    .bind(clean(input.email.clone()))
    .bind(secret.as_ref().map(|s| s.0))
    .bind(secret.as_ref().map(|s| s.1.clone()))
    .bind(totp)
    .bind(now)
    .bind(now)
    .execute(&mut *conn)
    .await?;
    Ok(id)
}

pub async fn create(pool: &SqlitePool, protection: Protection, input: PersonInput) -> Result<Staff, DomainError> {
    if protection == Protection::None {
        return invalid("With no sign-in, only one person uses this copy. Choose a protection level first.");
    }
    let mut conn = pool.acquire().await?;
    let id = insert(&mut conn, protection, &input, None).await?;
    drop(conn);
    Ok(get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn update(pool: &SqlitePool, id: &str, input: UpdateStaffInput) -> Result<Staff, DomainError> {
    check_person(&input.name, &input.role)?;
    if let Some(expires) = input.certificate_expires_on {
        check_date(expires, "The certificate's expiry")?;
    }
    let mut tx = pool.begin().await?;
    let found = sqlx::query(
        "UPDATE staff SET name = ?, title = ?, role = ?, is_admin = ?, phone = ?, email = ?, practising_number = ?, certificate_expires_on = ?, active = ?, updated_at = ?
         WHERE id = ?",
    )
    .bind(input.name.trim())
    .bind(clean(input.title))
    .bind(&input.role)
    .bind(input.is_admin)
    .bind(clean(input.phone))
    .bind(clean(input.email))
    .bind(clean(input.practising_number))
    .bind(input.certificate_expires_on)
    .bind(input.active)
    .bind(chrono::Utc::now().timestamp_millis())
    .bind(id)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if found == 0 {
        return Err(DomainError::NotFound("That person is not in this practice.".to_string()));
    }
    let admins: i64 = sqlx::query_scalar("SELECT count(*) FROM staff WHERE is_admin = 1 AND active = 1").fetch_one(&mut *tx).await?;
    if admins == 0 {
        return invalid("There must always be at least one active administrator.");
    }
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// Sets (or resets) a person's PIN or password for the current level.
pub async fn set_secret(pool: &SqlitePool, protection: Protection, id: &str, secret: &str) -> Result<(), DomainError> {
    let Some((kind, hash)) = hash_secret(protection, secret)? else { return invalid("Nobody signs in on this copy.") };
    let found = sqlx::query("UPDATE staff SET secret_kind = ?, secret_hash = ?, updated_at = ? WHERE id = ?")
        .bind(kind)
        .bind(hash)
        .bind(chrono::Utc::now().timestamp_millis())
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    if found == 0 {
        return Err(DomainError::NotFound("That person is not in this practice.".to_string()));
    }
    Ok(())
}

pub async fn set_active_session(conn: &mut SqliteConnection, staff_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO active_session (id, staff_id, signed_in_at) VALUES ('current', ?, ?)
         ON CONFLICT (id) DO UPDATE SET staff_id = excluded.staff_id, signed_in_at = excluded.signed_in_at",
    )
    .bind(staff_id)
    .bind(chrono::Utc::now().timestamp_millis())
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn clear_active_session(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM active_session").execute(pool).await?;
    Ok(())
}
