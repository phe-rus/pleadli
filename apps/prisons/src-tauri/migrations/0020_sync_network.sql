-- Sync network child 3 (spec: docs/specs/prisons/0001-head-office-peer-sync-network/0003-sync-protocol-and-head-office-management.md).
-- Every prisoner Head Office ever holds is attributed to exactly one
-- facility. NULL forever on a facility's own local rows (a facility's own
-- data never names itself); set, always server side by `/sync/prisoners`,
-- on every row Head Office receives.
ALTER TABLE prisoners ADD COLUMN facility_id TEXT REFERENCES facilities(id);

-- Lookups `hq_server.rs` runs on every request. Single digit rows in
-- practice, but the pairing-secret and sync-token lookups are on the
-- unauthenticated network boundary, so they get real indexes.
CREATE INDEX idx_facilities_sync_token_hash ON facilities (sync_token_hash);
CREATE INDEX idx_pairing_codes_secret_hash ON hq_pairing_codes (secret_hash);