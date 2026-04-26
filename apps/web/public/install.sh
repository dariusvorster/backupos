#!/usr/bin/env bash
set -eo pipefail

SUBCOMMAND="${1:-install}"
shift 1 2>/dev/null || true

SERVER_URL="${BACKUPOS_URL:-}"
TOKEN="${BACKUPOS_TOKEN:-}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --url)   SERVER_URL="$2"; shift 2 ;;
    --token) TOKEN="$2";      shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

log() { echo "[backupos] $*"; }
die() { echo "[backupos] ERROR: $*" >&2; exit 1; }

INSTALL_DIR=/opt/backupos-agent
ENV_FILE="$INSTALL_DIR/.env"
UNIT_FILE=/etc/systemd/system/backupos-agent.service
OVERRIDE_DIR=/etc/systemd/system/backupos-agent.service.d

write_unit() {
  cat > "$UNIT_FILE" <<'UNITEOF'
[Unit]
Description=BackupOS Agent
After=network.target

[Service]
Type=simple
EnvironmentFile=/opt/backupos-agent/.env
ExecStart=/usr/bin/node /opt/backupos-agent/agent.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNITEOF
}

# ── Update / self-heal mode ────────────────────────────────────────────────────
if [ "$SUBCOMMAND" = "update" ]; then
  log "Running update on existing install..."

  # Optionally download a fresh bundle if a server URL is known
  if [ -n "$SERVER_URL" ]; then
    DL_URL="${SERVER_URL/wss:\/\//https://}"
    DL_URL="${DL_URL/ws:\/\//http://}"
    DL_URL="${DL_URL%/ws/agent}"
    log "Downloading fresh agent bundle from $DL_URL ..."
    curl -fsSL "$DL_URL/agent/bundle.js" -o "$INSTALL_DIR/agent.js" \
      && log "Agent bundle updated ✓" \
      || log "Warning: Could not download fresh bundle — keeping existing agent.js"
  fi

  # Self-heal: rewrite unit if EnvironmentFile is missing
  need_unit_rewrite=0
  if [ ! -f "$UNIT_FILE" ]; then
    need_unit_rewrite=1
  elif ! grep -q '^EnvironmentFile=' "$UNIT_FILE"; then
    need_unit_rewrite=1
  fi

  if [ "$need_unit_rewrite" = "1" ]; then
    log "Rewriting systemd unit to add EnvironmentFile..."
    write_unit
    log "Unit rewritten ✓"
  else
    log "Unit file OK (EnvironmentFile already present) ✓"
  fi

  # Remove malformed override.conf (no [Service] header — silently ignored by systemd)
  if [ -f "$OVERRIDE_DIR/override.conf" ]; then
    if ! grep -q '^\[Service\]' "$OVERRIDE_DIR/override.conf"; then
      log "Removing malformed override.conf (missing [Service] header)..."
      rm -f "$OVERRIDE_DIR/override.conf"
      rmdir "$OVERRIDE_DIR" 2>/dev/null || true
      log "override.conf removed ✓"
    fi
  fi

  systemctl daemon-reload
  systemctl restart backupos-agent
  sleep 2
  if systemctl is-active --quiet backupos-agent; then
    log "Agent is running ✓"
    log "Logs:   journalctl -u backupos-agent -f"
    log "Status: systemctl status backupos-agent"
  else
    log "Agent failed to start. Last 30 log lines:"
    journalctl -u backupos-agent -n 30 --no-pager
    exit 1
  fi
  exit 0
fi

# ── Fresh install ──────────────────────────────────────────────────────────────

# Keep original WS URL for .env; normalise to http for downloads
WS_URL="$SERVER_URL"
SERVER_URL="${SERVER_URL/wss:\/\//https://}"
SERVER_URL="${SERVER_URL/ws:\/\//http://}"
SERVER_URL="${SERVER_URL%/ws/agent}"

[[ -z "$SERVER_URL" ]] && SERVER_URL="http://localhost:3093"
[[ -z "$TOKEN" ]] && die "Usage: BACKUPOS_URL=\$WS_URL BACKUPOS_TOKEN=\$TOKEN curl -fsSL \$SERVER_URL/install.sh | sudo bash"

# ── 1. Node.js ─────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  log "Node.js not found — installing via NodeSource..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
    sudo apt-get install -y nodejs
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
    sudo yum install -y nodejs
  else
    die "Cannot install Node.js automatically. Install Node.js 18+ and re-run."
  fi
fi
NODE_VER="$(node --version | sed 's/v//' | cut -d. -f1)"
[[ "$NODE_VER" -ge 18 ]] || die "Node.js 18+ required (found $(node --version))"
log "Node.js $(node --version) ✓"

# ── 2. restic ──────────────────────────────────────────────────────────────────
if ! command -v restic &>/dev/null; then
  log "Installing restic..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y restic
  elif command -v yum &>/dev/null; then
    sudo yum install -y restic
  else
    RESTIC_VER="0.17.3"
    case "$(uname -m)" in
      x86_64)  RESTIC_PKG="restic_${RESTIC_VER}_linux_amd64.bz2" ;;
      aarch64) RESTIC_PKG="restic_${RESTIC_VER}_linux_arm64.bz2" ;;
      *)       die "Unsupported arch: $(uname -m)" ;;
    esac
    RESTIC_URL="https://github.com/restic/restic/releases/download/v${RESTIC_VER}/${RESTIC_PKG}"
    curl -fsSL "$RESTIC_URL" -o /tmp/restic.bz2 || die "Failed to download restic"
    if command -v bunzip2 &>/dev/null; then
      bunzip2 -k /tmp/restic.bz2 && sudo mv /tmp/restic /usr/local/bin/restic
    elif command -v bzip2 &>/dev/null; then
      bzip2 -d -k /tmp/restic.bz2 && sudo mv /tmp/restic /usr/local/bin/restic
    else
      die "No bzip2/bunzip2 found — install bzip2 and re-run"
    fi
    rm -f /tmp/restic.bz2
    sudo chmod +x /usr/local/bin/restic
  fi
  restic version &>/dev/null || die "restic installed but cannot execute — check architecture"
  log "restic installed ✓"
fi
RESTIC_PATH="$(command -v restic)"

# ── 3. Agent bundle ────────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR"
log "Downloading agent..."
curl -fsSL "$SERVER_URL/agent/bundle.js" -o "$INSTALL_DIR/agent.js" \
  || die "Failed to download agent bundle from $SERVER_URL/agent/bundle.js"
log "Agent downloaded ✓"

# ── 4. Write .env ──────────────────────────────────────────────────────────────
# Ensure WS URL is in ws:// form for the agent
if [ -z "$WS_URL" ] || [[ "$WS_URL" == http* ]]; then
  # Build ws URL from the http base
  WS_URL="ws://${SERVER_URL#http://}/ws/agent"
  WS_URL="${WS_URL/https:\/\//wss://}"
fi
cat > "$ENV_FILE" <<ENVEOF
BACKUPOS_URL=$WS_URL
BACKUPOS_TOKEN=$TOKEN
RESTIC_BINARY_PATH=$RESTIC_PATH
ENVEOF
chmod 600 "$ENV_FILE"
log ".env written ✓"

# ── 5. Install and start service ───────────────────────────────────────────────
write_unit
systemctl daemon-reload
systemctl enable backupos-agent
systemctl start backupos-agent
sleep 2
if systemctl is-active --quiet backupos-agent; then
  log "Service started ✓"
else
  log "Service failed to start. Last 30 log lines:"
  journalctl -u backupos-agent -n 30 --no-pager
  exit 1
fi

log ""
log "BackupOS Agent installed successfully."
log "Logs:   journalctl -u backupos-agent -f"
log "Status: systemctl status backupos-agent"
