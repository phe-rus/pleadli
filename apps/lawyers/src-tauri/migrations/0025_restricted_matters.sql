-- Restricted matters (an information barrier inside a firm): a restricted matter, and everything under it, is
-- seen only by the people listed for it. Conflict searches still report that the name is known, without saying where.
ALTER TABLE matters ADD COLUMN restricted INTEGER NOT NULL DEFAULT 0 CHECK (restricted IN (0, 1));
CREATE TABLE matter_access (
    matter_id TEXT NOT NULL REFERENCES matters (id) ON DELETE CASCADE,
    staff_id TEXT NOT NULL REFERENCES staff (id),
    granted_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    PRIMARY KEY (matter_id, staff_id)
);
