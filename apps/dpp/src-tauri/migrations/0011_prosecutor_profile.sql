-- Prosecutor profile (spec: docs/specs/_root/0001-officer-identity-sign-in).
-- No login, no password: DPP is a single prosecutor installation by
-- deliberate product decision (docs/dpp/PRODUCT.md, Organizational
-- responsibility), so there is no roster to protect, only a name and
-- rank to capture for attribution on generated documents. Singleton row,
-- editable any time, not a one time capture.
CREATE TABLE prosecutor_profile (
    id TEXT PRIMARY KEY DEFAULT 'default',
    name TEXT NOT NULL,
    rank TEXT,
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
