-- Fields grounded in docs/police/research/custody-and-bonds.md, not invented:
-- `arrested_at` is the 48h clock start ("from the time of his or her
-- arrest" — Constitution Art. 23(4), Police Act s.25(1), both verified
-- against primary source). `cross_jurisdiction_transfer`/`transferred_at`
-- reflect the one real, verified statutory exception (Police Act s.25(2)):
-- the clock doesn't apply until transfer, and transfer itself must happen
-- within 7 days. `status` enumerates exactly the five decision points the
-- research verified against the Police Act (release without charge,
-- release on bond, production in court, referral to DPP, or continued
-- custody bounded by the deadline) — nothing beyond what's documented.
CREATE TABLE custody_records (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES people(id),
    incident_id TEXT REFERENCES incidents(id),
    case_id TEXT REFERENCES cases(id),
    arrested_at INTEGER NOT NULL,
    location TEXT,
    cross_jurisdiction_transfer INTEGER NOT NULL DEFAULT 0,
    transferred_at INTEGER,
    status TEXT NOT NULL DEFAULT 'in_custody',
    released_at INTEGER,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
