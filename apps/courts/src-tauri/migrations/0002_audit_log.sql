-- The audit trail, format version 1 (packages/node-core `audit`). The table and
-- its guards are the crate's own text, so every application that adopts the
-- chain has the same schema; a test keeps this file containing it verbatim.
CREATE TABLE audit_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER NOT NULL DEFAULT 1,
    at INTEGER NOT NULL,
    actor TEXT,
    action TEXT NOT NULL,
    subject_type TEXT,
    subject_id TEXT,
    scope_id TEXT,
    detail TEXT,
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL
);

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'The audit trail is append-only.'); END;

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'The audit trail is append-only.'); END;
