-- Visits (docs/prisons/PRODUCT.md, added 2026-09-11 after RESEARCH.md §9
-- grounded the real procedure: gate identification/search, reception
-- registration naming the prisoner, then a supervised visit). Secondary-
-- sourced (Justice Centres Uganda/JLOS) since the Prisons Regulations 2012
-- — the likely primary source — remain unreachable.
CREATE TABLE visits (
    id TEXT PRIMARY KEY,
    prisoner_id TEXT NOT NULL REFERENCES prisoners(id),
    visitor_name TEXT NOT NULL,
    visitor_identification TEXT,
    visited_at INTEGER NOT NULL,
    supervising_officer TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
