-- A plain "remanded to the next hearing" event, for countries whose law caps
-- each remand rather than the total (Tanzania: 15 clear days to prison per
-- adjournment, Criminal Procedure Act s.225(2)). SQLite cannot change a CHECK
-- in place, so the table is rebuilt with its rows.

CREATE TABLE custody_events_new (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    kind TEXT NOT NULL CHECK (kind IN ('arrest', 'court_production', 'remand', 'remand_both', 'remand_high_court', 'map', 'odp', 'odp_extension', 'bail', 'release', 'trial_start')),
    at INTEGER NOT NULL,
    person_name TEXT,
    note TEXT,
    source TEXT NOT NULL DEFAULT 'person' CHECK (source IN ('person', 'assist')),
    created_by TEXT,
    created_at INTEGER NOT NULL
);
INSERT INTO custody_events_new SELECT id, prosecution_file_id, kind, at, person_name, note, source, created_by, created_at FROM custody_events;
DROP TABLE custody_events;
ALTER TABLE custody_events_new RENAME TO custody_events;
CREATE INDEX custody_events_file ON custody_events (prosecution_file_id, at);
