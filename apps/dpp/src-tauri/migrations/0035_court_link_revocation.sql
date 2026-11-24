-- A court registry can end its link with this office. `revoked_*` say when and why.
ALTER TABLE court_links ADD COLUMN revoked_at INTEGER;
ALTER TABLE court_links ADD COLUMN revoked_reason TEXT;
