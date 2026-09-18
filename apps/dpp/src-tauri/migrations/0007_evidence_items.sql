-- Police Material (received) — Evidence/Exhibits (docs/dpp/PRODUCT.md).
-- `category` mirrors ODPP's own enumerated evidence types (RESEARCH.md
-- §3): expert evidence, digital evidence (CCTV, audio/visual, metadata),
-- documentary evidence, exhibits. DPP records what Police says exists and
-- its description — DPP does not independently track physical
-- chain-of-custody the way Police's own Exhibits/`exhibit_movements`
-- domain does, since DPP never holds the physical item.
CREATE TABLE evidence_items (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    category TEXT NOT NULL,
    description TEXT,
    identification_mark TEXT,
    recovered_from_location TEXT,
    source_note TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
