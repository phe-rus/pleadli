-- Documents this firm has filed with a court registry, and how the registry answered.
CREATE TABLE filings_out (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL REFERENCES court_links(id),
    matter_id TEXT NOT NULL REFERENCES matters(id),
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    seq INTEGER NOT NULL,
    payload TEXT NOT NULL,
    prepared_at INTEGER NOT NULL,
    outcome TEXT,
    reason TEXT,
    answered_at INTEGER
);
CREATE INDEX filings_out_matter ON filings_out (matter_id);
