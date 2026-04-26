# Phase B: Container Agent + Compose-Stack Source

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable BackupOS to discover, quiesce, and back up Docker Compose stacks via a containerised agent with a scoped socket proxy, and automatically update connected agents when the server bundle changes.

**Architecture:** The existing agent binary (`packages/agent/src/agent.ts`) gains capability detection at startup and handlers for three new message types (`list_compose_project`, `run_compose_backup`, `run_compose_restore`). A new `docker-client.ts` helper uses raw HTTP to the Docker Engine API (no Dockerode). The server follows the same request/resolve pattern already used for `list_resources`/`resources_result`. A container image bundles the agent bundle + Restic + DB client tools. The automatic force-update is layered on top of the existing `bundleHash` mechanism in `welcome` — the agent now _also_ sends its hash in `hello`, letting the server push `force_update` server-side rather than waiting for the client-side check.

**Tech Stack:** TypeScript, Bun, Drizzle/SQLite, WebSockets, Docker HTTP API (raw), Restic, `@backupos/app-hooks`, multi-arch Docker `buildx`, GitHub Actions.

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `packages/agent/src/capabilities.ts` | Detect capabilities at startup (`filesystem`, `docker`, apphook binaries) |
| `packages/agent/src/docker-client.ts` | Raw HTTP to Docker socket/TCP; pause/stop/start/inspect containers |
| `packages/agent/src/handlers/listCompose.ts` | Handle `list_compose_project` — enumerate a project's containers |
| `packages/agent/src/handlers/composeBackup.ts` | Orchestrate quiesce → restic backup → resume for a compose stack |
| `packages/agent/src/handlers/composeRestore.ts` | Orchestrate compose restore from a restic snapshot |
| `apps/agent-container/Dockerfile` | Multi-arch container image for the agent |
| `apps/web/public/agent/docker-compose.yml` | Reference deployment recipe served by the web UI |
| `.github/workflows/agent-image.yml` | Multi-arch CI build for the container image |

### Modified files
| File | Change |
|------|--------|
| `packages/agent-protocol/src/index.ts` | Add `Capability` type, compose config types, new message variants |
| `packages/agent/src/agent.ts` | Use `detectCapabilities()`, send `bundleHash` in hello, register new handlers |
| `apps/web/lib/ws-state.ts` | Add `requestListCompose` / `resolveListCompose` |
| `apps/web/server.ts` | Handle `compose_project_listing`; send `force_update` on hello hash mismatch; add `/api/agents/:id/list-compose` HTTP endpoint |
| `apps/web/lib/scheduler.ts` | Dispatch `run_compose_backup` for `compose_project` source type |
| `apps/web/app/actions/jobs.ts` | Same — `retryRun` path |
| `apps/web/components/source-config-section.tsx` | Add `compose_project` source type + per-service config wizard |
| `apps/web/app/(dashboard)/jobs/[id]/page.tsx` | Deprecation banner for `docker_volume` jobs |

---

## ⚠️ Smoke-test gate

**Do not implement Tasks 9–12 until the smoke test on Dockee01 passes:**
- Container agent enrolled, `list_compose_project` works on `proxyos-app`
- Backup with `quiescence='none'` for all services completes, restic snapshot contains volumes

---

## Task 1: Extend agent-protocol

**Files:**
- Modify: `packages/agent-protocol/src/index.ts`

- [ ] **Step 1.1: Read the file**

  Read `packages/agent-protocol/src/index.ts` to verify current content before editing.

- [ ] **Step 1.2: Add new types and message variants**

  Replace the entire file with the following (preserves all existing types, adds Phase B):

```typescript
export interface MountConfig {
  type: 'nfs' | 'smb'
  host: string
  remotePath: string
  mountPoint: string
  username?: string
  password?: string
  domain?: string
  options?: string
  mountCommand?: string
}

export interface BackupJobConfig {
  repoId: string
  repoUrl: string
  repoPassword: string
  paths: string[]
  exclude?: string[]
  tags?: string[]
  useVSS?: boolean
  envVars?: Record<string, string>
  mountConfig?: MountConfig
}

export interface BackupStats {
  filesNew: number
  filesChanged: number
  filesUnmodified: number
  dataAdded: number
  totalFilesProcessed: number
  totalBytesProcessed: number
  durationMs: number
}

export interface AgentMetrics {
  cpuPercent: number
  memUsedBytes: number
  memTotalBytes: number
  diskUsedBytes: Record<string, number>
  diskTotalBytes: Record<string, number>
  uptimeSeconds: number
}

export interface OsInfo {
  os: string
  arch: string
  kernel: string
}

// ── Phase B types ─────────────────────────────────────────────────────────

export type Capability =
  | 'filesystem'
  | 'docker'
  | 'podman'
  | 'vss'
  | 'apphook:postgres'
  | 'apphook:mysql'
  | 'apphook:redis'
  | 'apphook:sqlite'
  | 'hypervisor:proxmox'

export interface ComposeServiceVolume {
  type: 'volume' | 'bind'
  name?: string
  source?: string
  target: string
}

export interface ComposeServiceListing {
  name: string
  image: string
  containerStatus: string
  volumes: ComposeServiceVolume[]
  binds: string[]
  envFiles: string[]
  networks: string[]
  labels: Record<string, string>
}

export interface ComposeProjectListing {
  name: string
  composeFilePath?: string
  services: ComposeServiceListing[]
}

export interface ComposeApphookConfig {
  host?: string
  port?: number
  user?: string
  passwordEnv?: string
  database?: string
  dbPath?: string
}

export interface ComposeServiceConfig {
  serviceName: string
  included: boolean
  quiescence: 'none' | 'pause' | 'stop' | 'apphook'
  apphookType?: 'postgres' | 'mysql' | 'redis' | 'sqlite'
  apphookConfig?: ComposeApphookConfig
  includedVolumes: string[]
  includedBindMounts: string[]
}

export interface ComposeProjectConfig {
  projectName: string
  composeFilePath?: string
  services: ComposeServiceConfig[]
  includeComposeFile: boolean
  includeEnvFiles: boolean
  redactSecretsInEnvFiles: boolean
  includeContainerLabels: boolean
  includeNetworkMetadata: boolean
}

export interface ComposeRestoreConfig {
  projectName: string
  newProjectName?: string   // omit for in-place; set for side-by-side
  snapshotId: string
}

// ── Messages ──────────────────────────────────────────────────────────────

export type AgentMessage =
  | { type: 'hello'; token: string; hostname: string; ip: string; osInfo: OsInfo; agentVersion: string; platform: 'linux' | 'windows'; protocolVersion: string; resticVersion?: string; capabilities?: string[]; bundleHash?: string }
  | { type: 'ping' }
  | { type: 'metrics'; metrics: AgentMetrics }
  | { type: 'backup_start'; jobId: string; config: BackupJobConfig }
  | { type: 'backup_heartbeat'; jobId: string; runId: string; phase: 'starting' | 'scanning' | 'uploading' | 'finalizing'; lastResticEventAt: number }
  | { type: 'backup_progress'; jobId: string; pct: number; filesProcessed: number; bytesProcessed: number; filesTotal: number; bytesTotal: number; secondsRemaining?: number }
  | { type: 'backup_complete'; jobId: string; snapshotId: string; stats: BackupStats; log?: string }
  | { type: 'backup_failed'; jobId: string; error: string; detail: string; log?: string }
  | { type: 'backup_cancelled'; jobId: string; runId: string; reason: 'user_requested' | 'not_running' | 'agent_disconnect' }
  | { type: 'restore_start'; restoreId: string; specId: string }
  | { type: 'restore_progress'; restoreId: string; step: string; status: string }
  | { type: 'restore_complete'; restoreId: string; success: boolean }
  | { type: 'resources_result'; requestId: string; resources: DetectedResources }
  | { type: 'test_repo_result'; requestId: string; ok: boolean; error?: string; snapshotCount?: number }
  | { type: 'test_mount_result'; requestId: string; ok: boolean; error?: string }
  | { type: 'compose_project_listing'; requestId: string; project: ComposeProjectListing }
  | { type: 'compose_backup_failed'; jobId: string; error: string; detail: string }
  | { type: 'compose_restore_complete'; jobId: string; runId: string }
  | { type: 'compose_restore_failed'; jobId: string; runId: string; error: string; detail: string }

export interface DetectedResources {
  dockerVolumes?: string[]
  mountPoints?:   string[]
  databases?:     Array<{ type: string; host: string; port: number }>
}

export type ServerMessage =
  | { type: 'welcome'; agentId: string; serverVersion: string; bundleHash?: string }
  | { type: 'pong' }
  | { type: 'run_backup'; jobId: string; runId: string; config: BackupJobConfig }
  | { type: 'run_restore'; restoreId: string; specYaml: string; snapshotId: string }
  | { type: 'cancel_backup'; jobId: string; runId: string }
  | { type: 'verify_repo'; repoId: string; repoUrl: string; repoPassword: string; readData: boolean; envVars?: Record<string, string> }
  | { type: 'list_resources'; requestId: string }
  | { type: 'test_repo'; requestId: string; repoUrl: string; repoPassword: string; envVars?: Record<string, string> }
  | { type: 'test_mount'; requestId: string; mountConfig: MountConfig }
  | { type: 'force_update' }
  | { type: 'list_compose_project'; requestId: string; projectName: string }
  | { type: 'run_compose_backup'; jobId: string; runId: string; config: ComposeProjectConfig; repoId: string; repoUrl: string; repoPassword: string; envVars?: Record<string, string> }
  | { type: 'run_compose_restore'; jobId: string; runId: string; config: ComposeRestoreConfig; repoUrl: string; repoPassword: string; envVars?: Record<string, string> }
```

- [ ] **Step 1.3: Build and typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos
pnpm --filter @backupos/agent-protocol build
```

Expected: exits 0, no type errors.

- [ ] **Step 1.4: Commit**

```bash
git add packages/agent-protocol/src/index.ts
git commit -m "feat(protocol): add Phase B compose types and message variants"
```

---

## Task 2: Capability detection + auto force-update scope addition

**Files:**
- Create: `packages/agent/src/capabilities.ts`
- Modify: `packages/agent/src/agent.ts`

- [ ] **Step 2.1: Create capabilities.ts**

Create `packages/agent/src/capabilities.ts`:

```typescript
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readdirSync } from 'fs'
import * as http from 'http'
import type { Capability } from '@backupos/agent-protocol'

const execFileAsync = promisify(execFile)

async function binaryExists(name: string): Promise<boolean> {
  try {
    await execFileAsync(name, ['--version'], { timeout: 2_000 })
    return true
  } catch {
    return false
  }
}

function dockerRequest(dockerHost: string, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout')), 5_000)
    const done = () => clearTimeout(timeout)

    const handler = (res: http.IncomingMessage) => {
      res.resume()
      res.on('end', () => { done(); resolve() })
    }

    if (dockerHost.startsWith('unix://')) {
      const req = http.request(
        { socketPath: dockerHost.slice('unix://'.length), path, method: 'GET' },
        handler,
      )
      req.on('error', e => { done(); reject(e) })
      req.end()
    } else if (dockerHost.startsWith('tcp://')) {
      const u = new URL(dockerHost)
      const req = http.request(
        { host: u.hostname, port: parseInt(u.port || '2375'), path, method: 'GET' },
        handler,
      )
      req.on('error', e => { done(); reject(e) })
      req.end()
    } else {
      done()
      reject(new Error(`Unsupported DOCKER_HOST: ${dockerHost}`))
    }
  })
}

async function canReachDocker(): Promise<boolean> {
  const dockerHost = process.env['DOCKER_HOST'] ?? 'unix:///var/run/docker.sock'
  try {
    await dockerRequest(dockerHost, '/v1.41/_ping')
    return true
  } catch {
    return false
  }
}

function canReadFilesystem(): boolean {
  try { readdirSync('/'); return true } catch { return false }
}

export async function detectCapabilities(): Promise<Capability[]> {
  const caps: Capability[] = []

  if (canReadFilesystem()) caps.push('filesystem')
  if (await canReachDocker()) caps.push('docker')
  if (process.platform === 'win32') caps.push('vss')
  if (await binaryExists('pg_dump'))   caps.push('apphook:postgres')
  if (await binaryExists('mysqldump')) caps.push('apphook:mysql')
  if (await binaryExists('redis-cli')) caps.push('apphook:redis')
  if (await binaryExists('sqlite3'))   caps.push('apphook:sqlite')

  return caps
}
```

- [ ] **Step 2.2: Read agent.ts before editing**

  Read `packages/agent/src/agent.ts` to verify current content.

- [ ] **Step 2.3: Update agent.ts — import and use detectCapabilities; send bundleHash in hello**

  Three targeted edits:

  **Edit A** — replace the import block to add capabilities import:

  ```typescript
  // OLD (first line of imports):
  import WebSocket from 'ws'
  
  // NEW (add after existing imports, before VERSION constant):
  import WebSocket from 'ws'
  ```
  
  Then add the import after the existing `import { getSystemUptimeSeconds }` line:
  ```typescript
  import { detectCapabilities } from './capabilities'
  ```

  **Edit B** — replace the `buildCapabilities` function and its call site. The function currently returns `['backup', 'restore']`. Replace the entire function with a detected approach:

  Find this block in agent.ts:
  ```typescript
  function buildCapabilities(): string[] {
    const caps: string[] = ['backup', 'restore']
    if (process.platform === 'win32') caps.push('vss')
    return caps
  }
  ```

  Replace with:
  ```typescript
  let detectedCapabilities: string[] = ['backup', 'restore']
  void detectCapabilities().then(caps => {
    detectedCapabilities = ['backup', 'restore', ...caps]
    console.log('[agent] Capabilities:', detectedCapabilities.join(', '))
  })
  ```

  **Edit C** — in the `connect()` function, inside `ws.on('open', ...)`, replace the hello construction:

  Find:
  ```typescript
      const hello: AgentMessage = {
        type:            'hello',
        token:           TOKEN,
        hostname:        os.hostname(),
        ip:              getIp(),
        agentVersion:    VERSION,
        protocolVersion: PROTOCOL_VERSION,
        resticVersion:   RESTIC_VERSION || undefined,
        capabilities:    buildCapabilities(),
        platform:        process.platform === 'win32' ? 'windows' : 'linux',
        osInfo: {
          os:     process.platform,
          arch:   process.arch,
          kernel: os.release(),
        },
      }
  ```

  Replace with:
  ```typescript
      const hello: AgentMessage = {
        type:            'hello',
        token:           TOKEN,
        hostname:        os.hostname(),
        ip:              getIp(),
        agentVersion:    VERSION,
        protocolVersion: PROTOCOL_VERSION,
        resticVersion:   RESTIC_VERSION || undefined,
        capabilities:    detectedCapabilities,
        bundleHash:      SELF_HASH || undefined,
        platform:        process.platform === 'win32' ? 'windows' : 'linux',
        osInfo: {
          os:     process.platform,
          arch:   process.arch,
          kernel: os.release(),
        },
      }
  ```

- [ ] **Step 2.4: Update server.ts — send force_update when hello bundleHash differs**

  Read `apps/web/server.ts` to find the hello handler.

  Inside the `if (msg.type === 'hello')` block, after the line:
  ```typescript
          ws.send(JSON.stringify(welcome))
  ```

  Add:
  ```typescript
          // Auto force-update: if agent sent its bundle hash and it differs from ours, push the update
          if (msg.bundleHash && BUNDLE_HASH && msg.bundleHash !== BUNDLE_HASH) {
            console.log(`[server] Agent ${agentId} bundle mismatch (agent: ${msg.bundleHash.slice(0, 8)} server: ${BUNDLE_HASH.slice(0, 8)}) — sending force_update`)
            ws.send(JSON.stringify({ type: 'force_update' } satisfies ServerMessage))
          }
  ```

- [ ] **Step 2.5: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos
pnpm --filter @backupos/agent build
```

Expected: exits 0.

- [ ] **Step 2.6: Commit**

```bash
git add packages/agent/src/capabilities.ts packages/agent/src/agent.ts apps/web/server.ts
git commit -m "feat(agent): capability detection + server-side auto force-update on hello hash mismatch"
```

---

## Task 3: Docker client helper

**Files:**
- Create: `packages/agent/src/docker-client.ts`

- [ ] **Step 3.1: Create docker-client.ts**

Create `packages/agent/src/docker-client.ts`:

```typescript
import * as http from 'http'

interface DockerOpts {
  socketPath?: string
  host?: string
  port?: number
}

function getOpts(): DockerOpts {
  const h = process.env['DOCKER_HOST'] ?? 'unix:///var/run/docker.sock'
  if (h.startsWith('unix://')) return { socketPath: h.slice('unix://'.length) }
  if (h.startsWith('tcp://')) {
    const u = new URL(h)
    return { host: u.hostname, port: parseInt(u.port || '2375') }
  }
  throw new Error(`Unsupported DOCKER_HOST: ${h}`)
}

function dockerReq(method: string, path: string, body?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const opts = getOpts()
    const payload = body ? JSON.stringify(body) : undefined
    const timer = setTimeout(() => reject(new Error(`Docker ${method} ${path} timeout`)), 30_000)

    const reqOpts: http.RequestOptions = {
      method, path,
      ...opts,
      headers: payload
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        : {},
    }

    const req = http.request(reqOpts, res => {
      let data = ''
      res.on('data', (c: string) => { data += c })
      res.on('end', () => {
        clearTimeout(timer)
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)) } catch { resolve(data) }
        } else {
          reject(new Error(`Docker ${method} ${path} → HTTP ${res.statusCode ?? '?'}: ${data}`))
        }
      })
    })
    req.on('error', e => { clearTimeout(timer); reject(e) })
    if (payload) req.write(payload)
    req.end()
  })
}

export interface DockerMount {
  Type: 'volume' | 'bind'
  Name?: string
  Source: string
  Destination: string
}

export interface DockerContainer {
  Id: string
  Names: string[]
  Image: string
  Status: string
  Labels: Record<string, string>
  Mounts: DockerMount[]
  NetworkSettings: { Networks: Record<string, unknown> }
}

export interface DockerContainerInspect {
  State: {
    Status: string
    Health?: { Status: string }
  }
}

export async function dockerPing(): Promise<boolean> {
  try { await dockerReq('GET', '/v1.41/_ping'); return true } catch { return false }
}

export async function listComposeContainers(projectName: string): Promise<DockerContainer[]> {
  const f = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.project=${projectName}`] }))
  return dockerReq('GET', `/v1.41/containers/json?filters=${f}&all=true`) as Promise<DockerContainer[]>
}

export async function pauseContainer(id: string): Promise<void> {
  await dockerReq('POST', `/v1.41/containers/${id}/pause`)
}

export async function unpauseContainer(id: string): Promise<void> {
  await dockerReq('POST', `/v1.41/containers/${id}/unpause`)
}

export async function stopContainer(id: string, timeoutSec = 10): Promise<void> {
  await dockerReq('POST', `/v1.41/containers/${id}/stop?t=${timeoutSec}`)
}

export async function startContainer(id: string): Promise<void> {
  await dockerReq('POST', `/v1.41/containers/${id}/start`)
}

export async function inspectContainer(id: string): Promise<DockerContainerInspect> {
  return dockerReq('GET', `/v1.41/containers/${id}/json`) as Promise<DockerContainerInspect>
}

export async function waitForRunning(id: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const info = await inspectContainer(id)
    if (info.State.Status === 'running') return
    await new Promise(r => setTimeout(r, 1_000))
  }
  throw new Error(`Container ${id} did not reach 'running' within ${timeoutMs}ms`)
}
```

- [ ] **Step 3.2: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos
pnpm --filter @backupos/agent build
```

Expected: exits 0.

- [ ] **Step 3.3: Commit**

```bash
git add packages/agent/src/docker-client.ts
git commit -m "feat(agent): Docker HTTP client helper for compose backup orchestration"
```

---

## Task 4: list_compose_project — agent handler, ws-state, server endpoint, tRPC

**Files:**
- Create: `packages/agent/src/handlers/listCompose.ts`
- Modify: `apps/web/lib/ws-state.ts`
- Modify: `apps/web/server.ts`
- Modify: `packages/agent/src/agent.ts`

- [ ] **Step 4.1: Create the handler**

Create `packages/agent/src/handlers/listCompose.ts`:

```typescript
import { listComposeContainers } from '../docker-client'
import type { ComposeProjectListing, ComposeServiceListing, ComposeServiceVolume } from '@backupos/agent-protocol'

function defaultQuiescence(image: string): { quiescence: string; apphookType?: string } {
  const img = image.toLowerCase()
  if (/postgres|postgis/.test(img)) return { quiescence: 'apphook', apphookType: 'postgres' }
  if (/mysql|mariadb/.test(img))    return { quiescence: 'apphook', apphookType: 'mysql' }
  if (/^redis/.test(img))           return { quiescence: 'apphook', apphookType: 'redis' }
  if (/nginx|caddy|traefik|plex|jellyfin|emby/.test(img)) return { quiescence: 'none' }
  return { quiescence: 'stop' }
}

export async function handleListCompose(projectName: string): Promise<ComposeProjectListing> {
  const containers = await listComposeContainers(projectName)
  if (containers.length === 0) {
    throw new Error(`No containers found for project '${projectName}'. Is the project name correct and is Docker accessible?`)
  }

  const composeFilePath = containers[0]?.Labels['com.docker.compose.project.config_files'] ?? undefined

  const services: (ComposeServiceListing & { defaultQuiescence?: string; defaultApphookType?: string })[] =
    containers.map(c => {
      const serviceName = c.Labels['com.docker.compose.service'] ?? c.Names[0]?.replace(/^\//, '') ?? 'unknown'
      const volumes: ComposeServiceVolume[] = c.Mounts
        .filter(m => m.Type === 'volume')
        .map(m => ({ type: 'volume' as const, name: m.Name, target: m.Destination }))
      const binds: string[] = c.Mounts
        .filter(m => m.Type === 'bind')
        .map(m => m.Source)
      const dq = defaultQuiescence(c.Image)

      return {
        name: serviceName,
        image: c.Image,
        containerStatus: c.Status,
        volumes,
        binds,
        envFiles: [],
        networks: Object.keys(c.NetworkSettings?.Networks ?? {}),
        labels: c.Labels,
        defaultQuiescence: dq.quiescence,
        defaultApphookType: dq.apphookType,
      }
    })

  return { name: projectName, composeFilePath, services }
}
```

- [ ] **Step 4.2: Read ws-state.ts before editing**

  Read `apps/web/lib/ws-state.ts` to verify current content.

- [ ] **Step 4.3: Add requestListCompose / resolveListCompose to ws-state.ts**

  Add the following after the existing `resolveTestMount` export at the bottom of the file:

```typescript
import type { ComposeProjectListing } from '@backupos/agent-protocol'

declare global {
  // eslint-disable-next-line no-var
  var __bkp_pending_compose_lists: Map<string, (r: ComposeProjectListing) => void> | undefined
}

const pendingComposeLists: Map<string, (r: ComposeProjectListing) => void> =
  (globalThis.__bkp_pending_compose_lists ??= new Map())

export function requestListCompose(agentId: string, projectName: string): Promise<ComposeProjectListing> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID()
    const timer = setTimeout(() => {
      pendingComposeLists.delete(requestId)
      reject(new Error('Agent did not respond to list_compose_project in time'))
    }, 15_000)
    pendingComposeLists.set(requestId, result => {
      clearTimeout(timer)
      pendingComposeLists.delete(requestId)
      resolve(result)
    })
    const sent = dispatch(agentId, { type: 'list_compose_project', requestId, projectName })
    if (!sent) {
      clearTimeout(timer)
      pendingComposeLists.delete(requestId)
      reject(new Error('Agent not connected'))
    }
  })
}

export function resolveListCompose(requestId: string, project: ComposeProjectListing): void {
  pendingComposeLists.get(requestId)?.(project)
}
```

- [ ] **Step 4.4: Handle compose_project_listing in server.ts**

  Read `apps/web/server.ts`. In the WS `message` handler, after the existing `} else if (msg.type === 'test_mount_result' && agentId)` block, add:

```typescript
        } else if (msg.type === 'compose_project_listing') {
          resolveListCompose(msg.requestId, msg.project)
```

  Also add `resolveListCompose` to the import from `./lib/ws-state`:

  Find:
  ```typescript
  import { registerAgent, unregisterAgent, resolveDetect, requestDetect, resolveTestRepo, requestTestRepo, resolveTestMount, requestTestMount, connectedAgentIds, dispatch } from './lib/ws-state'
  ```

  Replace with:
  ```typescript
  import { registerAgent, unregisterAgent, resolveDetect, requestDetect, resolveTestRepo, requestTestRepo, resolveTestMount, requestTestMount, connectedAgentIds, dispatch, requestListCompose, resolveListCompose } from './lib/ws-state'
  ```

- [ ] **Step 4.5: Add /api/agents/:id/list-compose HTTP endpoint in server.ts**

  In the HTTP request handler section of server.ts, after the `detectMatch` block (the one for `/api/agents/:id/detect`), add:

```typescript
    const listComposeMatch = parsed.pathname?.match(/^\/api\/agents\/([^/]+)\/list-compose$/)
    if (req.method === 'POST' && listComposeMatch) {
      const agentId2 = listComposeMatch[1]!
      void (async () => {
        let body: { projectName?: string } = {}
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          body = JSON.parse(Buffer.concat(chunks).toString()) as { projectName?: string }
        } catch { /* ignore */ }
        if (!body.projectName) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'projectName required' }))
          return
        }
        requestListCompose(agentId2, body.projectName)
          .then(project => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(project))
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : 'List compose failed'
            res.writeHead(503, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: message }))
          })
      })()
      return
    }
```

- [ ] **Step 4.6: Register list_compose_project handler in agent.ts**

  In `handleMessage` in `packages/agent/src/agent.ts`, after the `verify_repo` block, add:

```typescript
  } else if (msg.type === 'list_compose_project') {
    void (async () => {
      try {
        const { handleListCompose } = await import('./handlers/listCompose')
        const project = await handleListCompose(msg.projectName)
        send({ type: 'compose_project_listing', requestId: msg.requestId, project })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        console.error('[agent] list_compose_project failed:', error)
        // Send an error response so the server doesn't hang waiting
        send({ type: 'compose_project_listing', requestId: msg.requestId, project: { name: msg.projectName, services: [] } })
      }
    })()
```

- [ ] **Step 4.7: Build and typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos
pnpm --filter @backupos/agent build
pnpm --filter @backupos/web typecheck 2>&1 | head -30
```

Expected: exits 0 or only pre-existing errors.

- [ ] **Step 4.8: Manual smoke test for list_compose_project**

  With the agent running on Dockee01 and connected to the server:

```bash
curl -s -X POST http://localhost:3093/api/agents/<AGENT_ID>/list-compose \
  -H 'Content-Type: application/json' \
  -d '{"projectName":"proxyos-app"}' | jq .
```

  Expected: JSON with `name`, `services` array, each service has `image`, `volumes`, `networks`.

- [ ] **Step 4.9: Commit**

```bash
git add packages/agent/src/handlers/listCompose.ts apps/web/lib/ws-state.ts apps/web/server.ts packages/agent/src/agent.ts
git commit -m "feat: list_compose_project — agent handler, ws-state relay, HTTP endpoint"
```

---

## Task 5: compose_project source type UI

**Files:**
- Modify: `apps/web/components/source-config-section.tsx`

This is a client component. The new `ComposeFields` sub-component:
1. Shows a text input for project name + "Inspect" button
2. On inspect, POSTs to `/api/agents/:id/list-compose`
3. Renders per-service config (quiescence selector, apphook config, volume checklist)
4. Stores the composed `sourceConfig` JSON in hidden form fields

- [ ] **Step 5.1: Read source-config-section.tsx before editing**

  Read `apps/web/components/source-config-section.tsx`.

- [ ] **Step 5.2: Add compose_project to SOURCE_TYPES array**

  Find:
  ```typescript
  const SOURCE_TYPES = [
    { value: 'filesystem',     label: 'Filesystem',      desc: 'Directories and files on the agent host' },
    { value: 'docker_volume',  label: 'Docker volume',   desc: 'Named Docker volume' },
  ```

  Replace with:
  ```typescript
  const SOURCE_TYPES = [
    { value: 'filesystem',      label: 'Filesystem',       desc: 'Directories and files on the agent host' },
    { value: 'compose_project', label: 'Compose project',  desc: 'Docker Compose stack — volumes, app-hooks, full stack backup' },
    { value: 'docker_volume',   label: 'Docker volume',    desc: 'Named Docker volume (deprecated — use Compose project)' },
  ```

- [ ] **Step 5.3: Add ComposeProjectFields component**

  Add the following before the `DETECTABLE` constant (around line 313):

```typescript
interface ComposeServiceState {
  name: string
  image: string
  included: boolean
  quiescence: 'none' | 'pause' | 'stop' | 'apphook'
  apphookType: string
  passwordEnv: string
  database: string
  includedVolumes: string[]
  includedBindMounts: string[]
  allVolumes: string[]
  allBinds: string[]
}

function ComposeProjectFields({ cfg, agentIdRef }: { cfg: Cfg; agentIdRef: React.RefObject<HTMLSelectElement | null> }) {
  const [projectName, setProjectName] = useState((cfg.projectName as string) ?? '')
  const [services, setServices] = useState<ComposeServiceState[]>([])
  const [inspecting, setInspecting] = useState(false)
  const [inspectError, setInspectError] = useState<string | undefined>()
  const [includeComposeFile, setIncludeComposeFile] = useState(true)
  const [includeEnvFiles, setIncludeEnvFiles] = useState(true)
  const [redactSecrets, setRedactSecrets] = useState(true)
  const [includeLabels, setIncludeLabels] = useState(true)
  const [includeNetworks, setIncludeNetworks] = useState(true)

  const inspect = async () => {
    const agentId = agentIdRef.current?.value
    if (!agentId) { setInspectError('Select an agent first'); return }
    if (!projectName.trim()) { setInspectError('Enter a project name'); return }
    setInspecting(true)
    setInspectError(undefined)
    try {
      const res = await fetch(`/api/agents/${agentId}/list-compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: projectName.trim() }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        setInspectError(body.error ?? 'Inspect failed')
        return
      }
      const listing = await res.json() as { services: Array<{ name: string; image: string; volumes: Array<{ name?: string }>; binds: string[]; defaultQuiescence?: string; defaultApphookType?: string }> }
      setServices(listing.services.map(s => ({
        name: s.name,
        image: s.image,
        included: true,
        quiescence: (s.defaultQuiescence ?? 'stop') as ComposeServiceState['quiescence'],
        apphookType: s.defaultApphookType ?? 'postgres',
        passwordEnv: '',
        database: '',
        includedVolumes: s.volumes.map(v => v.name).filter(Boolean) as string[],
        includedBindMounts: s.binds,
        allVolumes: s.volumes.map(v => v.name).filter(Boolean) as string[],
        allBinds: s.binds,
      })))
    } catch {
      setInspectError('Network error')
    } finally {
      setInspecting(false)
    }
  }

  const update = (i: number, patch: Partial<ComposeServiceState>) =>
    setServices(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))

  // Build sourceConfig JSON for form submission
  const sourceConfig = JSON.stringify({
    projectName: projectName.trim(),
    includeComposeFile,
    includeEnvFiles,
    redactSecretsInEnvFiles: redactSecrets,
    includeContainerLabels: includeLabels,
    includeNetworkMetadata: includeNetworks,
    services: services.map(s => ({
      serviceName: s.name,
      included: s.included,
      quiescence: s.quiescence,
      apphookType: s.quiescence === 'apphook' ? s.apphookType : undefined,
      apphookConfig: s.quiescence === 'apphook' ? {
        host: `${projectName}_${s.name}`,
        passwordEnv: s.passwordEnv || undefined,
        database: s.database || undefined,
      } : undefined,
      includedVolumes: s.includedVolumes,
      includedBindMounts: s.includedBindMounts,
    })),
  })

  return (
    <div style={{ marginTop: 16 }}>
      <input type="hidden" name="sourceConfig" value={sourceConfig} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
          placeholder="proxyos-app"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => { void inspect() }}
          disabled={inspecting}
          style={{
            padding: '8px 14px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', background: 'var(--surf2)',
            color: 'var(--fg)', fontSize: 13, cursor: inspecting ? 'wait' : 'pointer',
          }}
        >
          {inspecting ? 'Inspecting…' : 'Inspect project'}
        </button>
      </div>

      {inspectError && <div style={{ fontSize: 11, color: 'var(--err)', marginBottom: 8 }}>{inspectError}</div>}

      {services.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {services.map((svc, i) => (
            <div key={svc.name} style={{
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              padding: 12, background: 'var(--surf2)',
            }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input type="checkbox" checked={svc.included} onChange={e => update(i, { included: e.target.checked })} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{svc.name}</span>
                <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>{svc.image}</span>
              </label>

              {svc.included && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={labelStyle}>Quiescence</label>
                    <select value={svc.quiescence} onChange={e => update(i, { quiescence: e.target.value as ComposeServiceState['quiescence'] })} style={inputStyle}>
                      <option value="none">None (back up live)</option>
                      <option value="pause">Pause container</option>
                      <option value="stop">Stop container</option>
                      <option value="apphook">App hook (dump)</option>
                    </select>
                  </div>
                  {svc.quiescence === 'apphook' && (
                    <div>
                      <label style={labelStyle}>Hook type</label>
                      <select value={svc.apphookType} onChange={e => update(i, { apphookType: e.target.value })} style={inputStyle}>
                        <option value="postgres">PostgreSQL</option>
                        <option value="mysql">MySQL / MariaDB</option>
                        <option value="redis">Redis</option>
                        <option value="sqlite">SQLite</option>
                      </select>
                    </div>
                  )}
                  {svc.quiescence === 'apphook' && (
                    <>
                      <div>
                        <label style={labelStyle}>Password env var</label>
                        <input type="text" value={svc.passwordEnv} onChange={e => update(i, { passwordEnv: e.target.value })} placeholder="PROXYOS_POSTGRES_PWD" style={inputStyle} />
                        <p style={hintStyle}>Name of env var set on the agent container.</p>
                      </div>
                      <div>
                        <label style={labelStyle}>Database name</label>
                        <input type="text" value={svc.database} onChange={e => update(i, { database: e.target.value })} placeholder="postgres" style={inputStyle} />
                      </div>
                    </>
                  )}
                  {svc.allVolumes.length > 0 && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Named volumes</label>
                      {svc.allVolumes.map(v => (
                        <label key={v} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, marginBottom: 3 }}>
                          <input
                            type="checkbox"
                            checked={svc.includedVolumes.includes(v)}
                            onChange={e => update(i, {
                              includedVolumes: e.target.checked
                                ? [...svc.includedVolumes, v]
                                : svc.includedVolumes.filter(x => x !== v),
                            })}
                          />
                          <code>{v}</code>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {([
              [includeComposeFile, setIncludeComposeFile, 'Include compose file'],
              [includeEnvFiles, setIncludeEnvFiles, 'Include env files'],
              [redactSecrets, setRedactSecrets, 'Redact secrets in env files'],
              [includeLabels, setIncludeLabels, 'Include container labels'],
              [includeNetworks, setIncludeNetworks, 'Include network metadata'],
            ] as [boolean, (v: boolean) => void, string][]).map(([val, setter, label]) => (
              <label key={label} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                <input type="checkbox" checked={val} onChange={e => setter(e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5.4: Wire ComposeProjectFields into SourceConfigSection**

  The `SourceConfigSection` component needs to pass an agent select ref and render `ComposeProjectFields` when `compose_project` is selected.

  At the top of `SourceConfigSection`, add a ref:
  ```typescript
  const agentSelectRef = React.useRef<HTMLSelectElement | null>(null)
  ```
  
  Note: the agent `<select>` is in the parent page (`jobs/new/page.tsx`), not in `SourceConfigSection`. The component already reads it by querying the DOM: `document.querySelector<HTMLSelectElement>('select[name="agentId"]')`. Use the same approach for `ComposeProjectFields` — pass a getter instead of a ref.

  Actually simpler: the `ComposeProjectFields` already does the DOM query internally (same as `handleDetect` in the parent). Keep it consistent. Change `agentIdRef` parameter to just do the DOM lookup internally:

  Update `ComposeProjectFields` signature to remove `agentIdRef`:
  ```typescript
  function ComposeProjectFields({ cfg }: { cfg: Cfg }) {
  ```
  
  And inside `inspect()`, find the agent ID the same way `handleDetect` does:
  ```typescript
    const inspect = async () => {
      const agentId = document.querySelector<HTMLSelectElement>('select[name="agentId"]')?.value
  ```
  
  Then in the render section of `SourceConfigSection`, add after the existing source-type fields:
  ```typescript
        {selected === 'compose_project' && <ComposeProjectFields cfg={cfg} />}
  ```

  Also add `import React` at the top if not already present (for `useRef`). The file already uses `useState` and `useCallback` from `'react'` — check if `React` is imported.

  Also update `DETECTABLE` — `compose_project` is **not** in this set (it has its own Inspect button):
  ```typescript
  const DETECTABLE = new Set(['filesystem', 'docker_volume', 'database'])
  ```
  This stays the same.

- [ ] **Step 5.5: Update createJob / parseSourceConfig to pass compose config through**

  Read `apps/web/app/actions/jobs.ts`.

  In `parseSourceConfig`, the `compose_project` type passes `sourceConfig` directly as hidden form JSON (not individual form fields). Add handling for it:

  After the `nas_share` block in `parseSourceConfig`, add:
  ```typescript
  } else if (sourceType === 'compose_project') {
    const raw = fd.get('sourceConfig') as string | null
    if (raw) {
      try { cfg = JSON.parse(raw) as Record<string, unknown> } catch { /* ignore */ }
    }
  ```

- [ ] **Step 5.6: Build and typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos
pnpm --filter @backupos/web typecheck 2>&1 | head -40
```

Expected: 0 errors (or only pre-existing ones).

- [ ] **Step 5.7: Commit**

```bash
git add apps/web/components/source-config-section.tsx apps/web/app/actions/jobs.ts
git commit -m "feat(ui): compose_project source type with per-service quiescence wizard"
```

---

## Task 6: Backup dispatch for compose_project (server side)

**Files:**
- Modify: `apps/web/lib/scheduler.ts`
- Modify: `apps/web/app/actions/jobs.ts`

The scheduler's internal `dispatchToAgent` and the `retryRun` action both need to handle `compose_project` by dispatching `run_compose_backup` instead of `run_backup`.

- [ ] **Step 6.1: Read scheduler.ts**

  Read `apps/web/lib/scheduler.ts` (full file needed).

- [ ] **Step 6.2: Update resolveBackupPaths and dispatchToAgent in scheduler.ts**

  In `resolveBackupPaths`, the function currently returns `[]` for unknown source types, which prevents dispatch. For `compose_project`, the path resolution happens on the agent side. We need the scheduler to dispatch `run_compose_backup` instead of `run_backup` for this type.

  **Edit A** — extend `SourceConfig` interface at the top of the file:
  ```typescript
  interface SourceConfig {
    paths?:    string[]
    volumes?:  string[]
    exclude?:  string[]
    projectName?: string
    services?: unknown[]
    includeComposeFile?: boolean
    includeEnvFiles?: boolean
    redactSecretsInEnvFiles?: boolean
    includeContainerLabels?: boolean
    includeNetworkMetadata?: boolean
  }
  ```

  **Edit B** — replace the `dispatchToAgent` function body. Find the existing logic from `const paths = resolveBackupPaths(...)` through `const sent = dispatch(...)`:

  Replace the block from `const paths = resolveBackupPaths(...)` to `return true` with:

  ```typescript
  const tags = job.tags ? (JSON.parse(job.tags) as string[]) : [`job:${job.id}`]
  const mountConfig = cfg['mountConfig'] ? (JSON.parse(cfg['mountConfig']) as MountConfig) : undefined

  let msg: ServerMessage

  if (job.sourceType === 'compose_project') {
    const composeCfg = srcConfig as import('@backupos/agent-protocol').ComposeProjectConfig
    msg = {
      type:         'run_compose_backup',
      jobId:        job.id,
      runId,
      config:       composeCfg,
      repoId:       job.repositoryId ?? '',
      repoUrl:      cfg['repositoryUrl'] ?? '',
      repoPassword: password,
      envVars:      cfg,
    }
  } else {
    const paths = resolveBackupPaths(job.sourceType, srcConfig)
    if (paths.length === 0) return false

    msg = {
      type:   'run_backup',
      jobId:  job.id,
      runId,
      config: {
        repoId:       job.repositoryId ?? '',
        repoUrl:      cfg['repositoryUrl'] ?? '',
        repoPassword: password,
        paths,
        exclude:  srcConfig.exclude,
        tags,
        envVars:  cfg,
        mountConfig,
      },
    }
  }

  const sent = dispatch(job.agentId, msg)
  if (!sent) {
    await db.update(backupRuns).set({
      status: 'failed', completedAt: now,
      errorMessage: 'Agent disconnected before dispatch',
    }).where(eq(backupRuns.id, runId))
    return false
  }

  await stampNextRun(db, job.id, job.schedule)
  console.log(`[scheduler] Dispatched job "${job.name}" to agent ${job.agentId}`)
  return true
  ```

- [ ] **Step 6.3: Update retryRun in actions/jobs.ts similarly**

  Read `apps/web/app/actions/jobs.ts`.

  In `retryRun`, find the dispatch block:
  ```typescript
      const result = await dispatchToAgent(job.agentId, {
        type:   'run_backup',
        jobId,
        runId,
        config: { repoId: job.repositoryId!, repoUrl: cfg['repositoryUrl'] ?? '', repoPassword: password, paths, exclude: srcConfig.exclude, tags, envVars: cfg },
      })
  ```

  Replace the block from `const srcConfig = ...` to the `dispatchToAgent` call with:
  ```typescript
      const srcConfig = JSON.parse(job.sourceConfig) as { paths?: string[]; volumes?: string[]; exclude?: string[] }
      const tags      = job.tags ? (JSON.parse(job.tags) as string[]) : [`job:${jobId}`]
      let result: { ok: boolean; reason?: string; knownIds?: string[] }

      if (job.sourceType === 'compose_project') {
        result = await dispatchToAgent(job.agentId, {
          type:         'run_compose_backup',
          jobId,
          runId,
          config:       srcConfig as import('@backupos/agent-protocol').ComposeProjectConfig,
          repoId:       job.repositoryId!,
          repoUrl:      cfg['repositoryUrl'] ?? '',
          repoPassword: password,
          envVars:      cfg,
        })
      } else {
        const paths = job.sourceType === 'docker_volume'
          ? (srcConfig.volumes ?? []).map(v => `/var/lib/docker/volumes/${v}/_data`)
          : (srcConfig.paths ?? [])
        result = await dispatchToAgent(job.agentId, {
          type:   'run_backup',
          jobId,
          runId,
          config: { repoId: job.repositoryId!, repoUrl: cfg['repositoryUrl'] ?? '', repoPassword: password, paths, exclude: srcConfig.exclude, tags, envVars: cfg },
        })
      }
  ```

- [ ] **Step 6.4: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos
pnpm --filter @backupos/web typecheck 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 6.5: Commit**

```bash
git add apps/web/lib/scheduler.ts apps/web/app/actions/jobs.ts
git commit -m "feat(scheduler): dispatch run_compose_backup for compose_project source type"
```

---

## Task 7: Compose backup handler in agent (quiescence=none, then full)

**Files:**
- Create: `packages/agent/src/handlers/composeBackup.ts`
- Modify: `packages/agent/src/agent.ts`

- [ ] **Step 7.1: Create composeBackup.ts**

Create `packages/agent/src/handlers/composeBackup.ts`:

```typescript
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { ResticEngine } from '@backupos/engine'
import { PostgresHook } from '@backupos/app-hooks'
import type { ComposeProjectConfig, ComposeServiceConfig, AgentMessage } from '@backupos/agent-protocol'
import {
  listComposeContainers,
  pauseContainer, unpauseContainer,
  stopContainer, startContainer, waitForRunning,
} from '../docker-client'

const BINARY  = process.env['RESTIC_BINARY_PATH']
const STAGING = process.env['STAGING_DIR'] ?? '/staging'

export interface RunComposeBackupMsg {
  type:         'run_compose_backup'
  jobId:        string
  runId:        string
  config:       ComposeProjectConfig
  repoId:       string
  repoUrl:      string
  repoPassword: string
  envVars?:     Record<string, string>
}

export async function handleComposeBackup(
  msg: RunComposeBackupMsg,
  send: (m: AgentMessage) => void,
): Promise<void> {
  const { jobId, runId, config, repoId, repoUrl, repoPassword, envVars = {} } = msg

  const stagingDir = path.join(STAGING, runId)
  fs.mkdirSync(stagingDir, { recursive: true })

  const paused:  string[] = []  // container IDs that were paused — must unpause on any exit
  const stopped: string[] = []  // container IDs that were stopped — must start on any exit

  const hookCleanups: Array<() => Promise<void>> = []

  try {
    // 1. Enumerate containers
    const containers = await listComposeContainers(config.projectName)
    const containerMap: Record<string, string> = {}
    for (const c of containers) {
      const svc = c.Labels['com.docker.compose.service']
      if (svc) containerMap[svc] = c.Id
    }

    // 2. Quiesce each included service
    for (const svc of config.services) {
      if (!svc.included) continue
      const containerId = containerMap[svc.serviceName]
      send({ type: 'backup_heartbeat', jobId, runId, phase: 'scanning', lastResticEventAt: Date.now() })

      if (svc.quiescence === 'pause') {
        if (containerId) { await pauseContainer(containerId); paused.push(containerId) }
      } else if (svc.quiescence === 'stop') {
        if (containerId) { await stopContainer(containerId); stopped.push(containerId) }
      } else if (svc.quiescence === 'apphook') {
        const cleanup = await runAppHook(svc, config.projectName, stagingDir, envVars)
        if (cleanup) hookCleanups.push(cleanup)
      }
    }

    // 3. Collect restic backup paths
    const backupPaths: string[] = []

    for (const svc of config.services) {
      if (!svc.included) continue
      for (const volName of svc.includedVolumes) {
        const p = `/var/lib/docker/volumes/${volName}/_data`
        if (fs.existsSync(p)) backupPaths.push(p)
      }
      for (const bindPath of svc.includedBindMounts) {
        if (fs.existsSync(bindPath)) backupPaths.push(bindPath)
      }
    }

    if (config.includeComposeFile && config.composeFilePath && fs.existsSync(config.composeFilePath)) {
      const dest = path.join(stagingDir, 'docker-compose.yml')
      fs.copyFileSync(config.composeFilePath, dest)
    }

    if (fs.readdirSync(stagingDir).length > 0) backupPaths.push(stagingDir)

    send({ type: 'backup_heartbeat', jobId, runId, phase: 'uploading', lastResticEventAt: Date.now() })

    // 4. Restic backup
    const engine = new ResticEngine({
      repositoryUrl: repoUrl,
      password:      repoPassword,
      envVars,
      binaryPath:    BINARY,
    })

    // Ensure repo is initialised (same guard as runBackup)
    try { await engine.init() } catch { /* already initialised */ }

    const tags = [`compose:${config.projectName}`, `job:${jobId}`, `host:${os.hostname()}`]
    const result = await engine.backup({ paths: backupPaths, tags,
      onProgress: s => {
        send({
          type: 'backup_progress', jobId,
          pct: s.pct, filesProcessed: s.filesDone, bytesProcessed: s.bytesDone,
          filesTotal: s.filesTotal, bytesTotal: s.bytesTotal,
          secondsRemaining: s.secondsRemaining,
        })
      },
    })

    // 5. Resume services
    for (const id of [...paused]) await unpauseContainer(id).catch(e => console.warn('[agent] unpause failed:', e))
    paused.length = 0
    for (const id of [...stopped]) {
      await startContainer(id).catch(e => console.warn('[agent] start failed:', e))
      await waitForRunning(id, 30_000).catch(() => {})
    }
    stopped.length = 0

    // 6. App hook cleanup (deletes temp dump files)
    for (const cleanup of hookCleanups) await cleanup().catch(() => {})

    // 7. Staging cleanup
    fs.rmSync(stagingDir, { recursive: true, force: true })

    send({
      type: 'backup_complete',
      jobId,
      snapshotId: result.snapshotId,
      stats: {
        filesNew:            result.filesNew,
        filesChanged:        result.filesChanged,
        filesUnmodified:     result.filesUnmodified,
        dataAdded:           result.dataAdded,
        totalFilesProcessed: result.filesNew + result.filesChanged + result.filesUnmodified,
        totalBytesProcessed: result.totalSize ?? 0,
        durationMs:          result.duration  ?? 0,
      },
    })

  } catch (err) {
    // Always attempt to resume services before reporting failure
    for (const id of [...paused]) await unpauseContainer(id).catch(() => {})
    for (const id of [...stopped]) await startContainer(id).catch(() => {})
    for (const cleanup of hookCleanups) await cleanup().catch(() => {})
    try { fs.rmSync(stagingDir, { recursive: true, force: true }) } catch {}

    const error  = err instanceof Error ? err.message : String(err)
    const detail = err instanceof Error && err.stack ? err.stack : ''
    send({ type: 'backup_failed', jobId, error, detail })
    console.error(`[agent] compose backup failed job=${jobId}:`, error)
  }
}

async function runAppHook(
  svc: ComposeServiceConfig,
  projectName: string,
  stagingDir: string,
  envVars: Record<string, string>,
): Promise<(() => Promise<void>) | null> {
  if (!svc.apphookType || !svc.apphookConfig) return null

  const cfg = svc.apphookConfig
  const passwordEnv = cfg.passwordEnv
  const password = passwordEnv ? (process.env[passwordEnv] ?? envVars[passwordEnv] ?? '') : ''
  const host = cfg.host ?? `${projectName}_${svc.serviceName}`

  if (svc.apphookType === 'postgres') {
    const hook = new PostgresHook()
    const hookCfg = {
      appType:  'postgres' as const,
      host,
      port:     cfg.port ?? 5432,
      username: cfg.username ?? 'postgres',
      password,
      database: cfg.database,
    }
    const preResult = await hook.pre(hookCfg)
    if (preResult.dumpPath) {
      const dest = path.join(stagingDir, `${svc.serviceName}-pg.dump`)
      fs.copyFileSync(preResult.dumpPath, dest)
    }
    return () => hook.post(hookCfg, preResult)
  }

  // mysql/redis/sqlite hooks: same pattern using their respective Hook classes from @backupos/app-hooks
  // (add when testing with those services)
  return null
}
```

- [ ] **Step 7.2: Register run_compose_backup in agent.ts**

  In `handleMessage`, after the `list_compose_project` block added in Task 4, add:

```typescript
  } else if (msg.type === 'run_compose_backup') {
    void (async () => {
      const { handleComposeBackup } = await import('./handlers/composeBackup')
      await handleComposeBackup(msg, send)
    })()
```

- [ ] **Step 7.3: Build agent**

```bash
cd /Users/dariusvorster/Projects/backupos
pnpm --filter @backupos/agent build
```

Expected: 0 errors.

- [ ] **Step 7.4: ⚠️ SMOKE TEST — stop here until Dockee01 passes**

  On Dockee01, deploy the updated agent bundle. Create a `compose_project` job for `proxyos-app` with `quiescence='none'` on all services. Click Run now.

  **Verify:**
  1. Agent log shows `compose backup failed` or `backup_complete` — no silent hang
  2. Server run detail page shows the run reaching `success`
  3. `restic snapshots --tag compose:proxyos-app` on the repo shows a new snapshot
  4. Snapshot contains `/var/lib/docker/volumes/proxyos-app_postgres-data/_data`

  **Do not proceed to Task 8 until this passes.**

- [ ] **Step 7.5: Commit**

```bash
git add packages/agent/src/handlers/composeBackup.ts packages/agent/src/agent.ts
git commit -m "feat(agent): compose backup handler — quiescence and restic execution"
```

---

## Task 8: MySQL, Redis, SQLite app hooks + env-file redaction

**Files:**
- Modify: `packages/agent/src/handlers/composeBackup.ts`

The `runAppHook` function in composeBackup.ts currently only handles `postgres`. Extend it for the other three hook types.

- [ ] **Step 8.1: Read the existing hook implementations in packages/app-hooks**

  Read `packages/app-hooks/src/mysql.ts`, `packages/app-hooks/src/redis.ts`, `packages/app-hooks/src/sqlite.ts` to understand their interfaces.

- [ ] **Step 8.2: Extend runAppHook in composeBackup.ts**

  Replace the comment `// mysql/redis/sqlite hooks: same pattern...` with:

```typescript
  if (svc.apphookType === 'mysql') {
    const { MySQLHook } = await import('@backupos/app-hooks')
    const hook = new MySQLHook()
    const hookCfg = {
      appType:  'mysql' as const,
      host,
      port:     cfg.port ?? 3306,
      username: cfg.username ?? 'root',
      password,
      database: cfg.database,
    }
    const preResult = await hook.pre(hookCfg)
    if (preResult.dumpPath) {
      fs.copyFileSync(preResult.dumpPath, path.join(stagingDir, `${svc.serviceName}-mysql.dump`))
    }
    return () => hook.post(hookCfg, preResult)
  }

  if (svc.apphookType === 'redis') {
    const { RedisHook } = await import('@backupos/app-hooks')
    const hook = new RedisHook()
    const hookCfg = { appType: 'redis' as const, host, port: cfg.port ?? 6379, password }
    const preResult = await hook.pre(hookCfg)
    if (preResult.dumpPath) {
      fs.copyFileSync(preResult.dumpPath, path.join(stagingDir, `${svc.serviceName}-redis.dump`))
    }
    return () => hook.post(hookCfg, preResult)
  }

  if (svc.apphookType === 'sqlite') {
    const { SQLiteHook } = await import('@backupos/app-hooks')
    const hook = new SQLiteHook()
    const dbPath = cfg.dbPath ?? ''
    if (!dbPath) return null
    const hookCfg = { appType: 'sqlite' as const, database: dbPath }
    const preResult = await hook.pre(hookCfg)
    if (preResult.dumpPath) {
      fs.copyFileSync(preResult.dumpPath, path.join(stagingDir, `${svc.serviceName}-sqlite.dump`))
    }
    return () => hook.post(hookCfg, preResult)
  }
```

  Note: import class names from the `@backupos/app-hooks` package's `src/index.ts`. Verify the exported names match before this step.

- [ ] **Step 8.3: Add env file redaction**

  In `handleComposeBackup`, after the compose file copy block, add:

```typescript
    // Redact and copy env files if enabled
    if (config.includeEnvFiles && config.composeFilePath) {
      const projectDir = path.dirname(config.composeFilePath)
      const candidates = ['.env', '.env.local', '.env.production']
      for (const envFile of candidates) {
        const src = path.join(projectDir, envFile)
        if (!fs.existsSync(src)) continue
        let content = fs.readFileSync(src, 'utf-8')
        if (config.redactSecretsInEnvFiles) content = redactEnvFile(content)
        fs.writeFileSync(path.join(stagingDir, envFile), content)
      }
    }
```

  And add the `redactEnvFile` helper function at the bottom of the file:

```typescript
function redactEnvFile(content: string): string {
  return content.split('\n').map(line => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) return line
    const [, key] = m
    if (/(PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL|PRIVATE)/i.test(key!)) {
      return `${key!}=<REDACTED>`
    }
    return line
  }).join('\n')
}
```

- [ ] **Step 8.4: Build and test**

```bash
cd /Users/dariusvorster/Projects/backupos
pnpm --filter @backupos/agent build
```

- [ ] **Step 8.5: Commit**

```bash
git add packages/agent/src/handlers/composeBackup.ts
git commit -m "feat(agent): mysql/redis/sqlite app hooks + env file redaction in compose backup"
```

---

## Task 9: Restore flow

**Files:**
- Create: `packages/agent/src/handlers/composeRestore.ts`
- Modify: `packages/agent/src/agent.ts`
- Create: `apps/web/app/(dashboard)/restore/compose/page.tsx`

- [ ] **Step 9.1: Create composeRestore.ts**

Create `packages/agent/src/handlers/composeRestore.ts`:

```typescript
import * as path from 'path'
import * as fs from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { ResticEngine } from '@backupos/engine'
import type { ComposeRestoreConfig, AgentMessage } from '@backupos/agent-protocol'
import { stopContainer, startContainer, waitForRunning, listComposeContainers } from '../docker-client'

const execFileAsync = promisify(execFile)
const BINARY = process.env['RESTIC_BINARY_PATH']

export interface RunComposeRestoreMsg {
  type:         'run_compose_restore'
  jobId:        string
  runId:        string
  config:       ComposeRestoreConfig
  repoUrl:      string
  repoPassword: string
  envVars?:     Record<string, string>
}

export async function handleComposeRestore(
  msg: RunComposeRestoreMsg,
  send: (m: AgentMessage) => void,
): Promise<void> {
  const { jobId, runId, config, repoUrl, repoPassword, envVars = {} } = msg
  const targetProject = config.newProjectName ?? config.projectName
  const inPlace = !config.newProjectName

  try {
    const engine = new ResticEngine({
      repositoryUrl: repoUrl,
      password:      repoPassword,
      envVars,
      binaryPath:    BINARY,
    })

    send({ type: 'restore_progress', restoreId: runId, step: 'stopping', status: 'Stopping stack' })

    // Step 1: If in-place, stop the running stack
    if (inPlace) {
      const containers = await listComposeContainers(config.projectName)
      for (const c of containers) {
        await stopContainer(c.Id, 15).catch(() => {})
      }
    }

    send({ type: 'restore_progress', restoreId: runId, step: 'restoring', status: 'Restoring volumes from snapshot' })

    // Step 2: restic restore — target / to restore to original paths
    // Signature: restore(snapshotId: string, target: string, include?: string[])
    await engine.restore(config.snapshotId, '/', ['/var/lib/docker/volumes'])

    send({ type: 'restore_progress', restoreId: runId, step: 'starting', status: 'Starting stack' })

    // Step 3: docker compose up — agent doesn't have docker compose CLI but can start individual containers
    // For now: start each stopped container (for in-place, same containers as stopped)
    if (inPlace) {
      const containers = await listComposeContainers(config.projectName)
      for (const c of containers) {
        await startContainer(c.Id).catch(() => {})
        await waitForRunning(c.Id, 30_000).catch(() => {})
      }
    }

    send({ type: 'restore_complete', restoreId: runId, success: true })

  } catch (err) {
    const error  = err instanceof Error ? err.message : String(err)
    const detail = err instanceof Error && err.stack ? err.stack : ''
    send({ type: 'restore_complete', restoreId: runId, success: false })
    console.error(`[agent] compose restore failed job=${jobId}:`, error, detail)
  }
}
```

  Note: `ResticEngine.restore()` signature confirmed — `restore(snapshotId: string, target: string, include?: string[])` at `packages/engine/src/restic.ts:179`. No changes to the engine needed.

- [ ] **Step 9.2: Register run_compose_restore in agent.ts**

  In `handleMessage`, after the `run_compose_backup` block:

```typescript
  } else if (msg.type === 'run_compose_restore') {
    void (async () => {
      const { handleComposeRestore } = await import('./handlers/composeRestore')
      await handleComposeRestore(msg, send)
    })()
```

- [ ] **Step 9.3: Create a minimal restore UI page**

Create `apps/web/app/(dashboard)/restore/compose/page.tsx`:

```tsx
import { getDb, backupJobs, snapshots, agents, eq } from '@backupos/db'

export default async function ComposeRestorePage() {
  const db = getDb()
  const composeJobs = await db.select()
    .from(backupJobs)
    .where(eq(backupJobs.sourceType, 'compose_project'))
    .all()

  const agentList = await db.select().from(agents).all()

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>
        Restore compose stack
      </h1>
      <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 32 }}>
        Restore a Docker Compose stack from a Restic snapshot.
        Select the job, pick a snapshot, choose restore mode.
      </p>

      {composeJobs.length === 0 ? (
        <div style={{
          padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--fg-dim)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        }}>
          No compose project jobs found. Create one first.
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24 }}>
          <p style={{ fontSize: 13, color: 'var(--fg-mute)' }}>
            Compose stack restore wizard — full implementation in Phase B item 5.
            For now, use the restic CLI directly:
          </p>
          <pre style={{
            marginTop: 16, padding: 16, background: 'var(--surf2)',
            borderRadius: 'var(--radius-sm)', fontSize: 12,
            fontFamily: 'var(--font-mono)', color: 'var(--fg)', overflowX: 'auto',
          }}>{`# 1. Find your snapshot
restic snapshots --tag compose:<project-name>

# 2. Restore volumes
restic restore <snapshot-id> --target / \\
  --include /var/lib/docker/volumes/<vol>/_data

# 3. Start the stack
docker compose up -d`}</pre>
          <p style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 12 }}>
            Full UI restore wizard (in-place + side-by-side modes) ships in a follow-up.
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 9.4: Typecheck + build**

```bash
cd /Users/dariusvorster/Projects/backupos
pnpm --filter @backupos/agent build
pnpm --filter @backupos/web typecheck 2>&1 | head -30
```

- [ ] **Step 9.5: Commit**

```bash
git add packages/agent/src/handlers/composeRestore.ts packages/agent/src/agent.ts apps/web/app/\(dashboard\)/restore/compose/page.tsx
git commit -m "feat(agent): compose restore handler + placeholder restore UI page"
```

---

## Task 10: Container image + reference compose recipe

**Files:**
- Create: `apps/agent-container/Dockerfile`
- Create: `apps/web/public/agent/docker-compose.yml`

- [ ] **Step 10.1: Check existing Dockerfile for patterns**

  Read `Dockerfile` (root) to understand the base image and restic download pattern.

- [ ] **Step 10.2: Create apps/agent-container/Dockerfile**

```bash
mkdir -p /Users/dariusvorster/Projects/backupos/apps/agent-container
```

Create `apps/agent-container/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

# ── Base ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base

RUN apk add --no-cache \
    tini \
    curl \
    bzip2 \
    # PostgreSQL client (pg_dump, pg_restore)
    postgresql-client \
    # MariaDB client (mysqldump + mysql CLI)
    mariadb-client \
    # Redis CLI
    redis \
    # SQLite
    sqlite \
    # Utilities
    tar gzip xz

# Download restic for the target arch
ARG RESTIC_VERSION=0.17.3
ARG TARGETARCH
RUN RESTIC_ARCH=$(case "$TARGETARCH" in \
      arm64) echo "arm64" ;; \
      arm)   echo "arm"   ;; \
      *)     echo "amd64" ;; \
    esac) \
    && curl -fsSL \
       "https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/restic_${RESTIC_VERSION}_linux_${RESTIC_ARCH}.bz2" \
    | bunzip2 -c > /usr/local/bin/restic \
    && chmod +x /usr/local/bin/restic \
    && restic version

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM base AS runtime
WORKDIR /app

# The bundle.js is the compiled agent — mount or COPY at build time
# Default path; override with RESTIC_BINARY_PATH env if needed
ENV RESTIC_BINARY_PATH=/usr/local/bin/restic
ENV STAGING_DIR=/staging

# bundle.js is served from the BackupOS server and downloaded at install time.
# For the container image, we expect it to be baked in via CI (see agent-image.yml).
COPY bundle.js /app/bundle.js

# Staging directory for app-hook dumps and compose file copies
RUN mkdir -p /staging

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "/app/bundle.js"]
```

- [ ] **Step 10.3: Create apps/web/public/agent/docker-compose.yml**

  Ensure the directory exists:
```bash
mkdir -p /Users/dariusvorster/Projects/backupos/apps/web/public/agent
```

  Create `apps/web/public/agent/docker-compose.yml`:

```yaml
# BackupOS container agent — paste this onto any host you want to back up.
# 1. Copy this file to ~/backupos-agent/docker-compose.yml
# 2. Create ~/backupos-agent/.env with:
#      BACKUPOS_URL=ws://your-backupos-server:3093/ws/agent
#      BACKUPOS_TOKEN=<token generated during enrollment>
# 3. Run: docker compose up -d

services:
  socket-proxy:
    image: tecnativa/docker-socket-proxy:0.3
    container_name: backupos-socket-proxy
    restart: unless-stopped
    privileged: true
    environment:
      # Whitelist — only what the agent needs
      CONTAINERS: 1
      IMAGES: 1
      NETWORKS: 1
      VOLUMES: 1
      POST: 1
      # Everything else denied
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
    image: ghcr.io/dariusvorster/backupos-agent:latest
    container_name: backupos-agent
    restart: unless-stopped
    depends_on:
      - socket-proxy
    environment:
      BACKUPOS_URL: ${BACKUPOS_URL}
      BACKUPOS_TOKEN: ${BACKUPOS_TOKEN}
      DOCKER_HOST: tcp://socket-proxy:2375
      RESTIC_BINARY_PATH: /usr/local/bin/restic
      STAGING_DIR: /staging
      # For app-hook password injection, add env vars here:
      # PROXYOS_POSTGRES_PASSWORD: your-password
    volumes:
      # Named volumes — read-only for restic
      - /var/lib/docker/volumes:/var/lib/docker/volumes:ro
      # Bind mounts — add any paths you want to back up:
      # - /home/user/configs:/host/home/user/configs:ro
      # Staging area for app-hook dumps
      - /tmp/backupos-staging:/staging:rw
    networks:
      - backupos-internal
      # Add target stack networks for app-hooks:
      # - proxyos-app_default

networks:
  backupos-internal:
    driver: bridge
```

- [ ] **Step 10.4: Commit**

```bash
git add apps/agent-container/Dockerfile apps/web/public/agent/docker-compose.yml
git commit -m "feat(container): agent Dockerfile and compose deployment recipe"
```

---

## Task 11: Multi-arch CI workflow

**Files:**
- Create: `.github/workflows/agent-image.yml`

- [ ] **Step 11.1: Read existing docker-release.yml for patterns**

  Run: `cat /Users/dariusvorster/Projects/backupos/.github/workflows/docker-release.yml`

- [ ] **Step 11.2: Create agent-image.yml**

Create `.github/workflows/agent-image.yml`:

```yaml
name: Build & Push Agent Container Image

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository_owner }}/backupos-agent

jobs:
  build-and-push:
    name: Build multi-arch agent image
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Build agent bundle
        run: |
          bun run --filter @backupos/agent build
          # bundle.js is output directly to apps/web/public/agent/bundle.js by the build script
          cp apps/web/public/agent/bundle.js apps/agent-container/bundle.js

      - name: Set up QEMU (for arm/v7 emulation)
        uses: docker/setup-qemu-action@v3
        with:
          platforms: arm,arm64

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=tag
            type=sha,prefix=sha-,format=short
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push multi-arch image
        uses: docker/build-push-action@v5
        with:
          context: apps/agent-container
          platforms: linux/amd64,linux/arm64,linux/arm/v7
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

  Note: `packages/agent/dist/bundle.js` — verify the actual output path with `cat packages/agent/package.json | grep -A5 '"build"'` before using this workflow. Adjust the `cp` path if the bundle lands elsewhere.

- [ ] **Step 11.3: Commit**

```bash
git add .github/workflows/agent-image.yml
git commit -m "ci: multi-arch container agent image build workflow"
```

---

## Task 12: Deprecation banner for docker_volume jobs

**Files:**
- Modify: `apps/web/app/(dashboard)/jobs/[id]/page.tsx`

- [ ] **Step 12.1: Read the job detail page**

  Read `apps/web/app/(dashboard)/jobs/[id]/page.tsx`.

- [ ] **Step 12.2: Add the deprecation banner**

  At the top of the page component's JSX return, after the page header and before the job details, add:

```tsx
{job.sourceType === 'docker_volume' && (
  <div style={{
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '12px 16px', marginBottom: 20,
    backgroundColor: 'color-mix(in srgb, var(--surf) 80%, orange 10%)',
    border: '1px solid color-mix(in srgb, var(--border) 60%, orange 30%)',
    borderRadius: 'var(--radius)',
    fontSize: 13,
  }}>
    <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
    <div>
      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--fg)' }}>
        Deprecated source type: docker_volume
      </div>
      <div style={{ color: 'var(--fg-mute)', lineHeight: 1.5 }}>
        This job uses the legacy <code>docker_volume</code> source type which backs up volumes without
        app awareness or quiescence. Migrate to a <strong>Compose project</strong> job for reliable,
        app-aware backups.{' '}
        <a href={`/jobs/new?sourceType=compose_project&agentId=${job.agentId ?? ''}`}
           style={{ color: 'var(--accent)' }}>
          Create a compose_project job
        </a>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 12.3: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos
pnpm --filter @backupos/web typecheck 2>&1 | head -20
```

- [ ] **Step 12.4: Full build**

```bash
cd /Users/dariusvorster/Projects/backupos
npm run build 2>&1 | tail -20
```

Expected: exits 0.

- [ ] **Step 12.5: Commit**

```bash
git add apps/web/app/\(dashboard\)/jobs/\[id\]/page.tsx
git commit -m "feat(ui): deprecation banner on docker_volume jobs with link to compose_project migration"
```

---

## Self-review against spec

### Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Item 1 — Capability detection | Task 2 |
| Item 2 — Container image + compose recipe | Task 10 |
| Item 3 — compose_project source type (read path) | Task 4 |
| Item 4 — Backup execution flow | Tasks 6–8 |
| Item 5 — Restore flow | Task 9 |
| Item 6 — UI changes | Task 5 |
| Item 7 — docker_volume deprecation banner | Task 12 |
| Item 8 — Multi-arch CI | Task 11 |
| **Scope addition** — server sends force_update on hello hash mismatch | Task 2 |

### Gaps / notes

- `ResticEngine.restore()` in Task 9 — must verify the method exists before implementing. Run `grep -r 'restore' packages/engine/src/` first.
- The restore UI (Task 9) is intentionally a placeholder. The full in-place + side-by-side wizard is a follow-on.
- `apps/agent-container/bundle.js` in the CI workflow — must match the actual build output path. Verify with `pnpm --filter @backupos/agent build` and check where bundle.js lands.
- App hook class names (`MysqlHook`, `RedisHook`, `SqliteHook`) — verify export names in `packages/app-hooks/src/index.ts` before Task 8.
