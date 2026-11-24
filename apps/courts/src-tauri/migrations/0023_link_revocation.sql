-- A link can be ended. `revoked_*` say when and why. For links this registry issued (the DPP's), `relay_ended_at` is
-- when it also ended the link at the relay, which happens only after the other office collected the signed notice
-- (or after a week), because the relay drops mail still waiting when a link ends.
ALTER TABLE dpp_links ADD COLUMN revoked_at INTEGER;
ALTER TABLE dpp_links ADD COLUMN revoked_reason TEXT;
ALTER TABLE dpp_links ADD COLUMN relay_ended_at INTEGER;
ALTER TABLE firm_links ADD COLUMN revoked_at INTEGER;
ALTER TABLE firm_links ADD COLUMN revoked_reason TEXT;
ALTER TABLE prison_links ADD COLUMN revoked_at INTEGER;
ALTER TABLE prison_links ADD COLUMN revoked_reason TEXT;
