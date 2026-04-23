# Restore UI Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a run detail page with step logs, live polling while a restore is running, and a split button that lets you restore from any snapshot (not just latest).

**Architecture:** Three new files (run detail page, poll wrapper, split button) and three modified files (runs list page, spec detail page, server actions). No DB changes — everything works with existing `run.log` (JSON `StepResult[]`), `run.status`, and the `snapshots` table. Data fetching in the picker modal uses server actions (the project has no React Query setup; tRPC is proxy-only).

**Tech Stack:** Next.js 15 App Router, Drizzle/SQLite via `getDb()`, `'use server'` server actions, `useTransition` + `useEffect` for client state, `router.refresh()` for polling.

---

## File Map

| File | Change |
|------|--------|
| `apps/web/app/actions/restore.ts` | Modify: add `getSnapshots`, `getRepositories`, `runSpecWithSnapshot` |
| `apps/web/app/(dashboard)/restore/[id]/runs/poll-wrapper.tsx` | Create: client polling component |
| `apps/web/app/(dashboard)/restore/[id]/runs/[runId]/page.tsx` | Create: run detail server component |
| `apps/web/app/(dashboard)/restore/[id]/runs/page.tsx` | Modify: clickable rows + PollWrapper |
| `apps/web/app/(dashboard)/restore/[id]/run-split-button.tsx` | Create: split button + snapshot picker modal |
| `apps/web/app/(dashboard)/restore/[id]/page.tsx` | Modify: swap RunNowButton → RunSplitButton |

---

### Task 1: Server actions — snapshot fetching + runSpecWithSnapshot

**Files:**
- Modify: `apps/web/app/actions/restore.ts`

No automated tests exist for server actions in this codebase — verify manually by checking the network tab in the browser after Task 5.

- [ ] **Step 1: Read the file**

Read `apps/web/app/actions/restore.ts` to confirm the current imports and exports before editing.

- [ ] **Step 2: Add three new exports to `apps/web/app/actions/restore.ts`**

Append after the last export (`runSpec`) — do not change any existing code:

```ts
export async function getSnapshots(
  repositoryId: string,
): Promise<{ id: string; createdAt: Date | null; sizeBytes: number | null }[]> {
  const db = getDb()
  return db
    .select({ id: snapshots.id, createdAt: snapshots.createdAt, sizeBytes: snapshots.sizeBytes })
    .from(snapshots)
    .where(eq(snapshots.repositoryId, repositoryId))
    .orderBy(desc(snapshots.createdAt))
    .all()
}

export async function getRepositories(): Promise<{ id: string; name: string }[]> {
  const db = getDb()
  return db
    .select({ id: repositories.id, name: repositories.name })
    .from(repositories)
    .orderBy(repositories.name)
    .all()
}

export async function runSpecWithSnapshot(
  specId: string,
  snapshotId: string,
): Promise<{ error: string } | void> {
  try {
    await runSpec(specId, snapshotId)
  } catch (err: unknown) {
    // re-throw Next.js redirect — it's not a real error
    if (
      err != null &&
      typeof err === 'object' &&
      'digest' in err &&
      typeof (err as { digest: unknown }).digest === 'string' &&
      (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw err
    }
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 3: Add missing imports at the top of `apps/web/app/actions/restore.ts`**

The file currently imports: `getDb, restoreSpecs, restoreRuns, eq`. Add `snapshots`, `repositories`, `desc` to the `@backupos/db` import line:

```ts
import { getDb, restoreSpecs, restoreRuns, snapshots, repositories, eq, desc } from '@backupos/db'
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -E 'restore|actions' | head -20
```

Expected: no errors in `app/actions/restore.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/actions/restore.ts
git commit -m "feat(restore): add getSnapshots, getRepositories, runSpecWithSnapshot actions"
```

---

### Task 2: PollWrapper client component

**Files:**
- Create: `apps/web/app/(dashboard)/restore/[id]/runs/poll-wrapper.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function PollWrapper({ initialStatus }: { initialStatus: string }) {
  const router = useRouter()

  useEffect(() => {
    if (initialStatus !== 'running') return
    const id = setInterval(() => { router.refresh() }, 3_000)
    return () => clearInterval(id)
  }, [initialStatus, router])

  return null
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep 'poll-wrapper' | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/(dashboard)/restore/[id]/runs/poll-wrapper.tsx
git commit -m "feat(restore): add PollWrapper client polling component"
```

---

### Task 3: Run detail page

**Files:**
- Create: `apps/web/app/(dashboard)/restore/[id]/runs/[runId]/page.tsx`

This is a server component. It reads `run.log` (JSON `StepResult[]`), renders each step with a ✓/✗ icon, and mounts `<PollWrapper>` when the run is still in progress.

`StepResult` shape (from `@backupos/restore`):
```ts
interface StepResult {
  step: { name: string; type: string; [key: string]: unknown }
  success: boolean
  output?: string
  error?: string
  durationMs: number
}
```

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p "apps/web/app/(dashboard)/restore/[id]/runs/[runId]"
```

Then create `apps/web/app/(dashboard)/restore/[id]/runs/[runId]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getDb, restoreRuns, restoreSpecs } from '@backupos/db'
import { eq } from '@backupos/db'
import { PollWrapper } from '../poll-wrapper'

interface StepResult {
  step: { name: string; type: string }
  success: boolean
  output?: string
  error?: string
  durationMs: number
}

function safeParseSteps(raw: string | null | undefined): StepResult[] {
  if (!raw) return []
  try { return JSON.parse(raw) as StepResult[] } catch { return [] }
}

const STATUS_COLORS: Record<string, string> = {
  running: 'var(--accent)',
  success: 'var(--ok)',
  failed:  'var(--err)',
}

export default async function RestoreRunDetailPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>
}) {
  const { id, runId } = await params
  const db = getDb()

  const [run] = await db.select().from(restoreRuns).where(eq(restoreRuns.id, runId)).limit(1)
  if (!run) notFound()

  const [spec] = await db.select().from(restoreSpecs).where(eq(restoreSpecs.id, id)).limit(1)

  const steps = safeParseSteps(run.log)
  const statusColor = STATUS_COLORS[run.status] ?? 'var(--fg-mute)'

  const durationMs =
    run.completedAt && run.startedAt
      ? run.completedAt.getTime() - run.startedAt.getTime()
      : null

  return (
    <div style={{ maxWidth: 900 }}>
      {run.status === 'running' && <PollWrapper initialStatus="running" />}

      {/* Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link
          href={`/restore/${id}/runs`}
          style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}
        >
          ← {spec?.name ?? id} / Run history
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
          Run {run.id.slice(0, 8)}
        </h1>
        <span style={{
          fontSize: 12, fontWeight: 500, padding: '2px 8px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: `color-mix(in srgb, transparent 85%, ${statusColor} 15%)`,
          color: statusColor,
          border: `1px solid color-mix(in srgb, transparent 70%, ${statusColor} 30%)`,
        }}>
          {run.status}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-dim)' }}>
          {run.startedAt?.toISOString().slice(0, 16).replace('T', ' ')}
          {durationMs != null ? ` · ${(durationMs / 1000).toFixed(1)}s` : ''}
          {run.snapshotId ? ` · ${run.snapshotId.slice(0, 8)}` : ''}
        </span>
      </div>

      {/* Steps */}
      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid var(--border)',
          fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          Steps
        </div>

        {run.status === 'running' && steps.length === 0 ? (
          <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--fg-mute)' }}>
            Restore in progress…
          </div>
        ) : steps.length === 0 ? (
          <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--fg-mute)' }}>
            No log available
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {steps.map((s, i) => {
              const outputColor = s.success ? 'var(--fg-mute)' : 'var(--err)'
              return (
                <div
                  key={i}
                  style={{
                    borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                    padding: '10px 16px',
                    backgroundColor: s.success
                      ? 'color-mix(in srgb, var(--surf) 95%, var(--ok) 5%)'
                      : 'color-mix(in srgb, var(--surf) 93%, var(--err) 7%)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: s.success ? 'var(--ok)' : 'var(--err)', fontWeight: 500 }}>
                      {s.success ? '✓' : '✗'} {s.step.name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                      {(s.durationMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                  {(s.output || s.error) && (
                    <pre style={{
                      margin: '6px 0 0 0', fontSize: 11, fontFamily: 'var(--font-mono)',
                      color: outputColor, lineHeight: 1.5,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                    }}>
                      {s.error ?? s.output}
                    </pre>
                  )}
                </div>
              )
            })}
            {run.status === 'running' && (
              <div style={{
                borderTop: '1px solid var(--border)', padding: '10px 16px',
                fontSize: 12, color: 'var(--accent)',
              }}>
                Running…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -E 'runId|run-detail|RunDetail' | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(dashboard)/restore/[id]/runs/[runId]/page.tsx"
git commit -m "feat(restore): add run detail page with step logs"
```

---

### Task 4: Clickable run rows + PollWrapper on runs list

**Files:**
- Modify: `apps/web/app/(dashboard)/restore/[id]/runs/page.tsx`

- [ ] **Step 1: Read the current file**

Read `apps/web/app/(dashboard)/restore/[id]/runs/page.tsx` to confirm current imports and JSX.

- [ ] **Step 2: Replace the file contents**

The runs list page needs: (1) clickable rows that link to `/restore/${id}/runs/${run.id}`, (2) `<PollWrapper>` mounted when any run is `'running'`.

```tsx
import type { ComponentProps } from 'react'
import { getDb, restoreRuns, restoreSpecs } from '@backupos/db'
import { eq, desc } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PollWrapper } from './poll-wrapper'

type BadgeStatus = ComponentProps<typeof Badge>['status']

export default async function RestoreRunsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db     = getDb()
  const [spec] = await db.select().from(restoreSpecs).where(eq(restoreSpecs.id, id)).limit(1)
  if (!spec) notFound()

  const runs = await db
    .select()
    .from(restoreRuns)
    .where(eq(restoreRuns.specId, id))
    .orderBy(desc(restoreRuns.startedAt))
    .all()

  const hasRunning = runs.some(r => r.status === 'running')

  return (
    <div>
      <PollWrapper initialStatus={hasRunning ? 'running' : 'done'} />

      <div style={{ marginBottom: 24 }}>
        <Link href={`/restore/${id}`} style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>
          ← {spec.name}
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>Restore run history</h1>
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {runs.length === 0 ? (
          <EmptyState type="inline" headline="No runs yet" />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border2)' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Started</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Trigger</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Snapshot</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr
                  key={run.id}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  <td style={{ padding: 0 }} colSpan={4}>
                    <Link
                      href={`/restore/${id}/runs/${run.id}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto auto auto',
                        gap: 0,
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
                      <span style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                        {run.startedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'}
                      </span>
                      <span style={{ padding: '12px 20px' }}>
                        <Badge status={(run.status ?? 'idle') as BadgeStatus} />
                      </span>
                      <span style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', whiteSpace: 'nowrap' }}>
                        {run.trigger ?? '—'}
                      </span>
                      <span style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                        {run.snapshotId?.slice(0, 8) ?? '—'}
                      </span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep 'runs/page' | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/restore/[id]/runs/page.tsx"
git commit -m "feat(restore): clickable run rows and live polling on runs list"
```

---

### Task 5: RunSplitButton with snapshot picker modal

**Files:**
- Create: `apps/web/app/(dashboard)/restore/[id]/run-split-button.tsx`

This client component renders a split button. Left half triggers `runSpec` immediately. Right half (▾) opens a dropdown with "Run with latest" and "Choose snapshot…". Clicking "Choose snapshot…" opens a modal that lets the user pick a specific snapshot.

If `repositoryId` is provided, the modal immediately loads that repo's snapshots. If not, it first shows a repo selector, then loads snapshots for the chosen repo.

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { runSpec, runSpecWithSnapshot, getSnapshots, getRepositories } from '@/app/actions/restore'

interface Snapshot {
  id: string
  createdAt: Date | null
  sizeBytes: number | null
}

interface Repo {
  id: string
  name: string
}

function formatBytes(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`
  if (n >= 1_048_576)     return `${(n / 1_048_576).toFixed(1)} MB`
  return `${(n / 1024).toFixed(0)} KB`
}

export function RunSplitButton({
  specId,
  repositoryId,
}: {
  specId: string
  repositoryId: string | null
}) {
  const [isPending, startTransition] = useTransition()
  const [dropOpen, setDropOpen]       = useState(false)
  const [modalOpen, setModalOpen]     = useState(false)

  // Picker state
  const [repos, setRepos]               = useState<Repo[]>([])
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(repositoryId)
  const [snapshots, setSnapshots]       = useState<Snapshot[]>([])
  const [selectedSnapId, setSelectedSnapId] = useState<string | null>(null)
  const [loadingSnaps, setLoadingSnaps] = useState(false)
  const [loadError, setLoadError]       = useState<string | null>(null)
  const [runError, setRunError]         = useState<string | null>(null)

  const dropRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropOpen) return
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropOpen])

  // When modal opens with a known repositoryId, load snapshots immediately
  useEffect(() => {
    if (!modalOpen) return
    if (!selectedRepoId) {
      // need to load repo list
      getRepositories().then(r => setRepos(r)).catch(() => setRepos([]))
      return
    }
    loadSnapshotsForRepo(selectedRepoId)
  }, [modalOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  function loadSnapshotsForRepo(repoId: string) {
    setLoadingSnaps(true)
    setLoadError(null)
    setSnapshots([])
    setSelectedSnapId(null)
    getSnapshots(repoId).then(snaps => {
      setSnapshots(snaps)
      setLoadingSnaps(false)
    }).catch(() => {
      setLoadError('Failed to load snapshots.')
      setLoadingSnaps(false)
    })
  }

  function openModal() {
    setDropOpen(false)
    setModalOpen(true)
    setRunError(null)
    setSelectedSnapId(null)
    setSnapshots([])
    setLoadError(null)
    if (repositoryId) {
      setSelectedRepoId(repositoryId)
    } else {
      setSelectedRepoId(null)
      setRepos([])
    }
  }

  function handleRepoSelect(repoId: string) {
    setSelectedRepoId(repoId)
    loadSnapshotsForRepo(repoId)
  }

  function handleRun() {
    if (!selectedSnapId) return
    setRunError(null)
    startTransition(async () => {
      const result = await runSpecWithSnapshot(specId, selectedSnapId)
      if (result && 'error' in result) {
        setRunError(result.error)
      }
      // on success, redirect happens server-side
    })
  }

  const buttonBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 600, fontSize: 13, cursor: 'pointer', border: 'none',
    padding: '7px 14px', lineHeight: 1,
  }

  return (
    <>
      {/* Split button */}
      <div ref={dropRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          disabled={isPending}
          onClick={() => startTransition(() => runSpec(specId))}
          style={{
            ...buttonBase,
            backgroundColor: 'var(--accent)',
            color: '#000',
            borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
            borderRight: '1px solid color-mix(in srgb, var(--accent) 70%, #000 30%)',
          }}
        >
          {isPending ? 'Starting…' : 'Run now'}
        </button>
        <button
          disabled={isPending}
          onClick={() => setDropOpen(o => !o)}
          aria-label="More run options"
          style={{
            ...buttonBase,
            backgroundColor: 'color-mix(in srgb, var(--accent) 20%, var(--surf) 80%)',
            color: 'var(--accent)',
            borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
            padding: '7px 10px',
          }}
        >
          ▾
        </button>

        {dropOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0,
            backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            minWidth: 180, zIndex: 50,
          }}>
            <button
              onClick={() => { setDropOpen(false); startTransition(() => runSpec(specId)) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 14px', fontSize: 13, color: 'var(--fg)',
                background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              Run with latest
            </button>
            <div style={{ height: 1, backgroundColor: 'var(--border)' }} />
            <button
              onClick={openModal}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 14px', fontSize: 13, color: 'var(--fg)',
                background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              Choose snapshot…
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', width: '100%', maxWidth: 480,
              maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Modal header */}
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg)' }}>
                Choose snapshot
              </span>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--fg-dim)', cursor: 'pointer', fontSize: 16 }}
              >
                ✕
              </button>
            </div>

            {/* Repo selector (flow B — no repositoryId) */}
            {!repositoryId && !selectedRepoId && (
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <label style={{ fontSize: 12, color: 'var(--fg-dim)', display: 'block', marginBottom: 6 }}>
                  Repository
                </label>
                <select
                  style={{
                    width: '100%', backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 13, padding: '7px 10px',
                  }}
                  defaultValue=""
                  onChange={e => { if (e.target.value) handleRepoSelect(e.target.value) }}
                >
                  <option value="" disabled>Select a repository…</option>
                  {repos.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Snapshot list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {loadingSnaps && (
                <div style={{ padding: '20px', fontSize: 13, color: 'var(--fg-mute)', textAlign: 'center' }}>
                  Loading…
                </div>
              )}
              {loadError && (
                <div style={{ padding: '20px', fontSize: 13, color: 'var(--err)', textAlign: 'center' }}>
                  {loadError}{' '}
                  <button
                    onClick={() => selectedRepoId && loadSnapshotsForRepo(selectedRepoId)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}
                  >
                    Retry
                  </button>
                </div>
              )}
              {!loadingSnaps && !loadError && selectedRepoId && snapshots.length === 0 && (
                <div style={{ padding: '20px', fontSize: 13, color: 'var(--fg-mute)', textAlign: 'center' }}>
                  No snapshots found in this repository.
                </div>
              )}
              {snapshots.map(snap => (
                <button
                  key={snap.id}
                  onClick={() => setSelectedSnapId(snap.id)}
                  style={{
                    display: 'flex', width: '100%', textAlign: 'left',
                    alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
                    backgroundColor: selectedSnapId === snap.id ? 'var(--surf2)' : 'transparent',
                    borderLeft: `3px solid ${selectedSnapId === snap.id ? 'var(--accent)' : 'transparent'}`,
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>
                    {snap.id.slice(0, 8)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                    {snap.createdAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'}
                    {' · '}
                    {formatBytes(snap.sizeBytes)}
                  </span>
                </button>
              ))}
            </div>

            {/* Error */}
            {runError && (
              <div style={{
                padding: '8px 20px', fontSize: 12, color: 'var(--err)',
                borderTop: '1px solid var(--border)',
              }}>
                {runError}
              </div>
            )}

            {/* Footer */}
            <div style={{
              padding: '12px 20px', borderTop: '1px solid var(--border)',
              display: 'flex', gap: 8, justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  padding: '7px 14px', fontSize: 13, cursor: 'pointer',
                  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--fg)',
                }}
              >
                Cancel
              </button>
              <button
                disabled={!selectedSnapId || isPending}
                onClick={handleRun}
                style={{
                  padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  backgroundColor: selectedSnapId ? 'var(--accent)' : 'var(--surf2)',
                  color: selectedSnapId ? '#000' : 'var(--fg-dim)',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  opacity: (!selectedSnapId || isPending) ? 0.6 : 1,
                }}
              >
                {isPending ? 'Starting…' : 'Run'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep 'run-split-button' | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(dashboard)/restore/[id]/run-split-button.tsx"
git commit -m "feat(restore): add RunSplitButton with snapshot picker modal"
```

---

### Task 6: Swap RunNowButton → RunSplitButton on the spec detail page

**Files:**
- Modify: `apps/web/app/(dashboard)/restore/[id]/page.tsx`

- [ ] **Step 1: Read the current file**

Read `apps/web/app/(dashboard)/restore/[id]/page.tsx` to confirm the current import and JSX.

- [ ] **Step 2: Replace the import line**

Change:
```ts
import { RunNowButton } from './run-button'
```
to:
```ts
import { RunSplitButton } from './run-split-button'
```

- [ ] **Step 3: Replace the JSX usage**

Change:
```tsx
<RunNowButton specId={id} />
```
to:
```tsx
<RunSplitButton specId={id} repositoryId={spec.repositoryId ?? null} />
```

- [ ] **Step 4: Typecheck the whole app**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(dashboard)/restore/[id]/page.tsx"
git commit -m "feat(restore): swap RunNowButton for RunSplitButton on spec detail page"
```

---

## Manual Testing Checklist

After all tasks are complete, start the dev server and verify each feature:

```bash
pnpm dev
```

**Run detail page:**
- [ ] Navigate to `/restore` → open any spec → "Run history" → click a row
- [ ] Confirm you land on `/restore/<id>/runs/<runId>` with step logs
- [ ] A failed step shows in red (✗ icon, red output)
- [ ] A successful step shows in green (✓ icon)

**Live polling:**
- [ ] Trigger a run (Run now) — confirm the page redirects to `/restore/<id>/runs`
- [ ] While the run is `running`, the page auto-refreshes and the badge updates
- [ ] After the run completes, refreshes stop (no more network traffic every 3s)

**Split button:**
- [ ] On the spec detail page, confirm a split button appears instead of "Run now"
- [ ] Left half triggers immediately (redirects to runs page)
- [ ] ▾ opens a dropdown with "Run with latest" and "Choose snapshot…"
- [ ] "Choose snapshot…" opens the modal
- [ ] If the spec has a `repositoryId`, snapshots load immediately
- [ ] If not, a repo selector appears first; after choosing a repo, snapshots load
- [ ] Clicking a snapshot row highlights it; clicking "Run" starts the restore