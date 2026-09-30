//! The other people in a matter (the other side, their advocate, witnesses, a
//! co-accused), and the conflict check: before a matter is opened, every name
//! in it is looked for among every client and every party of every matter, so
//! the practice never acts against someone it already acts for without
//! knowing it (a duty of the Advocates (Professional Conduct) Regulations, [S]).
//!
//! The check is by words, not exact strings: "Okello John" finds "John
//! Okello", "Kiiza Robert" finds "Robert Kiiza & Sons Ltd". Words that say
//! nothing about who someone is ("Ltd", "and", "Uganda") are ignored. A hit is
//! strong when every word of the shorter name is found.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{clean, invalid, DomainError};
use super::matters::require_open;
use pleadli_node_core::db::begin_write;

pub const ROLES: [&str; 6] = ["opposing_party", "opposing_counsel", "co_party", "witness", "complainant", "other"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Party {
    pub id: String,
    pub matter_id: String,
    pub role: String,
    pub name: String,
    pub organisation: Option<String>,
    pub contact: Option<String>,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartyInput {
    pub role: String,
    pub name: String,
    pub organisation: Option<String>,
    pub contact: Option<String>,
    pub notes: Option<String>,
}

/// A name found elsewhere in the practice's records.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictHit {
    /// `client` (someone the practice acts for) or a party role.
    pub role: String,
    pub name: String,
    pub matter_id: Option<String>,
    pub matter_title: Option<String>,
    pub matter_status: Option<String>,
    /// Every word of the shorter name was found.
    pub strong: bool,
}

const NOISE: [&str; 16] = ["and", "the", "of", "ltd", "limited", "co", "company", "plc", "inc", "uganda", "advocates", "sons", "mr", "mrs", "ms", "dr"];

fn words(name: &str) -> Vec<String> {
    name.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.chars().count() >= 3 && !NOISE.contains(w))
        .map(str::to_string)
        .collect()
}

/// How `a` and `b` compare: None if no word is shared, Some(strong) otherwise.
fn compare(a: &[String], b: &[String]) -> Option<bool> {
    let shared = a.iter().filter(|w| b.contains(w)).count();
    if shared == 0 {
        return None;
    }
    Some(shared >= a.len().min(b.len()))
}

fn check(input: &PartyInput) -> Result<(), DomainError> {
    if input.name.trim().is_empty() {
        return invalid("A party needs a name.");
    }
    if !ROLES.contains(&input.role.as_str()) {
        return invalid("That is not a role in a matter.");
    }
    Ok(())
}

pub async fn list(pool: &SqlitePool, matter_id: &str) -> Result<Vec<Party>, sqlx::Error> {
    sqlx::query_as::<_, Party>("SELECT id, matter_id, role, name, organisation, contact, notes, created_at FROM parties WHERE matter_id = ? ORDER BY created_at")
        .bind(matter_id)
        .fetch_all(pool)
        .await
}

pub async fn add(pool: &SqlitePool, matter_id: &str, input: PartyInput) -> Result<Party, DomainError> {
    check(&input)?;
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    require_open(&mut tx, matter_id).await?;
    sqlx::query("INSERT INTO parties (id, matter_id, role, name, organisation, contact, notes) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(matter_id)
        .bind(&input.role)
        .bind(input.name.trim())
        .bind(clean(input.organisation))
        .bind(clean(input.contact))
        .bind(clean(input.notes))
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("party_added").subject("party", &id).scope(matter_id).detail(&input.role)).await?;
    tx.commit().await?;
    Ok(sqlx::query_as::<_, Party>("SELECT id, matter_id, role, name, organisation, contact, notes, created_at FROM parties WHERE id = ?").bind(&id).fetch_one(pool).await?)
}

pub async fn update(pool: &SqlitePool, id: &str, input: PartyInput) -> Result<Party, DomainError> {
    check(&input)?;
    let mut tx = begin_write(pool).await?;
    let matter_id: Option<String> = sqlx::query_scalar("SELECT matter_id FROM parties WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    let Some(matter_id) = matter_id else { return Err(DomainError::NotFound("Party not found.".to_string())) };
    require_open(&mut tx, &matter_id).await?;
    sqlx::query("UPDATE parties SET role = ?, name = ?, organisation = ?, contact = ?, notes = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?")
        .bind(&input.role)
        .bind(input.name.trim())
        .bind(clean(input.organisation))
        .bind(clean(input.contact))
        .bind(clean(input.notes))
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("party_changed").subject("party", id).scope(&matter_id)).await?;
    tx.commit().await?;
    Ok(sqlx::query_as::<_, Party>("SELECT id, matter_id, role, name, organisation, contact, notes, created_at FROM parties WHERE id = ?").bind(id).fetch_one(pool).await?)
}

pub async fn remove(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let mut tx = begin_write(pool).await?;
    let matter_id: Option<String> = sqlx::query_scalar("SELECT matter_id FROM parties WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    let Some(matter_id) = matter_id else { return Err(DomainError::NotFound("Party not found.".to_string())) };
    require_open(&mut tx, &matter_id).await?;
    sqlx::query("DELETE FROM parties WHERE id = ?").bind(id).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("party_removed").subject("party", id).scope(&matter_id)).await?;
    tx.commit().await?;
    Ok(())
}

/// Every client and party whose name shares a word with `name`, strongest
/// first. A small practice has hundreds of names, not millions, so they are
/// compared here rather than in SQL, where word matching would be guesswork.
pub async fn conflicts(pool: &SqlitePool, name: &str, except_matter: Option<&str>) -> Result<Vec<ConflictHit>, sqlx::Error> {
    let wanted = words(name);
    if wanted.is_empty() {
        return Ok(Vec::new());
    }
    let clients: Vec<(String, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT c.name, m.id, m.title, m.status FROM clients c LEFT JOIN matters m ON m.client_id = c.id",
    )
    .fetch_all(pool)
    .await?;
    let parties: Vec<(String, String, String, String, String)> =
        sqlx::query_as("SELECT p.name, p.role, m.id, m.title, m.status FROM parties p JOIN matters m ON m.id = p.matter_id").fetch_all(pool).await?;

    let mut hits = Vec::new();
    for (who, matter_id, title, status) in clients {
        if matter_id.is_some() && matter_id.as_deref() == except_matter {
            continue;
        }
        if let Some(strong) = compare(&wanted, &words(&who)) {
            hits.push(ConflictHit { role: "client".to_string(), name: who, matter_id, matter_title: title, matter_status: status, strong });
        }
    }
    for (who, role, matter_id, title, status) in parties {
        if Some(matter_id.as_str()) == except_matter {
            continue;
        }
        if let Some(strong) = compare(&wanted, &words(&who)) {
            hits.push(ConflictHit { role, name: who, matter_id: Some(matter_id), matter_title: Some(title), matter_status: Some(status), strong });
        }
    }
    hits.sort_by(|a, b| b.strong.cmp(&a.strong).then(a.name.cmp(&b.name)));
    hits.truncate(50);
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_match_by_words_in_any_order_and_ignore_noise() {
        let a = words("Okello John");
        assert_eq!(compare(&a, &words("John Okello")), Some(true));
        assert_eq!(compare(&words("Kiiza Robert"), &words("Robert Kiiza & Sons Ltd")), Some(true));
        assert_eq!(compare(&a, &words("John Mukasa")), Some(false), "one shared word is a weak hit");
        assert_eq!(compare(&words("Uganda Ltd"), &words("Uganda Revenue Ltd")), None, "noise words never match");
        assert!(words("Mr. Al").is_empty(), "too short to mean anything");
    }
}
