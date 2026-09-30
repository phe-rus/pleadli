-- Papers (docs/lawyers/REVIEW-2026-09-30.md, L3 "Import papers"): what the
-- client brings or the other side and the court send, photographed or scanned
-- into a matter. Each is one file sealed in the vault under its id; the row
-- keeps the path relative to the vault, never a name that says whose it is.
-- Assist may name, date and transcribe a paper; `assisted` stays 1 until a
-- person edits it, so what Assist wrote is always shown as unchecked.
CREATE TABLE papers (
    id TEXT PRIMARY KEY,
    matter_id TEXT NOT NULL REFERENCES matters(id),
    title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('pleading', 'court_document', 'letter', 'contract', 'receipt', 'identity', 'evidence', 'other')),
    -- The day the paper bears, as written on it (YYYY-MM-DD), if any.
    dated TEXT,
    from_whom TEXT,
    summary TEXT,
    transcript TEXT,
    assisted INTEGER NOT NULL DEFAULT 0,
    file_name TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    content_sha256 TEXT NOT NULL,
    added_by TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX papers_matter ON papers (matter_id, created_at);
