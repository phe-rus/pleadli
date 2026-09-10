//! Dev/test seed helpers shared across domains. Compiled out of release
//! builds entirely — every caller site is itself `#[cfg(debug_assertions)]`.

/// Wraps plain text in the minimal Tiptap/ProseMirror document JSON shape
/// (`@pleadli/rich-text`'s storage format). Seed data has to actually be in
/// this shape, not plain text, or the rich text preview renders nothing —
/// `isRichTextEmpty` looks for a top-level `content` array and treats
/// anything else (including plain text, or Lexical's old `root.children`
/// shape) as empty.
pub fn plain_text_to_rich_text_json(text: &str) -> String {
    serde_json::json!({
        "type": "doc",
        "content": [{
            "type": "paragraph",
            "content": [{
                "type": "text",
                "text": text,
            }],
        }],
    })
    .to_string()
}
