-- Clients and matters. The research found no Ugandan standard for a firm's
-- matter numbers or even for the word "matter" (docs/lawyers/RESEARCH.md, section
-- 2), so `our_ref` is the firm's own reference, free text, and nothing here
-- invents a numbering scheme. `court_number` is the number the court gave the
-- case, typed in, and is how a matter is matched to the court's record.
CREATE TABLE clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    custody TEXT CHECK (custody IN ('at_liberty', 'remanded', 'serving')),
    custody_place TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- How the advocate came to act: privately retained, appointed at the expense of
-- the state (the Judicature (Legal Representation at the Expense of the State)
-- Rules, 2022, which impose duties with dates: see 0004 and `domain/tasks.rs`),
-- pro bono, or through a legal aid clinic. Fees follow this: the state-funded and
-- pro bono tracks are separate and never paid together (research section 4).
CREATE TABLE matters (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id),
    title TEXT NOT NULL,
    our_ref TEXT,
    court_number TEXT,
    court_name TEXT,
    court_level TEXT CHECK (court_level IN ('magistrate', 'high', 'appeal', 'other')),
    offence TEXT,
    engagement TEXT NOT NULL DEFAULT 'private' CHECK (engagement IN ('private', 'state_appointed', 'pro_bono', 'legal_aid_clinic')),
    appointed_on INTEGER,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    outcome TEXT,
    closed_at INTEGER,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX matters_client ON matters (client_id);
CREATE UNIQUE INDEX matters_our_ref ON matters (our_ref COLLATE NOCASE) WHERE our_ref IS NOT NULL;
