CREATE TABLE station_assets (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    item_identifier TEXT,
    status TEXT NOT NULL,
    holder_name TEXT,
    person_id TEXT REFERENCES people(id),
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
