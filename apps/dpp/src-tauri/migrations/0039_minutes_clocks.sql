-- Hearing minutes (what happened, the next date, why adjourned, which
-- witnesses were served), and the office's time limits. A minute belongs to
-- one hearing; its witness lines are replaced as a set when it is saved.
-- Time limits are numbers the office can change; the legal guide edits them.
CREATE TABLE hearing_minutes (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    hearing_id TEXT NOT NULL UNIQUE REFERENCES hearings(id) ON DELETE CASCADE,
    next_date INTEGER,
    adjournment_cause TEXT,
    exhibits_json TEXT NOT NULL DEFAULT '[]',
    note TEXT,
    sent_at INTEGER,
    created_by TEXT,
    updated_at INTEGER NOT NULL
);
CREATE INDEX hearing_minutes_file ON hearing_minutes (prosecution_file_id);

CREATE TABLE witness_service (
    id TEXT PRIMARY KEY,
    hearing_id TEXT NOT NULL REFERENCES hearings(id) ON DELETE CASCADE,
    witness TEXT NOT NULL,
    served INTEGER NOT NULL DEFAULT 0 CHECK (served IN (0, 1)),
    reason TEXT,
    reported_at INTEGER NOT NULL
);
CREATE INDEX witness_service_hearing ON witness_service (hearing_id);

CREATE TABLE time_limits (
    key TEXT PRIMARY KEY,
    days INTEGER NOT NULL CHECK (days >= 1 AND days <= 365),
    updated_by TEXT,
    updated_at INTEGER NOT NULL
);
-- From the ODPP standards as read in the research (docs/dpp/REVIEW-2): files
-- are allocated within 3 days, a complaint answered within a week, and the
-- third adjournment calls for a review. The office can change each.
INSERT INTO time_limits (key, days, updated_at) VALUES ('allocation', 3, 0), ('complaint_reply', 7, 0), ('adjournments_before_review', 3, 0);
