-- Original supporting files belong to a case. This is not the exhibits register.
CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    name TEXT NOT NULL,
    media_type TEXT NOT NULL,
    size INTEGER NOT NULL CHECK (size > 0 AND size <= 10485760),
    sha256 TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX attachments_case ON attachments(case_id, created_at);
