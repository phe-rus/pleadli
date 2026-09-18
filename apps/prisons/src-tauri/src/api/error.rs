//! One error shape for the whole API: `{ "code": "...", "message": "..." }`.
//! Codes are stable and safe to branch on; messages are for people.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

use crate::domain::activation::ActivationError;
use crate::domain::attachments::AttachmentError;
use crate::domain::authz::Forbidden;
use crate::domain::backup::BackupError;
use crate::domain::facilities::{FacilityError, VerifyFacilityError};
use crate::domain::nodeconfig::ConnectError;
use crate::domain::officers::{OfficerError, OfficerErrorPayload};
use crate::domain::peer::PairError;
use crate::domain::error::DomainError;
use crate::domain::releases::ReleaseError;

#[derive(Debug, Serialize)]
pub struct ApiError {
    #[serde(skip)]
    pub status: StatusCode,
    pub code: String,
    pub message: String,
}

impl ApiError {
    pub fn new(status: StatusCode, code: &str, message: &str) -> Self {
        ApiError { status, code: code.to_string(), message: message.to_string() }
    }

    pub fn unauthenticated() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "UNAUTHENTICATED", "Sign in to continue.")
    }

    pub fn device_not_enrolled() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "DEVICE_NOT_ENROLLED", "This workstation is not enrolled with the facility node.")
    }

    pub fn local_only() -> Self {
        Self::new(StatusCode::FORBIDDEN, "LOCAL_ONLY", "This step can only be done on the machine that runs the node.")
    }

    pub fn not_found(what: &str) -> Self {
        Self::new(StatusCode::NOT_FOUND, "NOT_FOUND", &format!("{what} was not found."))
    }

    pub fn bad_request(message: &str) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "BAD_REQUEST", message)
    }

    pub fn conflict(code: &str, message: &str) -> Self {
        Self::new(StatusCode::CONFLICT, code, message)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(&self)).into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(err: sqlx::Error) -> Self {
        let text = err.to_string();
        match err {
            sqlx::Error::RowNotFound => ApiError::new(StatusCode::NOT_FOUND, "NOT_FOUND", "That record was not found."),
            _ if text.contains("UNIQUE constraint failed") => {
                ApiError::conflict("CONFLICT", "That record already exists.")
            }
            _ if text.contains("FOREIGN KEY constraint failed") => {
                ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, "REFERENCE_INVALID", "That refers to a record that does not exist.")
            }
            _ => {
                // The detail stays in the log; the caller gets nothing that
                // describes the schema.
                log::error!("database error: {text}");
                ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "DB_ERROR", "A database error occurred.")
            }
        }
    }
}

impl From<Forbidden> for ApiError {
    fn from(f: Forbidden) -> Self {
        ApiError::new(StatusCode::FORBIDDEN, "FORBIDDEN", &f.to_string())
    }
}

impl From<OfficerError> for ApiError {
    fn from(err: OfficerError) -> Self {
        let payload = OfficerErrorPayload::from(err);
        let status = match payload.code.as_str() {
            "INVALID_CREDENTIALS" => StatusCode::UNAUTHORIZED,
            "BADGE_TAKEN" | "LAST_ADMIN_GUARD" | "ALREADY_INITIALISED" => StatusCode::CONFLICT,
            "NOT_FOUND" => StatusCode::NOT_FOUND,
            "INVALID_ROLE" | "WEAK_PASSWORD" => StatusCode::UNPROCESSABLE_ENTITY,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        ApiError { status, code: payload.code, message: payload.message }
    }
}

impl From<ReleaseError> for ApiError {
    fn from(err: ReleaseError) -> Self {
        let message = err.to_string();
        match err {
            ReleaseError::Db(e) => e.into(),
            ReleaseError::NotInCustody => ApiError::conflict("NOT_IN_CUSTODY", &message),
            ReleaseError::GatesUnmet(_) => ApiError::conflict("DISCHARGE_GATES_UNMET", &message),
            ReleaseError::ExceptionNeedsAuthority => ApiError::new(StatusCode::FORBIDDEN, "EXCEPTION_NEEDS_OIC", &message),
            ReleaseError::ExceptionReasonRequired => {
                ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, "EXCEPTION_REASON_REQUIRED", &message)
            }
        }
    }
}

impl From<DomainError> for ApiError {
    fn from(err: DomainError) -> Self {
        match err {
            DomainError::Db(e) => e.into(),
            DomainError::NotFound(what) => ApiError::not_found(what),
            DomainError::Rejected(message) => ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, "REJECTED", &message),
            DomainError::Conflict { code, message } => ApiError::conflict(code, &message),
        }
    }
}

impl From<AttachmentError> for ApiError {
    fn from(err: AttachmentError) -> Self {
        match err {
            AttachmentError::Db(e) => e.into(),
            AttachmentError::Rejected(reason) => ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, "DOCUMENT_REJECTED", &reason),
            AttachmentError::Io(e) => {
                log::error!("vault error: {e}");
                ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "VAULT_ERROR", "The document store could not be read or written.")
            }
        }
    }
}

impl From<FacilityError> for ApiError {
    fn from(err: FacilityError) -> Self {
        match err {
            FacilityError::Db(e) => e.into(),
            FacilityError::NotFound => ApiError::not_found("That facility"),
            FacilityError::NotPending => ApiError::conflict("NOT_PENDING", "That facility is not waiting for verification."),
        }
    }
}

impl From<VerifyFacilityError> for ApiError {
    fn from(err: VerifyFacilityError) -> Self {
        match err {
            VerifyFacilityError::Db(e) => e.into(),
            VerifyFacilityError::NotFound => ApiError::not_found("That facility"),
            VerifyFacilityError::InvalidOrExpired => {
                ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, "INVALID_CODE", "That code is invalid or has expired.")
            }
        }
    }
}

impl From<ActivationError> for ApiError {
    fn from(err: ActivationError) -> Self {
        match err {
            ActivationError::Db(e) => e.into(),
            ActivationError::Invalid => {
                ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, "INVALID_ACTIVATION_CODE", "Invalid or expired activation code.")
            }
        }
    }
}

impl From<PairError> for ApiError {
    fn from(err: PairError) -> Self {
        match err {
            PairError::Db(e) => e.into(),
            PairError::Malformed => {
                ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, "PAIRING_CODE_MALFORMED", "That does not look like a Pleadli pairing code.")
            }
            PairError::AlreadyPaired => ApiError::conflict("ALREADY_PAIRED", "This installation is already paired with Head Office."),
            PairError::Rejected => {
                ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, "PAIRING_REJECTED", "Head Office did not accept that pairing code. It may be used or expired.")
            }
            PairError::Unreachable(detail) => {
                log::warn!("pairing: {detail}");
                ApiError::new(StatusCode::BAD_GATEWAY, "HEAD_OFFICE_UNREACHABLE", "Head Office could not be reached.")
            }
        }
    }
}

impl From<BackupError> for ApiError {
    fn from(err: BackupError) -> Self {
        match err {
            BackupError::Db(e) => e.into(),
            BackupError::Io(e) => {
                log::error!("backup io: {e}");
                ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "BACKUP_IO", "The backup folder could not be read or written.")
            }
            BackupError::Unreadable => ApiError::new(
                StatusCode::UNPROCESSABLE_ENTITY,
                "BACKUP_UNREADABLE",
                "That is not a readable Pleadli backup, or the recovery passphrase is wrong.",
            ),
            BackupError::Inconsistent(detail) => {
                log::warn!("backup inconsistent: {detail}");
                ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, "BACKUP_INCONSISTENT", "That backup is damaged and cannot be trusted.")
            }
            BackupError::NotConfigured => {
                ApiError::conflict("BACKUP_NOT_CONFIGURED", "Set a recovery passphrase before making backups.")
            }
            BackupError::WeakPassphrase => ApiError::new(
                StatusCode::UNPROCESSABLE_ENTITY,
                "WEAK_PASSPHRASE",
                "The recovery passphrase must be at least 10 characters.",
            ),
        }
    }
}

impl From<ConnectError> for ApiError {
    fn from(err: ConnectError) -> Self {
        match err {
            ConnectError::Db(e) => e.into(),
            ConnectError::Malformed(message) => ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, "CONNECT_MALFORMED", message),
            ConnectError::Refused => {
                ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, "INVALID_ENROLMENT_CODE", "The node did not accept that code. It may be used or expired: make a new one on the node.")
            }
            ConnectError::NotFresh => ApiError::conflict("NOT_FRESH", "This machine is already set up, so it cannot become a workstation without a reinstall."),
            ConnectError::Unreachable(detail) => {
                log::warn!("connect: {detail}");
                ApiError::new(
                    StatusCode::BAD_GATEWAY,
                    "NODE_UNREACHABLE",
                    "Could not reach the facility node. Check the address and that this computer is on the facility network, and that the fingerprint matches the one shown on the node.",
                )
            }
        }
    }
}
