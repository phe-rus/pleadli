-- Paper that can be checked: the exact wording of every paper that left the
-- application (printed, saved as PDF or Word), under the code printed on it.
-- Same as pleadli_node_core::paper::TABLE_SQL.
CREATE TABLE paper_prints (
    code TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    reference TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    body_sha256 TEXT NOT NULL,
    printed_by TEXT,
    printed_at INTEGER NOT NULL
);

CREATE INDEX paper_prints_entity ON paper_prints (entity_type, entity_id, printed_at);

CREATE TRIGGER paper_prints_no_update BEFORE UPDATE ON paper_prints
BEGIN SELECT RAISE(ABORT, 'A printed paper is never changed.'); END;

CREATE TRIGGER paper_prints_no_delete BEFORE DELETE ON paper_prints
BEGIN SELECT RAISE(ABORT, 'A printed paper is never changed.'); END;
