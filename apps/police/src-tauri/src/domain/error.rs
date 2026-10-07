//! The one error the newer domain modules return. Rules and authority checks
//! live here, on the server side of the API, so no client can skip them.

use std::fmt;

use super::officers::OfficerError;

#[derive(Debug)]
pub enum DomainError {
    /// The request is well formed but breaks a rule (422).
    Invalid(String),
    /// Not signed in, or the sign-in is not valid (401).
    Unauthorized(String),
    NotFound(String),
    /// Something already exists (409).
    Conflict(String),
    /// Too many wrong attempts; try again later (429).
    Slow(String),
    /// This officer must give a password before signing in (428). The body is
    /// `password`, or `choose_password` for an administrator who has none yet.
    NeedsPassword(&'static str),
    Db(sqlx::Error),
}

impl DomainError {
    pub fn rejected(message: &str) -> Self {
        DomainError::Invalid(message.to_string())
    }
}

impl fmt::Display for DomainError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DomainError::Invalid(m)
            | DomainError::Unauthorized(m)
            | DomainError::NotFound(m)
            | DomainError::Conflict(m)
            | DomainError::Slow(m) => write!(f, "{m}"),
            DomainError::NeedsPassword(m) => write!(f, "{m}"),
            DomainError::Db(e) => write!(f, "{e}"),
        }
    }
}

impl From<sqlx::Error> for DomainError {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => DomainError::NotFound("Record not found.".to_string()),
            other => DomainError::Db(other),
        }
    }
}

impl From<OfficerError> for DomainError {
    fn from(e: OfficerError) -> Self {
        match e {
            OfficerError::Invalid(m) => DomainError::Invalid(m),
            OfficerError::Db(db) if db.to_string().contains("officers.badge_number") => {
                DomainError::Conflict("That badge number is already in use.".to_string())
            }
            OfficerError::Db(db) => DomainError::from(db),
            OfficerError::Hash(m) => DomainError::Db(sqlx::Error::Protocol(m)),
        }
    }
}
