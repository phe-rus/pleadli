-- Police Material (received) — the proposed charge(s) (docs/dpp/PRODUCT.md).
-- Same structured shape as Police's own `charge_sheets` (offence,
-- statutory_section, particulars) — DPP is reviewing a proposed charge
-- sheet, not inventing one from nothing. A file can carry more than one
-- charge/count (joinder — Magistrates Courts Act §86-88, already
-- established in PRODUCT.md §1's cardinality section), so this is its own
-- table, not fields on `prosecution_files`.
CREATE TABLE charges (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    accused_person_id TEXT REFERENCES people(id),
    offence TEXT NOT NULL,
    statutory_section TEXT,
    particulars TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
