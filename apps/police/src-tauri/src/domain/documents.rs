//! Bulk "export everything": the Markdown/zip Vault snapshot and the
//! all-tables Excel workbook. Every list here reads through each domain's
//! own `list_all` (unfiltered, unlimited; distinct from the UI-oriented
//! `list_*`/`search_*` functions that cap at 50-100 rows), and every
//! Markdown write goes through each domain's own `write_*_markdown` and
//! `markdown::write_record`. Nothing here re-derives what a record's
//! Vault path or Markdown body should look like, it only walks every
//! table and calls what already exists per-record.

use rust_xlsxwriter::{Format, Workbook};
use serde::Serialize;
use serde_json::Value;
use sqlx::SqlitePool;
use std::fmt;
use std::io::Write as _;
use std::path::Path;

use super::{
    attachments, bonds, cases, charge_sheets, custody, duty, exhibits, incidents, markdown, officers, people, referrals,
    shift_log, station_admin, station_assets, station_diary, statements, vehicles,
};

#[derive(Debug)]
pub enum DocumentError {
    Io(std::io::Error),
    Db(sqlx::Error),
    Zip(zip::result::ZipError),
    Xlsx(rust_xlsxwriter::XlsxError),
    Pdf(String),
    Docx(docx_rs::DocxError),
}

impl fmt::Display for DocumentError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DocumentError::Io(e) => write!(f, "{e}"),
            DocumentError::Db(e) => write!(f, "{e}"),
            DocumentError::Zip(e) => write!(f, "{e}"),
            DocumentError::Xlsx(e) => write!(f, "{e}"),
            DocumentError::Pdf(e) => write!(f, "{e}"),
            DocumentError::Docx(e) => write!(f, "{e}"),
        }
    }
}

impl From<std::io::Error> for DocumentError {
    fn from(e: std::io::Error) -> Self {
        DocumentError::Io(e)
    }
}

impl From<sqlx::Error> for DocumentError {
    fn from(e: sqlx::Error) -> Self {
        DocumentError::Db(e)
    }
}

impl From<zip::result::ZipError> for DocumentError {
    fn from(e: zip::result::ZipError) -> Self {
        DocumentError::Zip(e)
    }
}

impl From<rust_xlsxwriter::XlsxError> for DocumentError {
    fn from(e: rust_xlsxwriter::XlsxError) -> Self {
        DocumentError::Xlsx(e)
    }
}

impl From<docx_rs::DocxError> for DocumentError {
    fn from(e: docx_rs::DocxError) -> Self {
        DocumentError::Docx(e)
    }
}

/// One link into a per-entity-type index page, collected while
/// regenerating Markdown so the index can point at wherever
/// `resolve_vault_dir` actually put each record (a case-linked
/// statement's own case folder, say), without re-deriving that logic.
struct IndexEntry {
    title: String,
    relative_path: String,
}

async fn index_entry(
    pool: &SqlitePool,
    vault_root: &Path,
    entity_type: &str,
    entity_id: &str,
    stem: &str,
    title: &str,
) -> Option<IndexEntry> {
    let dir = attachments::resolve_vault_dir(pool, vault_root, entity_type, entity_id).await.ok()?;
    let relative_dir = dir.strip_prefix(vault_root).ok()?.to_string_lossy().replace('\\', "/");
    let relative_path =
        if relative_dir.is_empty() { format!("{stem}.md") } else { format!("{relative_dir}/{stem}.md") };
    Some(IndexEntry { title: title.to_string(), relative_path })
}

fn write_index_file(vault_root: &Path, slug: &str, heading: &str, entries: &[IndexEntry]) -> std::io::Result<()> {
    let index_dir = vault_root.join("index");
    std::fs::create_dir_all(&index_dir)?;

    let mut body = format!("# {heading} ({})\n\n", entries.len());
    if entries.is_empty() {
        body.push_str("None recorded.\n");
    } else {
        for entry in entries {
            body.push_str(&format!("- [{}](../{})\n", entry.title, entry.relative_path));
        }
    }
    std::fs::write(index_dir.join(format!("{slug}.md")), body)
}

fn write_readme(vault_root: &Path, sections: &[(&str, &str, usize)]) -> std::io::Result<()> {
    let mut body = String::from(
        "# Pleadli Police Vault\n\n\
         Every record this station has entered, organized by type. Each entry below links to \
         that record's own Markdown file; attached files (photos, documents) live alongside it \
         in the same folder.\n\n## Index\n\n",
    );
    for (slug, heading, count) in sections {
        body.push_str(&format!("- [{heading}](index/{slug}.md) ({count})\n"));
    }
    body.push_str(&format!(
        "\n_Generated {}._\n",
        chrono::Utc::now().format("%Y-%m-%d %H:%M UTC")
    ));
    std::fs::write(vault_root.join("README.md"), body)
}

/// Regenerates every record's `.md` companion fresh (guards against a
/// record whose file moved or predates a given field existing) and writes
/// a navigable index on top: one page per entity type under `index/`,
/// plus a root `README.md` linking all of them. This is the "well
/// organized structure" the Markdown export promises, not just files
/// dropped in a folder.
pub async fn regenerate_all_markdown(pool: &SqlitePool, vault_root: &Path) -> Result<(), DocumentError> {
    let mut sections: Vec<(&str, &str, usize)> = Vec::new();

    let mut people_index = Vec::new();
    for record in people::list_all(pool).await? {
        people::write_person_markdown(pool, vault_root, &record).await;
        if let Some(e) = index_entry(
            pool,
            vault_root,
            "person",
            &record.id,
            &format!("person-{}", record.id),
            &format!("{} {}", record.first_name, record.last_name),
        )
        .await
        {
            people_index.push(e);
        }
    }
    sections.push(("people", "People", people_index.len()));
    write_index_file(vault_root, "people", "People", &people_index)?;

    let mut cases_index = Vec::new();
    for record in cases::list_all(pool).await? {
        cases::write_case_markdown(pool, vault_root, &record).await;
        if let Some(e) =
            index_entry(pool, vault_root, "case", &record.id, &format!("case-{}", record.id), &record.reference).await
        {
            cases_index.push(e);
        }
    }
    sections.push(("cases", "Cases", cases_index.len()));
    write_index_file(vault_root, "cases", "Cases", &cases_index)?;

    let mut incidents_index = Vec::new();
    for record in incidents::list_all(pool).await? {
        incidents::write_incident_markdown(pool, vault_root, &record).await;
        if let Some(e) = index_entry(
            pool,
            vault_root,
            "incident",
            &record.id,
            &format!("incident-{}", record.id),
            &record.summary,
        )
        .await
        {
            incidents_index.push(e);
        }
    }
    sections.push(("incidents", "Incidents", incidents_index.len()));
    write_index_file(vault_root, "incidents", "Incidents", &incidents_index)?;

    let mut statements_index = Vec::new();
    for record in statements::list_all(pool).await? {
        statements::write_statement_markdown(pool, vault_root, &record).await;
        if let Some(e) = index_entry(
            pool,
            vault_root,
            "statement",
            &record.id,
            &format!("statement-{}", record.id),
            &format!("Statement: {} {}", record.person_first_name, record.person_last_name),
        )
        .await
        {
            statements_index.push(e);
        }
    }
    sections.push(("statements", "Statements", statements_index.len()));
    write_index_file(vault_root, "statements", "Statements", &statements_index)?;

    let mut custody_index = Vec::new();
    for record in custody::list_all(pool).await? {
        custody::write_custody_markdown(pool, vault_root, &record).await;
        if let Some(e) = index_entry(
            pool,
            vault_root,
            "custody_record",
            &record.id,
            &format!("custody_record-{}", record.id),
            &format!("Custody record: {} {}", record.person_first_name, record.person_last_name),
        )
        .await
        {
            custody_index.push(e);
        }
    }
    sections.push(("custody", "Custody", custody_index.len()));
    write_index_file(vault_root, "custody", "Custody", &custody_index)?;

    let mut bonds_index = Vec::new();
    for record in bonds::list_all(pool).await? {
        bonds::write_bond_markdown(pool, vault_root, &record).await;
        if let Some(e) = index_entry(
            pool,
            vault_root,
            "bond",
            &record.id,
            &format!("bond-{}", record.id),
            &format!("Bond: {} {}", record.person_first_name, record.person_last_name),
        )
        .await
        {
            bonds_index.push(e);
        }
    }
    sections.push(("bonds", "Bonds", bonds_index.len()));
    write_index_file(vault_root, "bonds", "Bonds", &bonds_index)?;

    let mut exhibits_index = Vec::new();
    for record in exhibits::list_all(pool).await? {
        exhibits::write_exhibit_markdown(pool, vault_root, &record).await;
        if let Some(e) = index_entry(
            pool,
            vault_root,
            "exhibit",
            &record.id,
            &format!("exhibit-{}", record.id),
            &record.description,
        )
        .await
        {
            exhibits_index.push(e);
        }
    }
    sections.push(("exhibits", "Evidence", exhibits_index.len()));
    write_index_file(vault_root, "exhibits", "Evidence", &exhibits_index)?;

    let mut charge_sheets_index = Vec::new();
    for record in charge_sheets::list_all(pool).await? {
        charge_sheets::write_charge_sheet_markdown(pool, vault_root, &record).await;
        if let Some(e) = index_entry(
            pool,
            vault_root,
            "charge_sheet",
            &record.id,
            &format!("charge_sheet-{}", record.id),
            &record.offence,
        )
        .await
        {
            charge_sheets_index.push(e);
        }
    }
    sections.push(("charge-sheets", "Charge Sheets", charge_sheets_index.len()));
    write_index_file(vault_root, "charge-sheets", "Charge Sheets", &charge_sheets_index)?;

    let mut referrals_index = Vec::new();
    for record in referrals::list_all(pool).await? {
        referrals::write_referral_markdown(pool, vault_root, &record).await;
        if let Some(e) = index_entry(
            pool,
            vault_root,
            "referral",
            &record.id,
            &format!("referral-{}", record.id),
            &format!("Referral: {}", record.case_reference),
        )
        .await
        {
            referrals_index.push(e);
        }
    }
    sections.push(("referrals", "Referrals", referrals_index.len()));
    write_index_file(vault_root, "referrals", "Referrals", &referrals_index)?;

    let mut station_diary_index = Vec::new();
    for record in station_diary::list_all(pool).await? {
        station_diary::write_entry_markdown(pool, vault_root, &record).await;
        if let Some(e) = index_entry(
            pool,
            vault_root,
            "station_diary_entry",
            &record.id,
            &format!("station_diary_entry-{}", record.id),
            &format!("Station Diary: {}", record.category.replace('_', " ")),
        )
        .await
        {
            station_diary_index.push(e);
        }
    }
    sections.push(("station-diary", "Station Diary", station_diary_index.len()));
    write_index_file(vault_root, "station-diary", "Station Diary", &station_diary_index)?;

    let mut duty_index = Vec::new();
    for record in duty::list_all(pool).await? {
        duty::write_assignment_markdown(pool, vault_root, &record).await;
        if let Some(e) = index_entry(
            pool,
            vault_root,
            "duty_assignment",
            &record.id,
            &format!("duty_assignment-{}", record.id),
            &format!("Duty: {}", record.officer_name),
        )
        .await
        {
            duty_index.push(e);
        }
    }
    sections.push(("duty", "Duty Roster", duty_index.len()));
    write_index_file(vault_root, "duty", "Duty Roster", &duty_index)?;

    let mut station_assets_index = Vec::new();
    for record in station_assets::list_all(pool).await? {
        station_assets::write_asset_markdown(pool, vault_root, &record).await;
        if let Some(e) = index_entry(
            pool,
            vault_root,
            "station_asset",
            &record.id,
            &format!("station_asset-{}", record.id),
            &record.description,
        )
        .await
        {
            station_assets_index.push(e);
        }
    }
    sections.push(("station-assets", "Station Assets", station_assets_index.len()));
    write_index_file(vault_root, "station-assets", "Station Assets", &station_assets_index)?;

    let mut vehicles_index = Vec::new();
    for record in vehicles::list_all(pool).await? {
        vehicles::write_vehicle_markdown(pool, vault_root, &record).await;
        if let Some(e) = index_entry(
            pool,
            vault_root,
            "vehicle",
            &record.id,
            &format!("vehicle-{}", record.id),
            &record.plate_number,
        )
        .await
        {
            vehicles_index.push(e);
        }
    }
    sections.push(("vehicles", "Vehicles", vehicles_index.len()));
    write_index_file(vault_root, "vehicles", "Vehicles", &vehicles_index)?;

    let mut check_ins_index = Vec::new();
    for record in shift_log::list_all_check_ins(pool).await? {
        shift_log::write_check_in_markdown(pool, vault_root, &record).await;
        if let Some(e) = index_entry(
            pool,
            vault_root,
            "officer_check_in",
            &record.id,
            &format!("officer_check_in-{}", record.id),
            &format!("Check-in: {}", record.officer_name),
        )
        .await
        {
            check_ins_index.push(e);
        }
    }
    sections.push(("check-ins", "Check-ins", check_ins_index.len()));
    write_index_file(vault_root, "check-ins", "Check-ins", &check_ins_index)?;

    let mut handovers_index = Vec::new();
    for record in shift_log::list_all_handovers(pool).await? {
        shift_log::write_handover_markdown(pool, vault_root, &record).await;
        if let Some(e) = index_entry(
            pool,
            vault_root,
            "shift_handover",
            &record.id,
            &format!("shift_handover-{}", record.id),
            &format!("Handover to {}", record.incoming_officer_name),
        )
        .await
        {
            handovers_index.push(e);
        }
    }
    sections.push(("shift-handovers", "Shift Handovers", handovers_index.len()));
    write_index_file(vault_root, "shift-handovers", "Shift Handovers", &handovers_index)?;

    let mut officers_index = Vec::new();
    for record in officers::list_officers(pool).await? {
        officers::write_officer_markdown(pool, vault_root, &record).await;
        if let Some(e) = index_entry(pool, vault_root, "officer", &record.id, &format!("officer-{}", record.id), &record.name).await {
            officers_index.push(e);
        }
    }
    sections.push(("officers", "Officers", officers_index.len()));
    write_index_file(vault_root, "officers", "Officers", &officers_index)?;

    if let Some(profile) = station_admin::get_station_profile(pool).await? {
        if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "station_profile", "profile").await {
            let title = profile.name.clone().unwrap_or_else(|| "Station Profile".to_string());
            let _ = markdown::write_record(&dir, "station_profile-profile", &title, &profile);
        }
    }

    write_readme(vault_root, &sections)?;
    Ok(())
}

/// Zips the whole Vault tree (whatever's currently on disk under
/// `vault_root`, README/index included) to `destination`: a single
/// portable file an officer can copy to a USB stick or send on.
fn zip_vault(vault_root: &Path, destination: &Path) -> Result<(), DocumentError> {
    let file = std::fs::File::create(destination)?;
    let mut writer = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    fn walk(
        writer: &mut zip::ZipWriter<std::fs::File>,
        base: &Path,
        dir: &Path,
        options: zip::write::SimpleFileOptions,
    ) -> Result<(), DocumentError> {
        for dir_entry in std::fs::read_dir(dir)? {
            let dir_entry = dir_entry?;
            let path = dir_entry.path();
            let relative = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().replace('\\', "/");
            if path.is_dir() {
                walk(writer, base, &path, options)?;
            } else {
                writer.start_file(relative, options)?;
                writer.write_all(&std::fs::read(&path)?)?;
            }
        }
        Ok(())
    }

    walk(&mut writer, vault_root, vault_root, options)?;
    writer.finish()?;
    Ok(())
}

/// Regenerates every record's Markdown fresh, builds the index/README on
/// top, then zips the whole Vault to `destination`: the default "export
/// all data" format.
pub async fn export_all_markdown(pool: &SqlitePool, vault_root: &Path, destination: &Path) -> Result<(), DocumentError> {
    regenerate_all_markdown(pool, vault_root).await?;
    zip_vault(vault_root, destination)?;
    Ok(())
}

/// One sheet's worth of rows, columns derived from whatever fields the
/// record actually serializes as (the same JSON shape `markdown.rs`
/// already reads), so a new field on any domain struct shows up in the
/// export without this function needing to know about it by name.
fn write_sheet<T: Serialize>(workbook: &mut Workbook, sheet_name: &str, rows: &[T]) -> Result<(), DocumentError> {
    let worksheet = workbook.add_worksheet();
    worksheet.set_name(sheet_name)?;

    let Some(first) = rows.first() else {
        worksheet.write_string(0, 0, "No records.")?;
        return Ok(());
    };
    let Value::Object(first_map) = serde_json::to_value(first).unwrap_or(Value::Null) else {
        return Ok(());
    };
    let keys: Vec<String> = first_map.keys().filter(|k| k.as_str() != "id").cloned().collect();

    let header_format = Format::new().set_bold();
    for (col, key) in keys.iter().enumerate() {
        worksheet.write_string_with_format(0, col as u16, markdown::humanize_key(key), &header_format)?;
    }

    for (row_index, record) in rows.iter().enumerate() {
        let Value::Object(map) = serde_json::to_value(record).unwrap_or(Value::Null) else {
            continue;
        };
        for (col, key) in keys.iter().enumerate() {
            let cell = map.get(key).map(|v| markdown::format_value(key, v)).unwrap_or_default();
            worksheet.write_string((row_index + 1) as u32, col as u16, cell)?;
        }
    }

    Ok(())
}

/// One workbook, one sheet per table: the natural "all the data"
/// spreadsheet, read straight through each domain's own unlimited
/// `list_all`.
pub async fn export_all_xlsx(pool: &SqlitePool, destination: &Path) -> Result<(), DocumentError> {
    let mut workbook = Workbook::new();

    write_sheet(&mut workbook, "People", &people::list_all(pool).await?)?;
    write_sheet(&mut workbook, "Cases", &cases::list_all(pool).await?)?;
    write_sheet(&mut workbook, "Incidents", &incidents::list_all(pool).await?)?;
    write_sheet(&mut workbook, "Statements", &statements::list_all(pool).await?)?;
    write_sheet(&mut workbook, "Custody", &custody::list_all(pool).await?)?;
    write_sheet(&mut workbook, "Bonds", &bonds::list_all(pool).await?)?;
    write_sheet(&mut workbook, "Exhibits", &exhibits::list_all(pool).await?)?;
    write_sheet(&mut workbook, "Charge Sheets", &charge_sheets::list_all(pool).await?)?;
    write_sheet(&mut workbook, "Referrals", &referrals::list_all(pool).await?)?;
    write_sheet(&mut workbook, "Station Diary", &station_diary::list_all(pool).await?)?;
    write_sheet(&mut workbook, "Duty Roster", &duty::list_all(pool).await?)?;
    write_sheet(&mut workbook, "Station Assets", &station_assets::list_all(pool).await?)?;
    write_sheet(&mut workbook, "Vehicles", &vehicles::list_all(pool).await?)?;
    write_sheet(&mut workbook, "Check-ins", &shift_log::list_all_check_ins(pool).await?)?;
    write_sheet(&mut workbook, "Shift Handovers", &shift_log::list_all_handovers(pool).await?)?;
    write_sheet(&mut workbook, "Officers", &officers::list_officers(pool).await?)?;

    workbook.save(destination)?;
    Ok(())
}

// ---------------------------------------------------------------------
// PDF / DOCX: a single format-agnostic document tree, rendered once per
// format. `Doc` is deliberately generic (a title, an optional lead photo,
// and a flat list of heading/fields/notes/table sections) so the bulk
// "every table" export and the three per-record templates below build the
// same shape and share the same two renderers. Nothing downstream of
// `Doc` knows or cares which one produced it.
// ---------------------------------------------------------------------

struct DocImage {
    bytes: Vec<u8>,
    display_width: u32,
    display_height: u32,
}

struct DocTable {
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
}

struct DocSection {
    heading: String,
    fields: Vec<(String, String)>,
    /// Freeform text (a charge sheet's particulars, a case's summary),
    /// rendered as its own paragraph, not squeezed into a label/value row.
    notes: Option<String>,
    tables: Vec<DocTable>,
}

struct Doc {
    title: String,
    subtitle: Option<String>,
    photo: Option<DocImage>,
    sections: Vec<DocSection>,
}

pub enum DocumentFormat {
    Pdf,
    Docx,
}

impl DocumentFormat {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "pdf" => Some(Self::Pdf),
            "docx" => Some(Self::Docx),
            _ => None,
        }
    }
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

/// One table's worth of rows, columns derived from whatever fields the
/// record actually serializes as, the same approach `write_sheet` uses
/// for Excel, so a new field on any domain struct shows up here too
/// without this function needing to know about it by name.
fn doc_table_from_records<T: Serialize>(rows: &[T]) -> Option<DocTable> {
    let first = rows.first()?;
    let Value::Object(first_map) = serde_json::to_value(first).unwrap_or(Value::Null) else {
        return None;
    };
    let keys: Vec<String> = first_map.keys().filter(|k| k.as_str() != "id").cloned().collect();
    let headers = keys.iter().map(|k| markdown::humanize_key(k)).collect();

    let mut table_rows = Vec::new();
    for record in rows {
        let Value::Object(map) = serde_json::to_value(record).unwrap_or(Value::Null) else {
            continue;
        };
        table_rows.push(keys.iter().map(|k| map.get(k).map(|v| markdown::format_value(k, v)).unwrap_or_default()).collect());
    }

    Some(DocTable { headers, rows: table_rows })
}

fn doc_table_section<T: Serialize>(heading: &str, rows: &[T]) -> DocSection {
    match doc_table_from_records(rows) {
        Some(table) => DocSection { heading: heading.to_string(), fields: Vec::new(), notes: None, tables: vec![table] },
        None => DocSection {
            heading: heading.to_string(),
            fields: Vec::new(),
            notes: Some("None recorded.".to_string()),
            tables: Vec::new(),
        },
    }
}

fn format_timestamp(millis: i64) -> String {
    chrono::DateTime::<chrono::Utc>::from_timestamp_millis(millis)
        .map(|dt| dt.format("%Y-%m-%d %H:%M").to_string())
        .unwrap_or_default()
}

const PHOTO_DISPLAY_WIDTH_PX: u32 = 140;

fn scaled_photo_box(width_px: u32, height_px: u32) -> (u32, u32) {
    if width_px == 0 {
        return (PHOTO_DISPLAY_WIDTH_PX, PHOTO_DISPLAY_WIDTH_PX);
    }
    let height = ((height_px as f64) * (PHOTO_DISPLAY_WIDTH_PX as f64) / (width_px as f64)).round() as u32;
    (PHOTO_DISPLAY_WIDTH_PX, height.max(1))
}

/// A person's headshot, decoded and dimension-checked up front:
/// `docx_rs::Pic::new` panics on bytes it can't decode, so this proves
/// decodability (and gets real pixel dimensions, for an aspect-correct
/// print size) before either renderer ever sees the bytes. A format the
/// `image` crate can't decode (HEIC, notably) is silently skipped rather
/// than failing the whole export; the rest of the document still prints.
async fn person_photo(pool: &SqlitePool, vault_root: &Path, headshot_attachment_id: Option<&str>) -> Option<DocImage> {
    let attachment = attachments::get_attachment(pool, headshot_attachment_id?).await.ok().flatten()?;
    let bytes = std::fs::read(attachments::absolute_path(vault_root, &attachment.stored_path).ok()?).ok()?;
    let decoded = image::load_from_memory(&bytes).ok()?;
    use image::GenericImageView;
    let (width_px, height_px) = decoded.dimensions();
    let (display_width, display_height) = scaled_photo_box(width_px, height_px);
    Some(DocImage { bytes, display_width, display_height })
}

/// Renders the document tree as a small self-contained HTML page: the
/// input `printpdf::PdfDocument::from_html` lays out (with real
/// pagination) into a PDF. Any embedded photo is registered in the
/// returned image map under the same key its `<img src>` references.
fn build_html_and_images(doc: &Doc) -> (String, std::collections::BTreeMap<String, printpdf::Base64OrRaw>) {
    let mut images = std::collections::BTreeMap::new();
    let mut body = format!("<h1>{}</h1>", escape_html(&doc.title));

    if let Some(subtitle) = &doc.subtitle {
        body.push_str(&format!("<p style=\"color:#555555;\">{}</p>", escape_html(subtitle)));
    }

    if let Some(photo) = &doc.photo {
        images.insert("doc-photo".to_string(), printpdf::Base64OrRaw::Raw(photo.bytes.clone()));
        body.push_str(&format!(
            "<img src=\"doc-photo\" style=\"width:{}px;height:{}px;\" />",
            photo.display_width, photo.display_height
        ));
    }

    for section in &doc.sections {
        body.push_str(&format!("<h2>{}</h2>", escape_html(&section.heading)));

        if !section.fields.is_empty() {
            body.push_str("<table style=\"width:100%; border-collapse:collapse; margin-bottom:12px;\">");
            for (label, value) in &section.fields {
                body.push_str(&format!(
                    "<tr><td style=\"padding:4px 8px; font-weight:bold; width:180px; vertical-align:top;\">{}</td><td style=\"padding:4px 8px; white-space:pre-wrap;\">{}</td></tr>",
                    escape_html(label),
                    escape_html(value)
                ));
            }
            body.push_str("</table>");
        }

        if let Some(notes) = &section.notes {
            body.push_str(&format!("<p style=\"white-space:pre-wrap; padding:4px 8px;\">{}</p>", escape_html(notes)));
        }

        for table in &section.tables {
            body.push_str("<table style=\"width:100%; border-collapse:collapse; margin-bottom:16px;\"><thead><tr>");
            for header in &table.headers {
                body.push_str(&format!(
                    "<th style=\"border-bottom:1px solid #999999; text-align:left; padding:4px 8px;\">{}</th>",
                    escape_html(header)
                ));
            }
            body.push_str("</tr></thead><tbody>");
            for row in &table.rows {
                body.push_str("<tr>");
                for cell in row {
                    body.push_str(&format!(
                        "<td style=\"border-bottom:1px solid #eeeeee; padding:4px 8px;\">{}</td>",
                        escape_html(cell)
                    ));
                }
                body.push_str("</tr>");
            }
            body.push_str("</tbody></table>");
        }
    }

    let html = format!(
        "<html><body style=\"font-family: sans-serif; font-size: 11px; color:#222222;\">{body}</body></html>"
    );
    (html, images)
}

fn render_pdf(doc: &Doc) -> Result<Vec<u8>, DocumentError> {
    let (html, images) = build_html_and_images(doc);
    let fonts = std::collections::BTreeMap::new();
    let options = printpdf::GeneratePdfOptions::default();
    let mut warnings = Vec::new();

    let pdf = printpdf::PdfDocument::from_html(&html, &images, &fonts, &options, &mut warnings)
        .map_err(DocumentError::Pdf)?;

    let mut save_warnings = Vec::new();
    Ok(pdf.save(&printpdf::PdfSaveOptions::default(), &mut save_warnings))
}

fn render_docx(doc: &Doc, destination: &Path) -> Result<(), DocumentError> {
    let mut docx = docx_rs::Docx::new()
        .add_paragraph(docx_rs::Paragraph::new().add_run(docx_rs::Run::new().add_text(doc.title.clone()).bold().size(32)));

    if let Some(subtitle) = &doc.subtitle {
        docx = docx.add_paragraph(docx_rs::Paragraph::new().add_run(docx_rs::Run::new().add_text(subtitle.clone()).size(20)));
    }

    if let Some(photo) = &doc.photo {
        let pic = docx_rs::Pic::new(&photo.bytes).size(photo.display_width * 9525, photo.display_height * 9525);
        docx = docx.add_paragraph(docx_rs::Paragraph::new().add_run(docx_rs::Run::new().add_image(pic)));
    }

    for section in &doc.sections {
        docx = docx.add_paragraph(
            docx_rs::Paragraph::new().add_run(docx_rs::Run::new().add_text(section.heading.clone()).bold().size(26)),
        );

        for (label, value) in &section.fields {
            docx = docx.add_paragraph(
                docx_rs::Paragraph::new()
                    .add_run(docx_rs::Run::new().add_text(format!("{label}: ")).bold())
                    .add_run(docx_rs::Run::new().add_text(value.clone())),
            );
        }

        if let Some(notes) = &section.notes {
            docx = docx.add_paragraph(docx_rs::Paragraph::new().add_run(docx_rs::Run::new().add_text(notes.clone())));
        }

        for table in &section.tables {
            let mut rows = Vec::new();
            if !table.headers.is_empty() {
                rows.push(docx_rs::TableRow::new(
                    table
                        .headers
                        .iter()
                        .map(|h| {
                            docx_rs::TableCell::new()
                                .add_paragraph(docx_rs::Paragraph::new().add_run(docx_rs::Run::new().add_text(h.clone()).bold()))
                        })
                        .collect(),
                ));
            }
            for row in &table.rows {
                rows.push(docx_rs::TableRow::new(
                    row.iter()
                        .map(|cell| {
                            docx_rs::TableCell::new()
                                .add_paragraph(docx_rs::Paragraph::new().add_run(docx_rs::Run::new().add_text(cell.clone())))
                        })
                        .collect(),
                ));
            }
            if !rows.is_empty() {
                docx = docx.add_table(docx_rs::Table::new(rows));
            }
        }
    }

    let file = std::fs::File::create(destination)?;
    docx.build().pack(file)?;
    Ok(())
}

async fn write_doc(doc: &Doc, format: DocumentFormat, destination: &Path) -> Result<(), DocumentError> {
    match format {
        DocumentFormat::Pdf => std::fs::write(destination, render_pdf(doc)?)?,
        DocumentFormat::Docx => render_docx(doc, destination)?,
    }
    Ok(())
}

/// Same tables as `export_all_xlsx`, laid out as one flowing document
/// instead of a workbook: the "plain but organized" tier of PDF/DOCX
/// export, distinct from the polished per-record templates below.
async fn build_bulk_export_document(pool: &SqlitePool) -> Result<Doc, DocumentError> {
    let sections = vec![
        doc_table_section("People", &people::list_all(pool).await?),
        doc_table_section("Cases", &cases::list_all(pool).await?),
        doc_table_section("Incidents", &incidents::list_all(pool).await?),
        doc_table_section("Statements", &statements::list_all(pool).await?),
        doc_table_section("Custody", &custody::list_all(pool).await?),
        doc_table_section("Bonds", &bonds::list_all(pool).await?),
        doc_table_section("Evidence", &exhibits::list_all(pool).await?),
        doc_table_section("Charge Sheets", &charge_sheets::list_all(pool).await?),
        doc_table_section("Referrals", &referrals::list_all(pool).await?),
        doc_table_section("Station Diary", &station_diary::list_all(pool).await?),
        doc_table_section("Duty Roster", &duty::list_all(pool).await?),
        doc_table_section("Station Assets", &station_assets::list_all(pool).await?),
        doc_table_section("Vehicles", &vehicles::list_all(pool).await?),
        doc_table_section("Check-ins", &shift_log::list_all_check_ins(pool).await?),
        doc_table_section("Shift Handovers", &shift_log::list_all_handovers(pool).await?),
        doc_table_section("Officers", &officers::list_officers(pool).await?),
    ];

    Ok(Doc {
        title: "Pleadli Police \u{b7} Full Data Export".to_string(),
        subtitle: Some(format!("Generated {}", chrono::Utc::now().format("%Y-%m-%d %H:%M UTC"))),
        photo: None,
        sections,
    })
}

pub async fn export_all_pdf(pool: &SqlitePool, destination: &Path) -> Result<(), DocumentError> {
    let doc = build_bulk_export_document(pool).await?;
    write_doc(&doc, DocumentFormat::Pdf, destination).await
}

pub async fn export_all_docx(pool: &SqlitePool, destination: &Path) -> Result<(), DocumentError> {
    let doc = build_bulk_export_document(pool).await?;
    write_doc(&doc, DocumentFormat::Docx, destination).await
}

async fn build_person_document(pool: &SqlitePool, vault_root: &Path, id: &str) -> Result<Option<Doc>, DocumentError> {
    let Some(profile) = people::get_person_profile(pool, id).await? else {
        return Ok(None);
    };
    let person = &profile.person;

    let identity = DocSection {
        heading: "Identity".to_string(),
        fields: vec![
            ("Name".to_string(), format!("{} {}", person.first_name, person.last_name)),
            ("Other names".to_string(), person.other_names.clone().unwrap_or_else(|| "·".to_string())),
            ("Phone".to_string(), person.phone.clone().unwrap_or_else(|| "·".to_string())),
            ("National ID".to_string(), person.national_id.clone().unwrap_or_else(|| "·".to_string())),
            ("Address".to_string(), person.address.clone().unwrap_or_else(|| "·".to_string())),
            ("Recorded".to_string(), format_timestamp(person.created_at)),
        ],
        notes: None,
        tables: Vec::new(),
    };

    let photo = person_photo(pool, vault_root, person.headshot_attachment_id.as_deref()).await;

    let sections = vec![
        identity,
        doc_table_section("Cases", &profile.cases),
        doc_table_section("Incidents", &profile.incidents),
        doc_table_section("Statements", &profile.statements),
        doc_table_section("Custody records", &profile.custody_records),
        doc_table_section("Bonds", &profile.bonds),
        doc_table_section("Station diary entries", &profile.station_diary_entries),
        doc_table_section("Evidence", &profile.exhibits),
        doc_table_section("Charge sheets", &profile.charge_sheets),
        doc_table_section("Vehicles", &profile.vehicles),
    ];

    Ok(Some(Doc {
        title: format!("{} {}", person.first_name, person.last_name),
        subtitle: Some(format!("Person record · generated {}", chrono::Utc::now().format("%Y-%m-%d %H:%M UTC"))),
        photo,
        sections,
    }))
}

pub async fn export_person_document(
    pool: &SqlitePool,
    vault_root: &Path,
    id: &str,
    format: DocumentFormat,
    destination: &Path,
) -> Result<bool, DocumentError> {
    let Some(doc) = build_person_document(pool, vault_root, id).await? else {
        return Ok(false);
    };
    write_doc(&doc, format, destination).await?;
    Ok(true)
}

async fn build_case_document(pool: &SqlitePool, id: &str) -> Result<Option<Doc>, DocumentError> {
    let Some(workspace) = cases::get_case_workspace(pool, id).await? else {
        return Ok(None);
    };
    let case = &workspace.case;

    let overview = DocSection {
        heading: "Case".to_string(),
        fields: vec![
            ("Reference".to_string(), case.reference.clone()),
            ("Status".to_string(), case.status.clone()),
            ("Incident".to_string(), case.incident_summary.clone().unwrap_or_else(|| "·".to_string())),
            ("Recorded".to_string(), format_timestamp(case.created_at)),
        ],
        notes: Some(case.summary.clone()),
        tables: Vec::new(),
    };

    let people_section = if workspace.people.is_empty() {
        DocSection {
            heading: "People involved".to_string(),
            fields: Vec::new(),
            notes: Some("None recorded.".to_string()),
            tables: Vec::new(),
        }
    } else {
        DocSection {
            heading: "People involved".to_string(),
            fields: Vec::new(),
            notes: None,
            tables: vec![DocTable {
                headers: vec!["Name".to_string(), "Role".to_string()],
                rows: workspace
                    .people
                    .iter()
                    .map(|p| {
                        vec![
                            format!(
                                "{} {}{}",
                                p.person_first_name,
                                p.person_last_name,
                                p.person_other_names.as_deref().map(|n| format!(" ({n})")).unwrap_or_default()
                            ),
                            p.role.clone(),
                        ]
                    })
                    .collect(),
            }],
        }
    };

    let sections = vec![
        overview,
        people_section,
        doc_table_section("Statements", &workspace.statements),
        doc_table_section("Custody records", &workspace.custody_records),
        doc_table_section("Bonds", &workspace.bonds),
        doc_table_section("Evidence", &workspace.exhibits),
        doc_table_section("Charge sheets", &workspace.charge_sheets),
        doc_table_section("Referrals", &workspace.referrals),
    ];

    Ok(Some(Doc {
        title: case.reference.clone(),
        subtitle: Some(format!("Case file · generated {}", chrono::Utc::now().format("%Y-%m-%d %H:%M UTC"))),
        photo: None,
        sections,
    }))
}

pub async fn export_case_document(
    pool: &SqlitePool,
    id: &str,
    format: DocumentFormat,
    destination: &Path,
) -> Result<bool, DocumentError> {
    let Some(doc) = build_case_document(pool, id).await? else {
        return Ok(false);
    };
    write_doc(&doc, format, destination).await?;
    Ok(true)
}

async fn build_charge_sheet_document(pool: &SqlitePool, id: &str) -> Result<Option<Doc>, DocumentError> {
    let Some(sheet) = charge_sheets::get_charge_sheet(pool, id).await? else {
        return Ok(None);
    };

    let accused = match (&sheet.accused_first_name, &sheet.accused_last_name) {
        (Some(first), Some(last)) => {
            format!("{first} {last}{}", sheet.accused_other_names.as_deref().map(|n| format!(" ({n})")).unwrap_or_default())
        }
        _ => "·".to_string(),
    };

    let details = DocSection {
        heading: "Charge details".to_string(),
        fields: vec![
            ("Case reference".to_string(), sheet.case_reference.clone()),
            ("Accused".to_string(), accused),
            ("Offence".to_string(), sheet.offence.clone()),
            ("Statutory section".to_string(), sheet.statutory_section.clone()),
            ("Charged at".to_string(), format_timestamp(sheet.charged_at)),
            ("Officer".to_string(), sheet.officer_name.clone().unwrap_or_else(|| "·".to_string())),
            ("Station".to_string(), sheet.station_name.clone().unwrap_or_else(|| "·".to_string())),
        ],
        notes: None,
        tables: Vec::new(),
    };

    let particulars =
        DocSection { heading: "Particulars of offence".to_string(), fields: Vec::new(), notes: Some(sheet.particulars.clone()), tables: Vec::new() };

    Ok(Some(Doc {
        title: format!("Charge \u{b7} {}", sheet.offence),
        subtitle: Some(format!(
            "PF 53 \u{b7} Case {} \u{b7} generated {}",
            sheet.case_reference,
            chrono::Utc::now().format("%Y-%m-%d %H:%M UTC")
        )),
        photo: None,
        sections: vec![details, particulars],
    }))
}

pub async fn export_charge_sheet_document(
    pool: &SqlitePool,
    id: &str,
    format: DocumentFormat,
    destination: &Path,
) -> Result<bool, DocumentError> {
    let Some(doc) = build_charge_sheet_document(pool, id).await? else {
        return Ok(false);
    };
    write_doc(&doc, format, destination).await?;
    Ok(true)
}
