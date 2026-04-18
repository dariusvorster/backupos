export async function GET(req: Request): Promise<Response> {
  const origin = new URL(req.url).origin
  const script = `#!/bin/bash
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

ARCH=$(uname -m)
case $ARCH in
  x86_64)  BINARY="backupos-agent-linux-x64"   ;;
  aarch64) BINARY="backupos-agent-linux-arm64"  ;;
  *) echo "Unsupported arch: $ARCH"; exit 1     ;;
esac

echo "Installing BackupOS agent ($ARCH)..."
curl -fsSL "$SERVER_URL/agent/$BINARY" -o /usr/local/bin/backupos-agent
chmod +x /usr/local/bin/backupos-agent

backupos-agent enroll --url "$SERVER_URL" --token "$TOKEN"
backupos-agent service install
backupos-agent service start

echo "BackupOS agent installed and running."
echo "Node is now visible in BackupOS dashboard."
`
  return new Response(script, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
