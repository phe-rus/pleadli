-- The legal and operational inbox (docs/prisons/product/10-facility-first-
-- workspace-model.md section 8). One row per item; unread state is per
-- officer. Items that are derived from current state (an obligation that has
-- fallen due, a backup that is overdue) carry a `dedupe_key` so refreshing
-- never duplicates them and they close themselves when the condition ends.
CREATE TABLE inbox_items (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (origin IN ('local', 'head_office', 'court', 'manual', 'system')),
    source TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT,
    related_type TEXT,
    related_id TEXT,
    related_route TEXT,
    -- Who may see it: everyone at the facility, or those holding a permission,
    -- or one named officer.
    required_permission TEXT,
    recipient_officer_id TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'actioned', 'dismissed')),
    dedupe_key TEXT UNIQUE,
    created_at INTEGER NOT NULL,
    actioned_at INTEGER,
    actioned_by TEXT,
    resolution TEXT,
    recorded_by TEXT
);
CREATE INDEX idx_inbox_status ON inbox_items (status, created_at DESC);

CREATE TABLE inbox_reads (
    item_id TEXT NOT NULL REFERENCES inbox_items (id) ON DELETE CASCADE,
    officer_id TEXT NOT NULL,
    read_at INTEGER NOT NULL,
    PRIMARY KEY (item_id, officer_id)
);
