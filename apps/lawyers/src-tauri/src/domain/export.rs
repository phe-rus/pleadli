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

/// Which rows of `table` the person exporting may take.
fn row_filter(table: &str, columns: &[String]) -> String {
    use super::access;
    let has = |c: &str| columns.iter().any(|x| x == c);
    match table {
        "matters" => access::visible("t"),
        "fee_note_lines" => format!("t.fee_note_id IN (SELECT p.id FROM fee_notes p WHERE {})", access::on("p.matter_id")),
        "bill_items" => format!("t.bill_id IN (SELECT p.id FROM bills_of_costs p WHERE {})", access::on("p.matter_id")),
        "filing_documents" => format!("t.filing_id IN (SELECT p.id FROM filings p WHERE {})", access::on("p.matter_id")),
        "audit_log" => format!("(t.scope_id IS NULL OR {}) AND (t.subject_type IS NULL OR {})", access::entity_shown("'matter'", "t.scope_id"), access::entity_shown("t.subject_type", "t.subject_id")),
        "paper_prints" | "paper_ink" => access::entity_shown("t.entity_type", "t.entity_id"),
        _ if has("matter_id") => access::on("t.matter_id"),
        _ => "1 = 1".to_string(),
    }
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
        // A restricted matter, and everything under it, is left out for anyone not listed for it: an administrator's
        // export is not a way round the barrier.
        let shown = row_filter(&table, &columns);
        let sql = format!("SELECT COALESCE(json_group_array(json_object({pairs})), '[]') FROM \"{}\" AS t WHERE {shown}", table.replace('"', "\"\""));
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
