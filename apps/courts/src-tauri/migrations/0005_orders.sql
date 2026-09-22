-- Orders the court makes, as printable documents. An order is a draft until it
-- is issued. Issuing renders the wording once from the draft's fields, gives it
-- a reference and a SHA-256 of exactly what was rendered, and freezes it: an
-- issued order cannot be edited or deleted (the triggers below), only replaced
-- by a new order. A draft is a working note and can change freely.
CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    sitting_id TEXT REFERENCES sittings(id),
    kind TEXT NOT NULL CHECK (kind IN ('adjournment', 'remand', 'release', 'general')),
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
CREATE INDEX orders_case ON orders (case_id);

CREATE TRIGGER orders_issued_no_update BEFORE UPDATE ON orders WHEN OLD.status = 'issued'
BEGIN SELECT RAISE(ABORT, 'An issued order cannot be changed.'); END;

CREATE TRIGGER orders_issued_no_delete BEFORE DELETE ON orders WHEN OLD.status = 'issued'
BEGIN SELECT RAISE(ABORT, 'An issued order cannot be deleted.'); END;
