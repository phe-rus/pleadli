-- What a connected facility shares with Head Office, and what is still to be
-- sent. Both live on the facility and are shown to its officers.
--
-- `sync_classes`: one row per kind of thing that can leave the facility (or
-- arrive), with a switch. `legacy_snapshot` is the first-generation push of
-- whole prisoner rows: it is listed, honestly, so it can be turned off until
-- the tiered exchange replaces it.
CREATE TABLE sync_classes (
    class TEXT PRIMARY KEY,
    direction TEXT NOT NULL CHECK (direction IN ('up', 'down')),
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER,
    updated_by TEXT
);
INSERT INTO sync_classes (class, direction) VALUES ('roster', 'up'), ('legacy_snapshot', 'up'), ('policy', 'down');

-- `sync_outbox`: records changed since they were last sent, kept by triggers
-- so no domain code has to remember. Tracked only while this installation is
-- paired with a Head Office; the first push after connecting is a full one.
CREATE TABLE sync_outbox (
    class TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    changed_at INTEGER NOT NULL,
    PRIMARY KEY (class, entity_id)
);

ALTER TABLE peer_sync_config ADD COLUMN disconnected_at INTEGER;

CREATE TRIGGER sync_track_prisoner_insert AFTER INSERT ON prisoners
WHEN EXISTS (SELECT 1 FROM peer_sync_config WHERE id = 'default' AND facility_id IS NOT NULL)
BEGIN
    INSERT INTO sync_outbox (class, entity_id, changed_at) VALUES ('legacy_snapshot', NEW.id, CAST(unixepoch('subsecond') * 1000 AS INTEGER))
    ON CONFLICT (class, entity_id) DO UPDATE SET changed_at = excluded.changed_at;
END;

CREATE TRIGGER sync_track_prisoner_update AFTER UPDATE ON prisoners
WHEN EXISTS (SELECT 1 FROM peer_sync_config WHERE id = 'default' AND facility_id IS NOT NULL)
BEGIN
    INSERT INTO sync_outbox (class, entity_id, changed_at) VALUES ('legacy_snapshot', NEW.id, CAST(unixepoch('subsecond') * 1000 AS INTEGER))
    ON CONFLICT (class, entity_id) DO UPDATE SET changed_at = excluded.changed_at;
END;

CREATE TRIGGER sync_track_prisoner_delete AFTER DELETE ON prisoners
WHEN EXISTS (SELECT 1 FROM peer_sync_config WHERE id = 'default' AND facility_id IS NOT NULL)
BEGIN
    INSERT INTO sync_outbox (class, entity_id, changed_at) VALUES ('legacy_snapshot', OLD.id, CAST(unixepoch('subsecond') * 1000 AS INTEGER))
    ON CONFLICT (class, entity_id) DO UPDATE SET changed_at = excluded.changed_at;
END;

-- The roster carries names, badges, roles and status, never secrets, so only
-- changes to those columns count. A sign-in updates other columns and is not
-- a change to the roster.
CREATE TRIGGER sync_track_officer_insert AFTER INSERT ON officers
WHEN EXISTS (SELECT 1 FROM peer_sync_config WHERE id = 'default' AND facility_id IS NOT NULL)
BEGIN
    INSERT INTO sync_outbox (class, entity_id, changed_at) VALUES ('roster', NEW.id, CAST(unixepoch('subsecond') * 1000 AS INTEGER))
    ON CONFLICT (class, entity_id) DO UPDATE SET changed_at = excluded.changed_at;
END;

CREATE TRIGGER sync_track_officer_update AFTER UPDATE OF badge_number, name, role, is_admin, active ON officers
WHEN EXISTS (SELECT 1 FROM peer_sync_config WHERE id = 'default' AND facility_id IS NOT NULL)
BEGIN
    INSERT INTO sync_outbox (class, entity_id, changed_at) VALUES ('roster', NEW.id, CAST(unixepoch('subsecond') * 1000 AS INTEGER))
    ON CONFLICT (class, entity_id) DO UPDATE SET changed_at = excluded.changed_at;
END;

CREATE TRIGGER sync_track_officer_delete AFTER DELETE ON officers
WHEN EXISTS (SELECT 1 FROM peer_sync_config WHERE id = 'default' AND facility_id IS NOT NULL)
BEGIN
    INSERT INTO sync_outbox (class, entity_id, changed_at) VALUES ('roster', OLD.id, CAST(unixepoch('subsecond') * 1000 AS INTEGER))
    ON CONFLICT (class, entity_id) DO UPDATE SET changed_at = excluded.changed_at;
END;
