#!/usr/bin/env bash
# Demonstration data in the LOCAL D1 only: three institutions, offices,
# licences, computers, backups, reports, papers and one tracked case, all
# labelled "Demonstration". Run seed-dev.sh first (dev server up on :3000) so
# the demo accounts exist, then this; `bun run seed` does both in order. Never touches pleadli.com.
set -euo pipefail
cd "$(dirname "$0")/.."
bunx wrangler d1 execute pleadli-database --local --file scripts/seed-demo.sql
echo "Demo data loaded. Sign in as albertine.hq@example.test (Account) or pleadli@pleadli.com (Admin)."
