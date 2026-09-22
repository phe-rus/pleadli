-- A criminal case before this court (docs/courts/PROPOSAL.md, D4: criminal
-- only for now). `court_number` is the number the court registry gave it (for
-- example "CRB 214/2026"), typed in, because the registry's own system is the
-- register of record and this workspace sits beside it (D1). Nothing here is
-- derived from a Police or DPP number.
CREATE TABLE cases (
    id TEXT PRIMARY KEY,
    court_number TEXT NOT NULL,
    title TEXT NOT NULL,
    court_level TEXT NOT NULL DEFAULT 'magistrate' CHECK (court_level IN ('magistrate', 'high')),
    offence TEXT,
    registered_on INTEGER,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'concluded')),
    outcome TEXT,
    concluded_at INTEGER,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX cases_court_number ON cases (court_number COLLATE NOCASE);

-- Who is in a case. More than one accused is normal (joinder). Custody is
-- recorded for an accused only: remanded, on bail, or not in custody, with the
-- date the remand runs to and where the person is held, so the court can see
-- when a remand is ending without opening every file.
CREATE TABLE case_parties (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    role TEXT NOT NULL CHECK (role IN ('accused', 'complainant', 'prosecutor', 'defence_counsel')),
    name TEXT NOT NULL,
    custody TEXT CHECK (custody IN ('remanded', 'on_bail', 'not_in_custody')),
    remand_until INTEGER,
    custody_place TEXT,
    note TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX case_parties_case ON case_parties (case_id);
