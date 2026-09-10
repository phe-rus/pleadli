use serde::Serialize;
use serde_json::Value;
use std::path::Path;

/// `createdAt`/`arrestedAt`/etc. style fields are epoch-millisecond
/// numbers on every domain struct in this app — the one convention
/// consistent enough across all of them to special-case generically,
/// so the generated document reads as a date rather than a raw number.
fn is_timestamp_key(key: &str) -> bool {
    key.to_lowercase().ends_with("at")
}

fn humanize_key(key: &str) -> String {
    let mut out = String::new();
    for (i, ch) in key.chars().enumerate() {
        if ch.is_uppercase() && i > 0 {
            out.push(' ');
        }
        if i == 0 {
            out.extend(ch.to_uppercase());
        } else {
            out.extend(ch.to_lowercase());
        }
    }
    out
}

fn format_value(key: &str, value: &Value) -> String {
    match value {
        Value::Null => "·".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::String(s) if s.trim().is_empty() => "·".to_string(),
        Value::String(s) => s.clone(),
        Value::Number(n) if is_timestamp_key(key) => n
            .as_i64()
            .and_then(chrono::DateTime::<chrono::Utc>::from_timestamp_millis)
            .map(|dt| dt.format("%Y-%m-%d %H:%M").to_string())
            .unwrap_or_else(|| n.to_string()),
        Value::Number(n) => n.to_string(),
        other => other.to_string(),
    }
}

/// Renders any domain record (already `Serialize` for IPC) as a plain
/// Markdown document and writes it alongside that entity's attachments
/// in the Vault — so browsing the Vault on disk shows the record itself,
/// not just files someone chose to attach to it. Regenerated in full on
/// every write, since it mirrors the database rather than accumulating
/// history of its own.
pub fn write_record<T: Serialize>(dir: &Path, stem: &str, title: &str, record: &T) -> std::io::Result<()> {
    let value = serde_json::to_value(record).unwrap_or(Value::Null);
    let mut body = format!("# {title}\n\n");

    if let Value::Object(map) = value {
        for (key, val) in map {
            if key == "id" {
                continue;
            }
            body.push_str(&format!("- **{}:** {}\n", humanize_key(&key), format_value(&key, &val)));
        }
    }

    std::fs::create_dir_all(dir)?;
    std::fs::write(dir.join(format!("{stem}.md")), body)
}
