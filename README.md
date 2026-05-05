# BackupOS

**One backup platform for your entire homelab.**

BackupOS is a self-hosted backup management platform built on [Restic](https://restic.net). Back up Proxmox VMs and LXCs, Linux hosts, Windows machines, Docker / Compose stacks, databases, and NAS shares — from one dashboard, to one or more repositories, with YAML-defined restore specs that actually work when you need them.

> **Status: V1 launch candidate.** Active development. See [release notes](packages/docs-content/content/release-notes/index.mdx).

---

## Features

- **Unified dashboard** — every repository, job, agent, and restore spec in one place
- **Restic-native** — content-addressed storage, deduplication, incremental-forever, fully readable by the `restic` CLI on its own
- **Eight repository backends** — local filesystem, NFS, SMB / CIFS, SFTP, Amazon S3 (and S3-compatible), Cloudflare R2, Backblaze B2, Rclone
- **Eight source types** — filesystem, Compose project, Docker volume, database (PostgreSQL / MySQL / MariaDB / SQLite / Redis / MongoDB), Proxmox VM, Proxmox LXC, Windows VSS, NAS share
- **Cross-platform agents** — Linux (Node bundle, systemd) and Windows (native binary, Windows Service)
- **Hypervisor integration** — Proxmox VMs and LXCs via the Proxmox API
- **PBS protocol target** — point Proxmox VE at BackupOS as a Proxmox Backup Server-compatible target, no agent install on the Proxmox host required
- **YAML restore specs** — define, version, and rehearse your recovery procedure as code
- **DR Mode** — guided checklist that walks you through restore specs during an incident
- **Verification** — scheduled restore tests that prove backups are actually usable, not just present
- **Nine alert channels** — email, Slack, Discord, Telegram, Pushover, Gotify, ntfy, generic webhook, Twilio SMS
- **Cost forecasting** — per-repository storage growth tracking with projected monthly spend
- **Tamper-evident audit log** — SHA-256 hash chain across every privileged action, with forensic mode
- **OIDC SSO** — Authentik, Okta, Duo, plus local password + TOTP fallback
- **Encryption at rest** — every stored credential (alert channel secrets, repository passwords, OIDC client secrets, SMTP passwords) encrypted with a per-instance key

---

## Install

The recommended deployment is the **native installer** — it sets up both the web app and the PBS protocol service as systemd units. A Docker image is also provided for hosts where systemd isn't an option, but it ships only the web app (no PBS protocol service).

### Native installer (recommended)

Requirements: Linux host, root or sudo, Node.js 20+, pnpm 9+, Go 1.22+, restic 0.16+, openssl, rsync.

```bash
git clone https://github.com/dariusvorster/backupos.git ~/backupos
cd ~/backupos
sudo bash scripts/server-install.sh
```

The installer creates the `backupos` system user, builds the web app and the Go-based PBS protocol service, generates `/etc/backupos/server.env` with random secrets, and installs systemd units for `backupos` (web, port 3093) and `backupos-pbs` (PBS protocol, port 8007).

Open `http://<host>:3093` and create your admin account — the first signup is automatically the admin. After that, additional users join via invite from **Settings → Users**.

Full guide: [docs/getting-started/install-self-hosted](packages/docs-content/content/getting-started/install-self-hosted.mdx).

### Docker (web app only, no PBS protocol)

```bash
cp .env.example .env
# Edit .env — set ENCRYPTION_KEY, BETTER_AUTH_SECRET, BETTER_AUTH_URL
docker compose up -d
```

Open `http://localhost:3000`.

Use this if you don't need to back up Proxmox via the PBS protocol target. For agent-driven and hypervisor-API backups it's identical to the native install.

---

## Enroll your first agent

In the BackupOS UI: **Agents → Enroll agent**. Name the agent (typically the hostname), click **Generate token & enroll**, and copy the install command shown on the next page.

Run it on the host you want to back up:

```bash
curl -fsSL https://your-backupos-host:3093/install.sh \
  | sudo BACKUPOS_TOKEN=<token-from-ui> bash
```

The installer drops the agent at `/opt/backupos-agent/`, registers a `backupos-agent.service` systemd unit, and connects out to the BackupOS server over WebSocket. No inbound firewall rules are required on the agent host.

For Windows, the agent detail page also shows a PowerShell snippet (`iwr ... | iex`) that installs `backupos-agent.exe` as a Windows Service.

Full guide: [docs/getting-started/enrol-agent](packages/docs-content/content/getting-started/enrol-agent.mdx).

---

## Add a repository

**Repositories → Add repository** in the UI. Pick a backend, fill in the credentials, click **Test connection** (or **Test mount** for NFS / SMB). Save, then click into the new repository and **Initialize repository** with a strong password.

Strongly recommended: enable **escrow** on the repository detail page after initialization. It encrypts the repository password with a master passphrase you set; if you ever lose the password, you can recover it from **Settings**. Without escrow, a forgotten repository password means every snapshot in that repository is permanently unreadable.

Full guide: [docs/getting-started/connect-repository](packages/docs-content/content/getting-started/connect-repository.mdx).

---

## Updating

### Native install

```bash
cd ~/backupos
git pull origin main
sudo bash /opt/backupos/scripts/server-install.sh update --source ~/backupos
```

The installer self-updates, stops the services, rebuilds, and restarts. Existing data, secrets, and config are preserved.

### Docker

```bash
docker compose pull
docker compose up -d
```

Database migrations run automatically on startup.

### Agents

Re-run the original install command on the agent host. The install script is idempotent — it upgrades in place and preserves the existing token. Or, on Linux:

```bash
sudo bash /opt/backupos-agent/install.sh update
```

---

## Architecture

- **Web app** — Next.js + tRPC, runs as `backupos.service`. Stores everything in a single SQLite file at `/var/lib/backupos/backupos.db`.
- **PBS protocol service** — Go binary, runs as `backupos-pbs.service` on port 8007. Speaks the [Proxmox Backup Server](https://pbs.proxmox.com) wire protocol so PVE can write backups directly to BackupOS without an agent on the Proxmox host. Shares the SQLite database with the web app.
- **Agents** — Linux: Node.js bundle (`agent.js`) at `/opt/backupos-agent/`. Windows: native binary (`backupos-agent.exe`) under Program Files. Both speak the same WebSocket protocol.
- **Repositories** — standard Restic-compatible storage. BackupOS does not introduce a proprietary format.

Full architecture: [docs/introduction/architecture-overview](packages/docs-content/content/introduction/architecture-overview.mdx).

---

## Building from source

```bash
git clone https://github.com/dariusvorster/backupos
cd backupos
pnpm install
pnpm --filter @backupos/db build
pnpm --filter @backupos/engine build
pnpm --filter @backupos/agent build
pnpm --filter @backupos/web exec next build
```

The Go-based PBS protocol service is built separately:

```bash
cd services/backupos-pbs
go build -o ../../bin/backupos-pbs ./cmd/backupos-pbs
```

The native installer wraps both build paths in `scripts/server-install.sh`.

---

## License

To be confirmed before V1 GA. The planned licence is AGPL-3.0 (open source) plus a commercial license for organizations that prefer not to comply with AGPL terms.

---

## Status and roadmap

V1 launch candidate. Tracked in [issue #73](https://github.com/dariusvorster/backupos/issues/73) and the V1 milestone on the issue tracker.

Known scope deferred to V1.x:

- XCP-ng support via XAPI / CBT
- Cloud sync tier (currently no managed cloud product — BackupOS is self-hosted only)
- Licensing / paid tier infrastructure
- macOS agent
- Restore feature gaps tracked in issues #30–#32, #230, #231

Issues and feedback welcome at [github.com/dariusvorster/backupos/issues](https://github.com/dariusvorster/backupos/issues).
