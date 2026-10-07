-- Paper that can be checked: the exact wording of every paper that left the
-- application, under the code printed on it (pleadli_node_core::paper::TABLE_SQL).
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

-- A criminal matter's own custody dates, for the remand tracker: the day the
-- client was remanded on this charge and the day of committal for trial (the
-- Art. 23(6) Constitution clock runs between them; after committal the days
-- on remand are still counted, for the sentence).
ALTER TABLE matters ADD COLUMN remanded_on INTEGER;
ALTER TABLE matters ADD COLUMN committed_on INTEGER;
