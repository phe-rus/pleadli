-- Prisoner property & effects (docs/prisons/PRODUCT.md, RESEARCH.md §11.1) --
-- grounded directly in the Prisons Act 2006 s.62/s.30(2)(a), not the
-- inaccessible Regulations: non-retainable money/clothes/personal effects
-- are placed in the officer in charge's custody at admission, entered in
-- "prescribed registers," with an inventory kept, and returned at release.
-- No named fields beyond this are confirmed, so this stays a simple
-- description + returned marker, not a structured multi-field inventory.
CREATE TABLE property_records (
    id TEXT PRIMARY KEY,
    prisoner_id TEXT NOT NULL REFERENCES prisoners(id),
    description TEXT NOT NULL,
    recorded_at INTEGER NOT NULL,
    returned_at INTEGER,
    returned_note TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
