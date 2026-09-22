//! The structured content of a document: a small block model that every
//! rendering (the reader, the print sheet, DOCX, Markdown) reads. It holds no
//! layout, only what the document says.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Field {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListItem {
    pub title: Option<String>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Block {
    Heading { text: String },
    Paragraph { text: String },
    /// Labelled values, two to a row when shown.
    Fields { rows: Vec<Field> },
    List { ordered: bool, items: Vec<ListItem> },
    /// A line to sign above, and who signs.
    Signature { label: String, name: String, caption: Option<String> },
    /// A remark set apart from the body (privilege, no charges recorded).
    Note { text: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentContent {
    /// The issuing office, shown above the title.
    pub office: String,
    pub title: String,
    pub blocks: Vec<Block>,
}

pub const OFFICE: &str = "Office of the Director of Public Prosecutions";

pub fn field(label: &str, value: impl Into<String>) -> Field {
    Field { label: label.to_string(), value: value.into() }
}

/// The blocks a rich-text value (a Tiptap document as JSON, or plain text from
/// before the editor) says, so what a prosecutor wrote in the editor appears
/// in a document as paragraphs and lists and never as raw JSON.
pub fn rich_text_blocks(value: Option<&str>) -> Vec<Block> {
    let Some(raw) = value.map(str::trim).filter(|v| !v.is_empty()) else {
        return vec![];
    };
    let doc: Value = match serde_json::from_str::<Value>(raw) {
        Ok(doc) if doc.get("type").and_then(Value::as_str) == Some("doc") => doc,
        _ => return vec![Block::Paragraph { text: raw.to_string() }],
    };
    let mut out = Vec::new();
    for node in doc.get("content").and_then(Value::as_array).into_iter().flatten() {
        collect(node, &mut out);
    }
    out
}

fn text_of(node: &Value) -> String {
    match node.get("type").and_then(Value::as_str) {
        Some("text") => node.get("text").and_then(Value::as_str).unwrap_or_default().to_string(),
        Some("hardBreak") => "\n".to_string(),
        _ => node.get("content").and_then(Value::as_array).map(|c| c.iter().map(text_of).collect::<String>()).unwrap_or_default(),
    }
}

fn collect(node: &Value, out: &mut Vec<Block>) {
    match node.get("type").and_then(Value::as_str) {
        Some("paragraph") => {
            let text = text_of(node);
            if !text.trim().is_empty() {
                out.push(Block::Paragraph { text });
            }
        }
        Some("heading") => out.push(Block::Heading { text: text_of(node) }),
        Some(kind @ ("bulletList" | "orderedList")) => {
            let items = node
                .get("content")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .map(|item| ListItem { title: None, text: text_of(item) })
                .collect();
            out.push(Block::List { ordered: kind == "orderedList", items });
        }
        // Quotes and anything else: their own paragraphs, in order.
        _ => {
            for child in node.get("content").and_then(Value::as_array).into_iter().flatten() {
                collect(child, out);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rich_text_becomes_blocks_and_plain_text_survives() {
        let doc = r#"{"type":"doc","content":[
            {"type":"paragraph","content":[{"type":"text","text":"On 3 May, "},{"type":"text","marks":[{"type":"bold"}],"text":"the accused"},{"type":"text","text":" was seen."}]},
            {"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Item one"}]}]}]}]}"#;
        let blocks = rich_text_blocks(Some(doc));
        assert!(matches!(&blocks[0], Block::Paragraph { text } if text == "On 3 May, the accused was seen."));
        assert!(matches!(&blocks[1], Block::List { ordered: false, items } if items[0].text == "Item one"));
        assert!(matches!(&rich_text_blocks(Some("Plain words."))[0], Block::Paragraph { text } if text == "Plain words."));
        assert!(rich_text_blocks(None).is_empty());
    }
}
