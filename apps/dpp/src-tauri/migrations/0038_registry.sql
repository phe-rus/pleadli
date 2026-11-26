-- The registry's three registers: incoming (files received), outgoing (what
-- the office sent out) and movement (who a file was given to). Numbered per
-- register per year, as a paper register is. Incoming and outgoing entries are
-- made from events already recorded (a file received, a handover made), each
-- exactly once through `source_key`; movement entries are made by hand when a
-- clerk gives a file out. Stamps are recorded as who and when, never drawn.
CREATE TABLE register_entries (
    id TEXT PRIMARY KEY,
    register TEXT NOT NULL CHECK (register IN ('incoming', 'outgoing', 'movement')),
    year INTEGER NOT NULL,
    number INTEGER NOT NULL,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    occurred_at INTEGER NOT NULL,
    from_to TEXT,
    given_to TEXT,
    given_to_staff TEXT REFERENCES staff(id),
    note TEXT,
    stamps_json TEXT NOT NULL DEFAULT '[]',
    actor TEXT,
    source_key TEXT UNIQUE,
    created_at INTEGER NOT NULL,
    UNIQUE (register, year, number)
);
CREATE INDEX register_entries_file ON register_entries (prosecution_file_id);
