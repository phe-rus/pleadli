use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::{attachments, markdown};

/// See the migration's own comment for the resolution behind this being
/// one unified table, not separate Referral/Dispatch tables.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Referral {
    pub id: String,
    pub case_id: String,
    pub case_reference: String,
    pub destination_type: String,
    pub destination_name: Option<String>,
    pub referred_at: i64,
    pub status: String,
    pub officer_name: Option<String>,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReferralInput {
    pub case_id: String,
    pub destination_type: String,
    pub destination_name: Option<String>,
    pub referred_at: i64,
    pub status: String,
    pub officer_name: Option<String>,
    pub notes: Option<String>,
}

async fn write_referral_markdown(pool: &SqlitePool, vault_root: &Path, record: &Referral) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "referral", &record.id).await {
        let title = format!("Referral: {}", record.case_reference);
        if let Err(e) = markdown::write_record(&dir, &format!("referral-{}", record.id), &title, record) {
            log::warn!("failed to write referral markdown: {e}");
        }
    }
}

pub async fn create_referral(pool: &SqlitePool, vault_root: &Path, input: CreateReferralInput) -> Result<Referral, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO referrals
            (id, case_id, destination_type, destination_name, referred_at, status, officer_name, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.case_id)
    .bind(&input.destination_type)
    .bind(&input.destination_name)
    .bind(input.referred_at)
    .bind(&input.status)
    .bind(&input.officer_name)
    .bind(&input.notes)
    .execute(pool)
    .await?;

    let record = get_referral(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_referral_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn update_referral(pool: &SqlitePool, vault_root: &Path, id: &str, input: CreateReferralInput) -> Result<Referral, sqlx::Error> {
    sqlx::query(
        "UPDATE referrals
         SET case_id = ?, destination_type = ?, destination_name = ?, referred_at = ?, status = ?,
             officer_name = ?, notes = ?
         WHERE id = ?",
    )
    .bind(&input.case_id)
    .bind(&input.destination_type)
    .bind(&input.destination_name)
    .bind(input.referred_at)
    .bind(&input.status)
    .bind(&input.officer_name)
    .bind(&input.notes)
    .bind(id)
    .execute(pool)
    .await?;

    let record = get_referral(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_referral_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn list_referrals(pool: &SqlitePool, query: &str) -> Result<Vec<Referral>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, Referral>(
            "SELECT
                r.id, r.case_id, r.destination_type, r.destination_name, r.referred_at, r.status,
                r.officer_name, r.notes, r.created_at,
                c.reference AS case_reference
             FROM referrals r
             JOIN cases c ON c.id = r.case_id
             ORDER BY r.referred_at DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, Referral>(
        "SELECT
            r.id, r.case_id, r.destination_type, r.destination_name, r.referred_at, r.status,
            r.officer_name, r.notes, r.created_at,
            c.reference AS case_reference
         FROM referrals r
         JOIN cases c ON c.id = r.case_id
         WHERE r.destination_name LIKE ?1 OR c.reference LIKE ?1
         ORDER BY r.referred_at DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

pub async fn get_referral(pool: &SqlitePool, id: &str) -> Result<Option<Referral>, sqlx::Error> {
    sqlx::query_as::<_, Referral>(
        "SELECT
            r.id, r.case_id, r.destination_type, r.destination_name, r.referred_at, r.status,
            r.officer_name, r.notes, r.created_at,
            c.reference AS case_reference
         FROM referrals r
         JOIN cases c ON c.id = r.case_id
         WHERE r.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn list_for_case(pool: &SqlitePool, case_id: &str) -> Result<Vec<Referral>, sqlx::Error> {
    sqlx::query_as::<_, Referral>(
        "SELECT
            r.id, r.case_id, r.destination_type, r.destination_name, r.referred_at, r.status,
            r.officer_name, r.notes, r.created_at,
            c.reference AS case_reference
         FROM referrals r
         JOIN cases c ON c.id = r.case_id
         WHERE r.case_id = ?
         ORDER BY r.referred_at DESC",
    )
    .bind(case_id)
    .fetch_all(pool)
    .await
}

#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool, vault_root: &Path) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM referrals").fetch_one(pool).await?;
    if count > 0 {
        return Ok(());
    }

    let case_id: Option<String> = sqlx::query_scalar("SELECT id FROM cases ORDER BY created_at LIMIT 1")
        .fetch_optional(pool)
        .await?;
    let Some(case_id) = case_id else { return Ok(()) };

    create_referral(
        pool,
        vault_root,
        CreateReferralInput {
            case_id,
            destination_type: "dpp".to_string(),
            destination_name: Some("Resident State Attorney, Buganda Road".to_string()),
            referred_at: chrono::Utc::now().timestamp_millis(),
            status: "pending".to_string(),
            officer_name: Some("Namuli, S.".to_string()),
            notes: None,
        },
    )
    .await?;

    Ok(())
}
