# Jobs Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 7-day run-history strip to each row of the jobs list, and enable bulk job operations (pause, resume, delete) via a floating action bar.

**Architecture:** The jobs list page stays a server component for data fetching; the table is extracted to a `JobsTable` client component that receives pre-computed run-strip data and manages checkbox selection state. Bulk operations go through new server actions in `apps/web/app/actions/jobs.ts`. No schema changes required.

**Tech Stack:** Next.js 15 App Router (server + client components), Drizzle ORM, SQLite.

---

## File Map

| File | Action |
|---|---|
| `apps/web/app/actions/jobs.ts` | Create — `pauseJobs`, `resumeJobs`, `deleteJobs`, `triggerJob` server actions |
| `apps/web/app/(dashboard)/jobs/jobs-table.tsx` | Create — client component: 7-day strip, checkboxes, floating action bar |
| `apps/web/app/(dashboard)/jobs/page.tsx` | Modify — fetch recent runs, build strip data, render JobsTable |

---

### Task 1: Bulk job server actions

**Files:**
- Create: `apps/web/app/actions/jobs.ts`

- [ ] **Step 1: Create the server actions file**

```typescript
'use server'

import { revalidatePath }                  from 'next/cache'
import { getDb, backupJobs, backupRuns, eq, inArray } from '@backupos/db'

export async function pauseJobs(ids: string[]): Promise<void> {
  if (!ids.length) return
  const db = getDb()
  await db.update(backupJobs).set({ enabled: false }).where(inArray(backupJobs.id, ids))
  revalidatePath('/jobs')
}

export async function resumeJobs(ids: string[]): Promise<void> {
  if (!ids.length) return
  const db = getDb()
  await db.update(backupJobs).set({ enabled: true }).where(inArray(backupJobs.id, ids))
  revalidatePath('/jobs')
}

export async function deleteJobs(ids: string[]): Promise<void> {
  if (!ids.length) return
  const db = getDb()
  await db.delete(backupRuns).where(inArray(backupRuns.jobId, ids))
  await db.delete(backupJobs).where(inArray(backupJobs.id, ids))
  revalidatePath('/jobs')
}

export async function triggerJob(_id: string): Promise<void> {
  // Stub — agent triggering not yet implemented
  revalidatePath('/jobs')
}
```

- [ ] **Step 2: Verify the imports exist in `@backupos/db`**

```bash
cd /Users/dariusvorster/Projects/backupos && grep -r "inArray" packages/db/src/index.ts
```

Expected: `inArray` is re-exported from drizzle-orm. If missing, add it:
Open `packages/db/src/index.ts` and add `inArray` to the drizzle-orm re-export line (e.g. `export { eq, desc, asc, and, or, gte, lte, lt, gt, isNotNull, isNull, inArray, sql } from 'drizzle-orm'`).

- [ ] **Step 3: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web/app/actions/jobs.ts packages/db/src/index.ts
git commit -m "feat: bulk job server actions — pause, resume, delete, triggerJob stub"
```

---

### Task 2: Read then modify jobs list page to pass run-strip data

**Files:**
- Modify: `apps/web/app/(dashboard)/jobs/page.tsx`

First, read the current file:
`/Users/dariusvorster/Projects/backupos/apps/web/app/(dashboard)/jobs/page.tsx`

- [ ] **Step 1: Replace the page with the version that fetches run history and passes it to JobsTable**

The run strip for a job is built by taking the last 7 calendar days and checking whether there was a run on each day and what its status was.

```typescript
import { getDb, backupJobs, backupRuns, desc, gte } from '@backupos/db'
import { JobsTable } from './jobs-table'

export type RunDot = 'success' | 'failed' | 'none'

function buildStrips(
  jobs: { id: string }[],
  runs: { jobId: string; status: string; startedAt: Date | null }[],
): Record<string, RunDot[]> {
  const today = new Date()
  const strips: Record<string, RunDot[]> = {}
  for (const job of jobs) {
    strips[job.id] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (6 - i))
      const dayStr = d.toISOString().slice(0, 10)
      const run = runs.find(
        r => r.jobId === job.id && r.startedAt?.toISOString().slice(0, 10) === dayStr,
      )
      if (!run) return 'none'
      return run.status === 'success' ? 'success' : 'failed'
    })
  }
  return strips
}

export default async function JobsPage() {
  const db   = getDb()
  const jobs = await db.select().from(backupJobs).all()

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)

  const recentRuns = await db
    .select({
      jobId:     backupRuns.jobId,
      status:    backupRuns.status,
      startedAt: backupRuns.startedAt,
    })
    .from(backupRuns)
    .where(gte(backupRuns.startedAt, cutoff))
    .orderBy(desc(backupRuns.startedAt))
    .all()

  const strips = buildStrips(jobs, recentRuns)

  return <JobsTable jobs={jobs} strips={strips} />
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: error about missing `JobsTable` — that's fine, we add it in Task 3.

- [ ] **Step 3: Commit (partial — page references JobsTable not yet created)**

```bash
cd /Users/dariusvorster/Projects/backupos
git add "apps/web/app/(dashboard)/jobs/page.tsx"
git commit -m "feat: jobs page — pass 7-day run strips to JobsTable"
```

---

### Task 3: JobsTable client component

**Files:**
- Create: `apps/web/app/(dashboard)/jobs/jobs-table.tsx`

This is the main task. The component:
- Renders the existing columns (Name, Schedule, Status, Last run) plus a new "Last 7 days" column
- Adds a leading checkbox column
- Shows a floating action bar when any rows are selected

- [ ] **Step 1: Create `apps/web/app/(dashboard)/jobs/jobs-table.tsx`**

```typescript
'use client'

import { useState, useTransition }     from 'react'
import Link                            from 'next/link'
import type { ComponentProps }         from 'react'
import { Badge }                       from '@/components/ui/badge'
import { pauseJobs, resumeJobs, deleteJobs } from '@/app/actions/jobs'
import type { RunDot }                 from './page'

type BadgeStatus = ComponentProps<typeof Badge>['status']

interface Job {
  id:             string
  name:           string
  schedule:       string
  enabled:        boolean
  lastRunAt:      Date | null
  lastRunStatus:  string | null
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

function RunStrip({ dots }: { dots: RunDot[] }) {
  const color: Record<RunDot, string> = {
    success: '#22c55e',
    failed:  '#ef4444',
    none:    '#e5e7eb',
  }
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {dots.map((d, i) => (
        <span
          key={i}
          title={d}
          style={{
            display: 'inline-block', width: 8, height: 8,
            borderRadius: '50%', backgroundColor: color[d],
          }}
        />
      ))}
    </div>
  )
}

export function JobsTable({
  jobs,
  strips,
}: {
  jobs:   Job[]
  strips: Record<string, RunDot[]>
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending,  startTransition] = useTransition()

  const toggleAll = () => {
    if (selected.size === jobs.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(jobs.map(j => j.id)))
    }
  }

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBulkAction = (action: 'pause' | 'resume' | 'delete') => {
    const ids = [...selected]
    if (!ids.length) return
    if (action === 'delete' && !confirm(`Delete ${ids.length} job(s)? This also deletes their run history.`)) return
    startTransition(async () => {
      if (action === 'pause')  await pauseJobs(ids)
      if (action === 'resume') await resumeJobs(ids)
      if (action === 'delete') await deleteJobs(ids)
      setSelected(new Set())
    })
  }

  const th: React.CSSProperties = {
    padding: '10px 16px', textAlign: 'left', fontWeight: 500,
    fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase',
    letterSpacing: '0.06em',
  }
  const td: React.CSSProperties = {
    padding: '12px 16px', fontSize: 13, color: 'var(--fg)',
    borderTop: '1px solid var(--border)',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>Jobs</h1>
        <Link
          href="/jobs/new"
          style={{
            padding: '7px 16px', fontSize: 13, fontWeight: 500,
            borderRadius: 'var(--radius-sm)', background: 'var(--accent)',
            color: '#fff', textDecoration: 'none',
          }}
        >
          New job
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 48, textAlign: 'center',
          color: 'var(--fg-mute)', fontSize: 13,
        }}>
          No jobs yet.{' '}
          <Link href="/jobs/new" style={{ color: 'var(--accent)' }}>Create your first job →</Link>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border2)' }}>
                <th style={{ ...th, width: 40, paddingRight: 0 }}>
                  <input
                    type="checkbox"
                    checked={selected.size === jobs.length && jobs.length > 0}
                    onChange={toggleAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={th}>Name</th>
                <th style={th}>Schedule</th>
                <th style={th}>Status</th>
                <th style={th}>Last run</th>
                <th style={th}>Last 7 days</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id} style={{ opacity: pending ? 0.6 : 1 }}>
                  <td style={{ ...td, width: 40, paddingRight: 0 }}>
                    <input
                      type="checkbox"
                      checked={selected.has(job.id)}
                      onChange={() => toggleOne(job.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td style={td}>
                    <Link href={`/jobs/${job.id}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                      {job.name}
                    </Link>
                  </td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-mute)' }}>
                    {job.schedule}
                  </td>
                  <td style={td}>
                    <Badge status={job.enabled ? 'healthy' : 'paused'} label={job.enabled ? 'Enabled' : 'Disabled'} />
                  </td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-mute)' }}>
                    {fmtDate(job.lastRunAt)}
                  </td>
                  <td style={td}>
                    <RunStrip dots={strips[job.id] ?? Array(7).fill('none')} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Floating action bar */}
      {selected.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '10px 16px',
          display: 'flex', gap: 8, alignItems: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 40,
        }}>
          <span style={{ fontSize: 12, color: 'var(--fg-mute)', marginRight: 4 }}>
            {selected.size} selected
          </span>
          {[
            { label: 'Pause',  action: 'pause'  as const, color: 'var(--fg)'  },
            { label: 'Resume', action: 'resume' as const, color: 'var(--fg)'  },
            { label: 'Delete', action: 'delete' as const, color: 'var(--err)' },
          ].map(({ label, action, color }) => (
            <button
              key={action}
              disabled={pending}
              onClick={() => handleBulkAction(action)}
              style={{
                padding: '5px 14px', fontSize: 12, fontWeight: 500,
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                background: 'var(--surf2)', color, cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setSelected(new Set())}
            style={{
              padding: '5px 10px', fontSize: 12,
              borderRadius: 'var(--radius-sm)', border: 'none',
              background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add "apps/web/app/(dashboard)/jobs/jobs-table.tsx"
git commit -m "feat: JobsTable — 7-day run strip + checkbox bulk operations"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| 7-day run strip on jobs list (green/red/missed dots) | Task 2 (`buildStrips`) + Task 3 (`RunStrip`) |
| Bulk pause | Task 1 (`pauseJobs`) + Task 3 (action bar) |
| Bulk resume | Task 1 (`resumeJobs`) + Task 3 (action bar) |
| Bulk delete | Task 1 (`deleteJobs`) + Task 3 (action bar) |
| Bulk run now | Task 1 (`triggerJob` stub) — single trigger only, bulk run deferred (agent triggering not yet implemented) |

**Note:** "Bulk run now" is intentionally minimal — the spec notes this requires agent triggering which is not yet implemented. The server action stub is in place; the UI button is omitted from the action bar to avoid a no-op button.

**Job dependencies and job templates** from the spec (2.1) require a new job creation form which does not yet exist in this codebase. These are deferred to a future plan.

### Placeholder scan

No TBDs or TODOs. All code blocks are complete.

### Type consistency

- `RunDot` exported from `page.tsx`, imported in `jobs-table.tsx` — consistent.
- `Job` interface in `jobs-table.tsx` matches columns selected in `page.tsx` — consistent.
- `inArray` added to `@backupos/db` re-exports in Task 1 Step 2 before use in server actions — consistent.
