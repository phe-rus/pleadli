-- 0021 mapped every legacy 'admin' account to the facility role 'oic'. On an
-- installation that is Head Office that role grants facility permissions and
-- no Head Office ones, so the account could sign in but do nothing. Head
-- Office accounts carry Head Office roles (domain/authz.rs HQ_ROLES).
UPDATE officers SET role = 'hq_admin'
WHERE role = 'oic' AND EXISTS (SELECT 1 FROM hq_config WHERE role = 'head_office');

UPDATE officers SET role = 'hq_officer'
WHERE role IN ('officer', 'records') AND EXISTS (SELECT 1 FROM hq_config WHERE role = 'head_office');
