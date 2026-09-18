-- Review & Legal Observations (docs/dpp/PRODUCT.md) — the actual reviewing
-- work, distinct from the formal Decision (the brief is explicit these are
-- different things: an observation doesn't change the file's status; only
-- a real Decision does). Optionally points at the specific Statement or
-- Evidence item it's about, never both.
CREATE TABLE review_notes (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    statement_id TEXT REFERENCES statements(id),
    evidence_item_id TEXT REFERENCES evidence_items(id),
    author TEXT,
    note TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
