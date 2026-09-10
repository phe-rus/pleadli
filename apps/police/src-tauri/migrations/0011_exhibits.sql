-- Fields mirror the real register requirements from "The Constitution
-- (Exhibit Management Guidelines for Courts of Judicature) (Practice)
-- Directions, 2021" (docs/police/PRODUCT.md's audit, §G.2 — corroborated,
-- not primary-verified, but the governing instrument for exhibit handling
-- "during and after investigation") and UPF's own PF17A "Exhibit" form
-- (verified to exist by name on upf.go.ug). The guidelines specify: nature
-- of exhibit, state on recovery, date recovered, who handed it over, place
-- of recovery, witnesses present, receiver, case reference, identification
-- mark, storage officer/location, and item description — all present here.
-- Deliberately NOT modeled: any UPF-internal exhibit register beyond this
-- (never found), cash/drug weight-verification specifics, or a formal
-- disposal procedure — none of that was confirmed.
CREATE TABLE exhibits (
    id TEXT PRIMARY KEY,
    case_id TEXT REFERENCES cases(id),
    incident_id TEXT REFERENCES incidents(id),
    person_id TEXT REFERENCES people(id),
    description TEXT NOT NULL,
    identification_mark TEXT,
    recovered_at INTEGER NOT NULL,
    recovered_from_location TEXT,
    handed_over_by TEXT,
    witnesses TEXT,
    receiving_officer_name TEXT,
    storage_location TEXT,
    status TEXT NOT NULL DEFAULT 'in_storage',
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- Chain-of-custody: the actual reason Evidence is its own domain rather
-- than generic inventory (docs/police/PRODUCT.md: "who moved it, its
-- current status"). Each row is one movement event, never edited after
-- the fact — the history itself is the record.
CREATE TABLE exhibit_movements (
    id TEXT PRIMARY KEY,
    exhibit_id TEXT NOT NULL REFERENCES exhibits(id) ON DELETE CASCADE,
    moved_at INTEGER NOT NULL,
    location TEXT NOT NULL,
    custodian_name TEXT,
    reason TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
