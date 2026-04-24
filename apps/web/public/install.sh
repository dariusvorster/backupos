#!/usr/bin/env bash
# BackupOS Agent Installer
# Usage: curl -fsSL https://your-server/install.sh | BACKUPOS_URL=wss://... BACKUPOS_TOKEN=... bash
set -euo pipefail

BACKUPOS_URL="${BACKUPOS_URL:?BACKUPOS_URL is required (e.g. wss://your-server/ws/agent)}"
BACKUPOS_TOKEN="${BACKUPOS_TOKEN:?BACKUPOS_TOKEN is required}"
INSTALL_DIR="${INSTALL_DIR:-/opt/backupos-agent}"
SERVICE_USER="${SERVICE_USER:-backupos}"

OS="$(uname -s)"
ARCH="$(uname -m)"

log()  { echo "[install] $*"; }
die()  { echo "[install] ERROR: $*" >&2; exit 1; }

# ── 1. Node.js ────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  log "Node.js not found — installing via NodeSource …"
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    yum install -y nodejs
  elif [[ "$OS" == "Darwin" ]]; then
    command -v brew &>/dev/null || die "Install Homebrew first: https://brew.sh"
    brew install node
  else
    die "Cannot install Node.js automatically. Install Node.js 22+ and re-run."
  fi
fi

NODE_VER="$(node --version | sed 's/v//' | cut -d. -f1)"
[[ "$NODE_VER" -ge 18 ]] || die "Node.js 18+ required (found $(node --version))"
log "Node.js $(node --version) ✓"

# ── 2. restic ─────────────────────────────────────────────────────────────────
if ! command -v restic &>/dev/null; then
  log "Installing restic …"
  RESTIC_VER="0.17.3"
  case "${OS}-${ARCH}" in
    Linux-x86_64)  RESTIC_PKG="restic_${RESTIC_VER}_linux_amd64.bz2" ;;
    Linux-aarch64) RESTIC_PKG="restic_${RESTIC_VER}_linux_arm64.bz2" ;;
    Darwin-x86_64) RESTIC_PKG="restic_${RESTIC_VER}_darwin_amd64.bz2" ;;
    Darwin-arm64)  RESTIC_PKG="restic_${RESTIC_VER}_darwin_arm64.bz2" ;;
    *)             die "Unsupported platform ${OS}-${ARCH}. Install restic manually." ;;
  esac
  RESTIC_URL="https://github.com/restic/restic/releases/download/v${RESTIC_VER}/${RESTIC_PKG}"
  curl -fsSL "$RESTIC_URL" | bunzip2 > /usr/local/bin/restic
  chmod +x /usr/local/bin/restic
  log "restic $(restic version | head -1) ✓"
fi

# ── 3. Agent files ────────────────────────────────────────────────────────────
log "Installing agent to ${INSTALL_DIR} …"
mkdir -p "$INSTALL_DIR"

# Write the agent entry-point (fetched from the server that served this script)
HTTP_BASE="${BACKUPOS_URL/ws:/http:}"
HTTP_BASE="${HTTP_BASE/wss:/https:}"
HTTP_BASE="${HTTP_BASE/\/ws\/agent/}"

cat > "${INSTALL_DIR}/agent.cjs" << 'AGENT_SCRIPT'
// BackupOS Agent — single-file bundle
// This file is generated at install time. To update, re-run install.sh.
AGENT_SCRIPT

# Download the pre-built agent bundle from the server
if curl -fsSL "${HTTP_BASE}/backupos-agent.cjs" -o "${INSTALL_DIR}/agent.cjs" 2>/dev/null; then
  log "Downloaded agent bundle ✓"
else
  # Fallback: install from npm (when published)
  log "Bundle not found — installing via npm …"
  npm install --prefix "$INSTALL_DIR" --omit=dev @backupos/agent 2>/dev/null \
    || die "Failed to install agent. Ensure the server is accessible or install manually."
  ln -sf "${INSTALL_DIR}/node_modules/@backupos/agent/dist/agent.js" "${INSTALL_DIR}/agent.cjs"
fi

# ── 4. Config file ────────────────────────────────────────────────────────────
cat > "${INSTALL_DIR}/.env" << EOF
BACKUPOS_URL=${BACKUPOS_URL}
BACKUPOS_TOKEN=${BACKUPOS_TOKEN}
RESTIC_BINARY_PATH=$(command -v restic)
EOF
chmod 600 "${INSTALL_DIR}/.env"
log "Config written ✓"

# ── 5. Service ────────────────────────────────────────────────────────────────
if [[ "$OS" == "Linux" ]]; then
  # Create dedicated user if missing
  if ! id "$SERVICE_USER" &>/dev/null; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
    log "Created system user ${SERVICE_USER} ✓"
  fi
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR"

  cat > /etc/systemd/system/backupos-agent.service << EOF
[Unit]
Description=BackupOS Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=$(command -v node) ${INSTALL_DIR}/agent.cjs
Restart=always
RestartSec=5
StartLimitBurst=5
StartLimitIntervalSec=60

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${INSTALL_DIR}

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now backupos-agent
  log "systemd service enabled and started ✓"
  log "Status: systemctl status backupos-agent"
  log "Logs:   journalctl -u backupos-agent -f"

elif [[ "$OS" == "Darwin" ]]; then
  PLIST_PATH="${HOME}/Library/LaunchAgents/com.backupos.agent.plist"
  NODE_BIN="$(command -v node)"
  AGENT_BIN="${INSTALL_DIR}/agent.cjs"

  cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.backupos.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${AGENT_BIN}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>BACKUPOS_URL</key>
    <string>${BACKUPOS_URL}</string>
    <key>BACKUPOS_TOKEN</key>
    <string>${BACKUPOS_TOKEN}</string>
    <key>RESTIC_BINARY_PATH</key>
    <string>$(command -v restic)</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${INSTALL_DIR}/agent.log</string>
  <key>StandardErrorPath</key>
  <string>${INSTALL_DIR}/agent.log</string>
</dict>
</plist>
EOF

  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  launchctl load -w "$PLIST_PATH"
  log "launchd service loaded ✓"
  log "Logs: tail -f ${INSTALL_DIR}/agent.log"

else
  log "Unrecognised OS — starting agent directly (not as a service)"
  log "Run manually: BACKUPOS_URL=${BACKUPOS_URL} BACKUPOS_TOKEN=<token> node ${INSTALL_DIR}/agent.cjs"
fi

log ""
log "BackupOS Agent installed successfully."
log "The agent will connect to: ${BACKUPOS_URL}"
