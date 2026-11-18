-- What a facility has told this registry about a person it committed. A claim
-- by the facility, kept as received; it does not change the case by itself.
CREATE TABLE prison_reports (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL REFERENCES prison_links(id),
    order_id TEXT NOT NULL,
    case_id TEXT REFERENCES cases(id),
    court_number TEXT NOT NULL,
    accused TEXT NOT NULL,
    event TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    note TEXT,
    reported_by TEXT,
    seq INTEGER NOT NULL,
    sent_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    package_sha256 TEXT NOT NULL
);
CREATE INDEX prison_reports_case ON prison_reports (case_id);
