CREATE TABLE incidents (
    id TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT,
    occurred_at INTEGER NOT NULL,
    person_id TEXT REFERENCES people(id),
    station_diary_entry_id TEXT REFERENCES station_diary_entries(id),
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
