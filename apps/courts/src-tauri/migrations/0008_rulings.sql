-- Rulings and judgments: the court's reasoned decisions, as opposed to the
-- short orders of 0005. A draft is a working document and changes freely (and
-- may carry the date the decision was reserved, so a reserved judgment is never
-- invisible: the 2011 Auditor-General review found judgments long overdue with
-- "judgment on notice" and no date). Delivering renders the decision once, gives
-- it a reference and a SHA-256 of exactly what was delivered, and freezes it.
-- `body` holds the editor's document as JSON.
CREATE TABLE rulings (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    sitting_id TEXT REFERENCES sittings(id),
    kind TEXT NOT NULL CHECK (kind IN ('ruling', 'judgment')),
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    reserved_on INTEGER,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'delivered')),
    reference TEXT UNIQUE,
    content TEXT,
    content_sha256 TEXT,
    delivered_on INTEGER,
    delivered_at INTEGER,
    delivered_by TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX rulings_case ON rulings (case_id);

CREATE TRIGGER rulings_delivered_no_update BEFORE UPDATE ON rulings WHEN OLD.status = 'delivered'
BEGIN SELECT RAISE(ABORT, 'A delivered decision cannot be changed.'); END;

CREATE TRIGGER rulings_delivered_no_delete BEFORE DELETE ON rulings WHEN OLD.status = 'delivered'
BEGIN SELECT RAISE(ABORT, 'A delivered decision cannot be deleted.'); END;
