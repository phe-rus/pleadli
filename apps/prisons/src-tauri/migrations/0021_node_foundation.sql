-- Node foundation (docs/prisons/product-map/04, 05, 07; build phase 1).
-- Sessions, an append-only hash-chained audit log, the account role model,
-- workstation devices and per-node configuration. Forward-only: nothing
-- from migrations 0001 to 0020 is rewritten.

-- ---------------------------------------------------------------------
-- Accounts. `role` is a function template (permissions are derived from it
-- in domain/authz.rs, not stored); `is_admin` grants account, device,
-- backup and audit administration on top of the role. The 0015 CHECK that
-- limited `role` to ('officer','admin') is what blocks the product map's
-- role templates, and SQLite cannot alter a CHECK, so the table is rebuilt.
-- Legacy mapping: 'admin' becomes role 'oic' with is_admin = 1 (an admin
-- could do everything before, and the OIC template can do everything
-- operational); 'officer' stays 'officer' (general duty).
-- ---------------------------------------------------------------------
CREATE TABLE officers_v2 (
    id TEXT PRIMARY KEY,
    badge_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

INSERT INTO officers_v2 (id, badge_number, name, role, is_admin, password_hash, active, created_at)
SELECT id, badge_number, name,
       CASE role WHEN 'admin' THEN 'oic' ELSE 'officer' END,
       CASE role WHEN 'admin' THEN 1 ELSE 0 END,
       password_hash, active, created_at
FROM officers;

DROP TABLE officers;
ALTER TABLE officers_v2 RENAME TO officers;

-- The singleton Head Office session is replaced by real per-officer,
-- per-device sessions for every installation.
DROP TABLE IF EXISTS hq_session;

-- ---------------------------------------------------------------------
-- Devices: workstations enrolled against a Facility Node (or Head Office
-- node). The credential is a random token, stored only as a SHA-256 hash.
-- A one-time enrolment code is shown on the node and consumed once.
-- ---------------------------------------------------------------------
CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    enrolled_by TEXT,
    enrolled_at INTEGER NOT NULL,
    last_seen_at INTEGER,
    revoked_at INTEGER
);

CREATE TABLE device_enrolment_codes (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    created_by TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- ---------------------------------------------------------------------
-- Sessions. `id` is the SHA-256 of the bearer token, never the token.
-- ---------------------------------------------------------------------
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    officer_id TEXT NOT NULL REFERENCES officers(id),
    device_id TEXT,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER
);
CREATE INDEX idx_sessions_officer ON sessions (officer_id);

-- ---------------------------------------------------------------------
-- Audit. Append-only by trigger and hash-chained: every row commits the
-- previous row's hash, so editing or removing a row breaks verification
-- from that point on. Written inside the same transaction as the change
-- it describes (domain/audit.rs), never afterwards.
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    at INTEGER NOT NULL,
    actor_id TEXT,
    actor_badge TEXT,
    actor_name TEXT NOT NULL,
    device_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    workflow_id TEXT,
    reason TEXT,
    authorised_by TEXT,
    before_json TEXT,
    after_json TEXT,
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL
);
CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_at ON audit_log (at);

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

-- ---------------------------------------------------------------------
-- Documents are never deleted; a voided attachment keeps its file and its
-- row, carries who voided it and why, and drops out of default listings.
-- ---------------------------------------------------------------------
ALTER TABLE attachments ADD COLUMN voided_at INTEGER;
ALTER TABLE attachments ADD COLUMN voided_by TEXT;
ALTER TABLE attachments ADD COLUMN void_reason TEXT;

-- ---------------------------------------------------------------------
-- Node configuration (singleton). `node_mode`: 'standalone' (one machine,
-- the special case of a node), 'node' (also serves workstations on the
-- facility LAN), 'client' (a workstation that uses a remote node).
-- ---------------------------------------------------------------------
CREATE TABLE node_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    node_mode TEXT NOT NULL DEFAULT 'standalone' CHECK (node_mode IN ('standalone', 'node', 'client')),
    lan_port INTEGER NOT NULL DEFAULT 47921,
    lan_bind TEXT NOT NULL DEFAULT '0.0.0.0',
    backup_dir TEXT,
    backup_interval_hours INTEGER NOT NULL DEFAULT 24,
    backup_retention INTEGER NOT NULL DEFAULT 14,
    last_backup_at INTEGER,
    last_backup_status TEXT,
    last_backup_error TEXT,
    remote_node_url TEXT,
    remote_node_fingerprint TEXT,
    remote_device_token TEXT
);
INSERT INTO node_config (id) VALUES ('default');
