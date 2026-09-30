use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{clean, invalid, DomainError};
use pleadli_node_core::db::begin_write;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Client {
    pub id: String,
    pub name: String,
    /// A person, or an organisation (a company, a bank, a ministry).
    pub kind: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub custody: Option<String>,
    pub custody_place: Option<String>,
    pub notes: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// A row of the client list: the client and how many matters they have.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ClientSummary {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub custody: Option<String>,
    pub custody_place: Option<String>,
    pub notes: Option<String>,
    pub matters: i64,
    pub open_matters: i64,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientInput {
    pub name: String,
    #[serde(default)]
    pub kind: Option<String>,
    pub phone: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    pub address: Option<String>,
    pub custody: Option<String>,
    pub custody_place: Option<String>,
    pub notes: Option<String>,
}

struct Checked {
    name: String,
    kind: &'static str,
    custody: Option<String>,
    place: Option<String>,
}

fn check(input: &ClientInput) -> Result<Checked, DomainError> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return invalid("A client needs a name.");
    }
    let custody = clean(input.custody.clone());
    if let Some(c) = &custody {
        if !matches!(c.as_str(), "at_liberty" | "remanded" | "serving") {
            return invalid("Custody is at liberty, remanded, or serving a sentence.");
        }
    }
    let kind = match input.kind.as_deref() {
        None | Some("person") => "person",
        Some("organisation") => "organisation",
        Some(_) => return invalid("A client is a person or an organisation."),
    };
    // Custody is a person's, and only matters in criminal work.
    let custody = if kind == "organisation" { None } else { custody };
    let place = if matches!(custody.as_deref(), Some("remanded") | Some("serving")) { clean(input.custody_place.clone()) } else { None };
    Ok(Checked { name, kind, custody, place })
}

const COLUMNS: &str = "id, name, kind, phone, email, address, custody, custody_place, notes, created_at, updated_at";

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Client>, sqlx::Error> {
    sqlx::query_as::<_, Client>(sqlx::AssertSqlSafe(format!("SELECT {COLUMNS} FROM clients WHERE id = ?"))).bind(id).fetch_optional(pool).await
}

pub async fn list(pool: &SqlitePool, query: &str, limit: i64) -> Result<Vec<ClientSummary>, sqlx::Error> {
    let like = format!("%{}%", query.trim().replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
    sqlx::query_as::<_, ClientSummary>(
        "SELECT c.id, c.name, c.kind, c.phone, c.email, c.address, c.custody, c.custody_place, c.notes,
            (SELECT COUNT(*) FROM matters m WHERE m.client_id = c.id) AS matters,
            (SELECT COUNT(*) FROM matters m WHERE m.client_id = c.id AND m.status = 'open') AS open_matters,
            c.created_at
         FROM clients c WHERE c.name LIKE ?1 ESCAPE '\\' OR COALESCE(c.phone, '') LIKE ?1 ESCAPE '\\'
         ORDER BY c.name COLLATE NOCASE LIMIT ?2",
    )
    .bind(like)
    .bind(limit.clamp(1, 500))
    .fetch_all(pool)
    .await
}

pub async fn create(pool: &SqlitePool, input: ClientInput) -> Result<Client, DomainError> {
    let c = check(&input)?;
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    sqlx::query("INSERT INTO clients (id, name, kind, phone, email, address, custody, custody_place, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&c.name)
        .bind(c.kind)
        .bind(clean(input.phone))
        .bind(clean(input.email))
        .bind(clean(input.address))
        .bind(&c.custody)
        .bind(&c.place)
        .bind(clean(input.notes))
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("client_added").subject("client", &id)).await?;
    tx.commit().await?;
    Ok(get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn update(pool: &SqlitePool, id: &str, input: ClientInput) -> Result<Client, DomainError> {
    let c = check(&input)?;
    let mut tx = begin_write(pool).await?;
    let done = sqlx::query(
        "UPDATE clients SET name = ?, kind = ?, phone = ?, email = ?, address = ?, custody = ?, custody_place = ?, notes = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?",
    )
    .bind(&c.name)
    .bind(c.kind)
    .bind(clean(input.phone))
    .bind(clean(input.email))
    .bind(clean(input.address))
    .bind(&c.custody)
    .bind(&c.place)
    .bind(clean(input.notes))
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if done.rows_affected() == 0 {
        return Err(DomainError::NotFound("Client not found.".to_string()));
    }
    audit::record(&mut tx, Entry::new("client_updated").subject("client", id)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}
