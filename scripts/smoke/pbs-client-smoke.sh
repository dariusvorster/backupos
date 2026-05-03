#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# PBS client wire-compatibility smoke test
# See docs/testing/smoke-pbs.md for setup and usage.
# ---------------------------------------------------------------------------

# --- Validate environment --------------------------------------------------
required_vars=(
  BACKUPOS_HOST
  BACKUPOS_DATASTORE
  REAL_PBS_HOST
  CONTROL_DATASTORE
  SMOKE_TOKEN_BACKUPOS
  SMOKE_TOKEN_REAL_PBS
  PBS_AUTH_ID
  FP_BACKUPOS
  FP_REAL_PBS
  SMOKE_OUT
)
for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: \$$var is not set. See docs/testing/smoke-pbs.md section 4." >&2
    exit 1
  fi
done

mkdir -p \
  "$SMOKE_OUT/backupos" \
  "$SMOKE_OUT/real-pbs" \
  "$SMOKE_OUT/restore-backupos" \
  "$SMOKE_OUT/restore-real-pbs" \
  "$SMOKE_OUT/diff"

backupos_repo="$PBS_AUTH_ID@$BACKUPOS_HOST:$BACKUPOS_DATASTORE"
real_pbs_repo="$PBS_AUTH_ID@$REAL_PBS_HOST:$CONTROL_DATASTORE"

PASS=0
FAIL=0

# --- Helpers ---------------------------------------------------------------

# Run proxmox-backup-client against backupos-pbs.
# Captures combined stdout+stderr to the given file.
# Returns the exit code of proxmox-backup-client.
pbc_backupos() {
  local outfile="$1"; shift
  PBS_REPOSITORY="$backupos_repo" \
  PBS_FINGERPRINT="$FP_BACKUPOS" \
  PBS_PASSWORD="$SMOKE_TOKEN_BACKUPOS" \
    proxmox-backup-client "$@" >"$outfile" 2>&1
}

# Run proxmox-backup-client against real PBS (control).
pbc_real_pbs() {
  local outfile="$1"; shift
  PBS_REPOSITORY="$real_pbs_repo" \
  PBS_FINGERPRINT="$FP_REAL_PBS" \
  PBS_PASSWORD="$SMOKE_TOKEN_REAL_PBS" \
    proxmox-backup-client "$@" >"$outfile" 2>&1
}

# Normalise a text file: strip timestamps, snapshot date suffixes, version
# strings, fingerprints, and other known-divergent fields so that the
# backupos and real-PBS outputs can be diffed meaningfully.
normalize() {
  local infile="$1"
  local outfile="$2"
  sed \
    -e 's/[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}T[0-9:\.Z+-]\{10,\}/<TIMESTAMP>/g' \
    -e 's|/[0-9]\{10\}$|/<EPOCH>|g' \
    -e 's/"backup-time":[0-9]\+/"backup-time":<EPOCH>/g' \
    -e 's/"uptime":[0-9]\+/"uptime":<UPTIME>/g' \
    -e 's/"server-time":[0-9]\+/"server-time":<EPOCH>/g' \
    -e 's/"time":[0-9]\+/"time":<EPOCH>/g' \
    -e 's/proxmox-backup-server [0-9][^ ]*/proxmox-backup-server <VERSION>/g' \
    -e 's/backupos-pbs [0-9][^ ]*/backupos-pbs <VERSION>/g' \
    -e 's/[0-9A-Fa-f]\{2\}\(:[0-9A-Fa-f]\{2\}\)\{31\}/<FINGERPRINT>/g' \
    "$infile" > "$outfile"
}

# Record a step result. Exits 1 immediately on backupos failure.
record() {
  local step="$1"
  local target="$2"   # "backupos" or "real-pbs"
  local rc="$3"
  if [[ "$rc" -eq 0 ]]; then
    echo "  PASS: $step ($target)"
    [[ "$target" == "backupos" ]] && PASS=$((PASS + 1))
  else
    echo "  FAIL: $step ($target) — see $SMOKE_OUT/$target/" >&2
    if [[ "$target" == "backupos" ]]; then
      FAIL=$((FAIL + 1))
    else
      echo "  WARN: control (real PBS) failure is informational, not a test failure." >&2
    fi
  fi
}

# ---------------------------------------------------------------------------
# Step 1: status (auth probe)
# ---------------------------------------------------------------------------
echo "==> Step 1: status (auth probe)"

rc=0
pbc_backupos "$SMOKE_OUT/backupos/01-status.txt" status || rc=$?
record "step-1 status" "backupos" "$rc"

rc=0
pbc_real_pbs "$SMOKE_OUT/real-pbs/01-status.txt" status || rc=$?
record "step-1 status" "real-pbs" "$rc"

# ---------------------------------------------------------------------------
# Step 2: backup .pxar (didx path)
# ---------------------------------------------------------------------------
echo "==> Step 2: backup .pxar (didx)"

rc=0
pbc_backupos "$SMOKE_OUT/backupos/02-backup-pxar.txt" backup \
  "smoke-etc.pxar:/etc" \
  --backup-id pbs-smoke-pxar || rc=$?
record "step-2 backup-pxar" "backupos" "$rc"

rc=0
pbc_real_pbs "$SMOKE_OUT/real-pbs/02-backup-pxar.txt" backup \
  "smoke-etc.pxar:/etc" \
  --backup-id pbs-smoke-pxar || rc=$?
record "step-2 backup-pxar" "real-pbs" "$rc"

# ---------------------------------------------------------------------------
# Step 3: backup .img (fidx path)
# ---------------------------------------------------------------------------
echo "==> Step 3: backup .img (fidx)"

dd if=/dev/urandom of=/tmp/smoke.img bs=1M count=64 status=none
sha256sum /tmp/smoke.img > "$SMOKE_OUT/smoke-img.sha256"
echo "  Test image SHA256: $(cat "$SMOKE_OUT/smoke-img.sha256")"

rc=0
pbc_backupos "$SMOKE_OUT/backupos/03-backup-img.txt" backup \
  "smoke.img:/tmp/smoke.img" \
  --backup-id pbs-smoke-img || rc=$?
record "step-3 backup-img" "backupos" "$rc"

rc=0
pbc_real_pbs "$SMOKE_OUT/real-pbs/03-backup-img.txt" backup \
  "smoke.img:/tmp/smoke.img" \
  --backup-id pbs-smoke-img || rc=$?
record "step-3 backup-img" "real-pbs" "$rc"

# ---------------------------------------------------------------------------
# Step 4: snapshot list
# ---------------------------------------------------------------------------
echo "==> Step 4: snapshot list"

rc=0
pbc_backupos "$SMOKE_OUT/backupos/04-snapshots.json" snapshot list \
  --output-format json || rc=$?
record "step-4 snapshot-list" "backupos" "$rc"

rc=0
pbc_real_pbs "$SMOKE_OUT/real-pbs/04-snapshots.json" snapshot list \
  --output-format json || rc=$?
record "step-4 snapshot-list" "real-pbs" "$rc"

# ---------------------------------------------------------------------------
# Step 5: restore + byte-compare
# ---------------------------------------------------------------------------
echo "==> Step 5: restore"

# Parse the most-recent snapshot for a given backup-id from a JSON snapshot list.
# Usage: latest_snap <json-file> <backup-id>
# Prints: host/<backup-id>/<ISO-timestamp>
latest_snap() {
  local jsonfile="$1"
  local bid="$2"
  local snap
  snap=$(jq -re \
    --arg bid "$bid" \
    '[.[] | select(.["backup-id"] == $bid and .["backup-type"] == "host")]
     | sort_by(.["backup-time"])
     | last
     | "host/" + .["backup-id"] + "/" + (.["backup-time"] | todate)' \
    "$jsonfile") || {
      echo "ERROR: could not parse snapshot for backup-id='$bid' from $jsonfile" >&2
      echo "  Contents: $(cat "$jsonfile")" >&2
      return 1
    }
  echo "$snap"
}

# --- restore .pxar from backupos ---
backupos_pxar_snap=""
backupos_pxar_snap=$(latest_snap "$SMOKE_OUT/backupos/04-snapshots.json" "pbs-smoke-pxar") || FAIL=$((FAIL + 1))

if [[ -n "$backupos_pxar_snap" ]]; then
  mkdir -p "$SMOKE_OUT/restore-backupos/etc"
  rc=0
  pbc_backupos "$SMOKE_OUT/backupos/05-restore-pxar.txt" restore \
    "$backupos_pxar_snap" smoke-etc.pxar \
    "$SMOKE_OUT/restore-backupos/etc" || rc=$?
  record "step-5 restore-pxar" "backupos" "$rc"
fi

# --- restore .pxar from real PBS ---
real_pbs_pxar_snap=""
real_pbs_pxar_snap=$(latest_snap "$SMOKE_OUT/real-pbs/04-snapshots.json" "pbs-smoke-pxar") || true

if [[ -n "$real_pbs_pxar_snap" ]]; then
  mkdir -p "$SMOKE_OUT/restore-real-pbs/etc"
  rc=0
  pbc_real_pbs "$SMOKE_OUT/real-pbs/05-restore-pxar.txt" restore \
    "$real_pbs_pxar_snap" smoke-etc.pxar \
    "$SMOKE_OUT/restore-real-pbs/etc" || rc=$?
  record "step-5 restore-pxar" "real-pbs" "$rc"
fi

# --- restore .img from backupos ---
backupos_img_snap=""
backupos_img_snap=$(latest_snap "$SMOKE_OUT/backupos/04-snapshots.json" "pbs-smoke-img") || FAIL=$((FAIL + 1))

if [[ -n "$backupos_img_snap" ]]; then
  rc=0
  pbc_backupos "$SMOKE_OUT/backupos/05-restore-img.txt" restore \
    "$backupos_img_snap" smoke.img \
    "$SMOKE_OUT/restore-backupos/smoke.img" || rc=$?
  record "step-5 restore-img" "backupos" "$rc"

  if [[ "$rc" -eq 0 ]]; then
    restored_hash=$(sha256sum "$SMOKE_OUT/restore-backupos/smoke.img" | awk '{print $1}')
    original_hash=$(awk '{print $1}' "$SMOKE_OUT/smoke-img.sha256")
    if [[ "$restored_hash" == "$original_hash" ]]; then
      echo "  PASS: step-5 .img byte-match (backupos)"
      PASS=$((PASS + 1))
    else
      echo "  FAIL: step-5 .img byte-mismatch (backupos)" >&2
      echo "    original:  $original_hash" >&2
      echo "    restored:  $restored_hash" >&2
      FAIL=$((FAIL + 1))
    fi
  fi
fi

# --- restore .img from real PBS ---
real_pbs_img_snap=""
real_pbs_img_snap=$(latest_snap "$SMOKE_OUT/real-pbs/04-snapshots.json" "pbs-smoke-img") || true

if [[ -n "$real_pbs_img_snap" ]]; then
  rc=0
  pbc_real_pbs "$SMOKE_OUT/real-pbs/05-restore-img.txt" restore \
    "$real_pbs_img_snap" smoke.img \
    "$SMOKE_OUT/restore-real-pbs/smoke.img" || rc=$?
  record "step-5 restore-img" "real-pbs" "$rc"

  if [[ "$rc" -eq 0 ]]; then
    restored_hash=$(sha256sum "$SMOKE_OUT/restore-real-pbs/smoke.img" | awk '{print $1}')
    original_hash=$(awk '{print $1}' "$SMOKE_OUT/smoke-img.sha256")
    if [[ "$restored_hash" == "$original_hash" ]]; then
      echo "  PASS: step-5 .img byte-match (real-pbs, control)"
    else
      echo "  WARN: step-5 .img byte-mismatch (real-pbs control)" >&2
    fi
  fi
fi

# --- .pxar content comparison (backupos) ---
# Allowlisted divergences: /etc/mtab (symlink to /proc/mounts),
# /etc/resolv.conf (managed symlink), /etc/hostname (CT-specific).
if [[ -d "$SMOKE_OUT/restore-backupos/etc" ]]; then
  diff_pxar=0
  diff -r --exclude=mtab --exclude=resolv.conf --exclude=hostname \
    /etc "$SMOKE_OUT/restore-backupos/etc" \
    > "$SMOKE_OUT/diff/05-pxar-vs-source.diff" 2>&1 || diff_pxar=$?
  if [[ "$diff_pxar" -eq 0 ]]; then
    echo "  PASS: step-5 .pxar content matches /etc (backupos)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: step-5 .pxar content differs from /etc (backupos)" >&2
    echo "    See $SMOKE_OUT/diff/05-pxar-vs-source.diff" >&2
    FAIL=$((FAIL + 1))
  fi
fi

# ---------------------------------------------------------------------------
# Normalise + diff backupos vs real PBS outputs
# ---------------------------------------------------------------------------
echo "==> Diffing backupos vs real PBS (control)"

for stem in 01-status 02-backup-pxar 03-backup-img; do
  for target in backupos real-pbs; do
    if [[ -f "$SMOKE_OUT/$target/$stem.txt" ]]; then
      normalize "$SMOKE_OUT/$target/$stem.txt" "$SMOKE_OUT/$target/$stem.norm"
    fi
  done
  if [[ -f "$SMOKE_OUT/backupos/$stem.norm" && -f "$SMOKE_OUT/real-pbs/$stem.norm" ]]; then
    diff -u "$SMOKE_OUT/real-pbs/$stem.norm" "$SMOKE_OUT/backupos/$stem.norm" \
      > "$SMOKE_OUT/diff/$stem.diff" 2>&1 || true
    echo "  diff written: $SMOKE_OUT/diff/$stem.diff"
  fi
done

# Diff snapshot lists (normalised JSON)
for target in backupos real-pbs; do
  if [[ -f "$SMOKE_OUT/$target/04-snapshots.json" ]]; then
    normalize "$SMOKE_OUT/$target/04-snapshots.json" "$SMOKE_OUT/$target/04-snapshots.norm"
  fi
done
if [[ -f "$SMOKE_OUT/backupos/04-snapshots.norm" && -f "$SMOKE_OUT/real-pbs/04-snapshots.norm" ]]; then
  diff -u "$SMOKE_OUT/real-pbs/04-snapshots.norm" "$SMOKE_OUT/backupos/04-snapshots.norm" \
    > "$SMOKE_OUT/diff/04-snapshots.diff" 2>&1 || true
  echo "  diff written: $SMOKE_OUT/diff/04-snapshots.diff"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
echo "=== Smoke test complete ==="
echo "  Passed (backupos): $PASS"
echo "  Failed (backupos): $FAIL"
echo "  Output:  $SMOKE_OUT"
echo "  Diffs:   $SMOKE_OUT/diff/"
echo
echo "Paste results into issue #237 using the template in docs/testing/smoke-pbs.md section 7."

if [[ "$FAIL" -gt 0 ]]; then
  echo "RESULT: FAIL ($FAIL failures against backupos-pbs)" >&2
  exit 1
fi

echo "RESULT: PASS"
exit 0
