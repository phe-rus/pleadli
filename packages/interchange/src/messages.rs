//! What the packages say.
//!
//! Every field a station or an office sends is a claim by that sender, shown to
//! the person who reads it as such. Nothing here becomes a record on the
//! receiving side until that person accepts it.

use serde::{Deserialize, Serialize};

pub const KIND_REFERRAL: &str = "referral";
pub const KIND_RECEIPT: &str = "receipt";
pub const KIND_DECISION_NOTICE: &str = "decision_notice";

/// A person on the file. `key` is the sender's own id for them, used only to
/// join the statements and charges below to the right person.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersonClaim {
    pub key: String,
    /// `accused`, `complainant` or `witness`.
    pub role: String,
    pub first_name: String,
    pub last_name: String,
    pub other_names: Option<String>,
    pub phone: Option<String>,
    pub national_id: Option<String>,
    pub address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct StatementClaim {
    pub key: String,
    pub person_key: String,
    /// `witness`, `accused`, `arresting_officer`, `investigating_officer`, `complainant`.
    pub role: String,
    pub given_at: i64,
    pub content: String,
    pub taken_by: Option<String>,
    /// Files in the package that are this statement's scanned copy.
    pub file_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExhibitClaim {
    pub key: String,
    pub description: String,
    pub identification_mark: Option<String>,
    pub recovered_at: Option<i64>,
    pub recovered_from_location: Option<String>,
    pub file_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChargeClaim {
    pub accused_person_key: Option<String>,
    pub offence: String,
    pub statutory_section: Option<String>,
    pub particulars: Option<String>,
}

/// A case referred to the DPP office that handles the station.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReferralPayload {
    /// The station's own reference for the case: "KIRA ROAD CRB 221/2026".
    pub police_reference: String,
    /// Where the case is held, as the station names itself.
    pub station_name: String,
    pub referred_at: i64,
    pub referring_officer: Option<String>,
    pub summary: String,
    pub people: Vec<PersonClaim>,
    pub statements: Vec<StatementClaim>,
    pub exhibits: Vec<ExhibitClaim>,
    pub charges: Vec<ChargeClaim>,
    /// Set when this answers a return for further investigation: the file the
    /// DPP office gave in its receipt. A resubmission is never a new file.
    pub resubmission_of: Option<String>,
    pub notes: Option<String>,
}

/// The office's answer to a referral, for the station's own record.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptPayload {
    pub referral_package_id: String,
    pub police_reference: String,
    /// `accepted` or `rejected`.
    pub outcome: String,
    /// The office's own id for the file, to quote when resubmitting.
    pub dpp_file_key: Option<String>,
    /// The office's registration number for the file, if it has one.
    pub dpp_reference: Option<String>,
    pub reason: Option<String>,
    pub received_at: i64,
    pub decided_at: i64,
    pub decided_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct DirectionClaim {
    pub kind: String,
    pub instruction: String,
    pub person_name: Option<String>,
}

/// An issued document, as text the station can read and print. `blocks` is the
/// office's own block content (see the DPP document model).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct NoticeDocument {
    pub kind: String,
    pub title: String,
    pub reference: Option<String>,
    pub issued_at: Option<i64>,
    pub author: Option<String>,
    pub blocks: serde_json::Value,
}

/// A decision the office has made on a file the station referred.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct DecisionNoticePayload {
    pub police_reference: String,
    pub dpp_file_key: String,
    pub dpp_reference: Option<String>,
    /// `sanction`, `decline`, `return_for_investigation`, and the rest of the
    /// office's own list.
    pub decision_type: String,
    pub decided_at: i64,
    pub decided_by: Option<String>,
    /// Offences the decision is about, when it is about particular counts.
    pub counts: Vec<String>,
    pub reasons: Option<String>,
    pub directions: Vec<DirectionClaim>,
    pub documents: Vec<NoticeDocument>,
    pub court_case_number: Option<String>,
}
