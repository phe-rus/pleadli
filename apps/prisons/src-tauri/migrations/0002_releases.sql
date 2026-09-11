-- Every real release trigger as its own auditable event (docs/prisons/
-- PRODUCT.md §Release) — never a single "released" checkbox, same
-- discipline as DPP's decisions table. Append-only by convention: no
-- update/delete command is exposed for this table.
--
-- `release_type` covers the six distinct statutory triggers confirmed in
-- RESEARCH.md §4: bail, full remission, partial remission, parole, release
-- on licence, acquittal/court-ordered discharge — plus a seventh,
-- `erroneous_release_correction` (s.79's re-arrest-and-re-detain power),
-- which is the one type that flips a prisoner's status back to in-custody
-- rather than out.
CREATE TABLE releases (
    id TEXT PRIMARY KEY,
    prisoner_id TEXT NOT NULL REFERENCES prisoners(id),
    release_type TEXT NOT NULL,
    released_at INTEGER NOT NULL,
    ordered_by TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
