#!/usr/bin/env bash
# BackupOS Server — complete native Linux installer
#
# Usage:
#   sudo bash scripts/server-install.sh [options]
#   sudo bash scripts/server-install.sh update
#   sudo bash scripts/server-install.sh uninstall
#
# Options:
#   --url      https://backupos.example.com   Public URL (default: auto-detect LAN IP)
#   --port     3093                           Listen port (default: 3093)
#   --pbs-port 8007                           PBS protocol port (default: 8007)
#   --user     backupos                       System user to run the service (default: backupos)
#   --source   /path/to/repo                  Use local source dir instead of auto-detect

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
PBS_PORT=8007
PBS_BIND="0.0.0.0:${PBS_PORT}"
PUBLIC_URL=""
SOURCE_DIR=""
COMMAND="${1:-install}"

# Shift past the command if it's a word (install/update/uninstall)
case "$COMMAND" in install|update|uninstall) shift ;; *) COMMAND=install ;; esac

while [[ $# -gt 0 ]]; do
  case $1 in
    --url)      PUBLIC_URL="$2";                            shift 2 ;;
    --port)     PORT="$2";                                  shift 2 ;;
    --pbs-port) PBS_PORT="$2"; PBS_BIND="0.0.0.0:${PBS_PORT}"; shift 2 ;;
    --user)     SVC_USER="$2";                              shift 2 ;;
    --source)   SOURCE_DIR="$2";                            shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
log()    { echo "[backupos] $*"; }
ok()     { echo "[backupos] ✓ $*"; }
die()    { echo "[backupos] ERROR: $*" >&2; exit 1; }
rand32() { openssl rand -hex 32 2>/dev/null || tr -dc 'a-f0-9' </dev/urandom | head -c 64; }

# Wait until no process has the DB file open (max 30 seconds).
# After systemctl stop returns the OS should have released handles, but
# defending against slow shutdowns and SIGKILL stragglers — see #109.
wait_for_db_unlock() {
  local db_path="${DATA_DIR}/backupos.db"
  local i
  if [[ ! -f "$db_path" ]]; then
    return 0  # No DB yet — fresh install
  fi
  for i in $(seq 1 30); do
    if ! fuser "$db_path" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  log "WARN: $db_path still held after 30s wait — proceeding anyway"
  return 0
}

[[ $EUID -eq 0 ]] || die "Run as root:  sudo bash $0 $COMMAND"

# ── Uninstall ─────────────────────────────────────────────────────────────────
if [[ "$COMMAND" == "uninstall" ]]; then
  log "Stopping and removing BackupOS server..."
  systemctl stop    "$SERVICE_NAME-pbs" 2>/dev/null || true
  systemctl disable "$SERVICE_NAME-pbs" 2>/dev/null || true
  rm -f /etc/systemd/system/${SERVICE_NAME}-pbs.service
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

# Go (1.22+) for backupos-pbs service.
#
# Users typically install Go from the official tarball at /usr/local/go/.
# That puts go at /usr/local/go/bin/go but it's only on $PATH for shells
# that source /etc/profile.d/go.sh (login shells). sudo non-login bash
# (which is what runs this script) doesn't get that. Augment PATH here
# and create symlinks in /usr/local/bin/ so subsequent sudo invocations
# find go automatically.
if [[ -x /usr/local/go/bin/go ]] && ! command -v go &>/dev/null; then
  log "Found Go at /usr/local/go/bin — adding to PATH and linking to /usr/local/bin"
  export PATH="/usr/local/go/bin:$PATH"
  ln -sf /usr/local/go/bin/go /usr/local/bin/go
  ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
fi

if ! command -v go &>/dev/null; then
  die "Go not installed — install Go 1.22+ from https://go.dev/dl/ and re-run"
fi
GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
GO_MAJOR=$(echo "$GO_VERSION" | cut -d. -f1)
GO_MINOR=$(echo "$GO_VERSION" | cut -d. -f2)
if [[ "$GO_MAJOR" -lt 1 ]] || ([[ "$GO_MAJOR" -eq 1 ]] && [[ "$GO_MINOR" -lt 22 ]]); then
  die "Go $GO_VERSION too old — need Go 1.22+. Upgrade at https://go.dev/dl/"
fi
ok "Go $GO_VERSION"

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
    if [[ -d "$SRC/.git" ]]; then
      log "Pulling latest changes..."
      git -C "$SRC" pull --ff-only || log "git pull failed — continuing with current code"
    fi
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
  log "Waiting for database lock to release..."
  wait_for_db_unlock
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
pnpm --filter @backupos/agent       build
pnpm --filter @backupos/api         build
pnpm --filter @backupos/docs-content build

log "Building web app..."
pnpm --filter @backupos/web exec next build

log "Building backupos-pbs Go service..."
mkdir -p "$INSTALL_DIR/bin"
(
  cd "$INSTALL_DIR/services/backupos-pbs" || die "Go service source not found"
  GOFLAGS=-mod=mod go build \
    -ldflags="-s -w" \
    -o "$INSTALL_DIR/bin/backupos-pbs" \
    ./cmd/backupos-pbs
) || die "Go build failed"
chmod 755 "$INSTALL_DIR/bin/backupos-pbs"
ok "backupos-pbs binary built"

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

# backupos-pbs (Go service) bind address. Read by /pbs/connect to show
# users how to point PVE at this server.
BACKUPOS_PBS_BIND=$PBS_BIND

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

# Generate internal API secret for cross-process auth (web ↔ pbs)
if ! grep -q '^BACKUPOS_INTERNAL_SECRET=' "$ENV_FILE" 2>/dev/null; then
  SECRET=$(openssl rand -hex 32)
  echo "BACKUPOS_INTERNAL_SECRET=${SECRET}" >> "$ENV_FILE"
  echo "[backupos] Generated BACKUPOS_INTERNAL_SECRET"
fi
if ! grep -q '^BACKUPOS_INTERNAL_URL=' "$ENV_FILE" 2>/dev/null; then
  echo "BACKUPOS_INTERNAL_URL=http://127.0.0.1:3093" >> "$ENV_FILE"
  echo "[backupos] Set BACKUPOS_INTERNAL_URL"
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

# ── 8b. systemd service for the Go PBS sidecar ───────────────────────────────
cat > /etc/systemd/system/${SERVICE_NAME}-pbs.service <<PBSSVCEOF
[Unit]
Description=BackupOS PBS protocol service
Documentation=https://github.com/dariusvorster/backupos
After=network-online.target $SERVICE_NAME.service
Wants=network-online.target

[Service]
Type=simple
User=$SVC_USER
Group=$SVC_USER
EnvironmentFile=$ENV_FILE
ExecStart=$INSTALL_DIR/bin/backupos-pbs \\
  --bind $PBS_BIND \\
  --cert $DATA_DIR/pbs/cert.pem \\
  --key $DATA_DIR/pbs/key.pem \\
  --db $DATA_DIR/backupos.db \\
  --pbs-root $DATA_DIR/pbs
Restart=on-failure
RestartSec=5
TimeoutStopSec=10

# Hardening
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full
ReadWritePaths=$DATA_DIR

StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME-pbs

[Install]
WantedBy=multi-user.target
PBSSVCEOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" "$SERVICE_NAME-pbs"
systemctl restart "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME-pbs"

# Give them a moment to start
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
  ok "Service $SERVICE_NAME started"
else
  log "Service $SERVICE_NAME may have failed. Check:  journalctl -u $SERVICE_NAME -n 50"
fi
if systemctl is-active --quiet "$SERVICE_NAME-pbs"; then
  ok "Service $SERVICE_NAME-pbs started"
else
  log "Service $SERVICE_NAME-pbs may have failed. Check:  journalctl -u $SERVICE_NAME-pbs -n 50"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
PUBLIC_URL_ACTUAL="$(grep '^BETTER_AUTH_URL=' "$ENV_FILE" | cut -d= -f2-)"

echo ""
echo "══════════════════════════════════════════════════════"
echo "  BackupOS installed successfully"
echo ""
echo "  Dashboard:    $PUBLIC_URL_ACTUAL"
echo "  PBS service:  https://<host>:8007/api2/json/version"
echo "  Logs (web):   journalctl -u $SERVICE_NAME -f"
echo "  Logs (pbs):   journalctl -u $SERVICE_NAME-pbs -f"
echo "  Status:       systemctl status $SERVICE_NAME $SERVICE_NAME-pbs"
echo "  Config:       $ENV_FILE"
echo "  Data:         $DATA_DIR"
echo ""
echo "  To update:    sudo bash $0 update"
echo "  To uninstall: sudo bash $0 uninstall"
echo "══════════════════════════════════════════════════════"
