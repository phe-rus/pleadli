-- Communication & Requests (docs/prisons/PRODUCT.md, RESEARCH.md §11.6) --
-- the Human Rights Committee / "Mukutano" grievance mechanism: an elected
-- inmate committee receives complaints (food, remand overstay, general
-- welfare), escalates to the officer in charge / a staff committee, which
-- takes "further action." prisoner_id is nullable since a complaint may be
-- committee-sourced/anonymous rather than individually attributed.
CREATE TABLE requests (
    id TEXT PRIMARY KEY,
    prisoner_id TEXT REFERENCES prisoners(id),
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    raised_at INTEGER NOT NULL,
    outcome_note TEXT,
    resolved_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
