//! The one error the domain layer returns. Validation and authority checks
//! belong here, on the server side of the API, so no client can skip them.

use std::fmt;

#[derive(Debug)]
pub enum DomainError {
    /// The request is well formed but breaks a rule (422).
    Invalid(String),
    /// The installation's prosecutor may not do this (403).
    Forbidden(String),
    NotFound(String),
    Db(sqlx::Error),
}

impl fmt::Display for DomainError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DomainError::Invalid(m) | DomainError::Forbidden(m) | DomainError::NotFound(m) => write!(f, "{m}"),
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

pub fn invalid<T>(message: &str) -> Result<T, DomainError> {
    Err(DomainError::Invalid(message.to_string()))
}

/// Trims, and turns an empty string into `None`.
pub fn clean(value: Option<String>) -> Option<String> {
    value.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

/// A real-world timestamp (milliseconds) may be back-dated but not set in the
/// future beyond a day's clock skew, and must be positive.
pub fn check_timestamp(value: i64, what: &str) -> Result<(), DomainError> {
    let now = chrono::Utc::now().timestamp_millis();
    if value <= 0 || value > now + 86_400_000 {
        return Err(DomainError::Invalid(format!("{what} is not a valid date.")));
    }
    Ok(())
}
