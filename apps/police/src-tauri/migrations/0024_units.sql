-- The command structure this station sits in, held as data rather than code.
-- A station is one node in a tree of units: it has a parent (a division, a
-- district, a region) and, later, units inside it. What the levels are and are
-- called is NOT fixed here: `kind` is a suggestion validated in the domain, and
-- the real structure still has to be confirmed with serving officers
-- (docs/police/AUDIT.md section 4). Nothing about a unit above the station is
-- known to this installation beyond what an officer typed in.
--
-- `is_local` marks the one unit this installation belongs to (the station). At
-- most one row may carry it.
CREATE TABLE police_units (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES police_units(id),
    is_local INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

CREATE UNIQUE INDEX police_units_one_local ON police_units(is_local) WHERE is_local = 1;
CREATE INDEX police_units_parent ON police_units(parent_id);
