#!/usr/bin/env bash
# BackupOS Server — native Linux installer
# Usage: bash server-install.sh [--url https://backupos.example.com] [--port 3093] [--source /path/to/repo]
set -eo pipefail

INSTALL_DIR=/opt/backupos
DATA_DIR=/var/lib/backupos
CONF_DIR=/etc/backupos
ENV_FILE=$CONF_DIR/server.env
SERVICE_NAME=backupos
PORT=3093
BRANCH=main
SOURCE_DIR=""
PUBLIC_URL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --url)    PUBLIC_URL="$2";   shift 2 ;;
    --port)   PORT="$2";         shift 2 ;;
    --branch) BRANCH="$2";       shift 2 ;;
    --source) SOURCE_DIR="$2";   shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

log()  { echo "[server-install] $*"; }
die()  { echo "[server-install] ERROR: $*" >&2; exit 1; }
rand() { openssl rand -hex 32 2>/dev/null || tr -dc 'a-f0-9' < /dev/urandom | head -c 64; }

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash server-install.sh"

# ── 1. Node.js ────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  log "Installing Node.js 22..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    yum install -y nodejs
  else
    die "Cannot install Node.js automatically — install Node.js 22+ and re-run"
  fi
fi
NODE_VER="$(node --version | sed 's/v//' | cut -d. -f1)"
[[ "$NODE_VER" -ge 18 ]] || die "Node.js 18+ required (found $(node --version))"
log "Node.js $(node --version) ✓"

# ── 2. pnpm ───────────────────────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  log "Installing pnpm..."
  corepack enable && corepack prepare pnpm@latest --activate
fi
log "pnpm $(pnpm --version) ✓"

# ── 3. tsx ────────────────────────────────────────────────────────────────────
if ! command -v tsx &>/dev/null; then
  log "Installing tsx..."
  npm install -g tsx
fi
log "tsx ✓"

# ── 4. restic ─────────────────────────────────────────────────────────────────
if ! command -v restic &>/dev/null; then
  log "Installing restic..."
  if command -v apt-get &>/dev/null; then
    apt-get install -y restic
  elif command -v yum &>/dev/null; then
    yum install -y restic
  else
    RESTIC_VER="0.17.3"
    case "$(uname -m)" in
      x86_64)  RESTIC_PKG="restic_${RESTIC_VER}_linux_amd64.bz2" ;;
      aarch64) RESTIC_PKG="restic_${RESTIC_VER}_linux_arm64.bz2" ;;
      *)       die "Unsupported arch: $(uname -m)" ;;
    esac
    curl -fsSL "https://github.com/restic/restic/releases/download/v${RESTIC_VER}/${RESTIC_PKG}" -o /tmp/restic.bz2
    if command -v bunzip2 &>/dev/null; then
      bunzip2 -k /tmp/restic.bz2 && mv /tmp/restic /usr/local/bin/restic
    elif command -v bzip2 &>/dev/null; then
      bzip2 -d -k /tmp/restic.bz2 && mv /tmp/restic /usr/local/bin/restic
    else
      die "No bzip2/bunzip2 found — install bzip2 and re-run"
    fi
    rm -f /tmp/restic.bz2
    chmod +x /usr/local/bin/restic
  fi
fi
restic version &>/dev/null || die "restic installed but cannot execute"
log "restic $(restic version | head -1) ✓"

# ── 5. Source code ────────────────────────────────────────────────────────────
if [[ -n "$SOURCE_DIR" ]]; then
  log "Using local source from $SOURCE_DIR..."
  [[ -d "$SOURCE_DIR" ]] || die "Source directory not found: $SOURCE_DIR"
  rsync -a --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='apps/web/.next' \
    --exclude='apps/web/public/agent/bundle.js.bak' \
    "$SOURCE_DIR/" "$INSTALL_DIR/"
else
  # Detect if we're running from inside the repo
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  if [[ -f "$REPO_ROOT/package.json" ]] && grep -q '"backupos"' "$REPO_ROOT/package.json" 2>/dev/null; then
    log "Detected repo at $REPO_ROOT — using as source..."
    rsync -a --delete \
      --exclude='.git' \
      --exclude='node_modules' \
      --exclude='apps/web/.next' \
      "$REPO_ROOT/" "$INSTALL_DIR/"
  else
    die "Run from inside the repo or pass --source /path/to/repo"
  fi
fi

# ── 6. Build ──────────────────────────────────────────────────────────────────
log "Installing dependencies..."
cd "$INSTALL_DIR"
pnpm install --frozen-lockfile

log "Building packages..."
pnpm --filter @backupos/db build
pnpm --filter @backupos/engine build
pnpm --filter @backupos/app-hooks build
pnpm --filter @backupos/hypervisors build
pnpm --filter @backupos/monitors build
pnpm --filter @backupos/restore build
pnpm --filter @backupos/agent-protocol build
pnpm --filter @backupos/api build
pnpm --filter @backupos/docs-content build

log "Building web app..."
pnpm --filter @backupos/web exec next build

log "Build complete ✓"

# ── 7. Data & config directories ──────────────────────────────────────────────
mkdir -p "$DATA_DIR" "$CONF_DIR"

# ── 8. Environment file ───────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  log "Generating environment file at $ENV_FILE..."

  if [[ -z "$PUBLIC_URL" ]]; then
    # Try to auto-detect the machine's primary IP
    DETECTED_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    PUBLIC_URL="http://${DETECTED_IP:-localhost}:${PORT}"
    log "No --url given, using $PUBLIC_URL (edit $ENV_FILE to change)"
  fi

  cat > "$ENV_FILE" <<EOF
# BackupOS Server environment
# Edit this file then restart: systemctl restart $SERVICE_NAME

NODE_ENV=production
PORT=$PORT
HOSTNAME=0.0.0.0

# Database (absolute path)
DATABASE_URL=file:$DATA_DIR/backupos.db

# Restic binary
RESTIC_BINARY_PATH=/usr/local/bin/restic

# Auth — CHANGE THESE if you rotate secrets (all existing sessions will be invalidated)
BETTER_AUTH_SECRET=$(rand)
BETTER_AUTH_URL=$PUBLIC_URL
ENCRYPTION_KEY=$(rand)
EOF
  chmod 600 "$ENV_FILE"
  log "Environment file created ✓"
else
  log "Environment file already exists at $ENV_FILE — skipping generation"
fi

# ── 9. systemd service ────────────────────────────────────────────────────────
cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=BackupOS Server
After=network.target
Wants=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR/apps/web
EnvironmentFile=$ENV_FILE
ExecStart=$(which tsx) $INSTALL_DIR/apps/web/server.ts
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

log ""
log "BackupOS Server installed and started."
log ""
log "  URL:    $(grep BETTER_AUTH_URL "$ENV_FILE" | cut -d= -f2-)"
log "  Logs:   journalctl -u $SERVICE_NAME -f"
log "  Status: systemctl status $SERVICE_NAME"
log "  Config: $ENV_FILE"
log ""
log "To update: run this script again from the repo directory."
