-- Documents from country templates (docs/dpp/PIPELINE.md, Phase 3).
--
-- 1. A document no longer has to come from a decision: a detention request or
--    a release order stands on the file alone. The table is rebuilt so the
--    decision becomes optional; one document per decision and kind still holds
--    where there is a decision.
-- 2. Each person may keep an image of their signature, and the office its
--    stamp. Issuing a document copies both into it (and they are covered by
--    the document's hash from then on).

CREATE TABLE documents_new (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    reference TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    source_decision_id TEXT REFERENCES decisions(id),
    author TEXT,
    content TEXT NOT NULL,
    content_sha256 TEXT,
    prepared_at INTEGER NOT NULL,
    issued_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

INSERT INTO documents_new (id, prosecution_file_id, kind, title, reference, status, source_decision_id, author, content, content_sha256, prepared_at, issued_at, created_at)
SELECT id, prosecution_file_id, kind, title, reference, status, source_decision_id, author, content, content_sha256, prepared_at, issued_at, created_at FROM documents;

DROP TABLE documents;
ALTER TABLE documents_new RENAME TO documents;

CREATE UNIQUE INDEX one_document_per_source ON documents (source_decision_id, kind) WHERE source_decision_id IS NOT NULL;
CREATE INDEX documents_file ON documents (prosecution_file_id, prepared_at);

ALTER TABLE staff ADD COLUMN signature TEXT;
ALTER TABLE installation ADD COLUMN stamp TEXT;
