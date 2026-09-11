-- The core DPP record (docs/dpp/PRODUCT.md §1). ODPP's own dominant working
-- term is "file", not "case" — confirmed directly from ODPP's 2023 Decision
-- to Charge Guidelines (docs/dpp/RESEARCH.md §2). Three distinct reference
-- numbers exist per real-world matter: the police-side reference, ODPP's own
-- registration number, and a court case number assigned only once the
-- charge sheet is filed — hence three separate nullable-until-known columns
-- rather than one generic "reference" field. `odpp_registration_number` has
-- no known format (RESEARCH.md §2) so it stays free text, unindexed for
-- uniqueness.
--
-- `current_status` is a cached summary for list/queue views, not the audit
-- trail itself — the `decisions` table (0005) is the real record of what was
-- decided and when; this column is only ever updated as a side effect of
-- inserting a new decision, never edited directly (docs/dpp/PRODUCT.md,
-- Decisions & Reviews: "later edits must never silently rewrite a
-- historical decision").
CREATE TABLE prosecution_files (
    id TEXT PRIMARY KEY,
    odpp_registration_number TEXT,
    title TEXT NOT NULL,
    police_station TEXT,
    police_reference TEXT,
    court_case_number TEXT,
    current_status TEXT NOT NULL DEFAULT 'under_review',
    received_at INTEGER NOT NULL,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- Roles on a file (docs/dpp/PRODUCT.md §Person model): accused, complainant/
-- victim, witness. A many-to-many join, not embedded name fields on the
-- file, because joinder rules (Magistrates Courts Act §86-88, Trial on
-- Indictments Act §23-24, RESEARCH.md §1) mean one file can genuinely
-- involve multiple accused.
CREATE TABLE prosecution_file_people (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    person_id TEXT NOT NULL REFERENCES people(id),
    role TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
