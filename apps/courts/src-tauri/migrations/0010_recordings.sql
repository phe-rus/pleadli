-- Audio recording of a sitting (docs/courts/PROPOSAL.md, section 6, rule 1:
-- recording is separate from transcription). A recording is written in short
-- chunks as the sitting runs. Each chunk is sealed into the vault under its own
-- id, hashed, and chained to the one before it, so a crash or a power cut loses
-- at most the chunk in flight, and nothing already saved can be swapped or
-- dropped without the chain failing to verify. Chunks are immutable.
--
-- `status`: `recording` while it runs; `stopped` when the clerk stops it;
-- `interrupted` when the application found it still running at the next start
-- (a power cut, a crash). An interrupted recording keeps everything saved.
CREATE TABLE recordings (
    id TEXT PRIMARY KEY,
    sitting_id TEXT NOT NULL REFERENCES sittings(id),
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    status TEXT NOT NULL DEFAULT 'recording' CHECK (status IN ('recording', 'stopped', 'interrupted')),
    mime_type TEXT NOT NULL,
    final_chain_sha256 TEXT,
    created_by TEXT
);
CREATE INDEX recordings_sitting ON recordings (sitting_id);

CREATE TABLE recording_chunks (
    id TEXT PRIMARY KEY,
    recording_id TEXT NOT NULL REFERENCES recordings(id),
    seq INTEGER NOT NULL,
    offset_ms INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    chain_sha256 TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    UNIQUE (recording_id, seq)
);

CREATE TRIGGER recording_chunks_no_update BEFORE UPDATE ON recording_chunks
BEGIN SELECT RAISE(ABORT, 'A recorded chunk cannot be changed.'); END;
CREATE TRIGGER recording_chunks_no_delete BEFORE DELETE ON recording_chunks
BEGIN SELECT RAISE(ABORT, 'A recorded chunk cannot be deleted.'); END;

-- A recording can only move on from `recording`; once stopped or interrupted it
-- is fixed, and it is never deleted.
CREATE TRIGGER recordings_closed_no_update BEFORE UPDATE ON recordings WHEN OLD.status <> 'recording'
BEGIN SELECT RAISE(ABORT, 'A finished recording cannot be changed.'); END;
CREATE TRIGGER recordings_no_delete BEFORE DELETE ON recordings
BEGIN SELECT RAISE(ABORT, 'A recording cannot be deleted.'); END;
