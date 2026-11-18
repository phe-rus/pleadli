-- Documents counsel has filed in cases of this registry. status: received,
-- accepted (kept on the case), rejected (returned with a reason).
CREATE TABLE firm_filings (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL REFERENCES firm_links(id),
    case_id TEXT REFERENCES cases(id),
    seq INTEGER NOT NULL,
    sent_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    package_sha256 TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received',
    decided_at INTEGER,
    decided_by TEXT,
    reject_reason TEXT
);
CREATE INDEX firm_filings_case ON firm_filings (case_id);
