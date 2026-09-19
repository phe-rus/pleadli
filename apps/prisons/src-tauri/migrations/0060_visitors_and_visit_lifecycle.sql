-- Visitor register, visit lifecycle and visit rules (docs/prisons/RESEARCH.md
-- 9 to 11.7, product-map 02 W7). Additive only. The visit rules are
-- configurable because their source is secondary or unconfirmed (R-18).

-- A person who visits. Approved per prisoner once, then reused.
CREATE TABLE visitors (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    id_type TEXT NOT NULL DEFAULT 'national_id',
    id_number TEXT,
    phone TEXT,
    relationship_default TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX idx_visitors_identity ON visitors (id_type, id_number COLLATE NOCASE) WHERE id_number IS NOT NULL;
CREATE INDEX idx_visitors_name ON visitors (full_name COLLATE NOCASE);

CREATE TABLE prisoner_approved_visitors (
    prisoner_id TEXT NOT NULL REFERENCES prisoners(id),
    visitor_id TEXT NOT NULL REFERENCES visitors(id),
    relationship TEXT,
    approved_by TEXT,
    approved_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    note TEXT,
    PRIMARY KEY (prisoner_id, visitor_id)
);
CREATE INDEX idx_approved_visitors_visitor ON prisoner_approved_visitors (visitor_id);

-- Singleton. Days are ISO weekdays (1 = Monday), times are minutes after
-- midnight East Africa Time. Defaults follow the secondary source
-- (Monday to Friday, 8.00 to 17.00, at most three visitors at a time) and
-- the facility can change all of them.
CREATE TABLE visit_rules (
    id TEXT PRIMARY KEY DEFAULT 'default',
    max_visitors_per_visit INTEGER NOT NULL DEFAULT 3,
    max_visitors_per_prisoner_per_day INTEGER NOT NULL DEFAULT 6,
    visiting_days TEXT NOT NULL DEFAULT '1,2,3,4,5',
    opens_minutes INTEGER NOT NULL DEFAULT 480,
    closes_minutes INTEGER NOT NULL DEFAULT 1020,
    default_duration_minutes INTEGER NOT NULL DEFAULT 30,
    updated_at INTEGER,
    updated_by TEXT
);
INSERT INTO visit_rules (id) VALUES ('default');

ALTER TABLE visits ADD COLUMN visitor_id TEXT REFERENCES visitors(id);
ALTER TABLE visits ADD COLUMN relationship TEXT;
ALTER TABLE visits ADD COLUMN privileged INTEGER NOT NULL DEFAULT 0;
ALTER TABLE visits ADD COLUMN party_size INTEGER NOT NULL DEFAULT 1;
ALTER TABLE visits ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 30;
ALTER TABLE visits ADD COLUMN decided_by TEXT;
ALTER TABLE visits ADD COLUMN decided_at INTEGER;
ALTER TABLE visits ADD COLUMN decision_reason TEXT;
ALTER TABLE visits ADD COLUMN id_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE visits ADD COLUMN search_done INTEGER NOT NULL DEFAULT 0;
ALTER TABLE visits ADD COLUMN checked_in_at INTEGER;
ALTER TABLE visits ADD COLUMN checked_in_by TEXT;
ALTER TABLE visits ADD COLUMN started_at INTEGER;
ALTER TABLE visits ADD COLUMN ended_at INTEGER;
CREATE INDEX idx_visits_visited_at ON visits (visited_at);
CREATE INDEX idx_visits_prisoner ON visits (prisoner_id, visited_at);

-- Items a visitor brought for the prisoner, declared at the gate.
CREATE TABLE visit_items (
    id TEXT PRIMARY KEY,
    visit_id TEXT NOT NULL REFERENCES visits(id),
    description TEXT NOT NULL,
    disposition TEXT NOT NULL CHECK (disposition IN ('handed_over', 'held', 'refused')),
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX idx_visit_items_visit ON visit_items (visit_id);

-- Old two-value model: authorized (not yet attended) and attended.
UPDATE visits SET status = 'scheduled' WHERE status = 'authorized';
UPDATE visits SET status = 'completed' WHERE status = 'attended';
UPDATE visits SET privileged = 1 WHERE visit_type IN ('legal_advisor', 'personal_doctor');
