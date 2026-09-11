-- The core record (docs/prisons/PRODUCT.md §1). "Prisoner" is the Prisons
-- Act's own term (s.2) — not "inmate", which has no statutory definition.
-- `status` holds the three statutory categories on one entity rather than
-- three tables: convicted / unconvicted (UPS's own statistics call this
-- "Remand") / civil (a debtor, RESEARCH.md §2).
--
-- Admission requires one of four named legal instruments (s.58) — modeled
-- as a plain field, not a foreign key, since no separate "admission event"
-- table exists yet in this first slice (see `current_status`/`releases`
-- below for the one lifecycle transition this slice does track).
--
-- No official prisoner reference-number format was found (RESEARCH.md §2,
-- same open question as ODPP's registration number) — `reference` stays
-- free text.
CREATE TABLE prisoners (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    other_names TEXT,
    national_id TEXT,
    reference TEXT,
    status TEXT NOT NULL DEFAULT 'unconvicted',
    admission_instrument_type TEXT NOT NULL,
    admission_authority TEXT,
    admitted_at INTEGER NOT NULL,
    current_status TEXT NOT NULL DEFAULT 'in_custody',
    -- Which constitutional mandatory-bail threshold applies (Art. 23(6)):
    -- true = 180 days (offence triable only by the High Court), false = 60
    -- days (triable by both the High Court and a subordinate court). A
    -- plain boolean, not a full offence-classification model — this exists
    -- solely to drive the mandatory-bail-eligibility derived view
    -- correctly, per RESEARCH.md §3's confirmed 60/180-day constitutional
    -- figures (NOT the Prisons Act's own unreformed 120/360-day text).
    high_court_only_offence INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
