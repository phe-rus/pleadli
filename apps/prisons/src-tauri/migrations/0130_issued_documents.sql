-- Documents the facility has issued: the first print of a record's document
-- assigns its number, and every later print is a reprint of the same number.
-- The number comes from the facility's own document prefix (set at setup) and
-- a counter that restarts each year.
CREATE TABLE issued_documents (
    id TEXT PRIMARY KEY,
    number TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    record_id TEXT NOT NULL,
    issued_at INTEGER NOT NULL,
    issued_by TEXT,
    issued_by_name TEXT NOT NULL,
    issued_by_badge TEXT,
    reprints INTEGER NOT NULL DEFAULT 0,
    last_printed_at INTEGER,
    UNIQUE (kind, record_id)
);

CREATE TABLE document_counters (
    year INTEGER PRIMARY KEY,
    next_value INTEGER NOT NULL
);
