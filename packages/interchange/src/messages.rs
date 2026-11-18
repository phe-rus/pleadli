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

pub const KIND_FILING: &str = "case_filing";
pub const KIND_FILING_RECEIPT: &str = "filing_receipt";

/// One person the prosecution files against or names in a filing.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct FilingParty {
    pub key: String,
    /// `accused`, `complainant` or `witness`.
    pub role: String,
    pub name: String,
    /// Where the accused is held, as the prosecution knows it: `remanded`,
    /// `on_bail` or `not_in_custody`. A claim: the court records its own.
    pub custody: Option<String>,
    pub custody_place: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct FilingCharge {
    pub accused_key: Option<String>,
    pub offence: String,
    pub statutory_section: Option<String>,
    pub particulars: Option<String>,
}

/// A prosecution file the DPP office lodges with a court registry.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct FilingPayload {
    /// The office's own file key, to quote on every later message about it.
    pub dpp_file_key: String,
    pub dpp_reference: Option<String>,
    /// The police reference the file started as, so the chain can be followed.
    pub police_reference: Option<String>,
    pub title: String,
    /// `magistrate` or `high`.
    pub court_level: String,
    pub summary: String,
    pub parties: Vec<FilingParty>,
    pub charges: Vec<FilingCharge>,
    pub filed_at: i64,
    pub filed_by: Option<String>,
    pub notes: Option<String>,
}

/// The registry's answer to a filing.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct FilingReceiptPayload {
    pub filing_package_id: String,
    pub dpp_file_key: String,
    /// `accepted` or `rejected`.
    pub outcome: String,
    /// The number the court gave the case when it accepted it.
    pub court_number: Option<String>,
    pub reason: Option<String>,
    pub received_at: i64,
    pub decided_at: i64,
    pub decided_by: Option<String>,
}

pub const KIND_WITHDRAWAL: &str = "case_withdrawal";

/// The prosecution tells the court a case it filed is withdrawn (nolle
/// prosequi) or discontinued. A claim: the court records the end of the case
/// itself, after its own sittings are dealt with. The registry answers with a
/// `FilingReceiptPayload` whose outcome is `withdrawal_recorded` or `rejected`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WithdrawalPayload {
    pub dpp_file_key: String,
    /// The number the court gave the case when it was filed.
    pub court_number: String,
    /// `nolle_prosequi` or `discontinue`.
    pub decision: String,
    pub reason: Option<String>,
    pub decided_at: i64,
    pub decided_by: Option<String>,
}

pub const KIND_CUSTODY_ORDER: &str = "custody_order";
pub const KIND_CUSTODY_RECEIPT: &str = "custody_receipt";
pub const KIND_CUSTODY_REPORT: &str = "custody_report";

/// A facility tells the court what has happened to a person the court sent
/// there: released, transferred, taken to hospital, died, escaped, or not
/// produced. A claim by the facility; the court reads it, it does not change
/// the case by itself.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct CustodyReportPayload {
    /// The court's own id of the order this concerns.
    pub order_key: String,
    pub court_number: String,
    pub accused: String,
    /// `released`, `transferred`, `hospitalised`, `died`, `escaped`, `not_produced` or `other`.
    pub event: String,
    pub occurred_at: i64,
    pub note: Option<String>,
    pub reported_by: Option<String>,
}

/// A remand or release order a court has issued about a person in custody,
/// sent to the facility that holds or is to hold them. Every field is the
/// court's claim: the facility reads it, finds its own record of the person,
/// and records the order itself. The wording that was signed travels with it
/// so the facility keeps what the court issued, not a summary.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct CustodyOrderPayload {
    /// The court's own id for the order, used to answer it.
    pub order_key: String,
    /// `remand`, `release` or `committal` (a warrant on sentence).
    pub kind: String,
    pub court_name: String,
    pub court_number: String,
    pub case_title: String,
    /// The court's reference for the order, if it gave one.
    pub reference: Option<String>,
    pub accused: String,
    /// The place of custody the court named.
    pub prison: String,
    pub remand_until: Option<i64>,
    pub reason: Option<String>,
    pub issued_at: i64,
    /// For a `committal` order: the sentence the court passed. The facility
    /// records the warrant; its officer applies the sentence.
    #[serde(default)]
    pub term_years: Option<i64>,
    #[serde(default)]
    pub term_months: Option<i64>,
    #[serde(default)]
    pub term_days: Option<i64>,
    #[serde(default)]
    pub is_life: bool,
    #[serde(default)]
    pub offence: Option<String>,
    pub issued_by: Option<String>,
    /// The order as it was issued, paragraph by paragraph.
    pub paragraphs: Vec<String>,
    /// SHA-256 of the wording the court recorded at issue.
    pub content_sha256: Option<String>,
}

/// The facility's answer: whether it recorded the order against a person in
/// its custody, or could not.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct CustodyReceiptPayload {
    pub order_package_id: String,
    pub order_key: String,
    /// `recorded` or `returned`.
    pub outcome: String,
    pub reason: Option<String>,
    pub received_at: i64,
    pub decided_at: i64,
    pub decided_by: Option<String>,
}

pub const KIND_COURT_NOTICE: &str = "court_notice";
pub const KIND_COURT_NOTICE_RECEIPT: &str = "court_notice_receipt";

/// A notice from a court registry to counsel on a case: the date of a sitting,
/// or the wording of an order. Every field is the court's claim; the firm reads
/// it, chooses the matter it belongs to, and files it itself.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct CourtNoticePayload {
    /// The court's own id for the sitting or order, used to answer it.
    pub notice_key: String,
    /// `hearing` or `order`.
    pub kind: String,
    pub court_name: String,
    pub court_number: String,
    pub case_title: String,
    /// What the notice is called: "Notice of hearing", "Ruling", the order's title.
    pub title: String,
    /// A hearing: when and why, and where.
    pub at: Option<i64>,
    pub purpose: Option<String>,
    pub courtroom: Option<String>,
    /// An order: the wording as issued, and the court's reference.
    pub paragraphs: Vec<String>,
    pub reference: Option<String>,
    pub issued_at: i64,
    pub issued_by: Option<String>,
}

/// The firm's answer: whether it filed the notice against a matter.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct CourtNoticeReceiptPayload {
    pub notice_package_id: String,
    pub notice_key: String,
    /// `filed` or `returned`.
    pub outcome: String,
    pub reason: Option<String>,
    pub received_at: i64,
    pub decided_at: i64,
    pub decided_by: Option<String>,
}

pub const KIND_FIRM_FILING: &str = "firm_filing";
pub const KIND_FIRM_FILING_RECEIPT: &str = "firm_filing_receipt";

/// Counsel files a document in a case: an application, a notice of appeal, a
/// defence, a memorandum. The court's claim of the case number is what the firm
/// types; the court checks it against its own register before accepting.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct FirmFilingPayload {
    /// The firm's own id for the filing, used to answer it.
    pub filing_key: String,
    /// `application`, `notice_of_appeal`, `bail_application`, `defence`, `submissions` or `other`.
    pub kind: String,
    pub title: String,
    pub court_number: String,
    pub firm_name: String,
    pub firm_reference: Option<String>,
    pub filed_by: Option<String>,
    pub filed_at: i64,
    /// The document, paragraph by paragraph.
    pub paragraphs: Vec<String>,
}

/// The registry's answer to a firm filing: `accepted` or `rejected`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct FirmFilingReceiptPayload {
    pub filing_package_id: String,
    pub filing_key: String,
    pub outcome: String,
    pub reason: Option<String>,
    pub received_at: i64,
    pub decided_at: i64,
    pub decided_by: Option<String>,
}
