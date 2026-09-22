//! The command structure this station sits in: a tree of units held as data.
//! What the levels are and are called is not fixed by the code: the real
//! structure still has to be confirmed with serving officers
//! (docs/police/AUDIT.md section 4). This module only knows the station this
//! installation belongs to and what an officer has typed in above it.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Unit {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub is_local: bool,
    pub created_at: i64,
}

/// This station and the units above it, top down.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Chain {
    pub station: Unit,
    pub above: Vec<Unit>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveChainInput {
    pub region: Option<String>,
    pub district: Option<String>,
    pub division: Option<String>,
}

async fn local_unit(pool: &SqlitePool) -> Result<Unit, sqlx::Error> {
    let name: Option<String> = sqlx::query_scalar("SELECT name FROM station_profile WHERE id = 'default'")
        .fetch_optional(pool)
        .await?
        .flatten();
    let name = name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty()).unwrap_or_else(|| "This station".to_string());

    let existing = sqlx::query_as::<_, Unit>("SELECT * FROM police_units WHERE is_local = 1").fetch_optional(pool).await?;
    match existing {
        Some(unit) if unit.name == name => Ok(unit),
        Some(unit) => {
            // The station's name lives in the profile; the unit follows it.
            sqlx::query("UPDATE police_units SET name = ? WHERE id = ?").bind(&name).bind(&unit.id).execute(pool).await?;
            Ok(Unit { name, ..unit })
        }
        None => {
            let id = Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO police_units (id, kind, name, is_local) VALUES (?, 'station', ?, 1)")
                .bind(&id)
                .bind(&name)
                .execute(pool)
                .await?;
            sqlx::query_as::<_, Unit>("SELECT * FROM police_units WHERE id = ?").bind(&id).fetch_one(pool).await
        }
    }
}

pub async fn chain(pool: &SqlitePool) -> Result<Chain, sqlx::Error> {
    let station = local_unit(pool).await?;
    let mut above = Vec::new();
    let mut next = station.parent_id.clone();
    // A tree of a handful of levels; the bound only guards against a cycle.
    for _ in 0..16 {
        let Some(id) = next else { break };
        let unit = sqlx::query_as::<_, Unit>("SELECT * FROM police_units WHERE id = ?").bind(id).fetch_one(pool).await?;
        next = unit.parent_id.clone();
        above.push(unit);
    }
    above.reverse();
    Ok(Chain { station, above })
}

fn clean(value: &Option<String>) -> Option<String> {
    value.as_ref().map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

/// Replaces what is recorded above the station with the levels given (each
/// optional), top down: region, district, division.
pub async fn save_chain(pool: &SqlitePool, input: SaveChainInput) -> Result<Chain, sqlx::Error> {
    let station = local_unit(pool).await?;
    let old = chain(pool).await?.above;
    let mut tx = pool.begin().await?;

    sqlx::query("UPDATE police_units SET parent_id = NULL WHERE id = ?").bind(&station.id).execute(&mut *tx).await?;
    for unit in old.iter().rev() {
        sqlx::query("UPDATE police_units SET parent_id = NULL WHERE id = ?").bind(&unit.id).execute(&mut *tx).await?;
    }
    for unit in &old {
        sqlx::query("DELETE FROM police_units WHERE id = ?").bind(&unit.id).execute(&mut *tx).await?;
    }

    let mut parent: Option<String> = None;
    for (kind, name) in [("region", clean(&input.region)), ("district", clean(&input.district)), ("division", clean(&input.division))] {
        let Some(name) = name else { continue };
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO police_units (id, kind, name, parent_id) VALUES (?, ?, ?, ?)")
            .bind(&id)
            .bind(kind)
            .bind(&name)
            .bind(&parent)
            .execute(&mut *tx)
            .await?;
        parent = Some(id);
    }
    sqlx::query("UPDATE police_units SET parent_id = ? WHERE id = ?").bind(&parent).bind(&station.id).execute(&mut *tx).await?;
    tx.commit().await?;

    chain(pool).await
}
