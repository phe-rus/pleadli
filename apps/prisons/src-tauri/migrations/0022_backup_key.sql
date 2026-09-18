-- Backup encryption (docs/prisons/product-map/04 "Production readiness",
-- 05 M.7). Backups are encrypted with a key derived (Argon2id) from a
-- recovery passphrase the Officer in Charge keeps offline. The node keeps
-- the derived key so scheduled backups can run unattended; the salt is also
-- written into every backup file, so a new machine can restore with the
-- passphrase alone. The passphrase itself is never stored.
ALTER TABLE node_config ADD COLUMN backup_salt TEXT;
ALTER TABLE node_config ADD COLUMN backup_key TEXT;
