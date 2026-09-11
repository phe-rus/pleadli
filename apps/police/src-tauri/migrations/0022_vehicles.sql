-- A vehicle a person owns or is otherwise connected to — searchable by
-- plate number the same way a person is searchable by national ID,
-- answering the product ask to look someone up "by number plate."
-- owner_person_id is nullable: a plate can be logged before its owner
-- is known, same as every other optional relationship in this app.
CREATE TABLE vehicles (
    id TEXT PRIMARY KEY,
    plate_number TEXT NOT NULL,
    make TEXT,
    model TEXT,
    color TEXT,
    owner_person_id TEXT REFERENCES people(id),
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
