-- The advocate whose installation this is (one row). One advocate's own
-- practice is the first user (docs/lawyers/PROPOSAL.md): no firm structure, no
-- staff, no sign-in. The name is who the audit trail records and who signs what
-- is filed; the firm is what a filed document is headed with.
CREATE TABLE advocate_profile (
    id TEXT PRIMARY KEY CHECK (id = 'default'),
    name TEXT NOT NULL,
    firm TEXT,
    phone TEXT,
    email TEXT,
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
