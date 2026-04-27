# Compose Project Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users restore a compose_project backup (side-by-side or in-place) from the BackupOS UI, dispatching the restore through the agent WebSocket protocol.

**Architecture:** The agent receives a `run_compose_restore` message, stops services (in-place only), calls `restic restore` per volume, and either overwrites existing volumes (in-place) or populates new Docker volumes (side-by-side). The server creates a `backupRun` row with `runType='restore'` before dispatch and relies on the existing `backup_complete`/`backup_failed` handler to finalize it. The UI lives at `/restore/compose/new` and gates in-place mode behind a checkbox + confirm-text field.

**Tech Stack:** TypeScript, Next.js App Router server actions, Drizzle ORM (SQLite), restic CLI, Docker CLI, `@backupos/agent-protocol` WebSocket protocol, `@backupos/engine` ResticEngine.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/agent-protocol/src/index.ts` | Modify | Extend `ComposeRestoreConfig`; add `repoId` to `run_compose_restore` |
| `packages/db/src/schema.ts` | Modify | Add `runType` column to `backupRuns` |
| `packages/db/migrations/0027_run_type.sql` | Create | `ALTER TABLE backup_runs ADD COLUMN run_type TEXT DEFAULT 'backup'` |
| `packages/db/migrations/meta/_journal.json` | Modify | Register migration idx 27 |
| `packages/agent/src/exec-allowed.ts` | Modify | Add `cp` to allowlist |
| `packages/agent/src/handlers/composeRestore.ts` | Create | Full restore logic: stop → restore volumes → restart / side-by-side copy |
| `packages/agent/src/agent.ts` | Modify | Add `run_compose_restore` dispatch case |
| `apps/web/app/actions/compose-restore.ts` | Create | `triggerComposeRestore` server action |
| `apps/web/app/(dashboard)/restore/compose/new/page.tsx` | Create | Server component: loads jobs + runs data |
| `apps/web/app/(dashboard)/restore/compose/new/compose-restore-wizard.tsx` | Create | Client component: multi-step form |

---

## Task 1: Protocol — extend ComposeRestoreConfig

**Files:**
- Modify: `packages/agent-protocol/src/index.ts:119-164`

- [ ] **Step 1: Replace ComposeRestoreConfig and update run_compose_restore**

Replace lines 119–123 (old `ComposeRestoreConfig`) and update line 164 (`run_compose_restore` message):

```typescript
// ── REPLACE the existing ComposeRestoreConfig interface (lines 119-123) ──
export interface ComposeRestoreConfig {
  mode: 'in_place' | 'side_by_side'
  snapshotIds: string[]              // one per included service, same order as composeConfig.services
  composeConfig: ComposeProjectConfig
  restoreComposeFile: boolean
  sideBySideProjectName?: string     // required when mode === 'side_by_side'
}

// ── REPLACE the run_compose_restore entry in ServerMessage (line 164) ──
  | { type: 'run_compose_restore'; jobId: string; runId: string; repoId: string; config: ComposeRestoreConfig; repoUrl: string; repoPassword: string; envVars?: Record<string, string> }
```

Full diff for `packages/agent-protocol/src/index.ts`:

```diff
-export interface ComposeRestoreConfig {
-  projectName: string
-  newProjectName?: string   // omit for in-place; set for side-by-side
-  snapshotId: string
-}
+export interface ComposeRestoreConfig {
+  mode: 'in_place' | 'side_by_side'
+  snapshotIds: string[]
+  composeConfig: ComposeProjectConfig
+  restoreComposeFile: boolean
+  sideBySideProjectName?: string
+}
```

```diff
-  | { type: 'run_compose_restore'; jobId: string; runId: string; config: ComposeRestoreConfig; repoUrl: string; repoPassword: string; envVars?: Record<string, string> }
+  | { type: 'run_compose_restore'; jobId: string; runId: string; repoId: string; config: ComposeRestoreConfig; repoUrl: string; repoPassword: string; envVars?: Record<string, string> }
```

- [ ] **Step 2: Commit**

```bash
git add packages/agent-protocol/src/index.ts
git commit -m "feat(protocol): extend ComposeRestoreConfig with mode/snapshotIds/composeConfig fields"
```

---

## Task 2: DB — add run_type column

**Files:**
- Modify: `packages/db/src/schema.ts:160-161` (after `bandwidthLimitKbps`)
- Create: `packages/db/migrations/0027_run_type.sql`
- Modify: `packages/db/migrations/meta/_journal.json`

- [ ] **Step 1: Add runType to schema**

In `packages/db/src/schema.ts`, add after the `bandwidthLimitKbps` line (currently line 161):

```typescript
  // Resolved at trigger time — agent applies this limit (null = unlimited)
  bandwidthLimitKbps: integer('bandwidth_limit_kbps'),

  // 'backup' (default) or 'restore'
  runType: text('run_type').default('backup'),
```

- [ ] **Step 2: Create migration SQL**

Create `packages/db/migrations/0027_run_type.sql`:

```sql
ALTER TABLE backup_runs ADD COLUMN run_type TEXT DEFAULT 'backup';
```

- [ ] **Step 3: Register migration in journal**

In `packages/db/migrations/meta/_journal.json`, append to the `entries` array:

```json
    {
      "idx": 27,
      "version": "6",
      "when": 1777161600000,
      "tag": "0027_run_type",
      "breakpoints": true
    }
```

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations/0027_run_type.sql packages/db/migrations/meta/_journal.json
git commit -m "feat(db): add run_type column to backup_runs (backup|restore)"
```

---

## Task 3: exec-allowed — add cp

**Files:**
- Modify: `packages/agent/src/exec-allowed.ts:3-10`

- [ ] **Step 1: Add cp to the allowlist**

```typescript
export const ALLOWED_COMMANDS = new Set([
  'restic',
  'pg_dump',
  'mysqldump',
  'redis-cli',
  'sqlite3',
  'docker',
  'cp',
])
```

- [ ] **Step 2: Commit**

```bash
git add packages/agent/src/exec-allowed.ts
git commit -m "feat(agent): add cp to exec-allowed for side-by-side volume copy"
```

---

## Task 4: Agent handler — composeRestore.ts

**Files:**
- Create: `packages/agent/src/handlers/composeRestore.ts`

- [ ] **Step 1: Create the handler**

Create `packages/agent/src/handlers/composeRestore.ts` with this exact content:

```typescript
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { ResticEngine } from '@backupos/engine'
import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'
import { listComposeContainers, stopContainer, startContainer, waitForRunning } from '../docker-client'
import { spawnAllowed } from '../exec-allowed'

type SendFn = (msg: AgentMessage) => void
type RunMsg = Extract<ServerMessage, { type: 'run_compose_restore' }>

interface ActiveJobRef {
  ctrl: AbortController
  runId: string
  phase: string
  lastResticEventAt: number
  cancelled: boolean
}

export async function runComposeRestore(
  msg: RunMsg,
  send: SendFn,
  activeJobs: Map<string, ActiveJobRef>,
  binaryPath: string | undefined,
): Promise<void> {
  const { jobId, runId, repoUrl, repoPassword, envVars, config } = msg
  const { mode, snapshotIds, composeConfig, restoreComposeFile, sideBySideProjectName } = config

  if (activeJobs.has(jobId)) {
    console.warn(`[agent] run_compose_restore: job ${jobId} already active — ignoring`)
    return
  }

  const ctrl = new AbortController()
  activeJobs.set(jobId, { ctrl, runId, phase: 'starting', lastResticEventAt: Date.now(), cancelled: false })

  const logLines: string[] = []
  const tmpDir = path.join(os.tmpdir(), 'backupos-restore', jobId)

  const setPhase = (phase: string): void => {
    const j = activeJobs.get(jobId)
    if (j) { j.phase = phase; j.lastResticEventAt = Date.now() }
  }

  const makeEngine = () => new ResticEngine({
    repositoryUrl: repoUrl,
    password:      repoPassword,
    envVars:       envVars ?? {},
    binaryPath,
  })

  const services = composeConfig.services?.filter(s => s.included) ?? []

  // The compose file snapshot, if present, is appended after all service snapshots
  const serviceSnapshotIds = snapshotIds.slice(0, services.length)
  const composeFileSnapshotId = restoreComposeFile && snapshotIds.length > services.length
    ? snapshotIds[services.length]
    : undefined

  if (serviceSnapshotIds.length !== services.length) {
    send({
      type:   'backup_failed',
      jobId,
      error:  `service/snapshot count mismatch: ${services.length} services vs ${serviceSnapshotIds.length} snapshots`,
      detail: '',
    })
    activeJobs.delete(jobId)
    return
  }

  // For in-place: track stopped container IDs for best-effort restart on failure
  const stoppedContainerIds: string[] = []

  try {
    await fs.mkdir(tmpDir, { recursive: true })

    if (mode === 'in_place') {
      setPhase('quiescing')
      for (const service of services) {
        const containers = await listComposeContainers(composeConfig.projectName)
        const target = containers.find(c => (c.Labels['com.docker.compose.service'] ?? '') === service.serviceName)
        if (target) {
          await stopContainer(target.Id)
          stoppedContainerIds.push(target.Id)
          logLines.push(`[restore] stopped "${service.serviceName}"`)
        } else {
          logLines.push(`[restore] WARN: "${service.serviceName}" not found — skipping stop`)
        }
      }
    }

    setPhase('uploading')

    for (let i = 0; i < services.length; i++) {
      const service = services[i]!
      const snapshotId = serviceSnapshotIds[i]!

      for (const origVolName of service.includedVolumes) {
        const sourcePath = `/var/lib/docker/volumes/${origVolName}/_data`

        if (mode === 'in_place') {
          await makeEngine().restore(snapshotId, '/', [sourcePath])
          logLines.push(`[restore] restored "${service.serviceName}" vol ${origVolName} (in-place)`)
        } else {
          // side_by_side: restore to tmpDir, create new volume, copy contents
          const newVolName = origVolName.startsWith(`${composeConfig.projectName}_`)
            ? `${sideBySideProjectName!}${origVolName.slice(composeConfig.projectName.length)}`
            : `${sideBySideProjectName!}_${origVolName}`

          await spawnAllowed('docker', ['volume', 'create', newVolName])

          await makeEngine().restore(snapshotId, tmpDir, [sourcePath])

          // tmpDir/<sourcePath> contains the restored files
          const restoreDest = path.join(tmpDir, 'var', 'lib', 'docker', 'volumes', origVolName, '_data')
          const newVolPath  = `/var/lib/docker/volumes/${newVolName}/_data`
          await spawnAllowed('cp', ['-a', `${restoreDest}/.`, `${newVolPath}/`])

          logLines.push(`[restore] restored "${service.serviceName}" ${origVolName} → ${newVolName} (side-by-side)`)
        }
      }
    }

    // Optional compose file restore
    if (composeFileSnapshotId && composeConfig.composeFilePath) {
      if (mode === 'in_place') {
        await makeEngine().restore(composeFileSnapshotId, '/', [composeConfig.composeFilePath])
        logLines.push(`[restore] restored compose file to ${composeConfig.composeFilePath}`)
      } else {
        logLines.push(`[restore] NOTE: compose file restore skipped for side-by-side mode — original file unchanged`)
      }
    }

    if (mode === 'in_place') {
      setPhase('resuming')
      for (const containerId of stoppedContainerIds) {
        try {
          await startContainer(containerId)
          await waitForRunning(containerId, 30_000)
        } catch (err) {
          logLines.push(`[restore] WARN: failed to restart container ${containerId}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      logLines.push('[restore] in-place restore complete — all services restarted')
    } else {
      logLines.push(`[restore] side-by-side complete. Original "${composeConfig.projectName}" stack untouched. New volumes prefixed with "${sideBySideProjectName}".`)
    }

    setPhase('finalizing')
    send({
      type:       'backup_complete',
      jobId,
      snapshotId: serviceSnapshotIds[0] ?? 'restored',
      snapshotIds: serviceSnapshotIds,
      stats: {
        filesNew:            0,
        filesChanged:        0,
        filesUnmodified:     0,
        dataAdded:           0,
        totalFilesProcessed: 0,
        totalBytesProcessed: 0,
        durationMs:          0,
      },
      log: logLines.join('\n').slice(0, 1_000_000) || undefined,
    })

  } catch (err) {
    if (mode === 'in_place' && stoppedContainerIds.length > 0) {
      logLines.push('[restore] FATAL: restore failed mid-flight — attempting best-effort restart of stopped services')
      for (const containerId of stoppedContainerIds) {
        await startContainer(containerId).catch(re => {
          logLines.push(`[restore] WARN: restart failed for container ${containerId}: ${re instanceof Error ? re.message : String(re)}`)
        })
      }
    }
    send({
      type:   'backup_failed',
      jobId,
      error:  err instanceof Error ? err.message : String(err),
      detail: err instanceof Error && err.stack ? err.stack : '',
      log:    logLines.join('\n').slice(0, 1_000_000) || undefined,
    })
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    activeJobs.delete(jobId)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/agent/src/handlers/composeRestore.ts
git commit -m "feat(agent): add runComposeRestore handler with in-place and side-by-side modes"
```

---

## Task 5: Agent dispatch — add run_compose_restore case

**Files:**
- Modify: `packages/agent/src/agent.ts:230-248` (after the `run_compose_backup` block)

- [ ] **Step 1: Add the dispatch case**

In `packages/agent/src/agent.ts`, add after the closing `})()` of the `run_compose_backup` block (after line 234):

```typescript
  } else if (msg.type === 'run_compose_restore') {
    void (async () => {
      const { runComposeRestore } = await import('./handlers/composeRestore')
      await runComposeRestore(msg, send, activeJobs, BINARY)
    })()
```

The full block becomes:

```typescript
  } else if (msg.type === 'run_compose_backup') {
    void (async () => {
      const { runComposeBackup } = await import('./handlers/composeBackup')
      await runComposeBackup(msg, send, activeJobs, BINARY, ensureRepoInitialized)
    })()

  } else if (msg.type === 'run_compose_restore') {
    void (async () => {
      const { runComposeRestore } = await import('./handlers/composeRestore')
      await runComposeRestore(msg, send, activeJobs, BINARY)
    })()

  } else if (msg.type === 'list_compose_project') {
```

- [ ] **Step 2: Commit**

```bash
git add packages/agent/src/agent.ts
git commit -m "feat(agent): dispatch run_compose_restore to runComposeRestore handler"
```

---

## Task 6: Server action — triggerComposeRestore

**Files:**
- Create: `apps/web/app/actions/compose-restore.ts`

- [ ] **Step 1: Create the server action**

Create `apps/web/app/actions/compose-restore.ts`:

```typescript
'use server'

import { redirect } from 'next/navigation'
import { getDb, backupJobs, backupRuns, repositories, eq } from '@backupos/db'
import { decryptField } from '@/lib/repo-crypto'
import { dispatchToAgent } from '@/lib/internal-dispatch'
import { connectedAgentIds } from '@/lib/ws-state'
import type { ComposeProjectConfig } from '@backupos/agent-protocol'

export async function triggerComposeRestore(formData: FormData): Promise<void> {
  const jobId                = (formData.get('jobId')                as string | null)?.trim() ?? ''
  const sourceRunId          = (formData.get('sourceRunId')          as string | null)?.trim() ?? ''
  const mode                 = (formData.get('mode')                 as 'in_place' | 'side_by_side' | null) ?? 'side_by_side'
  const sideBySideProjectName = (formData.get('sideBySideProjectName') as string | null)?.trim() || undefined
  const restoreComposeFile   = formData.get('restoreComposeFile') === '1'

  if (!jobId || !sourceRunId) redirect('/restore/compose/new')

  const db  = getDb()
  const now = new Date()

  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId)).limit(1)
  if (!job || !job.repositoryId) redirect(`/jobs/${jobId}`)

  if (!job.agentId) {
    const runId = crypto.randomUUID()
    await db.insert(backupRuns).values({
      id: runId, jobId, repositoryId: job.repositoryId,
      status: 'failed', trigger: 'manual', startedAt: now, completedAt: now,
      runType: 'restore',
      errorMessage: 'job has no agent assigned — set an agent on this job',
    })
    redirect(`/jobs/${jobId}`)
  }

  if (!connectedAgentIds().includes(job.agentId)) {
    const runId = crypto.randomUUID()
    await db.insert(backupRuns).values({
      id: runId, jobId, repositoryId: job.repositoryId, agentId: job.agentId,
      status: 'failed', trigger: 'manual', startedAt: now, completedAt: now,
      runType: 'restore',
      errorMessage: `agent ${job.agentId} is not connected`,
    })
    redirect(`/jobs/${jobId}`)
  }

  const [sourceRun] = await db.select().from(backupRuns).where(eq(backupRuns.id, sourceRunId)).limit(1)
  if (!sourceRun) redirect(`/jobs/${jobId}`)

  const snapshotIds   = sourceRun.snapshotIds ? (JSON.parse(sourceRun.snapshotIds) as string[]) : []
  const composeConfig = JSON.parse(job.sourceConfig) as ComposeProjectConfig

  const [repo] = await db.select().from(repositories).where(eq(repositories.id, job.repositoryId!)).limit(1)
  if (!repo) redirect(`/jobs/${jobId}`)

  const cfg      = JSON.parse(decryptField(repo.config)) as Record<string, string>
  const password = decryptField(repo.resticPassword)
  if (!password) throw new Error(`triggerComposeRestore: failed to decrypt repo password for ${repo.id}`)

  const runId = crypto.randomUUID()
  await db.insert(backupRuns).values({
    id: runId, jobId, repositoryId: job.repositoryId!, agentId: job.agentId!,
    status: 'running', trigger: 'manual', startedAt: now,
    runType: 'restore',
  })

  const result = await dispatchToAgent(job.agentId!, {
    type:         'run_compose_restore',
    jobId,
    runId,
    repoId:       job.repositoryId!,
    repoUrl:      cfg['repositoryUrl'] ?? '',
    repoPassword: password,
    envVars:      cfg,
    config: {
      mode,
      snapshotIds,
      composeConfig,
      restoreComposeFile,
      sideBySideProjectName,
    },
  })

  if (!result.ok) {
    await db.update(backupRuns).set({
      status: 'failed', completedAt: now,
      errorMessage: `dispatch failed: ${result.reason ?? 'unknown'}`,
    }).where(eq(backupRuns.id, runId))
  }

  redirect(`/jobs/${jobId}`)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/actions/compose-restore.ts
git commit -m "feat(web): add triggerComposeRestore server action"
```

---

## Task 7: UI — compose restore wizard

**Files:**
- Create: `apps/web/app/(dashboard)/restore/compose/new/page.tsx`
- Create: `apps/web/app/(dashboard)/restore/compose/new/compose-restore-wizard.tsx`

- [ ] **Step 1: Create the server component (page.tsx)**

Create `apps/web/app/(dashboard)/restore/compose/new/page.tsx`:

```typescript
import { getDb, backupJobs, backupRuns, eq, and, desc } from '@backupos/db'
import { ComposeRestoreWizard } from './compose-restore-wizard'
import type { ComposeProjectConfig } from '@backupos/agent-protocol'

export const dynamic = 'force-dynamic'

export default async function ComposeRestoreNewPage() {
  const db = getDb()

  const jobs = await db
    .select({ id: backupJobs.id, name: backupJobs.name, sourceConfig: backupJobs.sourceConfig, agentId: backupJobs.agentId })
    .from(backupJobs)
    .where(eq(backupJobs.sourceType, 'compose_project'))
    .all()

  const jobData = await Promise.all(jobs.map(async job => {
    const runs = await db
      .select({ id: backupRuns.id, startedAt: backupRuns.startedAt, snapshotIds: backupRuns.snapshotIds })
      .from(backupRuns)
      .where(and(eq(backupRuns.jobId, job.id), eq(backupRuns.status, 'success')))
      .orderBy(desc(backupRuns.startedAt))
      .limit(10)
      .all()

    let projectName = job.name
    try {
      const cfg = JSON.parse(job.sourceConfig) as ComposeProjectConfig
      projectName = cfg.projectName ?? job.name
    } catch { /* sourceConfig not yet set */ }

    return {
      id:          job.id,
      name:        job.name,
      projectName,
      agentId:     job.agentId,
      runs: runs.map(r => ({
        id:          r.id,
        startedAt:   r.startedAt.toISOString(),
        snapshotIds: r.snapshotIds ? (JSON.parse(r.snapshotIds) as string[]) : [],
      })),
    }
  }))

  return (
    <div style={{ maxWidth: 640, margin: '32px auto', padding: '0 16px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Restore compose project</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 24 }}>
        Restore a previously backed-up compose project from a snapshot.
        Default mode is side-by-side (safe). In-place requires explicit confirmation.
      </p>
      <ComposeRestoreWizard jobs={jobData} />
    </div>
  )
}
```

- [ ] **Step 2: Create the client wizard component**

Create `apps/web/app/(dashboard)/restore/compose/new/compose-restore-wizard.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { triggerComposeRestore } from '@/app/actions/compose-restore'

type RunOption = { id: string; startedAt: string; snapshotIds: string[] }
type JobOption = { id: string; name: string; projectName: string; agentId: string | null; runs: RunOption[] }

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', boxSizing: 'border-box',
  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 13, outline: 'none',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, color: 'var(--fg-mute)', marginBottom: 4, fontWeight: 500,
}
const section: React.CSSProperties = {
  marginBottom: 20,
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function ComposeRestoreWizard({ jobs }: { jobs: JobOption[] }) {
  const [selectedJobId, setSelectedJobId]   = useState(jobs[0]?.id ?? '')
  const [selectedRunId, setSelectedRunId]   = useState(jobs[0]?.runs[0]?.id ?? '')
  const [mode, setMode]                     = useState<'in_place' | 'side_by_side'>('side_by_side')
  const [newProjectName, setNewProjectName] = useState(() => {
    const proj = jobs[0]?.projectName ?? ''
    return proj ? `${proj}-restored` : ''
  })
  const [restoreComposeFile, setRestoreComposeFile] = useState(true)
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [confirmText, setConfirmText]       = useState('')
  const [validationError, setValidationError] = useState<string | undefined>()

  const selectedJob = jobs.find(j => j.id === selectedJobId)
  const runs        = selectedJob?.runs ?? []
  const selectedRun = runs.find(r => r.id === selectedRunId) ?? runs[0]

  const handleJobChange = (newJobId: string) => {
    setSelectedJobId(newJobId)
    const j = jobs.find(j => j.id === newJobId)
    setSelectedRunId(j?.runs[0]?.id ?? '')
    setNewProjectName(j?.projectName ? `${j.projectName}-restored` : '')
    setConfirmChecked(false)
    setConfirmText('')
    setValidationError(undefined)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (mode === 'in_place') {
      const projectName = selectedJob?.projectName ?? ''
      if (!confirmChecked) {
        e.preventDefault()
        setValidationError('You must check the confirmation box.')
        return
      }
      if (confirmText !== projectName) {
        e.preventDefault()
        setValidationError(`Type "${projectName}" exactly to confirm.`)
        return
      }
    }
    if (mode === 'side_by_side' && !newProjectName.trim()) {
      e.preventDefault()
      setValidationError('New project name is required for side-by-side restore.')
      return
    }
    setValidationError(undefined)
  }

  if (jobs.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--fg-mute)', padding: '12px', background: 'var(--surf3)', borderRadius: 'var(--radius-sm)' }}>
        No compose_project jobs found. Create a compose backup job first.
      </div>
    )
  }

  return (
    <form action={triggerComposeRestore} onSubmit={handleSubmit}>
      {/* Hidden fields for server action */}
      <input type="hidden" name="jobId"      value={selectedJobId} />
      <input type="hidden" name="sourceRunId" value={selectedRun?.id ?? ''} />
      <input type="hidden" name="mode"       value={mode} />
      <input type="hidden" name="restoreComposeFile" value={restoreComposeFile ? '1' : '0'} />

      <div style={section}>
        <label style={lbl}>Compose job</label>
        <select value={selectedJobId} onChange={e => handleJobChange(e.target.value)} style={inp}>
          {jobs.map(j => (
            <option key={j.id} value={j.id}>{j.name} ({j.projectName})</option>
          ))}
        </select>
      </div>

      <div style={section}>
        <label style={lbl}>Snapshot to restore</label>
        {runs.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>No successful runs for this job yet.</div>
        ) : (
          <select
            value={selectedRun?.id ?? ''}
            onChange={e => setSelectedRunId(e.target.value)}
            style={inp}
          >
            {runs.map(r => (
              <option key={r.id} value={r.id}>
                {fmt(r.startedAt)} — {r.snapshotIds.length} snapshot{r.snapshotIds.length !== 1 ? 's' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={section}>
        <label style={lbl}>Restore mode</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(['side_by_side', 'in_place'] as const).map(m => (
            <label key={m} style={{
              display: 'flex', gap: 10, padding: '10px 14px', cursor: 'pointer',
              border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              background: mode === m ? 'color-mix(in srgb, var(--surf2) 70%, var(--accent) 8%)' : 'var(--surf2)',
            }}>
              <input type="radio" name="_mode_ui" value={m} checked={mode === m} onChange={() => {
                setMode(m)
                setConfirmChecked(false)
                setConfirmText('')
                setValidationError(undefined)
              }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {m === 'side_by_side' ? 'Side-by-side (safe)' : 'In-place (DESTRUCTIVE)'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                  {m === 'side_by_side'
                    ? 'Restore into a new project. Original stack stays running. Verify, then promote manually.'
                    : 'Replace existing volumes. Services will be stopped during restore. Data not in the snapshot will be lost.'}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {mode === 'side_by_side' && (
        <div style={section}>
          <label style={lbl}>New project name</label>
          <input
            type="text"
            name="sideBySideProjectName"
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            placeholder={`${selectedJob?.projectName ?? 'myapp'}-restored`}
            style={inp}
          />
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>
            Docker volumes will be created as <code>{newProjectName || '…'}_&lt;vol&gt;</code>
          </div>
        </div>
      )}

      {mode === 'in_place' && (
        <div style={{ ...section, padding: '12px 14px', background: 'color-mix(in srgb, var(--err) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--err) 30%, transparent)', borderRadius: 'var(--radius-sm)' }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={e => setConfirmChecked(e.target.checked)}
              style={{ marginTop: 2, accentColor: 'var(--err)', width: 14, height: 14 }}
            />
            <span style={{ fontSize: 12, color: 'var(--fg)' }}>
              I understand this will overwrite the volumes of <strong>{selectedJob?.projectName}</strong> and stop all its services. Data not in the snapshot will be lost permanently.
            </span>
          </label>
          <label style={lbl}>Type <strong>{selectedJob?.projectName}</strong> to confirm</label>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={selectedJob?.projectName ?? 'project-name'}
            style={{ ...inp, borderColor: confirmText === selectedJob?.projectName ? 'var(--success)' : 'var(--border)' }}
            autoComplete="off"
          />
        </div>
      )}

      <div style={section}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={restoreComposeFile}
            onChange={e => setRestoreComposeFile(e.target.checked)}
            style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
          />
          Also restore compose YAML file (if backed up)
        </label>
      </div>

      {validationError && (
        <div style={{ fontSize: 12, color: 'var(--err)', marginBottom: 12, padding: '6px 10px',
          background: 'color-mix(in srgb, var(--err) 10%, transparent)', borderRadius: 'var(--radius-sm)' }}>
          {validationError}
        </div>
      )}

      <button
        type="submit"
        disabled={runs.length === 0}
        style={{
          padding: '9px 20px', cursor: runs.length === 0 ? 'not-allowed' : 'pointer',
          borderRadius: 'var(--radius-sm)', border: 'none',
          background: mode === 'in_place' ? 'var(--err)' : 'var(--accent)',
          color: '#fff', fontSize: 13, fontWeight: 600,
          opacity: runs.length === 0 ? 0.5 : 1,
        }}
      >
        {mode === 'in_place' ? 'Restore in-place' : 'Restore side-by-side'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/(dashboard)/restore/compose/new/
git commit -m "feat(web): add compose restore UI at /restore/compose/new"
```

---

## Task 8: Build + PR

- [ ] **Step 1: Run the build**

```bash
cd apps/web && npx next build 2>&1 | tail -30
```

Expected: build completes with no TypeScript errors. All routes listed, no red error lines.

- [ ] **Step 2: Verify dead-code is clean (optional sanity check)**

```bash
grep -rn 'ComposeRestoreConfig\|runComposeRestore\|run_compose_restore\|triggerComposeRestore' \
  packages/agent-protocol/src/ packages/agent/src/ apps/web/app/actions/ \
  apps/web/app/\(dashboard\)/restore/compose/
```

Expected output: each name appears in exactly the right files, no stray references.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feat/phase-b-task-9-compose-restore
gh pr create \
  --title "feat: compose project restore (in-place + side-by-side)" \
  --body "..."
```

PR body should cover:
- What: two-mode compose restore dispatched through the agent WebSocket
- In-place: stops services → restic restore → restarts; best-effort restart on failure
- Side-by-side: restic restore to tmpDir → docker volume create → cp -a → original untouched
- New: `run_type` column on `backup_runs` (migration 0027); `cp` in exec-allowed
- Review checklist from spec (see below)

---

## Self-Review Against Spec

**Spec coverage:**

| Requirement | Task |
|-------------|------|
| in_place mode: stop before restore, restart after | Task 4 |
| in_place: best-effort restart on failure | Task 4 |
| side_by_side mode: original untouched | Task 4 |
| side_by_side: don't auto-start new project | Task 4 (log message only) |
| Password decryption reuses Task 6 pattern | Task 6 (uses `decryptField` + `dispatchToAgent`) |
| UI default: side_by_side | Task 7 (`useState('side_by_side')`) |
| In-place requires checkbox AND confirm-input | Task 7 (`handleSubmit` validates both) |
| run_type column | Task 2 |
| exec-allowed: cp added | Task 3 |
| Protocol: ComposeRestoreConfig extended | Task 1 |
| Agent dispatch case | Task 5 |
| Server action fail-fast for no-agent / disconnected | Task 6 |

**Out-of-scope confirmed NOT implemented:**
- Rollback after partial in-place failure (only best-effort restart)
- Side-by-side auto-start
- Restore preview / dry run
- Restore across agents
- Subset restore

**No placeholders found.**

**Type consistency:** `ComposeRestoreConfig` defined in Task 1, used identically in Tasks 4, 6, 7. `runType` column defined in Task 2, used identically in Task 6. `runComposeRestore` signature defined in Task 4, imported identically in Task 5.
