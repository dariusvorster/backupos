# BackupOS Phase A — Host Agent Stabilization

> **Status:** Spec, ready for implementation. Lands before Phase B (container agent).
> **Why this exists:** The host agent has accumulated multiple latent bugs that produce the same surface symptom ("backup says running but nothing happens"). This spec fixes them as a coordinated batch instead of patch-by-patch.
> **Estimated effort:** 2-3 days focused.
> **Branch:** `fix/phase-a-host-agent-stabilization`
> **Acceptance gate before Phase B:** five clean filesystem backup-and-restore cycles in a row, no manual intervention.

---

## Why this is one spec, not eight

We've tried "fix the bug we just saw, ship it, find another bug." That pattern produced a six-hour debugging session where every fix introduced or revealed a new symptom because the system has no contract for what the agent is supposed to do, when it's supposed to talk to the server, what timestamps mean, or what state a run can be in.

This spec **defines the contract** and fixes everything below the line in one coordinated PR. After it merges, the host agent has a stable, observable, recoverable lifecycle. Then we build the container agent on top of it.

The eight items below are sequenced to minimize churn. Implement in order, test after each, then move to the next.

---

## Item 1 — Agent install: systemd unit must load EnvironmentFile

### Bug

The agent install script writes a systemd unit at `/etc/systemd/system/backupos-agent.service` that does NOT include `EnvironmentFile=/opt/backupos-agent/.env`. The `.env` file IS written correctly during install (with `BACKUPOS_URL`, `BACKUPOS_TOKEN`, `RESTIC_BINARY_PATH`), but systemd never reads it. Agent crashes on boot with `BACKUPOS_TOKEN is required`, enters infinite restart loop.

Verified state on a real install (Dockee01): unit was missing the directive; restart counter reached 166 before discovery.

### Fix

Find the install script. Likely candidates:
- `apps/web/public/agent/install.sh`
- `apps/web/public/install-linux.sh`
- A template under `packages/agent/`
- Something in `scripts/`

Grep:
```bash
grep -rn "backupos-agent.service\|EnvironmentFile\|systemd/system" \
  apps/ packages/ scripts/ --include='*.sh' --include='*.ts' --include='*.tsx'
```

Required unit content the script must write:

```ini
[Unit]
Description=BackupOS Agent
After=network.target

[Service]
Type=simple
EnvironmentFile=/opt/backupos-agent/.env
ExecStart=/usr/bin/node /opt/backupos-agent/agent.js run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

The script must NOT create `/etc/systemd/system/backupos-agent.service.d/override.conf`. If the script previously created it, remove that step.

### Self-healing migration in `update` mode

The install script's `update` subcommand must:

```bash
need_unit_rewrite=0
if [ -f /etc/systemd/system/backupos-agent.service ]; then
  if ! grep -q '^EnvironmentFile=' /etc/systemd/system/backupos-agent.service; then
    need_unit_rewrite=1
  fi
fi
if [ "$need_unit_rewrite" = "1" ]; then
  echo "[backupos] Rewriting systemd unit to add EnvironmentFile..."
  cat > /etc/systemd/system/backupos-agent.service <<'EOF'
[Unit]
Description=BackupOS Agent
After=network.target

[Service]
Type=simple
EnvironmentFile=/opt/backupos-agent/.env
ExecStart=/usr/bin/node /opt/backupos-agent/agent.js run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
fi

# Remove malformed override (no [Service] section header)
if [ -f /etc/systemd/system/backupos-agent.service.d/override.conf ]; then
  if ! grep -q '^\[Service\]' /etc/systemd/system/backupos-agent.service.d/override.conf; then
    echo "[backupos] Removing malformed override.conf..."
    rm -f /etc/systemd/system/backupos-agent.service.d/override.conf
    rmdir /etc/systemd/system/backupos-agent.service.d 2>/dev/null || true
  fi
fi

systemctl daemon-reload
systemctl restart backupos-agent
sleep 3
if systemctl is-active --quiet backupos-agent; then
  echo "[backupos] Agent is running"
else
  echo "[backupos] Agent failed to start. Logs:"
  journalctl -u backupos-agent -n 30 --no-pager
  exit 1
fi
```

### Improve the agent's missing-env error message

In `packages/agent/src/agent.ts`, replace the bare `BACKUPOS_TOKEN is required` exit with:

```typescript
function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`[agent] ${name} is required.`)
    console.error(`[agent] If installed via systemd, ensure the unit at`)
    console.error(`[agent]   /etc/systemd/system/backupos-agent.service`)
    console.error(`[agent] contains: EnvironmentFile=/opt/backupos-agent/.env`)
    console.error(`[agent] and that the .env file has ${name}=<value>.`)
    console.error(`[agent] Run the install script in update mode to self-heal:`)
    console.error(`[agent]   sudo bash /opt/backupos-agent/install.sh update`)
    process.exit(1)
  }
  return v
}
```

Use `requireEnv('BACKUPOS_TOKEN')` and `requireEnv('BACKUPOS_URL')` at startup.

---

## Item 2 — Internal-dispatch HTTP bridge

### Bug

`apps/web/lib/ws-state.ts` exposes a `connections: Map<string, WebSocket>` keyed off `globalThis.__bkp_connections`. The intent was that the custom WebSocket server (`apps/web/server.ts`) and Next.js server actions would share this Map. They don't — verified by diagnostic logging:

```
[triggerJob] CHECK jobAgentId=90c801fb-... knownIds=[]
```

Server actions run in a different module/process context. They see an empty Map. Every `triggerJob` call falls through to the local-execution fallback, runs restic against paths that don't exist on the BackupOS server host, hangs forever.

### Fix

Replace the shared-global pattern with an authenticated localhost HTTP endpoint hosted by the WebSocket server (which owns the real Map). Server actions call this endpoint instead of trying to dispatch directly.

```
┌─────────────────────────────────────────┐
│   Next.js server actions                │
│   triggerJob, retryRun, cancelRun       │
│         │                               │
│         │  POST 127.0.0.1:3093/internal │
│         │       /dispatch               │
│         │  Header: X-Internal-Token     │
│         ▼                               │
└─────────┼───────────────────────────────┘
          ▼
┌─────────────────────────────────────────┐
│   server.ts process                     │
│   Owns the connections Map              │
│   Receives /internal/dispatch           │
│   Looks up agent socket                 │
│   Sends WS message                      │
│   Returns { ok: true } or               │
│           { ok: false, reason }         │
└─────────────────────────────────────────┘
```

### New env var

Add to `/etc/backupos/server.env` and `.env.example`:

```
BACKUPOS_INTERNAL_TOKEN=<auto-generated 32-byte base64>
```

Auto-generate on first startup (mirrors ProxyOS's secret-key pattern):

```typescript
// apps/web/lib/internal-token.ts
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const TOKEN_PATH = process.env.BACKUPOS_INTERNAL_TOKEN_PATH ?? '/var/lib/backupos/internal-token'

export function loadOrCreateInternalToken(): string {
  if (process.env.BACKUPOS_INTERNAL_TOKEN) return process.env.BACKUPOS_INTERNAL_TOKEN
  if (existsSync(TOKEN_PATH)) {
    const tok = readFileSync(TOKEN_PATH, 'utf8').trim()
    process.env.BACKUPOS_INTERNAL_TOKEN = tok
    return tok
  }
  const tok = randomBytes(32).toString('base64')
  writeFileSync(TOKEN_PATH, tok, { mode: 0o600 })
  chmodSync(TOKEN_PATH, 0o600)
  process.env.BACKUPOS_INTERNAL_TOKEN = tok
  console.warn(`[backupos] Generated internal token at ${TOKEN_PATH}. Back this file up.`)
  return tok
}
```

Call this at the top of `server.ts`, before anything else.

### Endpoint in `server.ts`

Add an internal route handler **before** Next.js's catch-all:

```typescript
if (req.method === 'POST' && req.url === '/internal/dispatch') {
  const auth = req.headers['x-internal-token']
  if (auth !== process.env.BACKUPOS_INTERNAL_TOKEN) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, reason: 'unauthorized' }))
    return
  }
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => {
    try {
      const { agentId, message } = JSON.parse(body) as {
        agentId: string
        message: Record<string, unknown>
      }
      const conn = connections.get(agentId)
      if (!conn || conn.readyState !== 1) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          ok: false,
          reason: 'agent_not_connected',
          knownIds: [...connections.keys()],
        }))
        return
      }
      conn.send(JSON.stringify(message))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, reason: 'bad_request', detail: String(err) }))
    }
  })
  return
}
```

### Client used by server actions

`apps/web/lib/internal-dispatch.ts`:

```typescript
const PORT = process.env.PORT ?? '3093'
const URL = `http://127.0.0.1:${PORT}/internal/dispatch`

export type DispatchResult =
  | { ok: true }
  | { ok: false; reason: 'agent_not_connected' | 'unauthorized' | 'bad_request' | 'network_error'; detail?: string; knownIds?: string[] }

export async function dispatchToAgent(
  agentId: string,
  message: Record<string, unknown>,
): Promise<DispatchResult> {
  const token = process.env.BACKUPOS_INTERNAL_TOKEN
  if (!token) {
    return { ok: false, reason: 'unauthorized', detail: 'BACKUPOS_INTERNAL_TOKEN not set in this process' }
  }
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': token,
      },
      body: JSON.stringify({ agentId, message }),
      signal: AbortSignal.timeout(5000),
    })
    return await res.json() as DispatchResult
  } catch (err) {
    return { ok: false, reason: 'network_error', detail: String(err) }
  }
}
```

### Replace every dispatch call site

Grep every place that does WS dispatch from action context:

```bash
grep -rn "dispatch(\|connectedAgentIds(" apps/web/ packages/ --include='*.ts' \
  | grep -v "node_modules\|\.next\|\.test\."
```

For each call site, the change pattern:

```typescript
// before
if (job.agentId && connectedAgentIds().includes(job.agentId)) {
  dispatch(job.agentId, { type: 'run_backup', jobId: id, config: { ... } })
} else {
  // local fallback (broken — see Item 3)
}

// after
if (job.agentId) {
  const result = await dispatchToAgent(job.agentId, {
    type: 'run_backup',
    jobId: id,
    config: { ... },
  })
  if (!result.ok) {
    await db.update(backupRuns).set({
      status: 'failed',
      completedAt: nowMs(),
      errorMessage: `Could not dispatch to agent (${result.reason}). ${result.detail ?? ''}`,
    }).where(eq(backupRuns.id, runId))
  }
}
```

Mark `connectedAgentIds()` in `ws-state.ts` as `@deprecated` with a comment pointing at `dispatchToAgent`. Don't delete yet — we want to grep for residual usage.

---

## Item 3 — Kill the silent local-execution fallback

### Bug

In `apps/web/app/actions/jobs.ts` `triggerJob`, the `else` branch when the agent isn't found in the connections Map calls `executeRun(id, runId)` locally. This was masking the dispatch bug for hours: every backup appeared to "start" because runs went into status `running`, but restic was running on the BackupOS server against paths like `/var/lib/docker/volumes/<vol>/_data` that don't exist there. Eventually it would either time out at 2 hours or be cancelled.

### Fix

Delete the local-execution fallback for jobs that have an `agentId` set. If dispatch fails, mark the run failed immediately with a clear error message.

Keep the local-execution path ONLY for the case where `job.agentId IS NULL`. That's a job genuinely meant to run on the BackupOS server itself (rare; valid only for self-backup of the BackupOS server's own data).

```typescript
if (job.agentId) {
  // Always go through the agent. Never fall back to local execution.
  const result = await dispatchToAgent(job.agentId, { ... })
  if (!result.ok) {
    await markRunFailed(runId, `agent dispatch failed: ${result.reason}`)
  }
} else {
  // Job has no agent — this is intentional (BackupOS-self-backup).
  void import('@/lib/scheduler').then(({ executeRun }) => executeRun(id, runId))
}
```

After this change, dockee01 (which has agent_id set) can never silently run on the wrong host. Either the agent runs it, or the run fails with `agent_not_connected` within 5 seconds.

---

## Item 4 — Implement `cancel_backup` on the agent

### Bug

The agent currently logs `[agent] cancel_backup not implemented for jobId=<id>` and does nothing. This means clicking Stop in the UI updates the DB row to `cancelled` but the actual restic process keeps running on the agent host until it finishes naturally.

### Fix

In `packages/agent/src/agent.ts`, find the message dispatcher. The agent needs to track running backup processes by `jobId` so it can kill them on cancel.

```typescript
// At module scope in agent
const activeBackups = new Map<string, { process: ChildProcess; runId: string }>()

// In run_backup handler, store the process when spawned
case 'run_backup': {
  const proc = spawnRestic(args, env)
  activeBackups.set(msg.jobId, { process: proc, runId: msg.runId })
  proc.on('exit', () => { activeBackups.delete(msg.jobId) })
  // ... existing wiring of stdout/stderr/onProgress
  break
}

// New cancel_backup handler
case 'cancel_backup': {
  const active = activeBackups.get(msg.jobId)
  if (!active) {
    console.warn(`[agent] cancel_backup: no active backup for jobId=${msg.jobId}`)
    send({ type: 'backup_cancelled', jobId: msg.jobId, runId: '', reason: 'not_running' })
    break
  }
  console.log(`[agent] cancel_backup jobId=${msg.jobId}, sending SIGTERM`)
  active.process.kill('SIGTERM')
  // Give restic 10 seconds to clean up gracefully
  setTimeout(() => {
    if (!active.process.killed) {
      console.warn(`[agent] restic did not exit after SIGTERM, sending SIGKILL`)
      active.process.kill('SIGKILL')
    }
  }, 10_000)
  send({ type: 'backup_cancelled', jobId: msg.jobId, runId: active.runId, reason: 'user_requested' })
  break
}
```

Add `backup_cancelled` to the agent protocol types in `packages/agent-protocol/src/index.ts`.

In server.ts WS message handler, on `backup_cancelled`:

```typescript
} else if (msg.type === 'backup_cancelled' && agentId) {
  await db.update(backupRuns).set({
    status: 'cancelled',
    completedAt: nowMs(),
    errorMessage: msg.reason === 'user_requested' ? null : `cancel: ${msg.reason}`,
  }).where(and(
    eq(backupRuns.jobId, msg.jobId),
    eq(backupRuns.status, 'running'),
  ))
}
```

---

## Item 5 — Per-run heartbeat (every 5s while a backup is active)

### Bug

When restic is in its file-walking phase (before any `status` JSON event), the server has no signal that anything is happening. UI shows "Starting backup…" indefinitely. Server can't distinguish hung agent from slow agent.

### Fix

Agent sends a `backup_heartbeat` message every 5 seconds while a backup is actively executing.

Protocol addition (`packages/agent-protocol/src/index.ts`):

```typescript
| {
    type: 'backup_heartbeat'
    jobId: string
    runId: string
    phase: 'starting' | 'scanning' | 'uploading' | 'finalizing'
    lastResticEventAt: number  // ms since epoch when restic last produced ANY output
  }
```

Agent implementation: alongside the `activeBackups` Map, run a `setInterval` that walks the Map and emits a heartbeat for each active backup. Phase tracking:

- `starting`: process spawned, no stdout yet
- `scanning`: receiving non-status output (pre-scan, even with `--no-scan` there's some startup chatter)
- `uploading`: received at least one `status` JSON event
- `finalizing`: process has emitted `summary` but hasn't exited yet

Server WS handler: persist the heartbeat to DB:

```typescript
} else if (msg.type === 'backup_heartbeat' && agentId) {
  await db.update(backupRuns).set({
    lastHeartbeatAt: nowMs(),
    phase: msg.phase,
  }).where(eq(backupRuns.id, msg.runId))
}
```

New columns on `backup_runs`:

```sql
ALTER TABLE backup_runs ADD COLUMN last_heartbeat_at INTEGER;
ALTER TABLE backup_runs ADD COLUMN phase TEXT;
```

The UI's run-detail page reads `phase` and renders it: "Phase: scanning · last heartbeat 3s ago" instead of an opaque "Starting backup…".

---

## Item 6 — Heartbeat-based stuck-run cleanup (replace 2-hour timeout)

### Bug

The current `checkAgents` sweep marks runs as `failed` if they've been `running` for >2 hours with no completion. This produces:
- Hung agents wait 2 hours before the user knows
- Long backups (large filesystems) get falsely killed
- Stuck rows pile up between cleanups

### Fix

Replace the 2-hour rule with a heartbeat-absence rule:

```typescript
// In scheduler.ts checkAgents (or rename to checkRunHealth)
// Runs whose last_heartbeat_at is more than 60 seconds old AND status is 'running':
const stale = await db.select().from(backupRuns).where(
  and(
    eq(backupRuns.status, 'running'),
    lt(backupRuns.lastHeartbeatAt, Date.now() - 60_000),
  ),
)
for (const run of stale) {
  // Try to ping the agent first — maybe heartbeat just got delayed
  const agentConnected = await isAgentConnectedViaInternalDispatch(run.agentId)
  if (!agentConnected) {
    await markRunFailed(run.id, 'agent disconnected, no heartbeat for 60s')
    continue
  }
  // Agent connected but not heartbeating — likely restic hung
  if (Date.now() - (run.lastHeartbeatAt ?? run.startedAt) > 300_000) {  // 5 min
    await markRunFailed(run.id, 'no heartbeat for 5 minutes despite agent connection')
  }
}
```

Run this sweep every 30 seconds. The 2-hour timeout is removed entirely.

`isAgentConnectedViaInternalDispatch(agentId)` is a new helper that calls `/internal/dispatch` with a `{ type: 'ping' }` message and looks at the response's `ok` field — `true` means agent is alive in the connections Map; `false` with `reason: 'agent_not_connected'` means it isn't.

---

## Item 7 — Version handshake at connection (`agent_hello`)

### Bug

The server has no idea what version of the agent code is running on each connected agent. When a protocol-breaking change ships (like the new `BACKUPOS_TOKEN` requirement, or `backup_progress` field additions), old agents silently fail or drop messages. Symptoms only appear when a feature is exercised.

### Fix

Right after the agent's WebSocket connection authenticates, send an `agent_hello`:

```typescript
// Protocol type
| {
    type: 'agent_hello'
    agentId: string
    agentVersion: string         // semver from package.json at build time
    protocolVersion: number      // bump on breaking changes; current = 1
    resticVersion: string        // captured at startup via `restic version --json`
    platform: 'linux' | 'darwin' | 'win32'
    arch: 'x64' | 'arm64' | 'arm'
    capabilities: string[]       // ['filesystem', 'docker', 'podman', 'vss', 'apphooks:postgres', ...]
  }
```

Agent emits this immediately after the existing connection-auth handshake. Server stores the values on the `agents` row:

```sql
ALTER TABLE agents ADD COLUMN protocol_version INTEGER;
ALTER TABLE agents ADD COLUMN restic_version TEXT;
ALTER TABLE agents ADD COLUMN capabilities TEXT;  -- JSON array
```

(The `agent_version`, `platform`, `arch` columns already exist.)

UI: agent detail page shows version + protocol version + a badge if the server expects a newer protocol version than the agent supports. Future: a "Update agent" button that triggers the install script's `update` mode remotely. Out of scope for Phase A — just surface the data.

---

## Item 8 — Timestamp consistency: pick one, fix everywhere

### Bug

The codebase mixes seconds and milliseconds for timestamps stored in SQLite integer columns. Confirmed:

- `agents.last_seen_at` stored as **seconds** (`1777172291`)
- `backup_runs.started_at` stored as **seconds** in some rows (we observed `datetime(started_at, 'unixepoch')` returning correct dates)
- Other code does `startedAt/1000` expecting **milliseconds**
- UI renders dates as 1970 sometimes, correctly other times

### Fix

**Pick milliseconds.** Reasons:
- JavaScript's native `Date.now()` and `Date.getTime()` return ms — zero conversion needed in the most common code paths
- Drizzle ORM's `integer({ mode: 'timestamp_ms' })` is built for this
- Consistent with most JS/TS ecosystems

Migration: write a one-shot data migration that scans every timestamp column and converts seconds → milliseconds where the value is < `1_000_000_000_000` (i.e., looks like seconds rather than ms). Run it once.

```sql
-- Pseudo-migration; real migration goes in packages/db/migrations/
-- For each timestamp column on each table, if value < 1_000_000_000_000, multiply by 1000
UPDATE backup_runs SET started_at = started_at * 1000 WHERE started_at < 1000000000000;
UPDATE backup_runs SET completed_at = completed_at * 1000 WHERE completed_at IS NOT NULL AND completed_at < 1000000000000;
UPDATE agents SET last_seen_at = last_seen_at * 1000 WHERE last_seen_at IS NOT NULL AND last_seen_at < 1000000000000;
UPDATE agents SET enrolled_at = enrolled_at * 1000 WHERE enrolled_at < 1000000000000;
UPDATE backup_jobs SET last_run_at = last_run_at * 1000 WHERE last_run_at IS NOT NULL AND last_run_at < 1000000000000;
UPDATE backup_jobs SET next_run_at = next_run_at * 1000 WHERE next_run_at IS NOT NULL AND next_run_at < 1000000000000;
UPDATE backup_jobs SET created_at = created_at * 1000 WHERE created_at < 1000000000000;
UPDATE backup_jobs SET last_preflight_at = last_preflight_at * 1000 WHERE last_preflight_at IS NOT NULL AND last_preflight_at < 1000000000000;
-- repeat for snapshots.created_at, snapshots.modified_at, etc.
```

Code audit: grep for every `Date.now() / 1000` or `unixepoch` usage and convert.

```bash
grep -rn "Date.now() / 1000\|/ 1000\|unixepoch\|strftime.*'%s'" \
  apps/ packages/ --include='*.ts' --include='*.tsx' --include='*.sql'
```

Each hit is reviewed and either:
- Removed (use ms directly)
- Annotated with a comment explaining why seconds are needed (rare — usually external API contracts)

Drizzle schema audit: ensure every `integer()` timestamp column declares `mode: 'timestamp_ms'`. Look for any using `'timestamp'` (which is seconds in some interpretations).

A helper `nowMs(): number => Date.now()` exported from `packages/types` and used everywhere — no raw `Date.now()` in code that hits the DB. This makes future audits easy: grep for raw `Date.now`, every hit is wrong.

---

## Acceptance test (the gate to Phase B)

After all eight items merge and deploy:

### Setup
1. Fresh agent install on Dockee01 via the updated install script (start from a clean state — uninstall first if needed)
2. Agent boots and connects within 10 seconds of `systemctl start`
3. `journalctl -u backupos-agent -n 20` shows: env loaded, connected, agent_hello sent, capabilities reported

### Test cycle (run 5 times in a row)
1. Click "Run now" on a filesystem-source job (back up `/etc` on Dockee01 to a local-disk Restic repo)
2. Within 5 seconds: agent log shows `run_backup` received and restic spawning
3. Within 10 seconds: UI run-detail page shows `Phase: scanning, last heartbeat <5s ago`
4. Backup completes successfully — run row transitions `running → success` with real stats populated (files_new, total_size, duration)
5. Click "Restore" on the resulting snapshot to a temp directory
6. Restored files match the source byte-for-byte (`diff -r /etc /tmp/restore-test/etc` returns no differences)

### Failure-mode tests
7. With agent stopped (`systemctl stop backupos-agent`), click Run now. Run row marked `failed` within 10 seconds with errorMessage containing `agent_not_connected`. No 2-hour wait. No silent local execution.
8. While a backup is running, click Stop. Within 15 seconds: restic process on agent is killed, run row transitions to `cancelled`.
9. Kill the agent process mid-backup (`pkill -9 node` on the agent host). Within 65 seconds: heartbeat-absence sweep marks the run failed with errorMessage containing `agent disconnected`.

If all three failure-mode tests + 5 happy-path cycles pass, **Phase A is green and Phase B can begin.**

---

## Observability deliverables

Add these because they make future debugging tractable:

- **Server log line on every dispatch:** `[dispatch] agentId=X jobId=Y messageType=run_backup result=ok`
- **Agent log line on every received message:** `[agent] received type=run_backup jobId=X`
- **Run-detail UI shows:** phase, last_heartbeat_at relative time, agent version, protocol version
- **Agent detail page shows:** capabilities, protocol_version, restic_version, last_seen_at relative time

---

## Out of scope for Phase A

- Container-agent (Phase B)
- Compose-stack source type (Phase B)
- App-aware hooks (Phase B — host agent gets filesystem only for now)
- Hypervisor backups (already in skill — separate spec)
- BackupOS Cloud
- Storage-driver snapshot integration (V2)

---

## Implementation order

1. **Item 1** — install script EnvironmentFile fix. Deploy to Dockee01. Confirm agent connects.
2. **Item 8** — timestamp migration. Touches everything; do it before adding more columns.
3. **Item 2** — internal-dispatch bridge. Replace `triggerJob`'s call site only. Test one click. If green, replace remaining call sites.
4. **Item 3** — kill the local-execution fallback. Test that a Run-now with the agent stopped fails immediately.
5. **Item 7** — `agent_hello` handshake. Adds the columns; agents start reporting on next reconnect.
6. **Item 5** — heartbeat. Deploy server-side first (so it can receive), then agent-side.
7. **Item 6** — heartbeat-based cleanup. Remove the 2-hour timeout.
8. **Item 4** — cancel_backup. Last because it's least urgent (cancel UI was already imperfect, this is fixing it properly).

After item 3, manually click Run now on dockee01. The full filesystem backup of `/etc` should work. If it doesn't, stop and debug — don't proceed to item 5+ on a broken foundation.

---

## What this spec deliberately does NOT do

- Does not redesign the WebSocket protocol from scratch
- Does not add per-app-data hooks (that's container-agent territory)
- Does not change how agents enroll (the existing token model stays)
- Does not change the database from SQLite to anything else
- Does not delete the orphan `/opt/backupos/apps/web/data/backupos.db` (cosmetic; do separately)
- Does not address the broken `02**` cron on the dockee01 job (manual UPDATE; do separately)

Phase A is about making the host agent honest, observable, and recoverable. Nothing else.
