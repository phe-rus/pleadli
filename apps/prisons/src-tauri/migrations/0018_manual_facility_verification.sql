-- Manual (no-email-yet) substitute for the real verification email (spec:
-- docs/specs/prisons/0001-head-office-peer-sync-network/0002-peer-
-- registration-and-pairing.md). The real design hashes the verification
-- code and only ever sends the plaintext by email; until that email
-- integration exists, Head Office needs to see the plaintext some other
-- way, so this column holds it temporarily, cleared the moment a facility
-- is verified. Remove this column (and the code that reads it) once real
-- email sending lands — `verification_code_hash` already exists and stays
-- the real, permanent verification mechanism either way.
ALTER TABLE facilities ADD COLUMN verification_code_plaintext TEXT;
