-- The Court Production & Remand domain (docs/prisons/PRODUCT.md), pulled
-- out as first-class the same way DPP pulled out Intake — it's a real,
-- named statutory duty (s.118's pre-session "list of prisoners awaiting
-- trial", s.67's reactive production orders), not a generic event log.
--
-- s.118 needs three fields per prisoner: admission date (already on
-- `prisoners`), the authority for detention (already on `prisoners` as
-- `admission_authority`), and the date last appeared in court — which this
-- table supplies as a derived value (the latest `production_date` for that
-- prisoner), rather than a field maintained by hand.
CREATE TABLE court_productions (
    id TEXT PRIMARY KEY,
    prisoner_id TEXT NOT NULL REFERENCES prisoners(id),
    court_reference TEXT,
    production_date INTEGER NOT NULL,
    purpose TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
