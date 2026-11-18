-- Reports the facility has sent to a court about a person the court committed.
CREATE TABLE court_reports_out (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL REFERENCES court_links(id),
    order_package_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    event TEXT NOT NULL,
    payload TEXT NOT NULL,
    prepared_at INTEGER NOT NULL
);
