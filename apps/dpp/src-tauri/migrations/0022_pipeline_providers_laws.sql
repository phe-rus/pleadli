-- The case pipeline (docs/dpp/PIPELINE.md), more Assist providers, and the
-- law library.
--
-- 1. Each file sits in one of seven stages. The stage is set by what a person
--    accepts or moves, and remembered with when it last changed. A file closes
--    with an outcome.
-- 2. `proposals`: what Assist prepared for a stage, and what a person did with
--    it (accepted, edited, rejected). Kept, so later proposals can learn from
--    how this office answers.
-- 3. `handovers`: where the file went, how, to whom, and when.
-- 4. Assist can use Gemini, OpenRouter, Anthropic or any OpenAI-compatible
--    server; the model is chosen automatically unless someone picks one.
-- 5. `laws`: the text of each statute the office works under, with the date
--    the text is correct at and where it came from.

ALTER TABLE prosecution_files ADD COLUMN stage TEXT NOT NULL DEFAULT 'receive'
    CHECK (stage IN ('receive', 'review', 'decide', 'prepare', 'handover', 'follow_up', 'concluded'));
ALTER TABLE prosecution_files ADD COLUMN stage_changed_at INTEGER;
ALTER TABLE prosecution_files ADD COLUMN outcome TEXT;
ALTER TABLE prosecution_files ADD COLUMN concluded_at INTEGER;

-- Files already decided start further along.
UPDATE prosecution_files SET stage = 'prepare'
 WHERE current_status IN ('sanctioned', 'declined', 'diverted', 'taken_over', 'discontinued', 'plea_bargained');
UPDATE prosecution_files SET stage = 'follow_up' WHERE current_status = 'returned_for_investigation';

CREATE TABLE proposals (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    stage TEXT NOT NULL,
    body TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'edited', 'rejected')),
    response_note TEXT,
    decided_by TEXT,
    decided_at INTEGER,
    created_by TEXT,
    created_at INTEGER NOT NULL
);
CREATE INDEX proposals_file ON proposals (prosecution_file_id, stage, created_at);

CREATE TABLE handovers (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    recipient TEXT NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('connection', 'email', 'print', 'collection', 'download', 'other')),
    note TEXT,
    reply_due_at INTEGER,
    handed_by TEXT,
    handed_at INTEGER NOT NULL
);
CREATE INDEX handovers_file ON handovers (prosecution_file_id, handed_at);

ALTER TABLE assist_settings ADD COLUMN base_url TEXT;
ALTER TABLE assist_settings ADD COLUMN auto_model INTEGER NOT NULL DEFAULT 1;
ALTER TABLE assist_settings ADD COLUMN laws_token TEXT;

CREATE TABLE laws (
    id TEXT PRIMARY KEY,
    jurisdiction TEXT NOT NULL,
    title TEXT NOT NULL,
    cite TEXT,
    frbr_uri TEXT,
    source TEXT NOT NULL,
    as_at TEXT,
    body TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX laws_work ON laws (jurisdiction, title);
