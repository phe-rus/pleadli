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

pub async fn update_person(pool: &SqlitePool, id: &str, input: CreatePersonInput) -> Result<Person, sqlx::Error> {
    sqlx::query(
        "UPDATE people
         SET first_name = ?, last_name = ?, other_names = ?, phone = ?, national_id = ?, address = ?
         WHERE id = ?",
    )
    .bind(&input.first_name)
    .bind(&input.last_name)
    .bind(&input.other_names)
    .bind(&input.phone)
    .bind(&input.national_id)
    .bind(&input.address)
    .bind(id)
    .execute(pool)
    .await?;

    get_person(pool, id).await?.ok_or(sqlx::Error::RowNotFound)
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

#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM people").fetch_one(pool).await?;
    if count > 0 {
        return Ok(());
    }

    create_person(
        pool,
        CreatePersonInput {
            first_name: "Grace".to_string(),
            last_name: "Namutebi".to_string(),
            other_names: None,
            phone: Some("0772 445 108".to_string()),
            national_id: Some("CM88012345ABCDE".to_string()),
            address: Some("Kansanga, Kampala".to_string()),
        },
    )
    .await?;

    create_person(
        pool,
        CreatePersonInput {
            first_name: "Robert".to_string(),
            last_name: "Okello".to_string(),
            other_names: None,
            phone: Some("0701 992 234".to_string()),
            national_id: Some("CM91034521XYZAB".to_string()),
            address: Some("Gulu Town".to_string()),
        },
    )
    .await?;

    Ok(())
}
