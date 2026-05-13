#!/usr/bin/env bash
# Verifies that POST /api/auth/sign-up/email is rejected when users exist.
# Run after deploy. Must be invoked with BACKUPOS_URL env set.
#
# Exits 0 on PASS (signup rejected), 1 on FAIL (signup succeeded).

set -euo pipefail

URL="${BACKUPOS_URL:-http://localhost:3093}"

echo "==> Probing $URL/api/auth/sign-up/email with anonymous POST"
echo "    (this should be rejected with non-200)"

RAND="security-probe-$(date +%s)-$RANDOM@example.local"

STATUS=$(curl -sk -o /tmp/signup-probe.json -w "%{http_code}" \
  -X POST "$URL/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$RAND\",\"name\":\"probe\",\"password\":\"hunter2hunter2\"}")

echo "    HTTP $STATUS"
echo "    Body: $(head -c 400 /tmp/signup-probe.json)"

if [ "$STATUS" -ge 200 ] && [ "$STATUS" -lt 300 ]; then
  echo "==> FAIL — anonymous signup returned $STATUS (vulnerability still present)"
  exit 1
fi

echo "==> PASS — anonymous signup rejected (HTTP $STATUS)"
exit 0
