-- Estate awareness (docs/prisons/product-map/08 2.2). Head Office needs to know
-- how recently each facility was heard from and how full it is, without
-- holding prisoner rows. A connected facility sends a small status report
-- (people held, approved capacity, as at its own clock): counts, tier T2.

-- When Head Office last heard from the facility on any authenticated call,
-- and what the facility last reported about itself. `status_reported_at` is
-- the facility's clock, so every figure can say how old it is.
ALTER TABLE facilities ADD COLUMN last_contact_at INTEGER;
ALTER TABLE facilities ADD COLUMN reported_held INTEGER;
ALTER TABLE facilities ADD COLUMN reported_convicted INTEGER;
ALTER TABLE facilities ADD COLUMN reported_unconvicted INTEGER;
ALTER TABLE facilities ADD COLUMN reported_civil INTEGER;
ALTER TABLE facilities ADD COLUMN reported_in_transit INTEGER;
ALTER TABLE facilities ADD COLUMN reported_capacity INTEGER;
ALTER TABLE facilities ADD COLUMN status_reported_at INTEGER;
ALTER TABLE facilities ADD COLUMN app_version TEXT;

-- Facilities that pushed before this existed have been heard from at least then.
UPDATE facilities SET last_contact_at = last_synced_at WHERE last_synced_at IS NOT NULL;

-- The facility's side: what it last sent, so it sends again when something
-- changed or after a while, not on every exchange.
ALTER TABLE peer_sync_config ADD COLUMN status_digest TEXT;
ALTER TABLE peer_sync_config ADD COLUMN status_pushed_at INTEGER;

INSERT INTO sync_classes (class, direction) VALUES ('status', 'up');
