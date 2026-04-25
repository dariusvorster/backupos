export async function GET(req: Request): Promise<Response> {
  // Prefer the configured public URL over the request origin.
  // The request origin can be a Tailscale IP or HTTPS when the server only speaks HTTP.
  const configuredUrl = process.env['BETTER_AUTH_URL']
  const origin = configuredUrl ?? (() => {
    const u = new URL(req.url)
    return `http://${u.hostname}:${u.port || 80}`
  })()
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

# ── 1. NAS mount helpers (cifs-utils + nfs-common) ───────────────────────────
if command -v apt-get &>/dev/null; then
  apt-get install -y cifs-utils nfs-common 2>/dev/null || true
elif command -v yum &>/dev/null; then
  yum install -y cifs-utils nfs-utils 2>/dev/null || true
fi

# ── 2. Node.js ────────────────────────────────────────────────────────────────
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

# ── 3. restic ─────────────────────────────────────────────────────────────────
if ! command -v restic &>/dev/null; then
  log "Installing restic..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y restic
  elif command -v yum &>/dev/null; then
    sudo yum install -y restic
  else
    RESTIC_VER="0.17.3"
    case "\$(uname -m)" in
      x86_64)  RESTIC_PKG="restic_\${RESTIC_VER}_linux_amd64.bz2" ;;
      aarch64) RESTIC_PKG="restic_\${RESTIC_VER}_linux_arm64.bz2" ;;
      *)       die "Unsupported arch: \$(uname -m)" ;;
    esac
    RESTIC_URL="https://github.com/restic/restic/releases/download/v\${RESTIC_VER}/\${RESTIC_PKG}"
    curl -fsSL "\$RESTIC_URL" -o /tmp/restic.bz2 || die "Failed to download restic"
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
  restic version &>/dev/null || die "restic installed but cannot execute"
  log "restic installed ✓"
fi

# ── 4. Agent bundle ───────────────────────────────────────────────────────────
INSTALL_DIR=/opt/backupos-agent
mkdir -p "\$INSTALL_DIR"
log "Downloading agent..."
curl -fsSL "$SERVER_URL/agent/bundle.js" -o "\$INSTALL_DIR/agent.js" || die "Failed to download agent bundle from $SERVER_URL/agent/bundle.js"
log "Agent downloaded ✓"

# ── 5. Enroll ─────────────────────────────────────────────────────────────────
node "\$INSTALL_DIR/agent.js" enroll --url "$SERVER_URL" --token "\$TOKEN"
log "Enrolled ✓"

# ── 6. Service ────────────────────────────────────────────────────────────────
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
