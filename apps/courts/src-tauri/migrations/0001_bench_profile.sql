-- The judicial officer this installation belongs to. One row: user zero is one
-- judicial officer with a clerk (docs/courts/PROPOSAL.md, D2). The name and
-- court are what an issued order is signed and headed with, and what the audit
-- trail records as the person acting.
CREATE TABLE bench_profile (
    id TEXT PRIMARY KEY CHECK (id = 'default'),
    name TEXT NOT NULL,
    title TEXT,
    court_name TEXT,
    court_level TEXT NOT NULL DEFAULT 'magistrate' CHECK (court_level IN ('magistrate', 'high')),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
