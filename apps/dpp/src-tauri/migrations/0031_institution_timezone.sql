-- The institution's timezone: an append-only history (same shape as pleadli_node_core::timezone::TABLE_SQL).
-- A change never re-times an old event. Instants everywhere else stay UTC epoch milliseconds.
CREATE TABLE institution_timezone (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_id TEXT NOT NULL,
    country TEXT NOT NULL,
    effective_from INTEGER NOT NULL,
    set_by TEXT,
    set_at INTEGER NOT NULL,
    reason TEXT
);

CREATE TRIGGER institution_timezone_no_update BEFORE UPDATE ON institution_timezone
BEGIN SELECT RAISE(ABORT, 'A timezone change is never edited. Make a new change.'); END;

CREATE TRIGGER institution_timezone_no_delete BEFORE DELETE ON institution_timezone
BEGIN SELECT RAISE(ABORT, 'A timezone change is never deleted.'); END;
