//! The legal guide: the office's offences and what each needs, kept as data
//! the office edits (docs/specs/dpp/0001-simplified-dpp, AC-7). Starter text
//! comes from real charge sheets and carries `source = 'starter'` until the
//! office changes it. Every change stores the version it replaced, so any
//! earlier text can be put back. The starter's section numbers are copied from
//! real charge sheets and were checked against the Act's own text
//! (guide_starter.rs). What has to be proved is the Act's elements; the papers
//! and gaps are a draft of practice for the office to correct.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::error::{clean, invalid, DomainError};
use super::guide_starter::STARTER_UG;

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub const STATES: &[&str] = &["in_use", "waiting_for_director"];


#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Offence {
    pub id: String,
    pub jurisdiction: String,
    pub title: String,
    pub section_refs: Option<String>,
    pub charge_wording: Option<String>,
    pub particulars_template: Option<String>,
    #[sqlx(json)]
    pub proving: Vec<String>,
    #[sqlx(json)]
    pub papers: Vec<String>,
    #[sqlx(json)]
    pub gaps: Vec<String>,
    #[sqlx(json)]
    pub words: Vec<String>,
    pub source: String,
    pub starter_key: Option<String>,
    pub state: String,
    pub updated_by: Option<String>,
    pub updated_at: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OffenceInput {
    pub jurisdiction: Option<String>,
    pub title: String,
    pub section_refs: Option<String>,
    pub charge_wording: Option<String>,
    pub particulars_template: Option<String>,
    #[serde(default)]
    pub proving: Vec<String>,
    #[serde(default)]
    pub papers: Vec<String>,
    #[serde(default)]
    pub gaps: Vec<String>,
    #[serde(default)]
    pub words: Vec<String>,
    pub state: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub id: String,
    pub offence_id: String,
    #[sqlx(json)]
    pub snapshot: Value,
    pub changed_by: Option<String>,
    pub changed_at: i64,
    pub note: Option<String>,
}

const COLS: &str = "id, jurisdiction, title, section_refs, charge_wording, particulars_template, proving_json AS proving, papers_json AS papers, gaps_json AS gaps, words_json AS words, source, starter_key, state, updated_by, updated_at, created_at";

fn lines(v: Vec<String>) -> Vec<String> {
    v.into_iter().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
}


/// Puts any starter offence the office has never had into the guide. Archived
/// ones count as had, so removing one does not bring it back.
pub async fn ensure_starter(pool: &SqlitePool, jurisdiction: &str) -> Result<(), sqlx::Error> {
    if jurisdiction != "ug" {
        return Ok(());
    }
    let t = now();
    for st in STARTER_UG {
        sqlx::query(
            "INSERT OR IGNORE INTO guide_offences (id, jurisdiction, title, section_refs, charge_wording, source, starter_key, updated_at, created_at)
             VALUES (?, 'ug', ?, ?, ?, 'starter', ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(st.title)
        .bind(st.refs)
        .bind(st.wording)
        .bind(st.key)
        .bind(t)
        .bind(t)
        .execute(pool)
        .await?;
        // An entry the office has never edited still carries the first empty
        // starter. Fill it with the real content; an edited one is left alone.
        sqlx::query(
            "UPDATE guide_offences SET title = ?, section_refs = ?, charge_wording = ?, particulars_template = ?, proving_json = ?, papers_json = ?, gaps_json = ?, words_json = ?, updated_at = ?
             WHERE jurisdiction = 'ug' AND starter_key = ? AND source = 'starter' AND proving_json = '[]'",
        )
        .bind(st.title)
        .bind(st.refs)
        .bind(st.wording)
        .bind(st.particulars)
        .bind(serde_json::to_string(st.proving).unwrap_or_default())
        .bind(serde_json::to_string(st.papers).unwrap_or_default())
        .bind(serde_json::to_string(st.gaps).unwrap_or_default())
        .bind(serde_json::to_string(st.words).unwrap_or_default())
        .bind(t)
        .bind(st.key)
        .execute(pool)
        .await?;
    }
    Ok(())
}

pub async fn list(pool: &SqlitePool, jurisdiction: &str) -> Result<Vec<Offence>, sqlx::Error> {
    ensure_starter(pool, jurisdiction).await?;
    sqlx::query_as::<_, Offence>(sqlx::AssertSqlSafe(format!("SELECT {COLS} FROM guide_offences WHERE jurisdiction = ? AND archived_at IS NULL ORDER BY title COLLATE NOCASE")))
        .bind(jurisdiction)
        .fetch_all(pool)
        .await
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Offence, DomainError> {
    Ok(sqlx::query_as::<_, Offence>(sqlx::AssertSqlSafe(format!("SELECT {COLS} FROM guide_offences WHERE id = ?"))).bind(id).fetch_one(pool).await?)
}

fn check(input: &OffenceInput) -> Result<(), DomainError> {
    if input.title.trim().is_empty() {
        return invalid("Give the offence a name.");
    }
    if let Some(s) = &input.state {
        if !STATES.contains(&s.as_str()) {
            return invalid("That is not a state a guide entry can be in.");
        }
    }
    Ok(())
}

fn snapshot(o: &Offence) -> Value {
    json!({
        "title": o.title, "sectionRefs": o.section_refs, "chargeWording": o.charge_wording, "particularsTemplate": o.particulars_template,
        "proving": o.proving, "papers": o.papers, "gaps": o.gaps, "words": o.words, "state": o.state,
    })
}

pub async fn create(pool: &SqlitePool, input: OffenceInput, actor: Option<&str>) -> Result<Offence, DomainError> {
    check(&input)?;
    let Some(jurisdiction) = clean(input.jurisdiction.clone()) else {
        return invalid("Say which country this offence is for.");
    };
    let id = Uuid::new_v4().to_string();
    let t = now();
    sqlx::query(
        "INSERT INTO guide_offences (id, jurisdiction, title, section_refs, charge_wording, particulars_template, proving_json, papers_json, gaps_json, words_json,
                                     source, state, updated_by, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'office', ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(jurisdiction)
    .bind(input.title.trim())
    .bind(clean(input.section_refs))
    .bind(clean(input.charge_wording))
    .bind(clean(input.particulars_template))
    .bind(json!(lines(input.proving)).to_string())
    .bind(json!(lines(input.papers)).to_string())
    .bind(json!(lines(input.gaps)).to_string())
    .bind(json!(lines(input.words)).to_string())
    .bind(input.state.as_deref().unwrap_or("in_use"))
    .bind(actor)
    .bind(t)
    .bind(t)
    .execute(pool)
    .await?;
    get(pool, &id).await
}

/// Writes the new text, keeping the old as a version first.
pub async fn update(pool: &SqlitePool, id: &str, input: OffenceInput, actor: Option<&str>) -> Result<Offence, DomainError> {
    check(&input)?;
    let before = get(pool, id).await?;
    let t = now();
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    sqlx::query("INSERT INTO guide_versions (id, offence_id, snapshot_json, changed_by, changed_at, note) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(id)
        .bind(snapshot(&before).to_string())
        .bind(actor)
        .bind(t)
        .bind(clean(input.note.clone()))
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE guide_offences SET title = ?, section_refs = ?, charge_wording = ?, particulars_template = ?, proving_json = ?, papers_json = ?, gaps_json = ?,
                words_json = ?, state = ?, source = 'office', updated_by = ?, updated_at = ? WHERE id = ?",
    )
    .bind(input.title.trim())
    .bind(clean(input.section_refs))
    .bind(clean(input.charge_wording))
    .bind(clean(input.particulars_template))
    .bind(json!(lines(input.proving)).to_string())
    .bind(json!(lines(input.papers)).to_string())
    .bind(json!(lines(input.gaps)).to_string())
    .bind(json!(lines(input.words)).to_string())
    .bind(input.state.unwrap_or(before.state))
    .bind(actor)
    .bind(t)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    get(pool, id).await
}

pub async fn versions(pool: &SqlitePool, id: &str) -> Result<Vec<Version>, sqlx::Error> {
    sqlx::query_as("SELECT id, offence_id, snapshot_json AS snapshot, changed_by, changed_at, note FROM guide_versions WHERE offence_id = ? ORDER BY changed_at DESC, rowid DESC").bind(id).fetch_all(pool).await
}

fn strings(v: &Value) -> Vec<String> {
    v.as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default()
}

fn text(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_string)
}

/// Puts an earlier version back. The text being replaced is kept as a version
/// too, so a restore can itself be undone.
pub async fn restore_version(pool: &SqlitePool, version_id: &str, actor: Option<&str>) -> Result<Offence, DomainError> {
    let v: Version = sqlx::query_as("SELECT id, offence_id, snapshot_json AS snapshot, changed_by, changed_at, note FROM guide_versions WHERE id = ?").bind(version_id).fetch_one(pool).await?;
    let s = &v.snapshot;
    let input = OffenceInput {
        jurisdiction: None,
        title: text(s, "title").unwrap_or_default(),
        section_refs: text(s, "sectionRefs"),
        charge_wording: text(s, "chargeWording"),
        particulars_template: text(s, "particularsTemplate"),
        proving: strings(&s["proving"]),
        papers: strings(&s["papers"]),
        gaps: strings(&s["gaps"]),
        words: strings(&s["words"]),
        state: text(s, "state"),
        note: Some("Restored an earlier version".into()),
    };
    update(pool, &v.offence_id, input, actor).await
}

/// One action puts the starter text back (starter entries only).
pub async fn restore_starter(pool: &SqlitePool, id: &str, actor: Option<&str>) -> Result<Offence, DomainError> {
    let o = get(pool, id).await?;
    let Some(key) = o.starter_key.as_deref() else {
        return invalid("Only an entry that came with the app has starter text to go back to.");
    };
    let Some(st) = STARTER_UG.iter().find(|st| st.key == key) else {
        return invalid("The starter text for this entry is not known.");
    };
    let input = OffenceInput {
        jurisdiction: None,
        title: st.title.to_string(),
        section_refs: Some(st.refs.to_string()),
        charge_wording: Some(st.wording.to_string()),
        particulars_template: Some(st.particulars.to_string()),
        proving: st.proving.iter().map(|x| x.to_string()).collect(),
        papers: st.papers.iter().map(|x| x.to_string()).collect(),
        gaps: st.gaps.iter().map(|x| x.to_string()).collect(),
        words: st.words.iter().map(|x| x.to_string()).collect(),
        state: Some("in_use".into()),
        note: Some("Starter text restored".into()),
    };
    let restored = update(pool, id, input, actor).await?;
    sqlx::query("UPDATE guide_offences SET source = 'starter' WHERE id = ?").bind(id).execute(pool).await?;
    get(pool, &restored.id).await
}

/// Removes an entry from the guide's list. It is kept (archived), so history
/// stays and a starter entry does not come back by itself.
pub async fn archive(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    sqlx::query("UPDATE guide_offences SET archived_at = ? WHERE id = ?").bind(now()).bind(id).execute(pool).await?;
    Ok(())
}

// ------------------------------------------------------- reading it for a file

/// Words too common in offence names to say which guide entry a file is about.
const GENERIC: &[&str] = &["criminal", "breaking", "assault", "grievous", "actual", "bodily", "building", "felony", "doing"];

/// The guide entries a file's charges and title point at. An entry matches when
/// its title appears in what the file says, when a distinctive word of its title
/// does, or when one of its section numbers is named in a charge's section.
pub async fn for_file(pool: &SqlitePool, file_id: &str, jurisdiction: &str) -> Result<Vec<Offence>, sqlx::Error> {
    let rows: Vec<(String, Option<String>)> = sqlx::query_as("SELECT offence, statutory_section FROM charges WHERE prosecution_file_id = ?").bind(file_id).fetch_all(pool).await?;
    let title: String = sqlx::query_scalar("SELECT title FROM prosecution_files WHERE id = ?").bind(file_id).fetch_one(pool).await?;
    let said = format!("{} {}", rows.iter().map(|(o, _)| o.as_str()).collect::<Vec<_>>().join(" "), title).to_lowercase();
    let sections: Vec<String> = rows
        .iter()
        .filter_map(|(_, s)| s.as_deref())
        .flat_map(|s| s.split(|c: char| !c.is_ascii_digit()).filter(|n| n.len() >= 3).map(str::to_string).collect::<Vec<_>>())
        .collect();
    let all = list(pool, jurisdiction).await?;
    Ok(all
        .into_iter()
        .filter(|o| o.state == "in_use")
        .filter(|o| {
            let t = o.title.to_lowercase();
            let by_title = said.contains(&t);
            let by_word = t.split_whitespace().any(|w| w.len() >= 5 && !GENERIC.contains(&w) && said.contains(w));
            let by_section = o.section_refs.as_deref().unwrap_or("").split(|c: char| !c.is_ascii_digit()).any(|n| n.len() >= 3 && sections.iter().any(|s| s == n));
            by_title || by_word || by_section
        })
        .collect())
}

/// What Assist is told about the offences on a file: the elements to check one
/// by one, the papers usually needed and what is often missing, in the words
/// the office keeps. Empty when no guide entry fits, so Assist says so rather
/// than reasoning from nothing.
pub async fn context_for_file(pool: &SqlitePool, file_id: &str, jurisdiction: &str) -> Result<String, sqlx::Error> {
    let found = for_file(pool, file_id, jurisdiction).await?;
    let mut out = String::new();
    for o in found {
        out.push_str(&format!("{} (Penal Code Act {})\n", o.title, o.section_refs.as_deref().unwrap_or("")));
        if !o.proving.is_empty() {
            out.push_str("What must be proved (check each against the file, and say which paper and page shows it):\n");
            for p in &o.proving {
                out.push_str(&format!("- {p}\n"));
            }
        }
        if !o.papers.is_empty() {
            out.push_str(&format!("Papers usually needed: {}.\n", o.papers.join("; ")));
        }
        if !o.gaps.is_empty() {
            out.push_str(&format!("Often missing: {}.\n", o.gaps.join("; ")));
        }
        for w in &o.words {
            out.push_str(&format!("Note: {w}\n"));
        }
        out.push('\n');
    }
    Ok(out)
}
