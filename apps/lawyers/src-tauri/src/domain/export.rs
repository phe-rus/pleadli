//! Everything the practice has recorded, as data it can take anywhere
//! (nobody is locked in): every table, every row, as JSON. What would let
//! someone else sign in or join the office is left out: PIN and password
//! hashes, second-factor keys, device keys, joining codes, the Assist key.
//! Papers (scans) stay in the sealed vault and are downloaded one by one.

use serde_json::{Map, Value};
use sqlx::SqlitePool;

/// Columns never exported, by table.
const WITHHELD: &[(&str, &[&str])] = &[
    ("staff", &["secret_hash", "totp_secret", "secret_kind"]),
    ("network", &["device_key"]),
    ("devices", &["key_hash"]),
    ("app_lock", &["*"]),
    ("pairing_codes", &["*"]),
    ("assist_settings", &["api_key", "key"]),
];

fn withheld(table: &str, column: &str) -> bool {
    WITHHELD.iter().any(|(t, cols)| *t == table && (cols.contains(&"*") || cols.contains(&column)))
}

pub async fn all(pool: &SqlitePool, exported_by: &str) -> Result<Value, sqlx::Error> {
    let tables: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_sqlx%' ORDER BY name",
    )
    .fetch_all(pool)
    .await?;
    let mut out = Map::new();
    for table in tables {
        let columns: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT name FROM pragma_table_info('{}')", table.replace('\'', "''")))).fetch_all(pool).await?;
        let kept: Vec<&String> = columns.iter().filter(|c| !withheld(&table, c)).collect();
        if kept.is_empty() {
            continue;
        }
        let pairs = kept.iter().map(|c| format!("'{0}', \"{0}\"", c.replace('\'', "''").replace('"', "\"\""))).collect::<Vec<_>>().join(", ");
        let sql = format!("SELECT COALESCE(json_group_array(json_object({pairs})), '[]') FROM \"{}\"", table.replace('"', "\"\""));
        let rows: String = sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).fetch_one(pool).await?;
        out.insert(table, serde_json::from_str(&rows).unwrap_or(Value::Array(Vec::new())));
    }
    Ok(serde_json::json!({
        "product": "Pleadli Lawyers",
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "exportedBy": exported_by,
        "note": "Every record of the practice. Sign-in secrets, device keys and the Assist key are left out. Papers (scans) are not included: download them from each matter.",
        "tables": out,
    }))
}
