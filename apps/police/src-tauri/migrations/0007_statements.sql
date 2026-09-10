CREATE TABLE statements (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    person_id TEXT NOT NULL REFERENCES people(id),
    case_id TEXT REFERENCES cases(id),
    officer_name TEXT,
    given_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
