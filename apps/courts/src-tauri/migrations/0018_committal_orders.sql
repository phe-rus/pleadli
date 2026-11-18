-- A sentence goes to a prison as a warrant of committal: a fifth kind of order.
-- SQLite cannot change a CHECK in place, so the table is rebuilt.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE orders_new (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    sitting_id TEXT REFERENCES sittings(id),
    kind TEXT NOT NULL CHECK (kind IN ('adjournment', 'remand', 'release', 'committal', 'general')),
    title TEXT NOT NULL,
    fields TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued')),
    reference TEXT UNIQUE,
    content TEXT,
    content_sha256 TEXT,
    issued_at INTEGER,
    issued_by TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
INSERT INTO orders_new SELECT id, case_id, sitting_id, kind, title, fields, status, reference, content, content_sha256, issued_at, issued_by, created_at, updated_at FROM orders;
DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;
CREATE INDEX orders_case ON orders (case_id);

CREATE TRIGGER orders_issued_no_update BEFORE UPDATE ON orders WHEN OLD.status = 'issued'
BEGIN SELECT RAISE(ABORT, 'An issued order cannot be changed.'); END;

CREATE TRIGGER orders_issued_no_delete BEFORE DELETE ON orders WHEN OLD.status = 'issued'
BEGIN SELECT RAISE(ABORT, 'An issued order cannot be deleted.'); END;
