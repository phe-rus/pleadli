use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

/// The category list is the one already established in
/// docs/police/PRODUCT.md's Station Diary section — not invented here.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StationDiaryEntry {
    pub id: String,
    pub category: String,
    pub content: String,
    pub person_id: Option<String>,
    pub person_first_name: Option<String>,
    pub person_last_name: Option<String>,
    pub person_other_names: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStationDiaryEntryInput {
    pub category: String,
    pub content: String,
    pub person_id: Option<String>,
}

pub async fn create_entry(
    pool: &SqlitePool,
    input: CreateStationDiaryEntryInput,
) -> Result<StationDiaryEntry, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO station_diary_entries (id, category, content, person_id) VALUES (?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.category)
    .bind(&input.content)
    .bind(&input.person_id)
    .execute(pool)
    .await?;

    get_entry(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn update_entry(
    pool: &SqlitePool,
    id: &str,
    input: CreateStationDiaryEntryInput,
) -> Result<StationDiaryEntry, sqlx::Error> {
    sqlx::query("UPDATE station_diary_entries SET category = ?, content = ?, person_id = ? WHERE id = ?")
        .bind(&input.category)
        .bind(&input.content)
        .bind(&input.person_id)
        .bind(id)
        .execute(pool)
        .await?;

    get_entry(pool, id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn list_entries(pool: &SqlitePool, query: &str) -> Result<Vec<StationDiaryEntry>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, StationDiaryEntry>(
            "SELECT
                sd.id, sd.category, sd.content, sd.person_id, sd.created_at,
                p.first_name AS person_first_name,
                p.last_name AS person_last_name,
                p.other_names AS person_other_names
             FROM station_diary_entries sd
             LEFT JOIN people p ON p.id = sd.person_id
             ORDER BY sd.created_at DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, StationDiaryEntry>(
        "SELECT
            sd.id, sd.category, sd.content, sd.person_id, sd.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM station_diary_entries sd
         LEFT JOIN people p ON p.id = sd.person_id
         WHERE sd.content LIKE ?1 OR sd.category LIKE ?1
         ORDER BY sd.created_at DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

pub async fn get_entry(pool: &SqlitePool, id: &str) -> Result<Option<StationDiaryEntry>, sqlx::Error> {
    sqlx::query_as::<_, StationDiaryEntry>(
        "SELECT
            sd.id, sd.category, sd.content, sd.person_id, sd.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM station_diary_entries sd
         LEFT JOIN people p ON p.id = sd.person_id
         WHERE sd.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

/// Wraps plain text in the minimal Lexical serialized-editor-state shape —
/// `content` is stored as Lexical JSON (see @pleadli/lexical-text), so seed
/// data has to actually be in that format, not plain text, or the rich
/// text preview will just render nothing (isRichTextEmpty catches the
/// parse failure silently).
#[cfg(debug_assertions)]
fn plain_text_to_lexical_json(text: &str) -> String {
    serde_json::json!({
        "root": {
            "children": [{
                "children": [{
                    "detail": 0,
                    "format": 0,
                    "mode": "normal",
                    "style": "",
                    "text": text,
                    "type": "text",
                    "version": 1
                }],
                "direction": "ltr",
                "format": "",
                "indent": 0,
                "type": "paragraph",
                "version": 1
            }],
            "direction": "ltr",
            "format": "",
            "indent": 0,
            "type": "root",
            "version": 1
        }
    })
    .to_string()
}

/// Dev/test convenience only, same as people::seed_if_empty — compiled out
/// of release builds entirely via #[cfg(debug_assertions)] in db.rs.
#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM station_diary_entries")
        .fetch_one(pool)
        .await?;
    if count > 0 {
        return Ok(());
    }

    let person_ids: Vec<String> = sqlx::query_scalar("SELECT id FROM people ORDER BY created_at LIMIT 2")
        .fetch_all(pool)
        .await?;
    let first_person = person_ids.first().cloned();
    let second_person = person_ids.get(1).cloned();

    let samples: [(&str, &str, Option<String>); 5] = [
        (
            "public_inquiry",
            "Woman came to the counter asking whether a lost national ID had been handed in. None on record.",
            None,
        ),
        (
            "lost_property",
            "Reported a lost phone near the taxi park, last seen around 6pm.",
            first_person.clone(),
        ),
        (
            "officer_movement",
            "Patrol team departed for Ntinda route, expected back by 22:00.",
            None,
        ),
        (
            "shift_handover",
            "Day shift handover: no outstanding issues at the counter, cell block quiet.",
            None,
        ),
        (
            "incident_report",
            "Neighbour dispute reported over a boundary wall, no injuries, advised to seek LC1 mediation first.",
            second_person.clone(),
        ),
    ];

    for (category, content, person_id) in samples {
        create_entry(
            pool,
            CreateStationDiaryEntryInput {
                category: category.to_string(),
                content: plain_text_to_lexical_json(content),
                person_id,
            },
        )
        .await?;
    }

    Ok(())
}
