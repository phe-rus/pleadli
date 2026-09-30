-- The work around a file, and the file's own index.
--
-- 1. `tasks`: the Board. A task may belong to a file or stand alone; it moves
--    across five columns. Tasks proposed by Assist are marked as such and stay
--    proposals until a person keeps them.
-- 2. `hearings`: dated court events on a file. The Calendar reads them.
-- 3. `filings`: what was filed in which court, when, and the receipt.
-- 4. `file_items`: the file's index, one row per document in the file, in the
--    country's file order (`kind` is the same everywhere; which section a kind
--    sits in is the country pack's). A row may stand on typed text alone (no
--    paper) or point at pages of a stored scan.
-- 5. `assist_settings` and `assist_log`: whether AI Assist is on, how it runs,
--    and every request it made (who, which file, what for). The provider key
--    stays in this encrypted database and never goes to the screen.

CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT REFERENCES prosecution_files(id),
    title TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'waiting_police', 'waiting_court', 'done')),
    due_at INTEGER,
    assigned_to TEXT REFERENCES staff(id),
    position REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'person' CHECK (source IN ('person', 'assist', 'direction')),
    proposed INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    done_at INTEGER
);
CREATE INDEX tasks_file ON tasks (prosecution_file_id);
CREATE INDEX tasks_status ON tasks (status, position);

CREATE TABLE hearings (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    court TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('mention', 'plea', 'bail', 'hearing', 'trial', 'ruling', 'judgment', 'sentence', 'other')),
    starts_at INTEGER NOT NULL,
    outcome TEXT,
    note TEXT,
    created_by TEXT,
    created_at INTEGER NOT NULL
);
CREATE INDEX hearings_file ON hearings (prosecution_file_id);
CREATE INDEX hearings_starts ON hearings (starts_at);

CREATE TABLE filings (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    what TEXT NOT NULL,
    court TEXT NOT NULL,
    filed_at INTEGER NOT NULL,
    receipt TEXT,
    document_id TEXT REFERENCES documents(id),
    note TEXT,
    created_by TEXT,
    created_at INTEGER NOT NULL
);
CREATE INDEX filings_file ON filings (prosecution_file_id);

CREATE TABLE file_items (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    document_date INTEGER,
    attachment_id TEXT REFERENCES attachments(id),
    page_from INTEGER,
    page_to INTEGER,
    summary TEXT,
    body TEXT,
    people TEXT,
    position REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'person' CHECK (source IN ('person', 'assist', 'police')),
    confirmed_by TEXT,
    confirmed_at INTEGER,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX file_items_file ON file_items (prosecution_file_id, position);

ALTER TABLE prosecution_files ADD COLUMN assigned_to TEXT REFERENCES staff(id);

CREATE TABLE assist_settings (
    id TEXT PRIMARY KEY CHECK (id = 'this'),
    mode TEXT NOT NULL DEFAULT 'off' CHECK (mode IN ('off', 'institution_key')),
    provider TEXT NOT NULL DEFAULT 'gemini',
    model TEXT NOT NULL DEFAULT 'gemini-flash-latest',
    api_key TEXT,
    acknowledged_by TEXT,
    acknowledged_at INTEGER,
    updated_at INTEGER NOT NULL
);

CREATE TABLE assist_log (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT REFERENCES prosecution_files(id),
    purpose TEXT NOT NULL,
    model TEXT NOT NULL,
    requested_by TEXT,
    ok INTEGER NOT NULL,
    detail TEXT,
    created_at INTEGER NOT NULL
);
CREATE INDEX assist_log_file ON assist_log (prosecution_file_id, created_at);
