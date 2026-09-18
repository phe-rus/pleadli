-- Police Material (received) — Statements (docs/dpp/PRODUCT.md). ODPP's own
-- Decision to Charge Guidelines enumerate exactly what must be on the file
-- at charge (RESEARCH.md §3): witness statements (including exculpatory
-- ones), arresting/investigating-officer statements, statements of the
-- accused. `statement_role` captures which of these this is — a real,
-- confirmed distinction, not an invented category. This is DPP's OWN
-- record of the material — see PRODUCT.md's "Architectural boundary"
-- section for why it can't be a live link into Police's own `statements`
-- table (separate local databases, no sync engine).
CREATE TABLE statements (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    person_id TEXT NOT NULL REFERENCES people(id),
    statement_role TEXT NOT NULL,
    content TEXT,
    given_at INTEGER NOT NULL,
    source_note TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
