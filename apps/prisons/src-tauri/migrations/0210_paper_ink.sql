-- Handwriting (pen, finger or mouse) kept on a paper, the latest writing only:
-- a note on the prison's copy, printed with it, not part of the verified wording.
-- The same table every Pleadli app keeps (node-core paper::INK_TABLE_SQL).
CREATE TABLE paper_ink (
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    ink TEXT NOT NULL,
    written_by TEXT,
    written_at INTEGER NOT NULL,
    PRIMARY KEY (entity_type, entity_id)
);
