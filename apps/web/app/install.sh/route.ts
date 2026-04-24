export async function GET(req: Request): Promise<Response> {
  const origin = new URL(req.url).origin
  const script = `#!/usr/bin/env bash
set -euo pipefail

SERVER_URL="${origin}"
TOKEN=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --url)   SERVER_URL="$2"; shift 2 ;;
    --token) TOKEN="$2";      shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$TOKEN" ]]; then
  echo "Usage: curl -fsSL $SERVER_URL/install.sh | bash -s -- --token TOKEN"
  exit 1
fi

log() { echo "[install] $*"; }
die() { echo "[install] ERROR: $*" >&2; exit 1; }

# ── 1. Node.js ────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  log "Node.js not found — installing via NodeSource..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    yum install -y nodejs
  else
    die "Cannot install Node.js automatically. Install Node.js 18+ and re-run."
  fi
fi
NODE_VER="$(node --version | sed 's/v//' | cut -d. -f1)"
[[ "$NODE_VER" -ge 18 ]] || die "Node.js 18+ required (found $(node --version))"
log "Node.js $(node --version) ✓"

# ── 2. restic ─────────────────────────────────────────────────────────────────
if ! command -v restic &>/dev/null; then
  log "Installing restic..."
  RESTIC_VER="0.17.3"
  case "$(uname -m)" in
    x86_64)  RESTIC_PKG="restic_\${RESTIC_VER}_linux_amd64.bz2" ;;
    aarch64) RESTIC_PKG="restic_\${RESTIC_VER}_linux_arm64.bz2" ;;
    *)       die "Unsupported arch: $(uname -m)" ;;
  esac
  RESTIC_URL="https://github.com/restic/restic/releases/download/v\${RESTIC_VER}/\${RESTIC_PKG}"
  if command -v bunzip2 &>/dev/null; then
    curl -fsSL "\$RESTIC_URL" | bunzip2 > /usr/local/bin/restic
  else
    curl -fsSL "\$RESTIC_URL" | bzip2 -d > /usr/local/bin/restic
  fi
  chmod +x /usr/local/bin/restic
  log "restic installed ✓"
fi

# ── 3. Agent bundle ───────────────────────────────────────────────────────────
INSTALL_DIR=/opt/backupos-agent
mkdir -p "\$INSTALL_DIR"
log "Downloading agent..."
curl -fsSL "$SERVER_URL/agent/bundle.js" -o "\$INSTALL_DIR/agent.js" || die "Failed to download agent bundle from $SERVER_URL/agent/bundle.js"
log "Agent downloaded ✓"

# ── 4. Enroll ─────────────────────────────────────────────────────────────────
node "\$INSTALL_DIR/agent.js" enroll --url "$SERVER_URL" --token "\$TOKEN"
log "Enrolled ✓"

# ── 5. Service ────────────────────────────────────────────────────────────────
node "\$INSTALL_DIR/agent.js" service install
node "\$INSTALL_DIR/agent.js" service start
log "Service started ✓"

log ""
log "BackupOS Agent installed successfully."
log "Logs:   journalctl -u backupos-agent -f"
log "Status: systemctl status backupos-agent"
`
  return new Response(script, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
