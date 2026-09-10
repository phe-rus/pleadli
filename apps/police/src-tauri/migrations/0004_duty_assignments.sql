CREATE TABLE duty_assignments (
    id TEXT PRIMARY KEY,
    officer_name TEXT NOT NULL,
    officer_rank TEXT,
    unit TEXT,
    shift_start INTEGER NOT NULL,
    shift_end INTEGER NOT NULL,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
