//! The error shared by the custody-spine domains (reception, instruments,
//! sentences, discharge, transfers). `Rejected` carries a message written for
//! the officer, not the schema.

use std::fmt;

#[derive(Debug)]
pub enum DomainError {
    Db(sqlx::Error),
    NotFound(&'static str),
    Rejected(String),
    Conflict { code: &'static str, message: String },
}

impl DomainError {
    pub fn rejected(message: impl Into<String>) -> Self {
        DomainError::Rejected(message.into())
    }

    pub fn conflict(code: &'static str, message: impl Into<String>) -> Self {
        DomainError::Conflict { code, message: message.into() }
    }
}

impl From<sqlx::Error> for DomainError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::RowNotFound => DomainError::NotFound("That record"),
            other => DomainError::Db(other),
        }
    }
}

impl fmt::Display for DomainError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DomainError::Db(e) => write!(f, "{e}"),
            DomainError::NotFound(what) => write!(f, "{what} was not found."),
            DomainError::Rejected(m) => write!(f, "{m}"),
            DomainError::Conflict { message, .. } => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for DomainError {}
