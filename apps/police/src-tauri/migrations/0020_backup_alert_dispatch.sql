-- Turns a backup alert from a fire-and-forget flag into a tracked
-- dispatch: who (if anyone) responded, and whether it's been explicitly
-- ended. `acknowledged` stays as-is for backward compatibility with any
-- existing rows; going forward it's kept in sync with `responded_at`
-- being set, not a separate concept.
ALTER TABLE backup_alerts ADD COLUMN responder_officer_id TEXT REFERENCES officers(id);
ALTER TABLE backup_alerts ADD COLUMN responded_at INTEGER;
ALTER TABLE backup_alerts ADD COLUMN ended_at INTEGER;
