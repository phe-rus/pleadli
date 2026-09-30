-- Documents for every kind of work, sealed like DPP's, and filings
-- (docs/lawyers/REVIEW-2026-09-30.md, section 4.3, phase L3).
--
-- 1. `documents` loses its fixed list of six kinds (all criminal defence): the
--    kinds are now the templates of each usage, checked by the domain. SQLite
--    cannot change a CHECK, so the table is rebuilt, rows and guards kept.
-- 2. What a filed document carries: the practice's address and contacts (its
--    letterhead, and the drawer's address the Advocates Act s.67 requires),
--    the practice's stamp, and each person's own signature.
-- 3. `filings`: documents put before a court together, with the court's own
--    reference (or ECCMIS's), the fee and its payment reference (PRN), and
--    service on the other side once it is done.

DROP TRIGGER documents_filed_no_update;
DROP TRIGGER documents_filed_no_delete;

CREATE TABLE documents_new (
    id TEXT PRIMARY KEY,
    matter_id TEXT NOT NULL REFERENCES matters(id),
    kind TEXT NOT NULL,
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
INSERT INTO documents_new SELECT id, matter_id, kind, title, body, status, reference, content, content_sha256, filed_on, filed_with, filed_at, filed_by, created_at, updated_at FROM documents;
DROP TABLE documents;
ALTER TABLE documents_new RENAME TO documents;
CREATE INDEX documents_matter ON documents (matter_id);

CREATE TRIGGER documents_filed_no_update BEFORE UPDATE ON documents WHEN OLD.status = 'filed'
BEGIN SELECT RAISE(ABORT, 'A filed document cannot be changed.'); END;
CREATE TRIGGER documents_filed_no_delete BEFORE DELETE ON documents WHEN OLD.status = 'filed'
BEGIN SELECT RAISE(ABORT, 'A filed document cannot be deleted.'); END;

ALTER TABLE installation ADD COLUMN address TEXT;
ALTER TABLE installation ADD COLUMN phone TEXT;
ALTER TABLE installation ADD COLUMN email TEXT;
ALTER TABLE installation ADD COLUMN stamp TEXT;
ALTER TABLE staff ADD COLUMN signature TEXT;

CREATE TABLE filings (
    id TEXT PRIMARY KEY,
    matter_id TEXT NOT NULL REFERENCES matters(id),
    filed_on INTEGER NOT NULL,
    court TEXT,
    court_reference TEXT,
    fee_amount INTEGER CHECK (fee_amount IS NULL OR fee_amount >= 0),
    fee_prn TEXT,
    served_on INTEGER,
    served_to TEXT,
    service_method TEXT,
    service_note TEXT,
    filed_by TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX filings_matter ON filings (matter_id, filed_on);

CREATE TABLE filing_documents (
    filing_id TEXT NOT NULL REFERENCES filings(id),
    document_id TEXT NOT NULL REFERENCES documents(id),
    position INTEGER NOT NULL,
    PRIMARY KEY (filing_id, document_id)
);
