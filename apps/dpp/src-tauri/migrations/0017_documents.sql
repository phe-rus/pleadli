-- The document library (docs/dpp/PRODUCT.md, Documents). One table for every
-- kind of official document DPP produces. `content` is a structured snapshot
-- (a small block model) built from the record; the reader, the print sheet, the
-- DOCX and the Markdown are all rendered from it, so what is read is what is
-- printed and exported.
--
-- A document is a draft until issued. A draft can be refreshed from the record.
-- Issuing freezes the content, assigns the reference and stores its SHA-256, so
-- a later change to the underlying records cannot alter an issued document, and
-- a change to the stored content can be detected.
--
-- `reference` is Pleadli's own document number (DPP-year-sequence), not an ODPP
-- number: ODPP's own numbering format is unconfirmed (RESEARCH.md).
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    reference TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    source_decision_id TEXT NOT NULL REFERENCES decisions(id),
    author TEXT,
    content TEXT NOT NULL,
    content_sha256 TEXT,
    prepared_at INTEGER NOT NULL,
    issued_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

CREATE UNIQUE INDEX one_document_per_source ON documents (source_decision_id, kind);

CREATE TABLE document_counters (
    year INTEGER PRIMARY KEY,
    next INTEGER NOT NULL
);
