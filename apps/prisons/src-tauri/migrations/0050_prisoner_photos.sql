-- Prisoner photographs (front and both sides) and the short-lived capture
-- sessions a phone or other connected device uses to send them.
-- A photo is an attachment in the vault; this table says which view it is.
-- Retaking a view supersedes the earlier photo, it never deletes it.
CREATE TABLE prisoner_photos (
    id TEXT PRIMARY KEY,
    prisoner_id TEXT NOT NULL REFERENCES prisoners(id),
    view TEXT NOT NULL CHECK (view IN ('front', 'left', 'right')),
    attachment_id TEXT NOT NULL,
    taken_at INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'reception',
    superseded_at INTEGER
);
CREATE INDEX idx_prisoner_photos_current ON prisoner_photos (prisoner_id, view, superseded_at);

-- Only the hash of the link token is kept. Photos wait here until reception
-- collects them, then are purged with the session.
CREATE TABLE capture_sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    max_photos INTEGER NOT NULL DEFAULT 6,
    closed_at INTEGER
);

CREATE TABLE capture_session_photos (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES capture_sessions(id),
    view TEXT NOT NULL CHECK (view IN ('front', 'left', 'right')),
    data BLOB NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX idx_capture_session_photos_session ON capture_session_photos (session_id);
