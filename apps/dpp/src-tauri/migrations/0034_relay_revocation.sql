-- When this office also ended a revoked station's connection at the relay. The relay drops the mail waiting between
-- two offices when a link is revoked, so the office does it only after the station has collected the signed notice
-- (or after a week), never before.
ALTER TABLE police_connections ADD COLUMN relay_ended_at INTEGER;
