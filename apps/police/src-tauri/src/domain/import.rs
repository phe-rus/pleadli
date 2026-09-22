//! Structured spreadsheet import. An officer picks a record type, then a
//! CSV/Excel file; the frontend maps detected columns against
//! `import_fields`'s manifest for that type (kept here so the two never
//! drift on what's mappable), resolves any person/case references the
//! officer confirms via `resolve_people`/`resolve_cases`, then hands the
//! final rows to `bulk_import`, which builds each entity's real
//! `Create*Input` and calls the *existing* `create_*` function per row.
//! Nothing here is a parallel insert path: every row gets the same
//! validation, Vault write, and Markdown write a hand-typed record would.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::fmt;
use std::path::Path;

use super::people::Person;
use super::{
    bonds, cases, charge_sheets, custody, duty, exhibits, officers, people, referrals, station_assets,
    station_diary, statements, vehicles,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportField {
    pub key: String,
    pub label: String,
    pub required: bool,
}

fn field(key: &str, label: &str, required: bool) -> ImportField {
    ImportField { key: key.to_string(), label: label.to_string(), required }
}

/// The mappable field list for a given importable entity type, or `None`
/// if that type isn't supported for bulk import. `personFirstName`,
/// `personLastName`, `personNationalId`, and `caseReference` are
/// pseudo-fields: they don't exist on the entity's `Create*Input`
/// directly, but are resolved into a real `personId`/`caseId` via
/// `resolve_people`/`resolve_cases` before `bulk_import` ever sees the
/// row. Everything else maps straight onto a `Create*Input` field of the
/// same key.
pub fn import_fields(entity_type: &str) -> Option<Vec<ImportField>> {
    Some(match entity_type {
        "person" => vec![
            field("firstName", "First name", true),
            field("lastName", "Last name", true),
            field("otherNames", "Other names", false),
            field("phone", "Phone", false),
            field("nationalId", "National ID", false),
            field("address", "Address", false),
        ],
        "case" => vec![
            field("reference", "Reference", true),
            field("summary", "Summary", true),
            field("status", "Status (open / closed)", true),
        ],
        "statement" => vec![
            field("personFirstName", "Person: first name", true),
            field("personLastName", "Person: last name", true),
            field("personNationalId", "Person: national ID", false),
            field("caseReference", "Case reference", false),
            field("content", "Statement content", true),
            field("officerName", "Officer name", false),
            field("givenAt", "Date given", true),
        ],
        "custody_record" => vec![
            field("personFirstName", "Person: first name", true),
            field("personLastName", "Person: last name", true),
            field("personNationalId", "Person: national ID", false),
            field("caseReference", "Case reference", false),
            field("arrestedAt", "Arrested at", true),
            field("location", "Location", false),
            field("crossJurisdictionTransfer", "Cross-jurisdiction transfer (yes/no)", true),
            field("transferredAt", "Transferred at", false),
            field("status", "Status", true),
            field("releasedAt", "Released at", false),
            field("notes", "Notes", false),
        ],
        "bond" => vec![
            field("personFirstName", "Person: first name", true),
            field("personLastName", "Person: last name", true),
            field("personNationalId", "Person: national ID", false),
            field("caseReference", "Case reference", false),
            field("lockUpSerialNumber", "Lock-up serial number", false),
            field("withSurety", "With surety (yes/no)", true),
            field("suretyName", "Surety name", false),
            field("suretyContact", "Surety contact", false),
            field("reportingSchedule", "Reporting schedule", false),
            field("officerName", "Officer name", false),
            field("officerRank", "Officer rank", false),
            field("status", "Status", true),
            field("grantedAt", "Granted at", true),
            field("notes", "Notes", false),
        ],
        "exhibit" => vec![
            field("caseReference", "Case reference", false),
            field("personFirstName", "Person: first name", false),
            field("personLastName", "Person: last name", false),
            field("personNationalId", "Person: national ID", false),
            field("description", "Description", true),
            field("identificationMark", "Identification mark", false),
            field("recoveredAt", "Recovered at", true),
            field("recoveredFromLocation", "Recovered from location", false),
            field("handedOverBy", "Handed over by", false),
            field("witnesses", "Witnesses", false),
            field("receivingOfficerName", "Receiving officer name", false),
            field("storageLocation", "Storage location", false),
            field("status", "Status", true),
            field("notes", "Notes", false),
        ],
        "charge_sheet" => vec![
            field("caseReference", "Case reference", true),
            field("personFirstName", "Accused: first name", false),
            field("personLastName", "Accused: last name", false),
            field("personNationalId", "Accused: national ID", false),
            field("offence", "Offence", true),
            field("statutorySection", "Statutory section", true),
            field("particulars", "Particulars", true),
            field("chargedAt", "Charged at", true),
            field("officerName", "Officer name", false),
            field("stationName", "Station name", false),
        ],
        "referral" => vec![
            field("caseReference", "Case reference", true),
            field("destinationType", "Destination type", true),
            field("destinationName", "Destination name", false),
            field("referredAt", "Referred at", true),
            field("status", "Status", true),
            field("officerName", "Officer name", false),
            field("notes", "Notes", false),
        ],
        "station_diary_entry" => vec![
            field("category", "Category", true),
            field("content", "Content", true),
            field("personFirstName", "Person: first name", false),
            field("personLastName", "Person: last name", false),
            field("personNationalId", "Person: national ID", false),
        ],
        "duty_assignment" => vec![
            field("officerName", "Officer name", true),
            field("officerRank", "Officer rank", false),
            field("unit", "Unit", false),
            field("shiftStart", "Shift start", true),
            field("shiftEnd", "Shift end", true),
            field("notes", "Notes", false),
        ],
        "station_asset" => vec![
            field("category", "Category (armory / impounded)", true),
            field("description", "Description", true),
            field("itemIdentifier", "Item identifier", false),
            field("status", "Status", true),
            field("holderName", "Holder name", false),
            field("personFirstName", "Person: first name", false),
            field("personLastName", "Person: last name", false),
            field("personNationalId", "Person: national ID", false),
            field("notes", "Notes", false),
        ],
        "officer" => vec![
            field("personFirstName", "Person: first name", true),
            field("personLastName", "Person: last name", true),
            field("personNationalId", "Person: national ID", false),
            field("badgeNumber", "Badge number", false),
            field("post", "Post", false),
            field("rank", "Rank", false),
            field("notes", "Notes", false),
        ],
        "vehicle" => vec![
            field("plateNumber", "Plate number", true),
            field("make", "Make", false),
            field("model", "Model", false),
            field("color", "Color", false),
            field("personFirstName", "Owner: first name", false),
            field("personLastName", "Owner: last name", false),
            field("personNationalId", "Owner: national ID", false),
            field("notes", "Notes", false),
        ],
        _ => return None,
    })
}

// ---------------------------------------------------------------------
// File parsing
// ---------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

#[derive(Debug)]
pub enum ImportError {
    Io(std::io::Error),
    Csv(csv::Error),
    Spreadsheet(String),
    UnsupportedFormat(String),
}

impl fmt::Display for ImportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ImportError::Io(e) => write!(f, "{e}"),
            ImportError::Csv(e) => write!(f, "{e}"),
            ImportError::Spreadsheet(e) => write!(f, "{e}"),
            ImportError::UnsupportedFormat(ext) => write!(f, "Unsupported file type: .{ext}"),
        }
    }
}

impl From<std::io::Error> for ImportError {
    fn from(e: std::io::Error) -> Self {
        ImportError::Io(e)
    }
}

impl From<csv::Error> for ImportError {
    fn from(e: csv::Error) -> Self {
        ImportError::Csv(e)
    }
}

fn parse_csv(path: &Path) -> Result<ImportPreview, ImportError> {
    let mut reader = csv::ReaderBuilder::new().has_headers(true).from_path(path)?;
    let headers = reader.headers()?.iter().map(|h| h.to_string()).collect();

    let mut rows = Vec::new();
    for record in reader.records() {
        let record = record?;
        rows.push(record.iter().map(|f| f.to_string()).collect());
    }

    Ok(ImportPreview { headers, rows })
}

/// A raw Excel serial number reads as noise to an officer mapping
/// columns, so date/time cells are rendered through chrono instead of
/// calamine's default `Display`, which only ever shows that raw value.
fn cell_to_string(cell: &calamine::Data) -> String {
    use calamine::DataType;
    if cell.is_datetime() {
        if let Some(dt) = cell.as_datetime() {
            return if dt.time() == chrono::NaiveTime::MIN {
                dt.date().format("%Y-%m-%d").to_string()
            } else {
                dt.format("%Y-%m-%d %H:%M").to_string()
            };
        }
    }
    cell.to_string()
}

fn parse_spreadsheet(path: &Path) -> Result<ImportPreview, ImportError> {
    use calamine::Reader;

    let mut workbook = calamine::open_workbook_auto(path).map_err(|e| ImportError::Spreadsheet(e.to_string()))?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| ImportError::Spreadsheet("The file has no sheets.".to_string()))?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| ImportError::Spreadsheet(e.to_string()))?;

    let mut rows_iter = range.rows();
    let headers: Vec<String> = rows_iter.next().map(|r| r.iter().map(cell_to_string).collect()).unwrap_or_default();
    let rows: Vec<Vec<String>> = rows_iter.map(|r| r.iter().map(cell_to_string).collect()).collect();

    Ok(ImportPreview { headers, rows })
}

pub fn parse_import_file(path: &Path) -> Result<ImportPreview, ImportError> {
    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    match extension.as_str() {
        "csv" => parse_csv(path),
        "xlsx" | "xlsm" | "xls" | "xlsb" | "ods" => parse_spreadsheet(path),
        other => Err(ImportError::UnsupportedFormat(other.to_string())),
    }
}

// ---------------------------------------------------------------------
// Person / case reference resolution
// ---------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonCandidate {
    /// A frontend-assigned id for this unique (name, national ID) tuple,
    /// just echoed back so the officer's resolution UI can match a
    /// result to the row group it came from.
    pub key: String,
    pub first_name: String,
    pub last_name: String,
    pub national_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonResolution {
    pub key: String,
    /// Set only when exactly one existing person matches unambiguously
    /// (by national ID first, full name otherwise) — never a guess the
    /// officer hasn't seen; `candidates` carries every other
    /// same-name/same-ID person so they can pick deliberately instead.
    pub exact_match: Option<Person>,
    pub candidates: Vec<Person>,
}

/// Deterministic matching only: exact national ID match wins outright
/// when it's the only one; otherwise an exact (case-insensitive) full
/// name match, when it's the only one. Anything else (no match, or more
/// than one candidate either way) comes back unresolved for the officer
/// to pick from `candidates` or choose to create a new person; nothing
/// here ever auto-links on a fuzzy or partial match.
pub async fn resolve_people(pool: &SqlitePool, candidates: Vec<PersonCandidate>) -> Result<Vec<PersonResolution>, sqlx::Error> {
    let mut results = Vec::with_capacity(candidates.len());

    for candidate in candidates {
        let mut exact_match = None;
        let mut others: Vec<Person> = Vec::new();

        if let Some(national_id) = candidate.national_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            let matches = sqlx::query_as::<_, Person>("SELECT * FROM people WHERE national_id = ?")
                .bind(national_id)
                .fetch_all(pool)
                .await?;
            if matches.len() == 1 {
                exact_match = matches.into_iter().next();
            } else {
                others = matches;
            }
        }

        if exact_match.is_none() {
            let name_matches = sqlx::query_as::<_, Person>(
                "SELECT * FROM people WHERE first_name = ?1 COLLATE NOCASE AND last_name = ?2 COLLATE NOCASE",
            )
            .bind(&candidate.first_name)
            .bind(&candidate.last_name)
            .fetch_all(pool)
            .await?;

            if name_matches.len() == 1 && others.is_empty() {
                exact_match = name_matches.into_iter().next();
            } else {
                for person in name_matches {
                    if !others.iter().any(|existing| existing.id == person.id) {
                        others.push(person);
                    }
                }
            }
        }

        results.push(PersonResolution { key: candidate.key, exact_match, candidates: others });
    }

    Ok(results)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseResolution {
    pub reference: String,
    pub matched_case_id: Option<String>,
}

/// Exact reference match only, same reasoning as `resolve_people`: a
/// case reference is either found or it isn't, never guessed at.
pub async fn resolve_cases(pool: &SqlitePool, references: Vec<String>) -> Result<Vec<CaseResolution>, sqlx::Error> {
    let mut results = Vec::with_capacity(references.len());
    for reference in references {
        let matched_case_id: Option<String> = sqlx::query_scalar("SELECT id FROM cases WHERE reference = ?")
            .bind(&reference)
            .fetch_optional(pool)
            .await?;
        results.push(CaseResolution { reference, matched_case_id });
    }
    Ok(results)
}

// ---------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRowFailure {
    pub row: usize,
    pub error: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkImportResult {
    pub imported: usize,
    pub failed: Vec<ImportRowFailure>,
}

/// Wraps plain text in the minimal Tiptap/ProseMirror document JSON shape
/// `@pleadli/rich-text` stores (see `domain::seed_support`'s debug-only
/// twin) — imported statement/diary content needs this in release builds
/// too, not just dev seeding.
fn plain_text_to_rich_text(text: &str) -> String {
    serde_json::json!({
        "type": "doc",
        "content": [{
            "type": "paragraph",
            "content": [{ "type": "text", "text": text }],
        }],
    })
    .to_string()
}

fn get<'a>(row: &'a HashMap<String, String>, key: &str) -> Option<&'a str> {
    row.get(key).map(String::as_str).map(str::trim).filter(|s| !s.is_empty())
}

fn get_owned(row: &HashMap<String, String>, key: &str) -> Option<String> {
    get(row, key).map(str::to_string)
}

fn get_bool(row: &HashMap<String, String>, key: &str) -> bool {
    get(row, key).map(|s| matches!(s.to_lowercase().as_str(), "yes" | "y" | "true" | "1")).unwrap_or(false)
}

fn require(row: &HashMap<String, String>, key: &str, label: &str) -> Result<String, String> {
    get_owned(row, key).ok_or_else(|| format!("'{label}' is required."))
}

/// Tries a handful of common date/date-time shapes (ISO, slash-separated,
/// written-out month names) in addition to a bare epoch-millisecond
/// number, since officers will paste dates from all kinds of existing
/// registers. Date-only values are treated as UTC midnight.
fn parse_flexible_datetime(raw: &str) -> Option<i64> {
    let s = raw.trim();

    if let Ok(millis) = s.parse::<i64>() {
        return Some(millis);
    }
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(dt.timestamp_millis());
    }

    const DATETIME_FORMATS: [&str; 6] =
        ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%d/%m/%Y %H:%M", "%m/%d/%Y %H:%M"];
    for fmt in DATETIME_FORMATS {
        if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, fmt) {
            return Some(naive.and_utc().timestamp_millis());
        }
    }

    const DATE_FORMATS: [&str; 6] = ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%B %d, %Y", "%d %B %Y"];
    for fmt in DATE_FORMATS {
        if let Ok(date) = chrono::NaiveDate::parse_from_str(s, fmt) {
            return date.and_hms_opt(0, 0, 0).map(|dt| dt.and_utc().timestamp_millis());
        }
    }

    None
}

fn get_timestamp(row: &HashMap<String, String>, key: &str) -> Result<Option<i64>, String> {
    match get(row, key) {
        None => Ok(None),
        Some(raw) => parse_flexible_datetime(raw).map(Some).ok_or_else(|| format!("Could not read a date from '{raw}'.")),
    }
}

fn require_timestamp(row: &HashMap<String, String>, key: &str, label: &str) -> Result<i64, String> {
    let raw = require(row, key, label)?;
    parse_flexible_datetime(&raw).ok_or_else(|| format!("Could not read '{label}' as a date: '{raw}'."))
}

/// Builds the one entity's real `Create*Input` from an already
/// column-mapped, already person/case-resolved row (keyed by the same
/// field names `import_fields` exposes, plus a resolved `personId`
/// and/or `caseId` in place of the pseudo person/case fields) and calls
/// the same `create_*` function the interactive form uses.
async fn import_one(pool: &SqlitePool, vault_root: &Path, entity_type: &str, row: &HashMap<String, String>) -> Result<(), String> {
    match entity_type {
        "person" => {
            let input = people::CreatePersonInput {
                first_name: require(row, "firstName", "First name")?,
                last_name: require(row, "lastName", "Last name")?,
                other_names: get_owned(row, "otherNames"),
                phone: get_owned(row, "phone"),
                national_id: get_owned(row, "nationalId"),
                address: get_owned(row, "address"),
            };
            people::create_person(pool, vault_root, input).await.map(|_| ()).map_err(|e| e.to_string())
        }
        "case" => {
            let input = cases::CreateCaseInput {
                reference: require(row, "reference", "Reference")?,
                summary: require(row, "summary", "Summary")?,
                status: require(row, "status", "Status")?,
                incident_id: None,
                people: Vec::new(),
            };
            cases::create_case(pool, vault_root, input).await.map(|_| ()).map_err(|e| e.to_string())
        }
        "statement" => {
            let content = require(row, "content", "Statement content")?;
            let input = statements::CreateStatementInput {
                officer_id: None,
                content: plain_text_to_rich_text(&content),
                person_id: require(row, "personId", "Person")?,
                case_id: get_owned(row, "caseId"),
                officer_name: get_owned(row, "officerName"),
                given_at: require_timestamp(row, "givenAt", "Date given")?,
            };
            statements::create_statement(pool, vault_root, input).await.map(|_| ()).map_err(|e| e.to_string())
        }
        "custody_record" => {
            let input = custody::CreateCustodyRecordInput {
                person_id: require(row, "personId", "Person")?,
                incident_id: None,
                case_id: get_owned(row, "caseId"),
                arrested_at: require_timestamp(row, "arrestedAt", "Arrested at")?,
                location: get_owned(row, "location"),
                cross_jurisdiction_transfer: get_bool(row, "crossJurisdictionTransfer"),
                transferred_at: get_timestamp(row, "transferredAt")?,
                status: require(row, "status", "Status")?,
                released_at: get_timestamp(row, "releasedAt")?,
                notes: get_owned(row, "notes"),
            };
            custody::create_record(pool, vault_root, input).await.map(|_| ()).map_err(|e| e.to_string())
        }
        "bond" => {
            let input = bonds::CreateBondInput {
                officer_id: None,
                person_id: require(row, "personId", "Person")?,
                custody_id: None,
                case_id: get_owned(row, "caseId"),
                lock_up_serial_number: get_owned(row, "lockUpSerialNumber"),
                with_surety: get_bool(row, "withSurety"),
                surety_name: get_owned(row, "suretyName"),
                surety_contact: get_owned(row, "suretyContact"),
                reporting_schedule: get_owned(row, "reportingSchedule"),
                officer_name: get_owned(row, "officerName"),
                officer_rank: get_owned(row, "officerRank"),
                status: require(row, "status", "Status")?,
                granted_at: require_timestamp(row, "grantedAt", "Granted at")?,
                notes: get_owned(row, "notes"),
            };
            bonds::create_bond(pool, vault_root, input).await.map(|_| ()).map_err(|e| e.to_string())
        }
        "exhibit" => {
            let input = exhibits::CreateExhibitInput {
                case_id: get_owned(row, "caseId"),
                incident_id: None,
                person_id: get_owned(row, "personId"),
                description: require(row, "description", "Description")?,
                identification_mark: get_owned(row, "identificationMark"),
                recovered_at: require_timestamp(row, "recoveredAt", "Recovered at")?,
                recovered_from_location: get_owned(row, "recoveredFromLocation"),
                handed_over_by: get_owned(row, "handedOverBy"),
                witnesses: get_owned(row, "witnesses"),
                receiving_officer_name: get_owned(row, "receivingOfficerName"),
                storage_location: get_owned(row, "storageLocation"),
                status: require(row, "status", "Status")?,
                notes: get_owned(row, "notes"),
            };
            exhibits::create_exhibit(pool, vault_root, input).await.map(|_| ()).map_err(|e| e.to_string())
        }
        "charge_sheet" => {
            let input = charge_sheets::CreateChargeSheetInput {
                officer_id: None,
                case_id: require(row, "caseId", "Case")?,
                accused_person_id: get_owned(row, "personId"),
                offence: require(row, "offence", "Offence")?,
                statutory_section: require(row, "statutorySection", "Statutory section")?,
                particulars: require(row, "particulars", "Particulars")?,
                charged_at: require_timestamp(row, "chargedAt", "Charged at")?,
                officer_name: get_owned(row, "officerName"),
                station_name: get_owned(row, "stationName"),
            };
            charge_sheets::create_charge_sheet(pool, vault_root, input).await.map(|_| ()).map_err(|e| e.to_string())
        }
        "referral" => {
            let input = referrals::CreateReferralInput {
                officer_id: None,
                case_id: require(row, "caseId", "Case")?,
                destination_type: require(row, "destinationType", "Destination type")?,
                destination_name: get_owned(row, "destinationName"),
                referred_at: require_timestamp(row, "referredAt", "Referred at")?,
                status: require(row, "status", "Status")?,
                officer_name: get_owned(row, "officerName"),
                notes: get_owned(row, "notes"),
            };
            referrals::create_referral(pool, vault_root, input).await.map(|_| ()).map_err(|e| e.to_string())
        }
        "station_diary_entry" => {
            let content = require(row, "content", "Content")?;
            let input = station_diary::CreateStationDiaryEntryInput {
                category: require(row, "category", "Category")?,
                content: plain_text_to_rich_text(&content),
                person_id: get_owned(row, "personId"),
            };
            station_diary::create_entry(pool, vault_root, input).await.map(|_| ()).map_err(|e| e.to_string())
        }
        "duty_assignment" => {
            let input = duty::CreateDutyAssignmentInput {
                officer_id: None,
                officer_name: require(row, "officerName", "Officer name")?,
                officer_rank: get_owned(row, "officerRank"),
                unit: get_owned(row, "unit"),
                shift_start: require_timestamp(row, "shiftStart", "Shift start")?,
                shift_end: require_timestamp(row, "shiftEnd", "Shift end")?,
                notes: get_owned(row, "notes"),
            };
            duty::create_assignment(pool, vault_root, input).await.map(|_| ()).map_err(|e| e.to_string())
        }
        "station_asset" => {
            let input = station_assets::CreateStationAssetInput {
                category: require(row, "category", "Category")?,
                description: require(row, "description", "Description")?,
                item_identifier: get_owned(row, "itemIdentifier"),
                status: require(row, "status", "Status")?,
                holder_name: get_owned(row, "holderName"),
                person_id: get_owned(row, "personId"),
                notes: get_owned(row, "notes"),
            };
            station_assets::create_asset(pool, vault_root, input).await.map(|_| ()).map_err(|e| e.to_string())
        }
        "officer" => {
            let first = require(row, "personFirstName", "Person: first name")?;
            let last = require(row, "personLastName", "Person: last name")?;
            let input = officers::CreateOfficerInput {
                badge_number: get_owned(row, "badgeNumber"),
                name: format!("{first} {last}"),
                rank: get_owned(row, "rank"),
                post: get_owned(row, "post"),
                role: "officer".to_string(),
                notes: get_owned(row, "notes"),
                person_id: get_owned(row, "personId"),
                password: None,
            };
            officers::create_officer(pool, input).await.map(|_| ()).map_err(|e| e.to_string())
        }
        "vehicle" => {
            let input = vehicles::CreateVehicleInput {
                plate_number: require(row, "plateNumber", "Plate number")?,
                make: get_owned(row, "make"),
                model: get_owned(row, "model"),
                color: get_owned(row, "color"),
                owner_person_id: get_owned(row, "personId"),
                notes: get_owned(row, "notes"),
            };
            vehicles::create_vehicle(pool, vault_root, input).await.map(|_| ()).map_err(|e| e.to_string())
        }
        other => Err(format!("Unsupported record type: {other}")),
    }
}

pub async fn bulk_import(pool: &SqlitePool, vault_root: &Path, entity_type: &str, rows: Vec<HashMap<String, String>>) -> BulkImportResult {
    let mut imported = 0;
    let mut failed = Vec::new();

    for (index, row) in rows.into_iter().enumerate() {
        match import_one(pool, vault_root, entity_type, &row).await {
            Ok(()) => imported += 1,
            Err(error) => failed.push(ImportRowFailure { row: index, error }),
        }
    }

    BulkImportResult { imported, failed }
}
