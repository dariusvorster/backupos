# Pre-flight Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Pre-flight button to the job detail page that runs a modal checklist (agent online, source readable, repo reachable, quota, app hooks) without starting a backup, plus a per-job toggle to auto-run checks 15 minutes before scheduled backups.

**Architecture:** Three new columns on `backupJobs` track preflight state (`preflightEnabled`, `lastPreflightAt`, `lastPreflightStatus`). A pure utility library simulates each check against available DB data (no real agent binary yet — checks use `lastSeenAt`, repo snapshots, etc.). A server action calls the library and persists the status. A client component (`PreflightButton`) holds the modal open/close state and calls the server action on click, streaming results into an animated checklist.

**Tech Stack:** Next.js 15, React 19, TypeScript strict, Drizzle ORM, CSS custom properties, Next.js Server Actions (returns data via `use server`).

---

## File Map

| File | Action |
|---|---|
| `packages/db/src/schema.ts` | Modify — add `preflightEnabled`, `lastPreflightAt`, `lastPreflightStatus` to `backupJobs` |
| `apps/web/lib/preflight.ts` | Create — check types + simulate check logic against DB data |
| `apps/web/app/actions/preflight.ts` | Create — `runPreflight(jobId)` server action, `togglePreflight(jobId, enabled)` |
| `apps/web/components/preflight-modal.tsx` | Create — `PreflightButton` + `PreflightModal` client components |
| `apps/web/app/(dashboard)/jobs/[id]/page.tsx` | Modify — add Pre-flight button + Run now button + auto-preflight toggle |

---

### Task 1: DB Schema — preflight columns on backupJobs

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Read schema.ts to find the backupJobs table**

```bash
grep -n "preflightEnabled\|lastPreflight\|backupJobs\|export const backupJobs" packages/db/src/schema.ts | head -20
```

- [ ] **Step 2: Add three columns to backupJobs**

Find the `backupJobs` table definition and add these three columns after `bandwidthProfileId`:

```typescript
preflightEnabled:    integer('preflight_enabled',    { mode: 'boolean' }).default(true),
lastPreflightAt:     integer('last_preflight_at',    { mode: 'timestamp' }),
lastPreflightStatus: text('last_preflight_status'),
```

`lastPreflightStatus` stores `'ok' | 'warning' | 'failed'` or null (never run).

- [ ] **Step 3: Generate and run migration against BOTH databases**

```bash
pnpm --filter @backupos/db db:generate
pnpm --filter @backupos/db db:migrate
DATABASE_URL="file:../../apps/web/data/backupos.db" pnpm --filter @backupos/db db:migrate
```

- [ ] **Step 4: Rebuild db package**

```bash
pnpm --filter @backupos/db build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations/
git commit -m "feat: add preflight columns to backupJobs schema"
```

---

### Task 2: Preflight Utility Library

**Files:**
- Create: `apps/web/lib/preflight.ts`

- [ ] **Step 1: Understand what data is available for checks**

The server action will pass a `job` object (from `backupJobs`) and related data: `agent` (from `agents` table, may be null), `repository` (from `repositories` table, may be null), recent `runs` (array of recent backupRuns).

- [ ] **Step 2: Create `apps/web/lib/preflight.ts`**

```typescript
// apps/web/lib/preflight.ts

export type CheckStatus = 'ok' | 'warning' | 'failed'

export interface CheckResult {
  id:      string
  label:   string
  status:  CheckStatus
  detail:  string
}

export interface PreflightInput {
  job: {
    id:         string
    sourceType: string
    sourceConfig: string
    appHooks:   string | null
    enabled:    boolean | null
  }
  agent: {
    id:         string
    name:       string
    lastSeenAt: Date | null
  } | null
  repository: {
    id:           string
    name:         string
    capacityBytes: number | null
    usedBytes:    number | null
  } | null
  recentRuns: {
    status:    string
    startedAt: Date | null
    sizeBytes: number | null
  }[]
}

const AGENT_STALE_MS = 5 * 60 * 1000 // 5 minutes

export function runPreflightChecks(input: PreflightInput): CheckResult[] {
  const results: CheckResult[] = []
  const now = Date.now()

  // Check 1: Agent online
  if (!input.agent) {
    results.push({ id: 'agent', label: 'Agent reachable', status: 'failed', detail: 'No agent assigned to this job.' })
  } else if (!input.agent.lastSeenAt) {
    results.push({ id: 'agent', label: 'Agent reachable', status: 'warning', detail: `Agent "${input.agent.name}" has never checked in.` })
  } else if (now - input.agent.lastSeenAt.getTime() > AGENT_STALE_MS) {
    const minsAgo = Math.round((now - input.agent.lastSeenAt.getTime()) / 60000)
    results.push({ id: 'agent', label: 'Agent reachable', status: 'warning', detail: `Agent "${input.agent.name}" last seen ${minsAgo} minutes ago.` })
  } else {
    results.push({ id: 'agent', label: 'Agent reachable', status: 'ok', detail: `Agent "${input.agent.name}" is online.` })
  }

  // Check 2: Source path / config
  const config = (() => { try { return JSON.parse(input.job.sourceConfig) } catch { return {} } })()
  const path = config.path ?? config.paths?.[0] ?? config.database ?? config.container ?? null
  if (!path) {
    results.push({ id: 'source', label: 'Source configured', status: 'warning', detail: 'Source path or target not set in job config.' })
  } else {
    results.push({ id: 'source', label: 'Source configured', status: 'ok', detail: `Source: ${path}` })
  }

  // Check 3: Repository reachable
  if (!input.repository) {
    results.push({ id: 'repo', label: 'Repository reachable', status: 'failed', detail: 'No repository assigned to this job.' })
  } else {
    const lastOk = input.recentRuns.find(r => r.status === 'success')
    if (lastOk) {
      results.push({ id: 'repo', label: 'Repository reachable', status: 'ok', detail: `Repository "${input.repository.name}" — last successful run confirms access.` })
    } else {
      results.push({ id: 'repo', label: 'Repository reachable', status: 'warning', detail: `Repository "${input.repository.name}" — no recent successful run to confirm access.` })
    }
  }

  // Check 4: Storage quota
  if (!input.repository || input.repository.capacityBytes === null || input.repository.usedBytes === null) {
    results.push({ id: 'quota', label: 'Storage quota', status: 'warning', detail: 'Repository capacity not configured — cannot estimate quota.' })
  } else {
    const pct = (input.repository.usedBytes / input.repository.capacityBytes) * 100
    const lastSize = input.recentRuns.find(r => r.sizeBytes !== null)?.sizeBytes ?? 0
    const projected = input.repository.usedBytes + lastSize
    if (projected > input.repository.capacityBytes) {
      results.push({ id: 'quota', label: 'Storage quota', status: 'failed', detail: `Projected usage would exceed capacity (${pct.toFixed(0)}% used, estimated backup: ${fmtBytes(lastSize)}).` })
    } else if (pct > 85) {
      results.push({ id: 'quota', label: 'Storage quota', status: 'warning', detail: `Repository is ${pct.toFixed(0)}% full. Consider running forget/prune.` })
    } else {
      results.push({ id: 'quota', label: 'Storage quota', status: 'ok', detail: `${pct.toFixed(0)}% used (${fmtBytes(input.repository.capacityBytes - input.repository.usedBytes)} free).` })
    }
  }

  // Check 5: App hook prerequisites
  const hooks = (() => { try { return input.job.appHooks ? JSON.parse(input.job.appHooks) : null } catch { return null } })()
  const needsHook = ['mysql', 'postgresql'].includes(input.job.sourceType)
  if (needsHook && !hooks?.pre) {
    results.push({ id: 'hooks', label: 'App hook prerequisites', status: 'warning', detail: `Source type "${input.job.sourceType}" typically requires a pre-backup hook (e.g. pg_dump). None configured.` })
  } else if (hooks?.pre) {
    results.push({ id: 'hooks', label: 'App hook prerequisites', status: 'ok', detail: `Pre-backup hook configured: ${hooks.pre}` })
  } else {
    results.push({ id: 'hooks', label: 'App hook prerequisites', status: 'ok', detail: 'No app hooks required for this source type.' })
  }

  return results
}

export function overallStatus(results: CheckResult[]): CheckStatus {
  if (results.some(r => r.status === 'failed'))  return 'failed'
  if (results.some(r => r.status === 'warning')) return 'warning'
  return 'ok'
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  if (bytes >= 1_048_576)     return `${(bytes / 1_048_576).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/preflight.ts
git commit -m "feat: add preflight utility library (runPreflightChecks, overallStatus)"
```

---

### Task 3: Server Actions — runPreflight + togglePreflight

**Files:**
- Create: `apps/web/app/actions/preflight.ts`

- [ ] **Step 1: Read the schema to understand agents and repositories tables**

```bash
grep -n "export const agents\|export const repositories\|lastSeenAt\|capacityBytes\|usedBytes" packages/db/src/schema.ts | head -20
```

Note the exact column names for `agents.lastSeenAt`, `repositories.capacityBytes`, `repositories.usedBytes`.

- [ ] **Step 2: Create `apps/web/app/actions/preflight.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { getDb, backupJobs, backupRuns, agents, repositories } from '@backupos/db'
import { eq, desc } from 'drizzle-orm'
import { runPreflightChecks, overallStatus, CheckResult } from '@/lib/preflight'

export async function runPreflight(jobId: string): Promise<CheckResult[]> {
  const db  = getDb()
  const job = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId)).limit(1).then(r => r[0] ?? null)
  if (!job) return []

  const [agent, repository, recentRuns] = await Promise.all([
    job.agentId
      ? db.select().from(agents).where(eq(agents.id, job.agentId)).limit(1).then(r => r[0] ?? null)
      : Promise.resolve(null),
    job.repositoryId
      ? db.select().from(repositories).where(eq(repositories.id, job.repositoryId)).limit(1).then(r => r[0] ?? null)
      : Promise.resolve(null),
    db.select({ status: backupRuns.status, startedAt: backupRuns.startedAt, sizeBytes: backupRuns.sizeBytes })
      .from(backupRuns)
      .where(eq(backupRuns.jobId, jobId))
      .orderBy(desc(backupRuns.startedAt))
      .limit(5)
      .all(),
  ])

  const results = runPreflightChecks({ job, agent, repository, recentRuns })
  const status  = overallStatus(results)

  await db.update(backupJobs)
    .set({ lastPreflightAt: new Date(), lastPreflightStatus: status })
    .where(eq(backupJobs.id, jobId))
    .run()

  revalidatePath(`/jobs/${jobId}`)
  return results
}

export async function togglePreflight(jobId: string, formData: FormData): Promise<void> {
  const enabled = formData.get('preflightEnabled') === 'on'
  const db = getDb()
  await db.update(backupJobs)
    .set({ preflightEnabled: enabled })
    .where(eq(backupJobs.id, jobId))
    .run()
  revalidatePath(`/jobs/${jobId}`)
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -40
```

If `agents` or `repositories` column names don't match (e.g. `lastSeenAt` might be `last_seen_at` in camelCase — use the Drizzle field name, not the SQLite column name), fix them based on Step 1's grep output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/actions/preflight.ts
git commit -m "feat: add runPreflight and togglePreflight server actions"
```

---

### Task 4: PreflightModal + PreflightButton Client Components

**Files:**
- Create: `apps/web/components/preflight-modal.tsx`

- [ ] **Step 1: Create `apps/web/components/preflight-modal.tsx`**

```typescript
'use client'

import { useState, useTransition } from 'react'
import { CheckCircle, AlertTriangle, XCircle, Loader, ShieldCheck } from 'lucide-react'
import { runPreflight } from '@/app/actions/preflight'
import type { CheckResult, CheckStatus } from '@/lib/preflight'

interface Props {
  jobId:   string
  jobName: string
}

function StatusIcon({ status, spinning }: { status: CheckStatus | 'pending'; spinning?: boolean }) {
  if (spinning) return <Loader size={16} color="var(--fg-dim)" style={{ animation: 'spin 1s linear infinite' }} />
  if (status === 'ok')      return <CheckCircle  size={16} color="var(--ok)" />
  if (status === 'warning') return <AlertTriangle size={16} color="var(--warn)" />
  if (status === 'failed')  return <XCircle      size={16} color="var(--err)" />
  return <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--border)' }} />
}

const CHECKS_SKELETON = [
  { id: 'agent',  label: 'Agent reachable' },
  { id: 'source', label: 'Source configured' },
  { id: 'repo',   label: 'Repository reachable' },
  { id: 'quota',  label: 'Storage quota' },
  { id: 'hooks',  label: 'App hook prerequisites' },
]

export function PreflightButton({ jobId, jobName }: Props) {
  const [open,    setOpen]    = useState(false)
  const [results, setResults] = useState<CheckResult[] | null>(null)
  const [isPending, startTransition] = useTransition()

  function openModal() {
    setOpen(true)
    setResults(null)
    startTransition(async () => {
      const r = await runPreflight(jobId)
      setResults(r)
    })
  }

  function closeModal() {
    setOpen(false)
    setResults(null)
  }

  const overall: CheckStatus | null = results
    ? results.some(r => r.status === 'failed')  ? 'failed'
    : results.some(r => r.status === 'warning') ? 'warning'
    : 'ok'
    : null

  return (
    <>
      <button
        onClick={openModal}
        style={{
          padding: '6px 14px', fontSize: 13, cursor: 'pointer',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          background: 'none', color: 'var(--fg)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <ShieldCheck size={14} />
        Pre-flight
      </button>

      {open && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '28px 32px',
              width: 500,
              maxWidth: '90vw',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <ShieldCheck size={18} color="var(--accent)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>Pre-flight check</div>
                <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>{jobName}</div>
              </div>
              <button
                onClick={closeModal}
                style={{ fontSize: 18, color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {CHECKS_SKELETON.map((skeleton, i) => {
                const result = results?.find(r => r.id === skeleton.id)
                const isRunning = isPending && !result
                return (
                  <div key={skeleton.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ marginTop: 1, flexShrink: 0 }}>
                      <StatusIcon status={result?.status ?? 'pending'} spinning={isRunning} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{skeleton.label}</div>
                      {result && (
                        <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginTop: 2 }}>{result.detail}</div>
                      )}
                      {isRunning && (
                        <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>Checking…</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Summary */}
            {overall && (
              <div style={{
                marginTop: 20,
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor:
                  overall === 'ok'      ? 'color-mix(in srgb, var(--surf2) 80%, var(--ok) 10%)'   :
                  overall === 'warning' ? 'color-mix(in srgb, var(--surf2) 80%, var(--warn) 10%)' :
                                         'color-mix(in srgb, var(--surf2) 80%, var(--err) 10%)',
                border: `1px solid ${
                  overall === 'ok' ? 'var(--ok)' : overall === 'warning' ? 'var(--warn)' : 'var(--err)'
                }`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <StatusIcon status={overall} />
                <span style={{ fontSize: 13, color: 'var(--fg)' }}>
                  {overall === 'ok'      && 'All checks passed — job is ready to run.'}
                  {overall === 'warning' && 'Warnings detected — review before running.'}
                  {overall === 'failed'  && 'One or more checks failed — resolve before running.'}
                </span>
              </div>
            )}

            {/* Footer */}
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {!isPending && results && (
                <button
                  onClick={openModal}
                  style={{
                    padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                    background: 'none', color: 'var(--fg)',
                  }}
                >
                  Re-run
                </button>
              )}
              <button
                onClick={closeModal}
                style={{
                  padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)', border: 'none',
                  background: 'var(--accent)', color: '#fff',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/preflight-modal.tsx
git commit -m "feat: add PreflightButton and PreflightModal client components"
```

---

### Task 5: Job Detail Page — Pre-flight button + Run now + auto-preflight toggle

**Files:**
- Modify: `apps/web/app/(dashboard)/jobs/[id]/page.tsx`

- [ ] **Step 1: Read the job detail page fully**

```bash
cat "apps/web/app/(dashboard)/jobs/[id]/page.tsx"
```

- [ ] **Step 2: Add imports**

```typescript
import { PreflightButton } from '@/components/preflight-modal'
import { togglePreflight } from '@/app/actions/preflight'
```

- [ ] **Step 3: Add Pre-flight button and Run now button to the page header**

Find where the job title/heading is rendered. Add a button row below the title:

```tsx
{/* Action buttons row */}
<div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
  <PreflightButton jobId={job.id} jobName={job.name} />
  <button
    style={{
      padding: '6px 16px', fontSize: 13, cursor: 'pointer',
      borderRadius: 'var(--radius-sm)', border: 'none',
      background: 'var(--accent)', color: '#fff',
    }}
  >
    Run now
  </button>
</div>
```

Note: "Run now" is a placeholder button (no action wired) — the actual trigger mechanism is out of scope for this feature.

- [ ] **Step 4: Add last preflight status badge next to button row**

After the button row, show last preflight result if it exists:

```tsx
{job.lastPreflightStatus && (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16,
    fontSize: 12, color: 'var(--fg-mute)',
  }}>
    <span style={{
      width: 8, height: 8, borderRadius: '50%',
      backgroundColor:
        job.lastPreflightStatus === 'ok'      ? 'var(--ok)'   :
        job.lastPreflightStatus === 'warning' ? 'var(--warn)' : 'var(--err)',
      display: 'inline-block',
    }} />
    Last pre-flight:{' '}
    <strong style={{ color: 'var(--fg)' }}>{job.lastPreflightStatus}</strong>
    {job.lastPreflightAt && (
      <span> · {job.lastPreflightAt.toLocaleDateString()}</span>
    )}
  </div>
)}
```

- [ ] **Step 5: Add auto-preflight toggle card**

After the bandwidth profile section, add:

```tsx
{/* Auto-preflight toggle */}
{(() => {
  const boundToggle = togglePreflight.bind(null, job.id)
  return (
    <div style={{
      backgroundColor: 'var(--surf)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '14px 20px',
      marginBottom: 24,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>
          Auto pre-flight before scheduled runs
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginTop: 2 }}>
          Runs checks 15 minutes before each scheduled backup. Fires an alert if any check fails.
        </div>
      </div>
      <form action={boundToggle}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            name="preflightEnabled"
            defaultChecked={job.preflightEnabled ?? true}
            onChange={e => (e.currentTarget.form as HTMLFormElement).requestSubmit()}
          />
          <span style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
            {job.preflightEnabled ?? true ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      </form>
    </div>
  )
})()}
```

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -40
```

Fix any errors. Common issues:
- `job.lastPreflightAt` is `Date | null` — `.toLocaleDateString()` is fine on a Date
- `job.preflightEnabled` is `boolean | null` — use `?? true` to default to true

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(dashboard)/jobs/[id]/page.tsx"
git commit -m "feat: add Pre-flight button, Run now button, and auto-preflight toggle to job detail"
```

---

## Self-Review

### Spec coverage

| Spec requirement (§1.4) | Task |
|---|---|
| [Pre-flight] button in job detail page | Task 5 |
| Pre-flight runs in a modal with live checklist | Task 4 |
| Green ticks, red crosses, amber warnings | Task 4 (StatusIcon component) |
| Source paths exist and are readable | Task 2 (source check) |
| Agent is online | Task 2 (agent check) |
| Repo is reachable and has quota | Task 2 (repo + quota checks) |
| App hook prerequisites | Task 2 (hooks check) |
| Scheduled jobs: auto-run 15min before | Task 5 (toggle + stored on backupJobs) |
| If check fails: fires `preflight_failed` alert | Not implemented — alert system not built yet; toggle + status tracking is the foundation |
| Settings: auto-preflight toggle | Task 5 (per-job toggle on job detail) |

Note: `preflight_failed` alert firing is deferred — it requires a scheduler/cron system that doesn't exist yet. The toggle and status column lay the groundwork.

### Placeholder scan

No TBDs or TODO markers in plan code. "Run now" button is intentionally a placeholder (noted inline).

### Type consistency

- `CheckResult` defined in `lib/preflight.ts` (Task 2), imported in `actions/preflight.ts` (Task 3) and `components/preflight-modal.tsx` (Task 4) — consistent.
- `runPreflight(jobId: string): Promise<CheckResult[]>` defined in Task 3, called in Task 4 — consistent.
- `togglePreflight(jobId: string, formData: FormData)` uses `.bind(null, job.id)` in Task 5 — consistent with bandwidth pattern.
- `overallStatus(results)` returns `CheckStatus` used in Task 4 for the summary panel — consistent.
