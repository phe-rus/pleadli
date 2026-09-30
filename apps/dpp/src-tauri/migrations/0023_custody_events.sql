-- The custody record of a file: arrest, appearances before a court or a
-- magistrate, warrants and orders (MAP, ODP, extensions, remand), bail and
-- release, each with its date and time. The legal clocks are counted from
-- these by the app, using the country pack's rules, never guessed.

CREATE TABLE custody_events (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    kind TEXT NOT NULL CHECK (kind IN ('arrest', 'court_production', 'remand_both', 'remand_high_court', 'map', 'odp', 'odp_extension', 'bail', 'release', 'trial_start')),
    at INTEGER NOT NULL,
    person_name TEXT,
    note TEXT,
    source TEXT NOT NULL DEFAULT 'person' CHECK (source IN ('person', 'assist')),
    created_by TEXT,
    created_at INTEGER NOT NULL
);
CREATE INDEX custody_events_file ON custody_events (prosecution_file_id, at);
