-- Fields mirror the real, named, verified PF18 "Release on Bond" form
-- (docs/police/research/custody-and-bonds.md, topic 3) as closely as what's
-- actually confirmed allows: case reference, lock-up serial number, custody
-- date, surety details/contact, granting officer's rank and name, and a
-- reporting-schedule field are all directly documented as PF18 fields.
-- Deliberately NOT modeled because the research found them unconfirmed:
-- a cash-surety-amount field (never confirmed as a real requirement), and
-- any rank-gating on who may grant an ordinary bond (only "plausible but
-- unconfirmed" for OC Station/OC CID).
CREATE TABLE bonds (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES people(id),
    custody_id TEXT REFERENCES custody_records(id),
    case_id TEXT REFERENCES cases(id),
    lock_up_serial_number TEXT,
    with_surety INTEGER NOT NULL DEFAULT 0,
    surety_name TEXT,
    surety_contact TEXT,
    reporting_schedule TEXT,
    officer_name TEXT,
    officer_rank TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    granted_at INTEGER NOT NULL,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
