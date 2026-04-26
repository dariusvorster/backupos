# BackupOS Phase B — Container Agent + Compose-Stack Source

> **Status:** Spec, ready for implementation.
> **Prerequisite:** Phase A must be green before Phase B begins. See `Phase-A-Host-Agent-Stabilization.md`. The acceptance gate is five clean filesystem backup-and-restore cycles plus three failure-mode tests passing on Dockee01.
> **Estimated effort:** 4-5 days focused.
> **Branch:** `feat/phase-b-container-agent`
> **Pitch:** Velero-shaped backup for Docker/Podman compose stacks — self-hosted, free, ARM-compatible, app-aware where it matters.

---

## What this enables

A user runs one Docker compose file on their homelab host. BackupOS picks up the agent automatically, sees every compose stack on the host, lets the user pick a stack and choose what to back up within it (volumes, bind mounts, compose file, env files, labels). Per-service quiescence: databases use app-aware hooks, content services back up while running, fragile services briefly stop. The whole stack is captured atomically per-service into one Restic snapshot tagged with the stack name. Restore puts everything back where it was.

Works on x86 servers, Raspberry Pi 4/5, generic ARM SBCs.

---

## Core architectural decisions (locked)

These come from earlier conversation. Don't relitigate.

1. **One agent binary, capability-detected.** The same agent code that runs on the host (Phase A) also runs in the container. It does NOT have `--mode` flags. At startup it inspects its environment (filesystem visibility, Docker socket reachability, available client tools) and reports capabilities to the server in `agent_hello`. The server uses the capabilities list to decide which jobs are dispatchable to which agent.

2. **Container deployment via socket proxy.** Never mount `/var/run/docker.sock` directly into the agent container. Always use `tecnativa/docker-socket-proxy` with a tightly-scoped allow-list. The proxy runs as a sidecar.

3. **Stack as the consistency boundary.** A backup job targets one or more compose stacks. Each stack is captured as one logical unit. Items within a stack (volumes, bind mounts, compose file, etc.) are toggleable but the unit of "which restic snapshot is this" is the stack.

4. **Per-service quiescence.** Within a stack, each service picks its own quiescence strategy: none, pause, stop, or app-hook. Safe defaults are auto-detected from the image name. User can override.

5. **Hook execution from outside the target.** Database hooks (pg_dump, mysqldump, redis-cli BGSAVE, sqlite3 .backup) run in the agent container against the target service via the compose network. Agent image bundles client tools. We do NOT enable `EXEC=1` on the socket proxy in V1.

6. **Multi-arch:** linux/amd64, linux/arm64, linux/arm/v7. Pi 3, Pi 4, Pi 5, x86, generic ARM.

7. **No filesystem snapshots in V1.** btrfs/ZFS snapshot acceleration is a V2 optimization. V1 ships with the four-strategy quiescence model and ships everywhere.

---

## Architecture diagram

```
┌─────────────────────────────────────────────────────────┐
│                  Homelab host (Dockee01)                │
│                                                         │
│  ┌────────────────────────┐  ┌──────────────────────┐   │
│  │ Docker socket proxy    │  │ BackupOS agent       │   │
│  │ (tecnativa)            │  │ (container)          │   │
│  │                        │  │                      │   │
│  │ Whitelist:             │◄─┤ Connects: WS to      │   │
│  │  CONTAINERS=1          │  │   BackupOS server    │   │
│  │  IMAGES=1              │  │ Capabilities:        │   │
│  │  NETWORKS=1            │  │   docker, apphooks   │   │
│  │  VOLUMES=1             │  │ Mounts:              │   │
│  │  POST=1                │  │   /var/lib/docker/   │   │
│  │ Denies:                │  │     volumes (ro)     │   │
│  │  EXEC, SWARM, INFO,    │  │   <bind paths> (ro)  │   │
│  │  SECRETS, BUILD        │  │   /backup-staging    │   │
│  └────────────────────────┘  │     (rw, tmpfs)      │   │
│           ▲                  └──────────┬───────────┘   │
│           │                             │               │
│           │ tcp://socket-proxy:2375     │ Internal      │
│           │ (allow-listed API)          │ network       │
│           │                             │               │
│  ┌────────┴─────────────────────────────┴───────────┐   │
│  │           Docker Engine (host)                    │   │
│  │  Other compose stacks: proxyos-app, dockhand, ...│   │
│  └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
            │
            │ WebSocket: ws://backupos:3093/ws/agent
            ▼
┌─────────────────────────────────────────────────────────┐
│ BackupOS server                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Item 1 — Capability detection (replaces "modes")

### What it is

At startup, the agent runs a series of probes to determine what it can do in its current environment. The result is a capabilities array sent to the server in `agent_hello`.

### Implementation

`packages/agent/src/capabilities.ts`:

```typescript
export type Capability =
  | 'filesystem'              // can read host filesystem paths (e.g., /etc, /home)
  | 'docker'                  // can reach Docker API
  | 'podman'                  // can reach Podman API
  | 'vss'                     // Windows VSS (host agent on Windows)
  | 'apphook:postgres'        // pg_dump available
  | 'apphook:mysql'           // mysqldump available
  | 'apphook:redis'           // redis-cli available
  | 'apphook:sqlite'          // sqlite3 available
  | 'hypervisor:proxmox'      // can reach Proxmox API (host agent on Proxmox node)

export async function detectCapabilities(): Promise<Capability[]> {
  const caps: Capability[] = []

  if (await canReadHostFilesystem()) caps.push('filesystem')
  if (await canReachDocker()) caps.push('docker')
  if (await canReachPodman()) caps.push('podman')
  if (process.platform === 'win32' && await hasVSS()) caps.push('vss')

  if (await binaryExists('pg_dump'))    caps.push('apphook:postgres')
  if (await binaryExists('mysqldump'))  caps.push('apphook:mysql')
  if (await binaryExists('redis-cli'))  caps.push('apphook:redis')
  if (await binaryExists('sqlite3'))    caps.push('apphook:sqlite')

  return caps
}

async function canReachDocker(): Promise<boolean> {
  const url = process.env.DOCKER_HOST ?? 'unix:///var/run/docker.sock'
  // For container deployment, DOCKER_HOST will be tcp://socket-proxy:2375
  try {
    await dockerodeClient(url).ping()
    return true
  } catch {
    return false
  }
}

async function binaryExists(name: string): Promise<boolean> {
  try {
    await execFile(name, ['--version'], { timeout: 2000 })
    return true
  } catch {
    return false
  }
}
```

### Server-side use

When dispatching a job, the server checks the target agent's capabilities against the job's source type:

```typescript
const requiredCapability = capabilityForSourceType(job.sourceType)
if (!agent.capabilities.includes(requiredCapability)) {
  return { ok: false, reason: 'agent_lacks_capability', detail: `agent ${agent.id} cannot handle ${job.sourceType}` }
}
```

`capabilityForSourceType`:
- `filesystem` → `'filesystem'`
- `docker_volume` (legacy, deprecated) → `'docker'`
- `compose_project` (new in Phase B) → `'docker'` or `'podman'`
- `database` → corresponding `'apphook:*'`
- `proxmox_vm` / `proxmox_lxc` → `'hypervisor:proxmox'`

### Schema changes

`agents.capabilities` was already added in Phase A as a JSON text column. No new schema work for this item.

---

## Item 2 — Container agent image and compose deployment

### Image

Build a multi-arch image at `ghcr.io/<org>/backupos-agent:<version>` with manifests for:
- linux/amd64
- linux/arm64
- linux/arm/v7

Image base: `node:22-alpine` (or `node:22-slim` if alpine causes pain with arm/v7 and node-gyp). Pi 4 with 4GB+ runs Alpine Node fine; Pi 3 with 1GB is tight but workable.

Image must contain:
- Compiled agent bundle (same code as host agent)
- Restic binary (pinned version, matching architecture)
- Database client tools: `postgresql-client`, `mariadb-client` (covers MySQL too), `redis-tools`, `sqlite`
- Standard utilities: `tar`, `gzip`, `xz` (in case of pre-archive transforms)
- `tini` as PID 1 for signal forwarding

Image size budget: <250MB compressed per arch. Alpine + bundled tools should land around 180-220MB.

### CI build

GitHub Actions matrix: build amd64 and arm64 natively (use larger runners if available); use QEMU emulation for arm/v7. Tag pushes:
- `latest` (only on main)
- `v<semver>` (on tagged releases)
- `sha-<short>` (on every commit, for testing)

### Reference compose file

Distributed to users as a copy-paste deployment recipe. Lives at `apps/web/public/agent/docker-compose.yml` (servable via the web UI).

```yaml
# backupos-agent compose — paste this on any host you want to back up
services:
  socket-proxy:
    image: tecnativa/docker-socket-proxy:0.3
    container_name: backupos-socket-proxy
    restart: unless-stopped
    privileged: true
    environment:
      # Whitelist — only what the agent actually needs
      CONTAINERS: 1
      IMAGES: 1
      NETWORKS: 1
      VOLUMES: 1
      POST: 1
      # Everything else explicitly denied
      EXEC: 0
      BUILD: 0
      INFO: 0
      SWARM: 0
      SECRETS: 0
      NODES: 0
      SERVICES: 0
      CONFIGS: 0
      DISTRIBUTION: 0
      PLUGINS: 0
      SESSION: 0
      SYSTEM: 0
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - backupos-internal

  agent:
    image: ghcr.io/<org>/backupos-agent:latest
    container_name: backupos-agent
    restart: unless-stopped
    depends_on:
      - socket-proxy
    environment:
      BACKUPOS_URL: ${BACKUPOS_URL}            # ws://backupos.local:3093/ws/agent
      BACKUPOS_TOKEN: ${BACKUPOS_TOKEN}        # generated during enrollment
      DOCKER_HOST: tcp://socket-proxy:2375     # the agent talks to Docker via the proxy
      RESTIC_BINARY_PATH: /usr/local/bin/restic
    volumes:
      # Read-only: all volumes the user wants to back up
      - /var/lib/docker/volumes:/var/lib/docker/volumes:ro
      # Read-only: any bind-mount paths the user wants visible (user adds these)
      # - /home/user/configs:/host/home/user/configs:ro
      # Writable staging area for app-hook dumps before they get into the restic snapshot
      - /tmp/backupos-staging:/staging:rw
    networks:
      - backupos-internal
      # External networks for app-hooks must be added per-stack:
      # - proxyos-app_default

networks:
  backupos-internal:
    driver: bridge
```

### Deployment UX

The web UI's "Add agent" page detects the user is on a Docker host and offers:

1. **Host agent** (existing): `curl | bash` install script
2. **Container agent** (new): pre-filled compose YAML + a generated token, downloadable as `.env` and `docker-compose.yml`. User pastes both onto the host and runs `docker compose up -d`.

The generated token must be unique per agent enrollment, encrypted at rest in the BackupOS server's DB (reuse the encryption helper from Phase A's internal-token work — Node `crypto` AES-256-GCM, key stored at `/var/lib/backupos/internal-token`).

### App-hook network attachment

For the agent container to reach a target service like `proxyos-app_postgres`, it must be attached to that stack's network. We can't auto-attach because we don't know in advance which stacks the user wants to back up.

V1 approach: at job-creation time, the BackupOS UI tells the user "to back up the postgres service in proxyos-app, attach the backupos-agent container to the `proxyos-app_default` network" and shows the exact CLI command. User runs:

```bash
docker network connect proxyos-app_default backupos-agent
```

V2 (deferred): the agent has API access to attach itself to networks via the socket proxy (would require enabling NETWORKS POST on the proxy, which we'd accept).

---

## Item 3 — `compose_project` source type

### Schema

Extend the `source_type` enum in `backup_jobs`:

```typescript
type SourceType =
  | 'filesystem'
  | 'docker_volume'         // DEPRECATED — kept for migration, not exposed in new-job UI
  | 'compose_project'       // NEW
  | 'database'
  | 'proxmox_vm'
  | 'proxmox_lxc'
  | 'windows_system'
  // ...
```

The `source_config` JSON for `compose_project`:

```typescript
type ComposeProjectConfig = {
  projectName: string                // 'proxyos-app' — Docker Compose project name
  composeFilePath?: string           // path inside agent container, e.g. '/host/home/user/proxyos-app/docker-compose.yml'
                                     // optional; if omitted, captured from container labels
  services: ComposeServiceConfig[]
  includeComposeFile: boolean        // default true
  includeEnvFiles: boolean           // default true
  redactSecretsInEnvFiles: boolean   // default true
  includeContainerLabels: boolean    // default true
  includeNetworkMetadata: boolean    // default true
}

type ComposeServiceConfig = {
  serviceName: string                // 'postgres'
  included: boolean                  // user can untick services
  quiescence: 'none' | 'pause' | 'stop' | 'apphook'
  apphookType?: 'postgres' | 'mysql' | 'redis' | 'sqlite'
  apphookConfig?: {
    // app-specific connection details
    // for postgres: { host, port, user, passwordEnv, database? }
    // for mysql:    { host, port, user, passwordEnv, database? }
    // for redis:    { host, port, passwordEnv? }
    // for sqlite:   { dbPath: '/var/lib/.../db.sqlite' (path inside the target container's volume) }
  }
  includedVolumes: string[]          // names of volumes to back up; if empty, ALL named volumes
  includedBindMounts: string[]       // host paths or volume mount targets; if empty, ALL bind mounts
}
```

### Auto-discovery

When the user picks "Compose project" as source type and selects a `projectName`, the agent is queried (via internal-dispatch) to enumerate the stack:

```
list_compose_project request:
  { type: 'list_compose_project', requestId, projectName: 'proxyos-app' }

list_compose_project response:
  {
    type: 'compose_project_listing',
    requestId,
    project: {
      name: 'proxyos-app',
      composeFilePath: '/host/home/user/proxyos-app/docker-compose.yml',
      services: [
        {
          name: 'postgres',
          image: 'postgres:16-alpine',
          containerStatus: 'running',
          volumes: [
            { type: 'volume', name: 'proxyos-app_postgres-data', target: '/var/lib/postgresql/data' },
          ],
          binds: [],
          envFiles: ['.env'],
          networks: ['proxyos-app_default'],
          labels: { ... },
        },
        // ... caddy, redis, etc.
      ],
    },
  }
```

The UI populates the per-service config form with these results. Auto-applied defaults from the image name:

| Image pattern | Default quiescence | Default apphook |
|---|---|---|
| `postgres*`, `postgis*` | `apphook` | `postgres` |
| `mysql*`, `mariadb*` | `apphook` | `mysql` |
| `redis*` | `apphook` | `redis` |
| `nginx*`, `caddy*`, `traefik*` | `none` | — |
| `plex*`, `jellyfin*`, `emby*` | `none` | — |
| (anything else) | `stop` | — |

User can override every default before saving.

---

## Item 4 — Backup execution flow (the main code path)

### Server side: dispatch

When `triggerJob` runs for a `compose_project` job, it dispatches via the internal HTTP bridge (Phase A Item 2):

```typescript
await dispatchToAgent(job.agentId!, {
  type: 'run_compose_backup',
  jobId: job.id,
  runId,
  config: composeProjectConfig,        // serialized ComposeProjectConfig
  repoUrl, repoPassword, envVars,      // restic repo info, same as existing run_backup
})
```

### Agent side: orchestration

In `packages/agent/src/handlers/composeBackup.ts`:

```
1. Receive run_compose_backup
2. Validate: project exists, all services exist, all named volumes exist
3. For each included service, in dependency order (use compose's depends_on):
   a. Apply quiescence:
      - 'none':    do nothing
      - 'pause':   docker pause <containerId>
      - 'stop':    docker stop <containerId>
      - 'apphook': run hook (e.g., pg_dump) → write dump to /staging/<service>.dump
   b. (No backup yet — just put the service in a quiet state)
4. Once all services are quiesced (or have produced their hook dumps):
   a. Run ONE restic backup invocation
   b. Paths:
      - For each named volume in included list: /var/lib/docker/volumes/<volName>/_data
      - For each bind mount in included list: <agent-mounted host path>
      - The compose file (copy to /staging first if needed): /staging/<projectName>/docker-compose.yml
      - Each env file (with secrets redacted if requested): /staging/<projectName>/<envFileName>
      - The metadata snapshot (labels, networks): /staging/<projectName>/metadata.json
      - The app-hook dumps: /staging/<service>.dump
   c. Tags: ['compose:<projectName>', 'job:<jobId>', 'host:<hostname>']
5. After restic completes successfully:
   a. For each service that was paused or stopped, resume:
      - 'pause':  docker unpause <containerId>
      - 'stop':   docker start <containerId>
   b. Wait for each service to report healthy (container status: running, optionally healthcheck: healthy with timeout)
6. Clean up /staging
7. Send backup_complete to server
```

If anything in steps 3-5 fails, the agent MUST attempt to resume all paused/stopped services before reporting `backup_failed`. The agent must not leave the user's stack down.

### App-hook implementations

`packages/app-hooks/postgres.ts`:

```typescript
export async function postgresHook(cfg: PostgresHookConfig): Promise<string> {
  const dumpPath = `/staging/${cfg.serviceName}.dump`
  const args = [
    '-h', cfg.host,
    '-p', String(cfg.port ?? 5432),
    '-U', cfg.user,
    '--format=custom',
    '--file', dumpPath,
  ]
  if (cfg.database) args.push(cfg.database)

  await execFile('pg_dump', args, {
    env: { ...process.env, PGPASSWORD: process.env[cfg.passwordEnv!] ?? '' },
    timeout: 30 * 60 * 1000,  // 30 min
  })
  return dumpPath
}
```

Mirror for mysql (mysqldump --single-transaction), redis (redis-cli BGSAVE then copy /data/dump.rdb out via a shared volume), sqlite (sqlite3 .backup command).

`cfg.host` is the target container's network address — `<projectName>_<serviceName>` resolves via Docker's compose-network DNS once the agent is attached to that network. `cfg.passwordEnv` names an env var the user has set on the agent container (e.g., `PROXYOS_POSTGRES_PASSWORD`). The UI documents this clearly.

### Secrets redaction

If `redactSecretsInEnvFiles=true`, env files are processed before being copied to staging:

```typescript
function redactEnvFile(content: string): string {
  return content.split('\n').map(line => {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (!m) return line
    const [, key, value] = m
    if (looksLikeSecret(key)) {
      return `${key}=<REDACTED>`
    }
    return line
  }).join('\n')
}

function looksLikeSecret(key: string): boolean {
  return /(PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL|PRIVATE)/i.test(key)
}
```

Conservative: redacts anything that smells secret. User can disable redaction in job config if they trust their backup destination (e.g., E2E-encrypted Restic to local-only repo).

---

## Item 5 — Restore flow

### Restore unit

A restore is per-stack-snapshot. UI flow:

1. User browses snapshots tagged `compose:<projectName>`
2. Picks one
3. Picks restore target: the same host (most common) or a different host with the same agent capability
4. Picks restore mode:
   - **In-place** — overwrite existing volumes, replace running stack
   - **Side-by-side** — restore to a new project name (e.g., `proxyos-app-restored-2026-04-26`)
5. Reviews what will be restored (list of volumes, the compose file, env files, labels)
6. Confirms

### Restore execution

Agent side:

```
1. Receive run_compose_restore message
2. If in-place: docker compose -p <projectName> down  (stop the running stack)
3. For each volume in the snapshot:
   - Ensure the named volume exists (docker volume create if needed)
   - restic restore --include /var/lib/docker/volumes/<volName>/_data --target /
4. Restore bind-mount paths to their original locations
5. Restore /staging/<projectName>/docker-compose.yml to its original path (or to a new path if side-by-side)
6. Restore env files
7. For each app-hook dump:
   - Bring up just that service (docker compose up -d <serviceName>)
   - Wait for it to be healthy
   - Run the hook in restore mode (pg_restore, mysql import, redis-cli flushall + restore .rdb, sqlite3 < dump)
8. docker compose -p <projectName> up -d  (bring everything up)
9. Wait for healthchecks
10. Send restore_complete to server
```

Side-by-side mode skips step 2 and uses the new project name in steps 5 and 8. Steps 7-9 use the new project name.

### Failures during restore

If anything fails during restore, the agent MUST:
- Leave any partially-restored data in place (no auto-cleanup)
- Attempt to bring the original stack back up if in-place restore was interrupted
- Report a detailed `restore_failed` to the server with which step failed

The user gets a clear error and can retry, restore manually, or contact support. We never delete the original stack's data without successful completion.

---

## Item 6 — UI changes

### New job creation flow for `compose_project`

```
Step 1: Pick agent (must have 'docker' capability)
Step 2: Pick stack (auto-discovered list from list_compose_project)
Step 3: Configure per-service:

  ┌─────────────────────────────────────────────────────────┐
  │ Stack: proxyos-app                                      │
  │                                                         │
  │ Services:                                               │
  │ ☑ caddy        Quiescence: [None        ▾]              │
  │                Volumes: ☑ caddy-data ☑ caddy-config     │
  │                                                         │
  │ ☑ postgres     Quiescence: [App hook    ▾]              │
  │                Hook: postgres   DB: proxyos             │
  │                Password env var: PROXYOS_POSTGRES_PWD   │
  │                Volumes: ☑ postgres-data                 │
  │                                                         │
  │ ☑ proxyos      Quiescence: [Stop        ▾]              │
  │                Volumes: ☑ proxyos-data                  │
  │                                                         │
  │ Stack-level options:                                    │
  │ ☑ Include compose file                                  │
  │ ☑ Include env files                                     │
  │   ☑ Redact secrets                                      │
  │ ☑ Include container labels                              │
  │ ☑ Include network metadata                              │
  │                                                         │
  │ [ Apply safe defaults ]   [ Cancel ]   [ Save job ]     │
  └─────────────────────────────────────────────────────────┘

Step 4: Schedule (existing UI)
Step 5: Repository (existing UI)
```

### Run-detail page additions

For runs of `compose_project` jobs, the live run view shows:

```
Phase: Quiescing services    Service: postgres    Strategy: pg_dump
Phase: Backing up files      Files: 1234 / 5678   Bytes: 234 MB / 1.2 GB
Phase: Resuming services     Service: caddy       Status: healthy
```

Replaces the generic "Phase: scanning" with stack-aware progress.

### Restore wizard

New page at `/restore/compose`. Browse snapshots, pick one, configure restore mode, preview, confirm.

---

## Item 7 — Migration: deprecate `docker_volume` source type

### What `docker_volume` did before

Per Phase A's diagnosis: jobs with `source_type='docker_volume'` were dispatched to the host agent, which tried to read `/var/lib/docker/volumes/<vol>/_data` directly on the host running BackupOS (wrong host) and silently fell through to a broken local execution path.

### Migration plan

1. Existing `docker_volume` jobs are NOT auto-migrated to `compose_project`. We don't have enough info to do it correctly (no quiescence config, no app-hook config, no service mapping).
2. Existing `docker_volume` jobs continue to work via the host agent if Phase A is deployed and an agent with `docker` capability is reachable on the right host. The behavior is fixed (no silent local fallback), but it's still a volume-only backup with no app awareness.
3. The new-job UI no longer offers `docker_volume` as a source type. It's replaced by `compose_project`.
4. Job-detail page on existing `docker_volume` jobs shows a banner: "This job uses the deprecated docker_volume source type. We recommend migrating to a compose_project job for app-aware backups." with a "Migrate" button that opens the compose_project wizard pre-filled with what we can infer.
5. After 2 minor releases of warning, `docker_volume` is removed entirely.

dockee01 (your test job) probably has `source_type='docker_volume'`. After Phase A merges, you'll be able to manually delete that job and recreate it as `compose_project` once Phase B ships.

---

## Item 8 — Multi-arch build and ARM testing

### CI matrix

`.github/workflows/agent-image.yml`:

```yaml
jobs:
  build-amd64:
    runs-on: ubuntu-latest
    steps: [build linux/amd64 native]
  build-arm64:
    runs-on: ubuntu-22.04-arm  # or self-hosted Pi/Ampere
    steps: [build linux/arm64 native]
  build-armv7:
    runs-on: ubuntu-latest
    steps: [build linux/arm/v7 via QEMU]
  manifest:
    needs: [build-amd64, build-arm64, build-armv7]
    steps: [docker manifest create + push]
```

### Hardware-tested matrix

Each minor release must be smoke-tested on real hardware before tagging. Maintain `docs/tested-hardware.md`:

| Hardware | Arch | OS | Result | Notes |
|---|---|---|---|---|
| Raspberry Pi 4 (4GB) | arm64 | Raspberry Pi OS 12 | ✓ | Full V1 |
| Raspberry Pi 5 (8GB) | arm64 | Raspberry Pi OS 12 | ✓ | Full V1 |
| Raspberry Pi 3B+ | arm/v7 | Raspberry Pi OS 12 (32-bit) | ✓ | Slow on large repos |
| Generic x86 server | amd64 | Ubuntu 24.04 | ✓ | Full V1 |
| Mac mini M2 Linux VM | arm64 | Debian 12 | ✓ | |

Smoke test: deploy agent compose on the device, enroll, run a 1GB filesystem backup, verify, restore, verify match.

### ARM-specific gotchas to document

- `arm/v7` 32-bit address space limits Restic's mmap usage. Repos > ~2TB risk OOM. Document the limit; recommend arm64.
- Pi 4 with USB drive: I/O is the bottleneck, not CPU. Backups are 2-3x slower than NVMe-equipped x86. Expected and fine.
- AES on Pi without crypto extensions is software-only. ChaCha20 is faster on these CPUs but Restic doesn't expose that choice. Accept the default and document realistic throughput (15-25 MB/s on Pi 4 to local USB SSD).

---

## Acceptance test (the gate to Phase C)

After Phase B merges:

### Basic compose backup
1. Deploy backupos-agent compose on Dockee01 (which already has the proxyos-app stack running)
2. Agent enrolls, reports capabilities including `docker`, `apphook:postgres`, `apphook:redis`
3. Create a `compose_project` job for proxyos-app with safe defaults
4. Click Run now
5. Within 2 seconds, agent log shows quiescence starting per-service
6. Backup completes successfully — restic snapshot contains volumes, compose file, env files (redacted), labels
7. proxyos-app continues serving traffic throughout (quick stops on services configured with `stop`, no observable downtime on `apphook` services)

### Restore (the real test)
8. Take note of current state of proxyos-app (e.g., a specific test record in postgres)
9. Make a change to the data (insert a new test record)
10. Restore from the snapshot taken in step 6, in-place mode
11. Verify the test record from step 8 is present, the change from step 9 is gone
12. proxyos-app is fully running and healthy

### Multi-arch
13. Repeat steps 1-12 on a Raspberry Pi 4 with a small test stack
14. Repeat on a Raspberry Pi 3 with a 32-bit OS

### Failure modes
15. With agent disconnected, click Run now: fails immediately with `agent_not_connected`
16. Mid-backup, kill the agent container: heartbeat-absence cleanup marks run failed within 65s; remaining services are NOT left in stopped state (this requires the agent to attempt to resume on shutdown — see Item 4)
17. Restore with a corrupted snapshot: aborts cleanly, leaves original stack running

If steps 1-17 all pass, **Phase B is green.**

---

## What Phase B explicitly does NOT include

- Filesystem-snapshot acceleration (V2)
- Storage-driver snapshots (V2)
- Mongo app-hook (V2)
- `EXEC=1`-gated in-container hooks (V2)
- Cross-host stack backup (one project spanning multiple hosts) (V2)
- Swarm support (out of scope)
- Kubernetes (separate product)
- Auto-migration of legacy `docker_volume` jobs (manual only — too dangerous to automate)
- Backup of the BackupOS server itself via the container agent (use the host agent for self-backup)

---

## Implementation order

1. **Capability detection** (Item 1) — pure code, no infrastructure, easy to unit-test
2. **Container image build pipeline** (Item 8 partial) — get an agent image building on amd64 first; test on x86 host
3. **Compose deployment recipe** (Item 2) — write the YAML, test enrollment with the new image
4. **list_compose_project handler** (Item 3 read path) — agent enumerates stacks, server stores the listing
5. **compose_project job creation UI** (Item 6 first half) — user can save jobs with the new source type
6. **Backup execution flow** (Item 4) — start with quiescence='none' only, get the path-collection working
7. **App-hooks** (Item 4 cont.) — add postgres first, test with proxyos-app, then mysql/redis/sqlite
8. **Restore flow** (Item 5) — restore-in-place first, side-by-side after
9. **Multi-arch CI** (Item 8 cont.) — add arm64 then armv7 to the build matrix
10. **Real-hardware testing** (Item 8 cont.) — deploy on a Pi 4, run the acceptance suite
11. **Migration banner for docker_volume** (Item 7) — last, after everything else works
12. **Documentation** — at every step, update docs/install-container-agent.md

After step 6, do an end-to-end smoke test on Dockee01: backup proxyos-app with quiescence='none' for everything, restore side-by-side, manually verify volumes contain expected data. If that works, the whole shape is right and adding hooks is incremental.

---

## A note on scope discipline

This spec is large. Resist adding things to it. Specifically:

- **Don't** build a stack-aware monitoring view in Phase B. It's a Phase C feature.
- **Don't** build custom user-defined hooks. V1 ships the four hooks listed; users wanting Mongo or Elastic wait for V2.
- **Don't** build a "back up all stacks on this host with one click" feature. Per-stack jobs first; bulk operations later.
- **Don't** integrate with Infra OS yet. The Layer 1 API integration (in the skill notes) is a separate piece of work that lands after Phase B is stable.
- **Don't** ship Cloud Solo / Teams. That's a deployment+billing question, not a backup-engine question.

Six things ship in Phase B: image, compose recipe, list_compose_project, compose_project source type, backup execution, restore. Everything else is gravy.
