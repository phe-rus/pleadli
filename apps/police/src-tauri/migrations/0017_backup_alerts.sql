-- A remote officer's "request backup" call — separate from
-- remote_access_log (that's a passive audit trail; this is an active
-- alert the station needs to see and act on). Location is whatever the
-- phone's browser geolocation reports at the moment the alert is sent,
-- never tracked continuously.
CREATE TABLE backup_alerts (
    id TEXT PRIMARY KEY,
    officer_id TEXT NOT NULL REFERENCES officers(id),
    latitude REAL,
    longitude REAL,
    acknowledged INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
