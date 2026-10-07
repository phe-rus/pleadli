#!/usr/bin/env bash
# Local development accounts only (http://localhost:3000, local D1). Never run
# against pleadli.com. The staff account gets the admin role because its address
# is in PLEADLI_STAFF_EMAILS (default pleadli@pleadli.com); the second account is
# an ordinary person who registers an institution on /orchestra.
set -euo pipefail
base="${1:-http://localhost:3000}"
signup() { curl -s -o /dev/null -w "%{http_code} $2\n" -X POST "$base/api/auth/sign-up/email" -H 'content-type: application/json' -H "origin: $base" -d "{\"name\":\"$1\",\"email\":\"$2\",\"password\":\"$3\"}"; }
signup "Pleadli" "pleadli@pleadli.com" "Pleadli123"
signup "Albertine HQ (test)" "albertine.hq@example.test" "orchestra-test-2026"
