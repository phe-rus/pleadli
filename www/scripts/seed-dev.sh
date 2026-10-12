#!/usr/bin/env bash
# Local development accounts only (http://localhost:3000, local D1). Never run
# against pleadli.com. Both signups are ordinary accounts. Platform admin
# provisioning is an explicit trusted operation, never an email signup rule.
set -euo pipefail
base="${1:-http://localhost:3000}"
case "$base" in
  http://localhost:3000|http://127.0.0.1:3000) ;;
  *) echo "This script only seeds the local development server on port 3000." >&2; exit 1 ;;
esac
signup() { curl -s -o /dev/null -w "%{http_code} $2\n" -X POST "$base/api/auth/sign-up/email" -H 'content-type: application/json' -H "origin: $base" -d "{\"name\":\"$1\",\"email\":\"$2\",\"password\":\"$3\"}"; }
signup "Pleadli" "pleadli@pleadli.com" "Pleadli123"
signup "Albertine HQ (test)" "albertine.hq@example.test" "orchestra-test-2026"
