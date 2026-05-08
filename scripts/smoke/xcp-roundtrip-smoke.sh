#!/usr/bin/env bash
# XCP-ng backup → restore round-trip smoke test
#
# Required env vars:
#   BACKUPOS_URL              https://your-backupos-host
#   BACKUPOS_INTERNAL_SECRET  matches the server's BACKUPOS_INTERNAL_SECRET
#   SMOKE_JOB_ID              UUID of the xcpng_vm backup job to test
#   SMOKE_TARGET_SR_UUID      UUID of the SR where the restored VM should be created
#
# Optional:
#   SMOKE_VM_NAME             name for the restored VM (default: smoke-restored-<timestamp>)
#   SMOKE_TEMPLATE_LABEL      XCP-ng template label (default: "Other install media")
#   SMOKE_BACKUP_TIMEOUT      seconds to wait for backup  (default: 1800)
#   SMOKE_RESTORE_TIMEOUT     seconds to wait for restore (default: 1800)
#   SMOKE_POLL_INTERVAL       seconds between status polls (default: 15)

set -euo pipefail

BASE_URL="${BACKUPOS_URL:?BACKUPOS_URL is required}"
SECRET="${BACKUPOS_INTERNAL_SECRET:?BACKUPOS_INTERNAL_SECRET is required}"
JOB_ID="${SMOKE_JOB_ID:?SMOKE_JOB_ID is required}"
TARGET_SR="${SMOKE_TARGET_SR_UUID:?SMOKE_TARGET_SR_UUID is required}"
VM_NAME="${SMOKE_VM_NAME:-smoke-restored-$(date +%Y%m%d-%H%M%S)}"
TEMPLATE="${SMOKE_TEMPLATE_LABEL:-Other install media}"
BACKUP_TIMEOUT="${SMOKE_BACKUP_TIMEOUT:-1800}"
RESTORE_TIMEOUT="${SMOKE_RESTORE_TIMEOUT:-1800}"
POLL="${SMOKE_POLL_INTERVAL:-15}"

AUTH="Authorization: Bearer ${SECRET}"

die() { echo "FAIL: $*" >&2; exit 1; }

# ── Step 1: trigger backup ────────────────────────────────────────────────────
echo "==> Step 1: triggering backup for job ${JOB_ID}"
resp=$(curl -sf -X POST "${BASE_URL}/api/v1/integration/runs" \
  -H "${AUTH}" -H 'Content-Type: application/json' \
  -d "{\"job_id\":\"${JOB_ID}\"}")
RUN_ID=$(echo "$resp" | grep -o '"run_id":"[^"]*"' | cut -d'"' -f4)
[[ -n "$RUN_ID" ]] || die "no run_id in response: $resp"
echo "    run_id=${RUN_ID}"

# ── Step 2: poll backup ───────────────────────────────────────────────────────
echo "==> Step 2: polling backup (timeout ${BACKUP_TIMEOUT}s)"
deadline=$(( $(date +%s) + BACKUP_TIMEOUT ))
while true; do
  [[ $(date +%s) -lt $deadline ]] || die "backup timed out after ${BACKUP_TIMEOUT}s"
  status_resp=$(curl -sf "${BASE_URL}/api/v1/integration/runs/${RUN_ID}" -H "${AUTH}")
  status=$(echo "$status_resp" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  echo "    status=${status}"
  [[ "$status" == "running" ]] || break
  sleep "$POLL"
done
[[ "$status" == "success" ]] || die "backup ended with status=${status}"
echo "    backup succeeded"

# ── Step 3: trigger restore ───────────────────────────────────────────────────
echo "==> Step 3: triggering restore → SR=${TARGET_SR} VM=${VM_NAME}"
restore_body=$(printf '{"job_id":"%s","target_sr_uuid":"%s","vm_name":"%s","target_template_name_label":"%s"}' \
  "$JOB_ID" "$TARGET_SR" "$VM_NAME" "$TEMPLATE")
restore_resp=$(curl -sf -X POST "${BASE_URL}/api/v1/integration/restore-runs" \
  -H "${AUTH}" -H 'Content-Type: application/json' \
  -d "$restore_body")
RESTORE_ID=$(echo "$restore_resp" | grep -o '"restore_run_id":"[^"]*"' | cut -d'"' -f4)
[[ -n "$RESTORE_ID" ]] || die "no restore_run_id in response: $restore_resp"
echo "    restore_run_id=${RESTORE_ID}"

# ── Step 4: poll restore ──────────────────────────────────────────────────────
echo "==> Step 4: polling restore (timeout ${RESTORE_TIMEOUT}s)"
deadline=$(( $(date +%s) + RESTORE_TIMEOUT ))
while true; do
  [[ $(date +%s) -lt $deadline ]] || die "restore timed out after ${RESTORE_TIMEOUT}s"
  rstatus_resp=$(curl -sf "${BASE_URL}/api/v1/integration/restore-runs/${RESTORE_ID}" -H "${AUTH}")
  rstatus=$(echo "$rstatus_resp" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  echo "    status=${rstatus}"
  [[ "$rstatus" == "running" ]] || break
  sleep "$POLL"
done
[[ "$rstatus" == "success" ]] || die "restore ended with status=${rstatus}"

NEW_VM=$(echo "$rstatus_resp" | grep -o '"new_vm_uuid":"[^"]*"' | cut -d'"' -f4)
echo "==> PASS — new VM UUID: ${NEW_VM:-unknown}"
echo "    Remember to destroy ${NEW_VM} from XCP-ng if no longer needed."
