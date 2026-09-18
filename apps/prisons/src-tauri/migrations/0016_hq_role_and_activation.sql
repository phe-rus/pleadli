-- Head Office role choice and activation (spec: docs/specs/prisons/0001-head-office-peer-sync-network/0001-onboarding-and-activation-code.md).
-- `role` gates the first launch choice screen: NULL means "never chosen
-- yet", so the screen keeps reappearing until a real choice is persisted.
-- A NULL default satisfies the CHECK constraint (NULL IN (...) evaluates
-- to NULL, not false, so SQLite accepts it for every existing row).
ALTER TABLE hq_config ADD COLUMN role TEXT CHECK (role IN ('facility', 'head_office'));

-- Set once, and only moved forward, when a valid activation code is
-- accepted; used to guard against a rolled back system clock replaying an
-- already used code against an already activated install.
ALTER TABLE hq_config ADD COLUMN activated_at INTEGER;
