-- Generated report documents (docs/prisons/product-map/05 N.2 and O.5).
--
-- A report is a snapshot: the figures as they stood when it was generated,
-- kept exactly so it can be reprinted as issued. Nothing here is updated or
-- deleted; a corrected report is a new report with its own reference.
-- `content_hash` is the SHA-256 of `content_json`, so a reprint can prove it
-- is the document that was issued.
CREATE TABLE generated_reports (
    id TEXT PRIMARY KEY,
    reference TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    period_from INTEGER,
    period_to INTEGER,
    template_version INTEGER NOT NULL,
    content_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    generated_by_id TEXT,
    generated_by_name TEXT NOT NULL,
    generated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

CREATE INDEX idx_generated_reports_generated_at ON generated_reports (generated_at DESC);

CREATE TRIGGER generated_reports_no_update BEFORE UPDATE ON generated_reports
BEGIN
    SELECT RAISE(ABORT, 'generated reports are immutable');
END;

CREATE TRIGGER generated_reports_no_delete BEFORE DELETE ON generated_reports
BEGIN
    SELECT RAISE(ABORT, 'generated reports are never deleted');
END;
