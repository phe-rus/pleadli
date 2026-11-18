-- The legal rules the app applies (offences police cannot bail, the age of a juvenile, guidance),
-- kept as versioned data rather than code so they can be improved without a new release. Every
-- version ever loaded is kept, so a record can always be traced to the rules in force when it was made.
CREATE TABLE rule_packs (
    id TEXT PRIMARY KEY,
    country TEXT NOT NULL,
    version INTEGER NOT NULL,
    body TEXT NOT NULL,
    source TEXT NOT NULL,
    imported_at INTEGER NOT NULL,
    imported_by TEXT,
    UNIQUE (country, version)
);
