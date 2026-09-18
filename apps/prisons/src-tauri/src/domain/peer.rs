//! The facility side of pairing (docs/specs/prisons/0001-head-office-peer-
//! sync-network/0002, docs/prisons/product-map/04 J.3).
//!
//! The outbound call to Head Office is made here, in the node, not from the
//! browser: a webview never talks to Head Office directly, and every outbound
//! network call lives in one place that a transport abstraction can replace.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::time::Duration;

use super::authz::Actor;
use super::facilities;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairInput {
    pub pairing_code: String,
    pub name: String,
    pub facility_number: String,
    pub location: String,
    pub region: String,
    pub head_officer_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairResult {
    pub facility_id: String,
}

#[derive(Debug)]
pub enum PairError {
    /// The code does not look like a Pleadli pairing code.
    Malformed,
    /// This installation is already paired.
    AlreadyPaired,
    /// Head Office could not be reached at all.
    Unreachable(String),
    /// Head Office answered but refused (bad, used or expired code).
    Rejected,
    Db(sqlx::Error),
}

impl From<sqlx::Error> for PairError {
    fn from(e: sqlx::Error) -> Self {
        PairError::Db(e)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterResponse {
    facility_id: String,
    sync_token: String,
}

/// `<host>#<secret>`: splits on the last `#` so a host can never contain the
/// secret. The host must be an http(s) origin.
pub fn parse_pairing_code(code: &str) -> Result<(String, String), PairError> {
    let code = code.trim();
    let sharp = code.rfind('#').ok_or(PairError::Malformed)?;
    let (host, secret) = (&code[..sharp], &code[sharp + 1..]);
    if host.is_empty() || secret.is_empty() || !(host.starts_with("https://") || host.starts_with("http://")) {
        return Err(PairError::Malformed);
    }
    Ok((host.trim_end_matches('/').to_string(), secret.to_string()))
}

pub async fn pair_with_head_office(pool: &SqlitePool, actor: &Actor, input: PairInput) -> Result<PairResult, PairError> {
    let already: Option<String> = sqlx::query_scalar("SELECT facility_id FROM peer_sync_config WHERE id = 'default'")
        .fetch_one(pool)
        .await?;
    if already.is_some() {
        return Err(PairError::AlreadyPaired);
    }

    let (host, secret) = parse_pairing_code(&input.pairing_code)?;

    let client = reqwest::Client::builder().timeout(Duration::from_secs(20)).build().map_err(|e| PairError::Unreachable(e.to_string()))?;
    let response = client
        .post(format!("{host}/api/network/v1/pairing/register"))
        .json(&serde_json::json!({
            "pairingSecret": secret,
            "name": input.name,
            "facilityNumber": input.facility_number,
            "location": input.location,
            "region": input.region,
            "headOfficerName": input.head_officer_name,
        }))
        .send()
        .await
        .map_err(|e| PairError::Unreachable(e.to_string()))?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(PairError::Rejected);
    }
    if !response.status().is_success() {
        return Err(PairError::Unreachable(format!("Head Office responded {}", response.status())));
    }
    let registered: RegisterResponse = response.json().await.map_err(|e| PairError::Unreachable(e.to_string()))?;

    let mut tx = crate::db::begin_write(pool).await?;
    facilities::save_peer_credentials(&mut tx, actor, &host, &registered.facility_id, &registered.sync_token).await?;
    tx.commit().await?;

    Ok(PairResult { facility_id: registered.facility_id })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pairing_code_parses_host_and_secret() {
        let (host, secret) = parse_pairing_code("https://hq.example.org#abc-DEF_123").unwrap();
        assert_eq!(host, "https://hq.example.org");
        assert_eq!(secret, "abc-DEF_123");
    }

    #[test]
    fn malformed_codes_are_rejected() {
        for bad in ["", "no-hash-here", "#secretonly", "https://hq.example.org#", "ftp://hq.example.org#s", "hq.example.org#s"] {
            assert!(matches!(parse_pairing_code(bad), Err(PairError::Malformed)), "should reject {bad:?}");
        }
    }
}
