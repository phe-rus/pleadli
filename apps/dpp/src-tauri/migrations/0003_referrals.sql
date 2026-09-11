-- The Police -> DPP handoff (docs/dpp/PRODUCT.md §Intake & Referrals,
-- §3 Police boundary). RESEARCH.md §3 confirms this is a real, named,
-- repeating event: an initial referral for sanctioning, and — when a file
-- is sent back for further investigation — a later resubmission referral
-- against the *same* file, not a new one. `is_resubmission` distinguishes
-- the two without needing a second table. References the Police case only
-- by station/reference text; Police's own database is never imported
-- (docs/dpp/PRODUCT.md §3: "Police retains its own record; DPP creates and
-- maintains its own").
CREATE TABLE referrals (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    police_station TEXT,
    police_reference TEXT,
    received_at INTEGER NOT NULL,
    material_summary TEXT,
    is_resubmission INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
