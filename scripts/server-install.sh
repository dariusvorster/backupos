#!/usr/bin/env bash
# BackupOS Server — complete native Linux installer
#
# Usage:
#   sudo bash scripts/server-install.sh [options]
#   sudo bash scripts/server-install.sh update
#   sudo bash scripts/server-install.sh uninstall
#
# Options:
#   --url    https://backupos.example.com   Public URL (default: auto-detect LAN IP)
#   --port   3093                           Listen port (default: 3093)
#   --user   backupos                       System user to run the service (default: backupos)
#   --source /path/to/repo                  Use local source dir instead of auto-detect

set -eo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
INSTALL_DIR=/opt/backupos
DATA_DIR=/var/lib/backupos
CONF_DIR=/etc/backupos
LOG_DIR=/var/log/backupos
ENV_FILE=$CONF_DIR/server.env
SERVICE_NAME=backupos
SVC_USER=backupos
PORT=3093
PUBLIC_URL=""
SOURCE_DIR=""
COMMAND="${1:-install}"

# Shift past the command if it's a word (install/update/uninstall)
case "$COMMAND" in install|update|uninstall) shift ;; *) COMMAND=install ;; esac

while [[ $# -gt 0 ]]; do
  case $1 in
    --url)    PUBLIC_URL="$2";  shift 2 ;;
    --port)   PORT="$2";        shift 2 ;;
    --user)   SVC_USER="$2";    shift 2 ;;
    --source) SOURCE_DIR="$2";  shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
log()    { echo "[backupos] $*"; }
ok()     { echo "[backupos] ✓ $*"; }
die()    { echo "[backupos] ERROR: $*" >&2; exit 1; }
rand32() { openssl rand -hex 32 2>/dev/null || tr -dc 'a-f0-9' </dev/urandom | head -c 64; }

[[ $EUID -eq 0 ]] || die "Run as root:  sudo bash $0 $COMMAND"

# ── Uninstall ─────────────────────────────────────────────────────────────────
if [[ "$COMMAND" == "uninstall" ]]; then
  log "Stopping and removing BackupOS server..."
  systemctl stop  "$SERVICE_NAME" 2>/dev/null || true
  systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f /etc/systemd/system/${SERVICE_NAME}.service
  rm -f /etc/logrotate.d/$SERVICE_NAME
  systemctl daemon-reload
  log "Service removed."
  log ""
  log "The following were NOT removed (contains your data and config):"
  log "  $DATA_DIR   — database"
  log "  $CONF_DIR   — environment / secrets"
  log "  $INSTALL_DIR — application files"
  log ""
  log "To fully remove:  rm -rf $DATA_DIR $CONF_DIR $INSTALL_DIR"
  exit 0
fi

# ── 1. System dependencies ────────────────────────────────────────────────────
log "Checking system dependencies..."

# git
command -v git &>/dev/null || {
  log "Installing git..."
  if command -v apt-get &>/dev/null; then apt-get install -y git
  elif command -v yum &>/dev/null;    then yum install -y git
  else die "Cannot install git — install it manually and re-run"; fi
}

# rsync (used for local source copy)
command -v rsync &>/dev/null || {
  if command -v apt-get &>/dev/null; then apt-get install -y rsync
  elif command -v yum &>/dev/null;   then yum install -y rsync; fi
}

# Node.js 22
if ! command -v node &>/dev/null || [[ "$(node --version | sed 's/v//' | cut -d. -f1)" -lt 18 ]]; then
  log "Installing Node.js 22..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    yum install -y nodejs
  else
    die "Cannot install Node.js — install Node.js 22+ manually and re-run"
  fi
fi
ok "Node.js $(node --version)"

# pnpm
if ! command -v pnpm &>/dev/null; then
  log "Installing pnpm..."
  corepack enable && corepack prepare pnpm@latest --activate
fi
ok "pnpm $(pnpm --version)"

# tsx
if ! command -v tsx &>/dev/null; then
  log "Installing tsx..."
  npm install -g tsx
fi
ok "tsx"

# restic
if ! command -v restic &>/dev/null; then
  log "Installing restic..."
  if command -v apt-get &>/dev/null; then
    apt-get install -y restic
  elif command -v yum &>/dev/null; then
    yum install -y restic
  else
    RESTIC_VER="0.17.3"
    case "$(uname -m)" in
      x86_64)  PKG="restic_${RESTIC_VER}_linux_amd64.bz2" ;;
      aarch64) PKG="restic_${RESTIC_VER}_linux_arm64.bz2" ;;
      *)       die "Unsupported arch: $(uname -m)" ;;
    esac
    curl -fsSL "https://github.com/restic/restic/releases/download/v${RESTIC_VER}/${PKG}" -o /tmp/restic.bz2
    if command -v bunzip2 &>/dev/null; then bunzip2 -k /tmp/restic.bz2
    elif command -v bzip2 &>/dev/null; then bzip2 -d -k /tmp/restic.bz2
    else die "No bzip2/bunzip2 — install bzip2 and re-run"; fi
    mv /tmp/restic /usr/local/bin/restic
    rm -f /tmp/restic.bz2
    chmod +x /usr/local/bin/restic
  fi
fi
restic version &>/dev/null || die "restic installed but cannot execute — check architecture"
ok "restic $(restic version | head -1 | awk '{print $2}')"

# ── 2. System user ────────────────────────────────────────────────────────────
if ! id "$SVC_USER" &>/dev/null; then
  log "Creating system user '$SVC_USER'..."
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
fi
ok "User '$SVC_USER'"

# ── 3. Directories ────────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$CONF_DIR" "$LOG_DIR"
chown "$SVC_USER:$SVC_USER" "$DATA_DIR" "$LOG_DIR"

# ── 4. Source code ────────────────────────────────────────────────────────────
if [[ -n "$SOURCE_DIR" ]]; then
  log "Syncing from $SOURCE_DIR..."
  [[ -d "$SOURCE_DIR" ]] || die "Source directory not found: $SOURCE_DIR"
  SRC="$SOURCE_DIR"
else
  # Auto-detect: script lives in <repo>/scripts/
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  if [[ -f "$REPO_ROOT/package.json" ]] && grep -q 'backupos' "$REPO_ROOT/package.json" 2>/dev/null; then
    SRC="$REPO_ROOT"
    log "Using repo at $SRC..."
  else
    die "Run from inside the repo, or pass --source /path/to/repo"
  fi
fi

# Stop service before syncing so files aren't in use
WAS_RUNNING=false
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  WAS_RUNNING=true
  log "Stopping service for update..."
  systemctl stop "$SERVICE_NAME"
fi

rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='apps/web/.next' \
  --exclude='apps/web/.next' \
  --exclude='*.bak' \
  "$SRC/" "$INSTALL_DIR/"

# ── 5. Build ──────────────────────────────────────────────────────────────────
cd "$INSTALL_DIR"

log "Installing dependencies..."
pnpm install --frozen-lockfile

log "Building packages..."
pnpm --filter @backupos/db          build
pnpm --filter @backupos/engine      build
pnpm --filter @backupos/app-hooks   build
pnpm --filter @backupos/hypervisors build
pnpm --filter @backupos/monitors    build
pnpm --filter @backupos/restore     build
pnpm --filter @backupos/agent-protocol build
pnpm --filter @backupos/api         build
pnpm --filter @backupos/docs-content build

log "Building web app..."
pnpm --filter @backupos/web exec next build
ok "Build complete"

# Fix ownership so the service user can write to data dirs
chown -R "$SVC_USER:$SVC_USER" "$DATA_DIR" "$LOG_DIR"
# The app files are owned by root — that's fine, service user just reads them

# ── 6. Environment file ───────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  log "Generating $ENV_FILE..."

  if [[ -z "$PUBLIC_URL" ]]; then
    DETECTED_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    PUBLIC_URL="http://${DETECTED_IP:-localhost}:${PORT}"
    log "No --url given — using $PUBLIC_URL (edit $ENV_FILE to change)"
  fi

  cat > "$ENV_FILE" <<ENVEOF
# BackupOS Server — environment configuration
# Edit then restart:  systemctl restart $SERVICE_NAME

NODE_ENV=production
PORT=$PORT
HOSTNAME=0.0.0.0

# Database
DATABASE_URL=file:$DATA_DIR/backupos.db

# Restic binary
RESTIC_BINARY_PATH=$(command -v restic)

# Auth secrets — rotate these only if you want to invalidate all sessions
BETTER_AUTH_SECRET=$(rand32)
BETTER_AUTH_URL=$PUBLIC_URL
ENCRYPTION_KEY=$(rand32)
ENVEOF
  chmod 600 "$ENV_FILE"
  ok "Environment file created"
else
  ok "Environment file already exists (keeping existing secrets)"
fi

# ── 7. Log rotation ───────────────────────────────────────────────────────────
cat > /etc/logrotate.d/$SERVICE_NAME <<LREOF
$LOG_DIR/*.log {
  daily
  rotate 14
  compress
  delaycompress
  missingok
  notifempty
  sharedscripts
  postrotate
    systemctl kill --signal=USR1 $SERVICE_NAME 2>/dev/null || true
  endscript
}
LREOF

# ── 8. systemd service ────────────────────────────────────────────────────────
RESTIC_BIN="$(command -v restic)"
TSX_BIN="$(command -v tsx)"

cat > /etc/systemd/system/${SERVICE_NAME}.service <<SVCEOF
[Unit]
Description=BackupOS Server
Documentation=https://github.com/dariusvorster/backupos
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SVC_USER
Group=$SVC_USER
WorkingDirectory=$INSTALL_DIR/apps/web
EnvironmentFile=$ENV_FILE
ExecStart=$TSX_BIN $INSTALL_DIR/apps/web/server.ts
Restart=on-failure
RestartSec=5
TimeoutStopSec=30

# Hardening
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full
ReadWritePaths=$DATA_DIR $LOG_DIR $CONF_DIR

StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

# Give it a moment to start
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
  ok "Service started"
else
  log "Service may have failed to start. Check:  journalctl -u $SERVICE_NAME -n 50"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
PUBLIC_URL_ACTUAL="$(grep '^BETTER_AUTH_URL=' "$ENV_FILE" | cut -d= -f2-)"

echo ""
echo "══════════════════════════════════════════════════════"
echo "  BackupOS installed successfully"
echo ""
echo "  Dashboard:  $PUBLIC_URL_ACTUAL"
echo "  Logs:       journalctl -u $SERVICE_NAME -f"
echo "  Status:     systemctl status $SERVICE_NAME"
echo "  Config:     $ENV_FILE"
echo "  Data:       $DATA_DIR"
echo ""
echo "  To update:    sudo bash $0 update"
echo "  To uninstall: sudo bash $0 uninstall"
echo "══════════════════════════════════════════════════════"
