-- This firm can end a court registry's link. `revoked_*` say when and why (the registry is told the reason), and
-- `relay_ended_at` is when the firm also ended it at the relay, which happens only after the registry has collected
-- the signed notice (or after a week), because the relay drops mail still waiting when a link ends.
ALTER TABLE court_links ADD COLUMN revoked_at INTEGER;
ALTER TABLE court_links ADD COLUMN revoked_reason TEXT;
ALTER TABLE court_links ADD COLUMN relay_ended_at INTEGER;
