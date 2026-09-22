-- The advocate's own documents: an application, submissions, a list of
-- authorities, a letter, advice. A draft is a working document. Filing marks it
-- as put before the court (or sent), gives it a local reference and a SHA-256 of
-- exactly what was filed, and freezes it: what was filed is never edited, only
-- replaced by a new document. (Whether Ugandan practice prescribes a form for
-- each of these is not settled by the research: none is asserted here.)
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    matter_id TEXT NOT NULL REFERENCES matters(id),
    kind TEXT NOT NULL CHECK (kind IN ('bail_application', 'submissions', 'list_of_authorities', 'letter', 'advice', 'general')),
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'filed')),
    reference TEXT UNIQUE,
    content TEXT,
    content_sha256 TEXT,
    filed_on INTEGER,
    filed_with TEXT,
    filed_at INTEGER,
    filed_by TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX documents_matter ON documents (matter_id);

CREATE TRIGGER documents_filed_no_update BEFORE UPDATE ON documents WHEN OLD.status = 'filed'
BEGIN SELECT RAISE(ABORT, 'A filed document cannot be changed.'); END;
CREATE TRIGGER documents_filed_no_delete BEFORE DELETE ON documents WHEN OLD.status = 'filed'
BEGIN SELECT RAISE(ABORT, 'A filed document cannot be deleted.'); END;
