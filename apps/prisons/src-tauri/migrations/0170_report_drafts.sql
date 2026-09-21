-- Composed reports: a document an officer assembles from written text and
-- tables drawn from the registers. Unlike an issued report (`generated_reports`,
-- immutable), a draft is worked on and saved as often as needed. Issuing one
-- copies it into `generated_reports` as a numbered, fingerprinted snapshot and
-- freezes the draft: `issued_report_id` is set once and the draft is never
-- edited again. Drafts are not deleted.
CREATE TABLE report_drafts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    blocks_json TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_by_name TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    issued_report_id TEXT REFERENCES generated_reports(id)
);

CREATE INDEX idx_report_drafts_updated ON report_drafts (updated_at DESC);
