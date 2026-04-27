# BackupOS

**One backup platform for your entire homelab.**

BackupOS is a self-hosted backup management platform built on [Restic](https://restic.net). Back up Proxmox VMs and LXCs, Linux hosts, Windows machines, Docker containers, databases, and NAS devices — from one dashboard, to one or more repositories, with YAML-defined restore specs that actually work.

---

## Features

- **Unified dashboard** — all repositories, jobs, agents, and restore specs in one place
- **Restic-native** — content-addressed storage, SHA-256 verified, deduplication, incremental-forever
- **Multi-backend** — S3, Cloudflare R2, Backblaze B2, SFTP, local filesystem, Rclone
- **Lightweight agents** — single Node.js bundle for Linux and macOS remote hosts, auto-installs as a system service
- **Hypervisor integration** — Proxmox VMs and LXCs via API
- **YAML restore specs** — define, version, and test your recovery procedure as code
- **DR Mode** — guided recovery wizard for files, databases, and full hosts
- **Monitors** — track backup health scores, detect missed jobs, alert on failures
- **Alert channels** — Discord, Slack, generic webhooks, email via SMTP
- **Snapshot browser** — browse and compare repository snapshots
- **Retention policies** — per-job or global keep-last/daily/weekly/monthly/yearly with automatic prune
- **Verification** — scheduled integrity checks with `restic check`
- **API tokens** — for CI/CD and scripting
- **Audit log** — full activity history

---

## Quick start (Docker)

**1. Copy the environment file and fill in the required values:**

```bash
cp .env.example .env
```

Edit `.env`:

```env
ENCRYPTION_KEY=        # openssl rand -hex 32
BETTER_AUTH_SECRET=    # openssl rand -hex 32
BETTER_AUTH_URL=http://localhost:3000
```

**2. Start the container:**

```bash
docker compose up -d
```

**3. Open BackupOS:**

```
http://localhost:3000
```

On first load you'll be prompted to create the admin account. After that, signup is disabled — additional users are managed from within the app.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ENCRYPTION_KEY` | Yes | 32-byte hex key for encrypting stored credentials. Generate: `openssl rand -hex 32` |
| `BETTER_AUTH_SECRET` | Yes | Secret for signing auth sessions. Generate: `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | Yes | Public URL of your BackupOS instance (used for auth callbacks) |
| `DATABASE_URL` | No | SQLite path. Defaults to `file:/app/data/backupos.db` |
| `RESTIC_BINARY_PATH` | No | Path to restic binary. Defaults to `restic` in PATH |
| `RESEND_API_KEY` | No | [Resend](https://resend.com) API key for email alerts |
| `ALERT_TO_EMAIL` | No | Default recipient address for email alerts |

---

## Exposing to the internet

If you want to access BackupOS outside your local network, put it behind a reverse proxy with HTTPS. Example with Caddy:

```
backupos.example.com {
    reverse_proxy localhost:3000
}
```

Update `BETTER_AUTH_URL` to match your public domain:

```env
BETTER_AUTH_URL=https://backupos.example.com
```

---

## Installing agents on remote hosts

The BackupOS agent is a lightweight Node.js process that runs on a remote server or container, executes backup jobs locally using a local restic binary, and streams results back to your BackupOS instance over a WebSocket connection.

### Prerequisites

- The remote host must be able to reach your BackupOS instance over HTTP/HTTPS
- Node.js 18+ (the installer will install it if missing)
- `restic` (the installer will install it if missing on Linux)

### 1. Generate an API token

In the BackupOS dashboard go to **Settings → API Tokens** and create a token. Copy it — you'll pass it to the installer.

### 2. Run the one-liner installer

On the remote host (Linux or macOS):

```bash
curl -fsSL https://your-backupos-url/install.sh | \
  BACKUPOS_URL=wss://your-backupos-url/ws/agent \
  BACKUPOS_TOKEN=<your-api-token> \
  bash
```

Replace `your-backupos-url` with the URL of your BackupOS instance (e.g. `backupos.example.com`).

The installer will:
1. Download the agent binary from your BackupOS instance
2. Install Node.js and restic if they are not already present
3. Register the agent as a **systemd** service (Linux) or **launchd** service (macOS) that starts on boot and auto-restarts on failure

### 3. Verify the agent connected

Back in the dashboard, go to **Agents** — the new host should appear within a few seconds with its hostname, IP, and live CPU/memory metrics.

### Installing in a Docker container

Add the agent to your container's entrypoint or as a sidecar service. The agent needs the `BACKUPOS_URL` and `BACKUPOS_TOKEN` environment variables:

```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y restic curl
RUN curl -fsSL https://your-backupos-url/backupos-agent.cjs -o /usr/local/bin/backupos-agent.cjs
CMD ["node", "/usr/local/bin/backupos-agent.cjs"]
```

Or with Docker Compose alongside your application:

```yaml
services:
  app:
    image: your-app

  backupos-agent:
    image: node:20-slim
    environment:
      BACKUPOS_URL: wss://backupos.example.com/ws/agent
      BACKUPOS_TOKEN: <your-api-token>
    volumes:
      - app_data:/data:ro   # mount the data you want to back up
    command: >
      sh -c "apt-get update -q && apt-get install -y -q restic &&
             curl -fsSL https://backupos.example.com/backupos-agent.cjs -o /agent.cjs &&
             node /agent.cjs"
    restart: unless-stopped

volumes:
  app_data:
```

### Manual install (no installer)

If you prefer to manage the process yourself:

```bash
# Download the agent
curl -fsSL https://your-backupos-url/backupos-agent.cjs -o backupos-agent.cjs

# Run it
BACKUPOS_URL=wss://your-backupos-url/ws/agent \
BACKUPOS_TOKEN=<your-api-token> \
node backupos-agent.cjs
```

The agent reconnects automatically with exponential backoff (1 s → 60 s) if the connection drops.

---

## Updating

```bash
docker compose pull && docker compose up -d
```

BackupOS runs database migrations automatically on startup. Agents update themselves on next install by re-running the one-liner.

---

## Building from source

**Requirements:** Node.js 22+, pnpm 9+

```bash
git clone https://github.com/dariusvorster/backupos
cd backupos
pnpm install
pnpm build
cp .env.example .env  # fill in required values
pnpm --filter @backupos/web start
```

### Build the Docker image locally

```bash
docker build -t backupos .
```

Multi-arch (requires Docker Buildx):

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t backupos .
```

---

## Data & backups

All BackupOS data lives in a single SQLite database at `/app/data/backupos.db` (mounted as a named volume by default). Back this up regularly — it holds your job configs, agent registrations, restore specs, and alert settings.

```bash
# One-line backup of the BackupOS database itself
docker exec backupos sqlite3 /app/data/backupos.db ".backup '/app/data/backupos.db.bak'"
```

---

## Releasing

Releases are tagged with semantic version (e.g. `v0.2.0`). Pushing a tag in `vX.Y.Z` format triggers two GitHub Actions workflows:

- `release-container-agent.yml` builds and publishes the agent image
- `docker-release.yml` builds and publishes the BackupOS server image

Both publish multi-arch (linux/amd64 + linux/arm64) to GitHub Container Registry:

- `ghcr.io/dariusvorster/backupos-agent:vX.Y.Z`
- `ghcr.io/dariusvorster/backupos-web:vX.Y.Z`

### First-publish visibility

When a container package is first created on ghcr.io, GitHub creates it with **private visibility** by default — even when the source repo is public. After the first successful publish of a new package name, the maintainer must manually change visibility to public:

1. Go to https://github.com/users/dariusvorster/packages/container/PACKAGE_NAME/settings
2. Scroll to the "Danger Zone" section
3. Click "Change visibility" → select "Public" → confirm by typing the package name

Subsequent publishes inherit public visibility — this is a one-time step per package.

### Cutting a release

1. Update `CHANGELOG.md` — move "Unreleased" entries to a new dated `## [X.Y.Z] - YYYY-MM-DD` section
2. Commit: `git commit -am "chore: update CHANGELOG for vX.Y.Z release"`
3. Tag and push: `git tag vX.Y.Z && git push --tags`
4. Wait for both workflows to complete (~5 min for agent, ~25 min for server image)
5. Create the GitHub Release: `gh release create vX.Y.Z --title "vX.Y.Z — YYYY-MM-DD" --notes-file <changelog-section> --latest`

---

## License

MIT
