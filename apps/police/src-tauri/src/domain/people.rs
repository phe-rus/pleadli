use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Person {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub other_names: Option<String>,
    pub phone: Option<String>,
    pub national_id: Option<String>,
    pub address: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePersonInput {
    pub first_name: String,
    pub last_name: String,
    pub other_names: Option<String>,
    pub phone: Option<String>,
    pub national_id: Option<String>,
    pub address: Option<String>,
}

pub async fn create_person(pool: &SqlitePool, input: CreatePersonInput) -> Result<Person, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO people (id, first_name, last_name, other_names, phone, national_id, address)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.first_name)
    .bind(&input.last_name)
    .bind(&input.other_names)
    .bind(&input.phone)
    .bind(&input.national_id)
    .bind(&input.address)
    .execute(pool)
    .await?;

    get_person(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn search_people(pool: &SqlitePool, query: &str) -> Result<Vec<Person>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, Person>("SELECT * FROM people ORDER BY created_at DESC LIMIT 50")
            .fetch_all(pool)
            .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, Person>(
        "SELECT * FROM people
         WHERE first_name LIKE ?1 OR last_name LIKE ?1 OR other_names LIKE ?1
            OR phone LIKE ?1 OR national_id LIKE ?1
         ORDER BY created_at DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

pub async fn get_person(pool: &SqlitePool, id: &str) -> Result<Option<Person>, sqlx::Error> {
    sqlx::query_as::<_, Person>("SELECT * FROM people WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
}

/// Dev/test convenience only — inserts a handful of sample people the first
/// time the local database is empty. Compiled out of release builds entirely
/// via `#[cfg(debug_assertions)]` in db.rs, so it can never ship.
#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM people")
        .fetch_one(pool)
        .await?;
    if count > 0 {
        return Ok(());
    }

    let samples = [
        ("Mungu", "Wasswa", Some("M."), Some("0772 445 190"), Some("CM9012345ABCDE"), Some("Ntinda, Kampala")),
        ("Deborah", "Wasswa", None, Some("0701 223 887"), Some("CF8823410XYZAB"), Some("Bugolobi, Kampala")),
        ("Wasswa", "Otema", Some("K."), Some("0782 991 004"), None, Some("Gulu Town")),
        ("S.", "Kigozi", None, None, Some("CM7712209QRSTU"), Some("Mukono")),
        ("Grace", "Nabirye", None, Some("0759 664 213"), Some("CF9034521LMNOP"), Some("Jinja Road, Kampala")),
    ];

    for (first_name, last_name, other_names, phone, national_id, address) in samples {
        create_person(
            pool,
            CreatePersonInput {
                first_name: first_name.to_string(),
                last_name: last_name.to_string(),
                other_names: other_names.map(str::to_string),
                phone: phone.map(str::to_string),
                national_id: national_id.map(str::to_string),
                address: address.map(str::to_string),
            },
        )
        .await?;
    }

    Ok(())
}
