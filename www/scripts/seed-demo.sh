#!/usr/bin/env bash
# Demonstration data in the LOCAL D1 only: three institutions, offices,
# licences, computers, backups, reports, papers and one tracked case, all
# labelled "Demonstration". Run seed-dev.sh first (dev server up on :3000) so
# the demo owner account exists, then this. Never touches pleadli.com.
set -euo pipefail
cd "$(dirname "$0")/.."
bunx wrangler d1 execute DB --local --file scripts/seed-demo.sql
echo "Demo data loaded. Sign in as albertine.hq@example.test (Account) or pleadli@pleadli.com (Admin)."

# To sign in to Pleadli Account locally (local only, a throwaway test account):
# create demo.owner@example.test on /create-account (password: demo-owner-local-2026), then
#   sqlite3 <local D1 file> "insert into orchestra_member (id,organization_id,user_id,email,role,status,invited_at,joined_at) values ('demo-m-owner','demo-org-dpp',(select id from user where email='demo.owner@example.test'),'demo.owner@example.test','owner','active',strftime('%s','now')*1000,strftime('%s','now')*1000);"
# Then /account/demo-org-dpp/postbox shows the demo connection request from the police office.
