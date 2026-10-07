-- Handwriting on a paper received or scanned (pen, finger, mouse), one row per
-- paper, the latest writing only. Same as pleadli_node_core::paper::INK_TABLE_SQL.
CREATE TABLE paper_ink (
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    ink TEXT NOT NULL,
    written_by TEXT,
    written_at INTEGER NOT NULL,
    PRIMARY KEY (entity_type, entity_id)
);
