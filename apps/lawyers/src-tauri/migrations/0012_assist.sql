-- Assist (docs/lawyers/REVIEW-2026-09-30.md, L3; D12: same as DPP). Whether
-- it is on, which provider answers, and the practice's own key, kept in this
-- encrypted database and never sent to the screen. It runs only after an
-- administrator has confirmed where a matter's papers go.
CREATE TABLE assist_settings (
    id TEXT PRIMARY KEY CHECK (id = 'this'),
    mode TEXT NOT NULL DEFAULT 'off' CHECK (mode IN ('off', 'practice_key')),
    provider TEXT NOT NULL DEFAULT 'gemini',
    model TEXT NOT NULL DEFAULT '',
    auto_model INTEGER NOT NULL DEFAULT 1,
    base_url TEXT,
    api_key TEXT,
    acknowledged_by TEXT,
    acknowledged_at INTEGER,
    updated_at INTEGER NOT NULL
);

-- Every request: who asked, on which matter, for what, and whether it
-- answered. What was sent and returned is not kept.
CREATE TABLE assist_log (
    id TEXT PRIMARY KEY,
    matter_id TEXT REFERENCES matters(id),
    task TEXT NOT NULL,
    model TEXT NOT NULL,
    requested_by TEXT,
    ok INTEGER NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
);
CREATE INDEX assist_log_matter ON assist_log (matter_id, created_at);
