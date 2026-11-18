-- Demonstration data for the LOCAL database only (see seed-demo.sh).
-- Every institution is named "(Demonstration)" and every address contains
-- "demo", so none of this can be mistaken for a real record. Re-runnable.
-- Times are relative to now so the pages always look current.

-- The signed-in manager, created by seed-dev.sh.
-- pleadli@pleadli.com becomes staff (local only; production staff are provisioned by hand).
UPDATE user SET role = 'admin' WHERE email = 'pleadli@pleadli.com';

INSERT OR REPLACE INTO organization
  (id, name, slug, institution_type, kind, country, district, contact_email, contact_phone, status, address, requested_at, reviewed_at, reviewed_by, review_note)
VALUES
  ('demo-org-police', 'Albertine Region Police (Demonstration)', 'demo-albertine-police', 'police', 'institution', 'UG', 'Hoima', 'hq@albertine-police.example.test', '+256 700 000 101', 'active', 'ug.police.demo-albertine', (strftime('%s','now') - 40*86400) * 1000, (strftime('%s','now') - 39*86400) * 1000, 'demo', 'Demonstration data'),
  ('demo-org-dpp', 'Hoima Resident State Attorney (Demonstration)', 'demo-hoima-dpp', 'dpp', 'institution', 'UG', 'Hoima', 'rsa@hoima-dpp.example.test', '+256 700 000 102', 'active', 'ug.dpp.demo-hoima', (strftime('%s','now') - 30*86400) * 1000, (strftime('%s','now') - 29*86400) * 1000, 'demo', 'Demonstration data'),
  ('demo-org-lawyers', 'Mbarara Advocates (Demonstration)', 'demo-mbarara-advocates', 'lawyers', 'institution', 'UG', 'Mbarara', 'office@mbarara-advocates.example.test', '+256 700 000 103', 'pending', NULL, (strftime('%s','now') - 2*86400) * 1000, NULL, NULL, NULL);

INSERT OR REPLACE INTO organization_unit (id, organization_id, parent_id, name, kind, district, address) VALUES
  ('demo-unit-command', 'demo-org-police', NULL, 'Albertine Regional Command (Demonstration)', 'command', 'Hoima', 'ug.police.demo-albertine.command'),
  ('demo-unit-hoima', 'demo-org-police', 'demo-unit-command', 'Hoima Central Station (Demonstration)', 'station', 'Hoima', 'ug.police.demo-albertine.hoima-central'),
  ('demo-unit-masindi', 'demo-org-police', 'demo-unit-command', 'Masindi Station (Demonstration)', 'station', 'Masindi', 'ug.police.demo-albertine.masindi'),
  ('demo-unit-dpp', 'demo-org-dpp', NULL, 'Hoima State Attorney Office (Demonstration)', 'office', 'Hoima', 'ug.dpp.demo-hoima.office');

INSERT OR REPLACE INTO entitlement (id, organization_id, application, enabled) VALUES
  ('demo-ent-police', 'demo-org-police', 'police', 1),
  ('demo-ent-dpp', 'demo-org-dpp', 'dpp', 1),
  ('demo-ent-lawyers', 'demo-org-lawyers', 'lawyers', 1);

INSERT OR REPLACE INTO orchestra_member (id, organization_id, user_id, email, role, status, invited_at, joined_at)
SELECT 'demo-mem-police-owner', 'demo-org-police', id, email, 'owner', 'active', (strftime('%s','now') - 40*86400) * 1000, (strftime('%s','now') - 40*86400) * 1000 FROM user WHERE email = 'albertine.hq@example.test'
UNION ALL
SELECT 'demo-mem-dpp-owner', 'demo-org-dpp', id, email, 'owner', 'active', (strftime('%s','now') - 30*86400) * 1000, (strftime('%s','now') - 30*86400) * 1000 FROM user WHERE email = 'albertine.hq@example.test'
UNION ALL
SELECT 'demo-mem-lawyers-owner', 'demo-org-lawyers', id, email, 'owner', 'active', (strftime('%s','now') - 2*86400) * 1000, (strftime('%s','now') - 2*86400) * 1000 FROM user WHERE email = 'albertine.hq@example.test';

INSERT OR REPLACE INTO orchestra_member (id, organization_id, user_id, email, role, status, invited_at, joined_at) VALUES
  ('demo-mem-police-invited', 'demo-org-police', NULL, 'deputy@albertine-police.example.test', 'admin', 'invited', (strftime('%s','now') - 1*86400) * 1000, NULL);

INSERT OR REPLACE INTO licence (id, organization_id, application, seats, starts_at, expires_at, status, key_hash, key_hint, issued_by, note, created_at) VALUES
  ('demo-lic-police', 'demo-org-police', 'police', 10, (strftime('%s','now') - 35*86400) * 1000, (strftime('%s','now') + 330*86400) * 1000, 'active', 'demo0000000000000000000000000000000000000000000000000000000000a1', 'DEMO', 'demo', 'Demonstration licence', (strftime('%s','now') - 35*86400) * 1000),
  ('demo-lic-dpp', 'demo-org-dpp', 'dpp', 5, (strftime('%s','now') - 25*86400) * 1000, (strftime('%s','now') + 340*86400) * 1000, 'active', 'demo0000000000000000000000000000000000000000000000000000000000a2', 'DEMO', 'demo', 'Demonstration licence', (strftime('%s','now') - 25*86400) * 1000);

INSERT OR REPLACE INTO licence_request (id, organization_id, application, seats, message, status, created_at) VALUES
  ('demo-req-1', 'demo-org-dpp', 'dpp', 3, 'We would like three more computers for the new state attorneys. (Demonstration)', 'open', (strftime('%s','now') - 1*86400) * 1000);

INSERT OR REPLACE INTO computer
  (id, device_hash, application, organization_id, unit_id, licence_id, version, os, country, trial_started_at, first_seen_at, last_seen_at)
VALUES
  ('demo-pc-1', 'demo-device-hash-1', 'police', 'demo-org-police', 'demo-unit-hoima', 'demo-lic-police', '0.9.2', 'Windows 11', 'UG', (strftime('%s','now') - 38*86400) * 1000, (strftime('%s','now') - 38*86400) * 1000, (strftime('%s','now') - 2*3600) * 1000),
  ('demo-pc-2', 'demo-device-hash-2', 'police', 'demo-org-police', 'demo-unit-masindi', 'demo-lic-police', '0.9.2', 'Windows 10', 'UG', (strftime('%s','now') - 33*86400) * 1000, (strftime('%s','now') - 33*86400) * 1000, (strftime('%s','now') - 1*86400) * 1000),
  ('demo-pc-3', 'demo-device-hash-3', 'police', 'demo-org-police', 'demo-unit-command', 'demo-lic-police', '0.9.1', 'Windows 11', 'UG', (strftime('%s','now') - 20*86400) * 1000, (strftime('%s','now') - 20*86400) * 1000, (strftime('%s','now') - 9*86400) * 1000),
  ('demo-pc-4', 'demo-device-hash-4', 'dpp', 'demo-org-dpp', 'demo-unit-dpp', 'demo-lic-dpp', '0.8.7', 'Windows 11', 'UG', (strftime('%s','now') - 24*86400) * 1000, (strftime('%s','now') - 24*86400) * 1000, (strftime('%s','now') - 3*3600) * 1000),
  ('demo-pc-5', 'demo-device-hash-5', 'dpp', NULL, NULL, NULL, '0.8.7', 'Windows 10', 'UG', (strftime('%s','now') - 12*86400) * 1000, (strftime('%s','now') - 12*86400) * 1000, (strftime('%s','now') - 4*86400) * 1000);

INSERT OR REPLACE INTO backup_report (id, computer_id, organization_id, at, storage_id, size_bytes, ok, message) VALUES
  ('demo-bk-1', 'demo-pc-1', 'demo-org-police', (strftime('%s','now') - 1*86400) * 1000, NULL, 48234496, 1, NULL),
  ('demo-bk-2', 'demo-pc-1', 'demo-org-police', (strftime('%s','now') - 2*86400) * 1000, NULL, 47890432, 1, NULL),
  ('demo-bk-3', 'demo-pc-2', 'demo-org-police', (strftime('%s','now') - 3*86400) * 1000, NULL, NULL, 0, 'The backup folder was not reachable. (Demonstration)'),
  ('demo-bk-4', 'demo-pc-4', 'demo-org-dpp', (strftime('%s','now') - 1*86400) * 1000, NULL, 15728640, 1, NULL);

INSERT OR REPLACE INTO support_report (id, kind, application, version, computer_id, organization_id, title, body, status, reply, created_at, replied_at, replied_by) VALUES
  ('demo-sr-1', 'issue', 'police', '0.9.2', 'demo-pc-1', 'demo-org-police', 'Print preview is cut off (Demonstration)', 'The charge sheet preview loses the last line on A4. No case details are attached.', 'open', NULL, (strftime('%s','now') - 6*3600) * 1000, NULL, NULL),
  ('demo-sr-2', 'question', 'dpp', '0.8.7', 'demo-pc-4', 'demo-org-dpp', 'Can two state attorneys share one computer? (Demonstration)', 'We have one desktop in the office and two attorneys.', 'answered', 'Yes. Each person signs in with their own passcode; the licence counts computers, not people.', (strftime('%s','now') - 5*86400) * 1000, (strftime('%s','now') - 4*86400) * 1000, 'demo');

INSERT OR REPLACE INTO paper
  (id, code, reference, kind, application, organization_id, office, computer_id, content_sha256, file_sha256, issued_at, recorded_at)
VALUES
  ('demo-paper-1', 'DEMOA1B2C3D4', 'DEMO/HCS/0042/2026', 'charge_sheet', 'police', 'demo-org-police', 'ug.police.demo-albertine.hoima-central', 'demo-pc-1', 'demo5d41402abc4b2a76b9719d911017c592demo5d41402abc4b2a76b9719d911017c592', NULL, (strftime('%s','now') - 3*86400) * 1000, (strftime('%s','now') - 3*86400) * 1000),
  ('demo-paper-2', 'DEMOE5F6G7H8', 'DEMO/HSA/0007/2026', 'indictment', 'dpp', 'demo-org-dpp', 'ug.dpp.demo-hoima.office', 'demo-pc-4', 'demo7d793037a0760186574b0282f2f435e7demo7d793037a0760186574b0282f2f435e7', NULL, (strftime('%s','now') - 1*86400) * 1000, (strftime('%s','now') - 1*86400) * 1000);

INSERT OR REPLACE INTO tracking_code (code, organization_id, computer_id, created_at) VALUES
  ('DEMOTRACK123', 'demo-org-police', 'demo-pc-1', (strftime('%s','now') - 10*86400) * 1000);

INSERT OR REPLACE INTO tracking_event (id, code, stage, office, at, next_at, recorded_at) VALUES
  ('demo-te-1', 'DEMOTRACK123', 'reported', 'ug.police.demo-albertine.hoima-central', (strftime('%s','now') - 10*86400) * 1000, NULL, (strftime('%s','now') - 10*86400) * 1000),
  ('demo-te-2', 'DEMOTRACK123', 'investigating', 'ug.police.demo-albertine.hoima-central', (strftime('%s','now') - 8*86400) * 1000, NULL, (strftime('%s','now') - 8*86400) * 1000),
  ('demo-te-3', 'DEMOTRACK123', 'with_dpp', 'ug.dpp.demo-hoima.office', (strftime('%s','now') - 2*86400) * 1000, (strftime('%s','now') + 12*86400) * 1000, (strftime('%s','now') - 2*86400) * 1000);

-- Test tokens so the relay can be tried with curl (local database only):
-- Authorization: Bearer demo-token-hoima | demo-token-masindi | demo-token-dpp
UPDATE computer SET token_hash = '266715c9c1f1942a253276d4f321c39fde1333036678e03ab3d6fe06a0a95d67' WHERE id = 'demo-pc-1';
UPDATE computer SET token_hash = 'd4ffd9a0fedc8a30094aa39c99e72112fb8643a8d7f78565adda23b340a03cca' WHERE id = 'demo-pc-2';
UPDATE computer SET token_hash = '3f643eade5c96d16fee51971b7b3fda090563c7390d07f2c20e235ad5c01bab0' WHERE id = 'demo-pc-4';
