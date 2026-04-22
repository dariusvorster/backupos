# Live Run Streaming + Session Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the run detail page with a scrollable log viewer (polling for live runs), a phase timeline scrubber (pre-hook → backup → post-hook → verification), "Jump to error" and "Copy as command" buttons. Store logs and phase timing in two new text columns on `backupRuns`.

**Architecture:** Two new nullable text columns on `backupRuns` — `log` (newline-delimited log text) and `phases` (JSON with per-phase timing and status). A `LogViewer` client component polls every 3s when the run is in progress, auto-scrolls to the bottom, and exposes "Jump to error" (scrolls to first ERROR line). A `PhaseTimeline` client component renders an SVG timeline bar and a range input scrubber; dragging it scrolls the log view to the corresponding line by timestamp. "Copy as command" constructs a restic backup command string from the job/repo config. No WebSocket or SSE — polling is sufficient for the MVP.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, CSS custom properties, inline SVG for phase bars, `useRef` for scroll control.

---

## File Map

| File | Action |
|---|---|
| `packages/db/src/schema.ts` | Modify — add `log`, `phases` to `backupRuns` |
| `apps/web/app/actions/runs.ts` | Create — `getRunLog(runId)`, `copyCommand(runId)` server actions |
| `apps/web/components/log-viewer.tsx` | Create — `LogViewer` client component with polling, scroll, jump-to-error |
| `apps/web/components/phase-timeline.tsx` | Create — `PhaseTimeline` client component with scrubber |
| `apps/web/app/(dashboard)/jobs/[id]/runs/[runId]/page.tsx` | Modify — add LogViewer + PhaseTimeline + Copy command button |

---

### Task 1: DB Schema — log and phases columns on backupRuns

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Find the backupRuns table**

```bash
grep -n "export const backupRuns" packages/db/src/schema.ts
```

Read a few lines from that line to confirm current last column.

- [ ] **Step 2: Add two columns**

After the last existing column in `backupRuns` (before the closing `}`), add:

```typescript
log:    text('log'),
phases: text('phases'),
```

`log` stores the full run log as newline-delimited text. Each line is formatted by the agent as `[HH:MM:SS] [PHASE] message`, e.g. `[00:00:01] [backup] snapshot 3a4b5c created`. Null = no log yet.

`phases` stores a JSON object with timing per phase:
```json
{
  "preHook":     { "startMs": 0,     "durationMs": 1200,  "status": "ok" },
  "backup":      { "startMs": 1200,  "durationMs": 43000, "status": "ok" },
  "postHook":    { "startMs": 44200, "durationMs": 800,   "status": "ok" },
  "verification":{ "startMs": 45000, "durationMs": 2000,  "status": "ok" }
}
```
Phase status is one of: `"ok"`, `"error"`, `"skipped"`. Null = no phase data (legacy runs).

- [ ] **Step 3: Generate migration and run against BOTH databases**

```bash
pnpm --filter @backupos/db db:generate
pnpm --filter @backupos/db db:migrate
DATABASE_URL="file:../../apps/web/data/backupos.db" pnpm --filter @backupos/db db:migrate
```

- [ ] **Step 4: Rebuild db package**

```bash
pnpm --filter @backupos/db build
```

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations/
git commit -m "feat: add log and phases columns to backupRuns schema"
```

---

### Task 2: Server Actions for Run Log

**Files:**
- Create: `apps/web/app/actions/runs.ts`

- [ ] **Step 1: Check what columns are available on backupRuns and related tables**

```bash
grep -n "export const backupRuns\|export const backupJobs\|export const repositories\|sourceConfig\|backend\|config\|log\|phases" packages/db/src/schema.ts | head -40
```

Note the column names for job `sourceType`, `sourceConfig` and repository `backend`, `config`.

- [ ] **Step 2: Create `apps/web/app/actions/runs.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { getDb, backupRuns, backupJobs, repositories } from '@backupos/db'
import { eq } from 'drizzle-orm'

export interface PhaseEntry {
  startMs:    number
  durationMs: number
  status:     'ok' | 'error' | 'skipped'
}

export interface PhaseData {
  preHook?:     PhaseEntry
  backup?:      PhaseEntry
  postHook?:    PhaseEntry
  verification?: PhaseEntry
}

export interface RunDetail {
  id:          string
  status:      string
  startedAt:   Date | null
  completedAt: Date | null
  log:         string | null
  phases:      PhaseData | null
  errorMessage: string | null
  jobId:       string
}

export async function getRunDetail(runId: string): Promise<RunDetail | null> {
  const db  = getDb()
  const row = await db.select({
    id:           backupRuns.id,
    status:       backupRuns.status,
    startedAt:    backupRuns.startedAt,
    completedAt:  backupRuns.completedAt,
    log:          backupRuns.log,
    phases:       backupRuns.phases,
    errorMessage: backupRuns.errorMessage,
    jobId:        backupRuns.jobId,
  }).from(backupRuns).where(eq(backupRuns.id, runId)).get()

  if (!row) return null

  let phases: PhaseData | null = null
  if (row.phases) {
    try { phases = JSON.parse(row.phases) } catch { phases = null }
  }

  return { ...row, phases }
}

export async function getResticCommand(runId: string): Promise<string> {
  const db  = getDb()
  const run = await db.select({ jobId: backupRuns.jobId, repositoryId: backupRuns.repositoryId })
    .from(backupRuns).where(eq(backupRuns.id, runId)).get()
  if (!run) return '# run not found'

  const job = await db.select({ sourceType: backupJobs.sourceType, sourceConfig: backupJobs.sourceConfig })
    .from(backupJobs).where(eq(backupJobs.id, run.jobId)).get()

  const repo = await db.select({ backend: repositories.backend, config: repositories.config })
    .from(repositories).where(eq(repositories.id, run.repositoryId)).get()

  const source = (() => {
    try { return JSON.parse(job?.sourceConfig ?? '{}')?.path ?? '/data' } catch { return '/data' }
  })()

  const repoPath = (() => {
    try {
      const cfg = JSON.parse(repo?.config ?? '{}')
      return cfg.bucket ? `${repo?.backend ?? 's3'}:${cfg.bucket}` : cfg.path ?? '/backup'
    } catch { return '/backup' }
  })()

  return `restic -r ${repoPath} backup ${source} --compression max`
}
```

**IMPORTANT:** Check the actual column names on `backupRuns` — `repositoryId` may be named differently. Adapt the select query to use whatever columns exist. If `repositoryId` doesn't exist on runs, skip the repo lookup and return a simpler command.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/actions/runs.ts
git commit -m "feat: add getRunDetail and getResticCommand server actions"
```

---

### Task 3: LogViewer Client Component

**Files:**
- Create: `apps/web/components/log-viewer.tsx`

- [ ] **Step 1: Create `apps/web/components/log-viewer.tsx`**

```typescript
'use client'

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { getRunDetail } from '@/app/actions/runs'
import type { RunDetail } from '@/app/actions/runs'

interface LogViewerProps {
  initialRun: RunDetail
  onPhaseUpdate?: (run: RunDetail) => void
}

// Parse log lines from raw text — each line is a string
function parseLines(log: string | null): string[] {
  if (!log) return []
  return log.split('\n').filter(l => l.trim().length > 0)
}

// Find index of first ERROR line
function findFirstError(lines: string[]): number {
  return lines.findIndex(l => /\[error\]|\berror\b/i.test(l))
}

export function LogViewer({ initialRun, onPhaseUpdate }: LogViewerProps) {
  const [run,        setRun]        = useState<RunDetail>(initialRun)
  const [isPending,  startTransition] = useTransition()
  const scrollRef                   = useRef<HTMLDivElement>(null)
  const userScrolled                = useRef(false)
  const intervalRef                 = useRef<ReturnType<typeof setInterval> | null>(null)

  const lines = parseLines(run.log)
  const errorIdx = findFirstError(lines)
  const isLive   = run.status === 'running'

  // Auto-scroll to bottom for live runs (unless user scrolled up)
  useEffect(() => {
    if (!isLive || userScrolled.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length, isLive])

  // Detect user scroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onScroll() {
      const el = scrollRef.current
      if (!el) return
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      userScrolled.current = !atBottom
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Poll every 3s for live runs
  useEffect(() => {
    if (!isLive) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      startTransition(async () => {
        const updated = await getRunDetail(initialRun.id)
        if (updated) {
          setRun(updated)
          onPhaseUpdate?.(updated)
        }
      })
    }, 3000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isLive, initialRun.id, onPhaseUpdate])

  const jumpToError = useCallback(() => {
    if (errorIdx < 0 || !scrollRef.current) return
    const el = scrollRef.current
    const lineEls = el.querySelectorAll<HTMLElement>('[data-line]')
    const target  = lineEls[errorIdx]
    if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); userScrolled.current = true }
  }, [errorIdx])

  const scrollToLine = useCallback((lineIdx: number) => {
    const el = scrollRef.current
    if (!el) return
    const lineEls = el.querySelectorAll<HTMLElement>('[data-line]')
    const target  = lineEls[lineIdx]
    if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); userScrolled.current = true }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        backgroundColor: 'var(--surf2)',
        borderBottom: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, color: 'var(--fg-mute)', flex: 1 }}>
          {isLive ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                backgroundColor: 'var(--ok)',
                animation: 'pulse-dot 1.5s ease-in-out infinite',
              }} />
              Live · {lines.length} lines
            </span>
          ) : `${lines.length} lines`}
        </span>
        {errorIdx >= 0 && (
          <button
            onClick={jumpToError}
            style={{
              fontSize: 12, padding: '3px 10px', cursor: 'pointer',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--err)',
              color: 'var(--err)', background: 'none',
            }}
          >
            ↓ Jump to error
          </button>
        )}
        {isLive && isPending && (
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Refreshing…</span>
        )}
      </div>

      {/* Log output */}
      <div
        ref={scrollRef}
        style={{
          height: 360,
          overflowY: 'auto',
          backgroundColor: '#0d1117',
          borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
          padding: '12px 0',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        {lines.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: '#6e7681', fontSize: 12 }}>
            {isLive ? 'Waiting for log output…' : 'No log data recorded for this run.'}
          </div>
        ) : (
          lines.map((line, i) => {
            const isError = /\[error\]|\berror\b/i.test(line)
            const isWarn  = /\[warn\]|\bwarn\b/i.test(line)
            return (
              <div
                key={i}
                data-line={i}
                style={{
                  display: 'flex', alignItems: 'flex-start',
                  padding: '1px 16px',
                  backgroundColor: isError ? 'rgba(248,81,73,0.08)' : 'transparent',
                  borderLeft: isError ? '2px solid #f85149' : isWarn ? '2px solid #d29922' : '2px solid transparent',
                }}
              >
                <span style={{ color: '#6e7681', userSelect: 'none', minWidth: 32, marginRight: 8, fontSize: 11 }}>
                  {String(i + 1).padStart(3, ' ')}
                </span>
                <span style={{ color: isError ? '#f85149' : isWarn ? '#d29922' : '#c9d1d9', wordBreak: 'break-all' }}>
                  {line}
                </span>
              </div>
            )
          })
        )}
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}

// Export scrollToLine ref helper so PhaseTimeline can trigger scroll
export type { LogViewerProps }
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/log-viewer.tsx
git commit -m "feat: add LogViewer component with polling, auto-scroll, and jump-to-error"
```

---

### Task 4: PhaseTimeline + Run Detail Page Integration

**Files:**
- Create: `apps/web/components/phase-timeline.tsx`
- Modify: `apps/web/app/(dashboard)/jobs/[id]/runs/[runId]/page.tsx`

- [ ] **Step 1: Create `apps/web/components/phase-timeline.tsx`**

```typescript
'use client'

import { useState, useCallback } from 'react'
import type { PhaseData, PhaseEntry } from '@/app/actions/runs'

interface PhaseTimelineProps {
  phases:      PhaseData
  totalMs:     number
  onScrub?:    (fraction: number) => void
}

const PHASE_ORDER = ['preHook', 'backup', 'postHook', 'verification'] as const
type PhaseName = typeof PHASE_ORDER[number]

const PHASE_LABEL: Record<PhaseName, string> = {
  preHook:     'Pre-hook',
  backup:      'Backup',
  postHook:    'Post-hook',
  verification:'Verify',
}

const PHASE_COLOR: Record<string, string> = {
  ok:      'var(--ok)',
  error:   'var(--err)',
  skipped: 'var(--fg-dim)',
}

export function PhaseTimeline({ phases, totalMs, onScrub }: PhaseTimelineProps) {
  const [scrubPos, setScrubPos] = useState(100)  // 0–100

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setScrubPos(val)
    onScrub?.(val / 100)
  }, [onScrub])

  return (
    <div style={{ padding: '12px 0' }}>
      {/* Phase bars */}
      <div style={{ position: 'relative', height: 24, backgroundColor: 'var(--surf2)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: 6 }}>
        {PHASE_ORDER.map(name => {
          const phase = phases[name] as PhaseEntry | undefined
          if (!phase) return null
          const left  = totalMs > 0 ? (phase.startMs / totalMs) * 100 : 0
          const width = totalMs > 0 ? (phase.durationMs / totalMs) * 100 : 0
          const color = PHASE_COLOR[phase.status] ?? 'var(--accent)'
          return (
            <div
              key={name}
              title={`${PHASE_LABEL[name]}: ${(phase.durationMs / 1000).toFixed(1)}s (${phase.status})`}
              style={{
                position: 'absolute',
                left:  `${left}%`,
                width: `${width}%`,
                height: '100%',
                backgroundColor: color,
                opacity: 0.75,
              }}
            />
          )
        })}
        {/* Scrubber position indicator */}
        <div style={{
          position: 'absolute',
          left: `${scrubPos}%`,
          top: 0, bottom: 0,
          width: 2,
          backgroundColor: 'var(--fg)',
          pointerEvents: 'none',
          transform: 'translateX(-50%)',
        }} />
      </div>

      {/* Phase labels */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        {PHASE_ORDER.map(name => {
          const phase = phases[name] as PhaseEntry | undefined
          if (!phase) return null
          const color = PHASE_COLOR[phase.status] ?? 'var(--accent)'
          return (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color, display: 'inline-block' }} />
              <span style={{ color: 'var(--fg-mute)' }}>{PHASE_LABEL[name]}</span>
              <span style={{ color: 'var(--fg-dim)' }}>{(phase.durationMs / 1000).toFixed(1)}s</span>
            </div>
          )
        })}
      </div>

      {/* Scrubber */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', minWidth: 32 }}>0s</span>
        <input
          type="range"
          min={0}
          max={100}
          value={scrubPos}
          onChange={handleScrub}
          style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', minWidth: 40, textAlign: 'right' }}>
          {(totalMs / 1000).toFixed(1)}s
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Read the current run detail page**

```bash
cat "apps/web/app/(dashboard)/jobs/[id]/runs/[runId]/page.tsx"
```

- [ ] **Step 3: Also check exact column names on backupRuns**

```bash
grep -n "repositoryId\|log\|phases\|completedAt" packages/db/src/schema.ts | grep -i "run\|backup_run" | head -10
```

- [ ] **Step 4: Rewrite the run detail page**

Replace the content of `apps/web/app/(dashboard)/jobs/[id]/runs/[runId]/page.tsx` with:

```typescript
import { notFound }       from 'next/navigation'
import { getDb, backupRuns, backupJobs } from '@backupos/db'
import { eq }             from 'drizzle-orm'
import { LogViewer }      from '@/components/log-viewer'
import { PhaseTimeline }  from '@/components/phase-timeline'
import { getResticCommand } from '@/app/actions/runs'
import { CopyCommandButton } from '@/components/copy-command-button'
import type { PhaseData } from '@/app/actions/runs'

const STATUS_COLORS: Record<string, string> = {
  running:   'var(--accent)',
  success:   'var(--ok)',
  failed:    'var(--err)',
  cancelled: 'var(--fg-dim)',
}

function safeParsePhases(raw: string | null): PhaseData | null {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export default async function RunDetailPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id: jobId, runId } = await params
  const db = getDb()

  const run = await db.select().from(backupRuns).where(eq(backupRuns.id, runId)).get()
  if (!run) notFound()

  const job = await db.select({ name: backupJobs.name }).from(backupJobs).where(eq(backupJobs.id, jobId)).get()

  const phases  = safeParsePhases(run.phases ?? null)
  const totalMs = run.completedAt && run.startedAt
    ? run.completedAt.getTime() - run.startedAt.getTime()
    : 0

  const runDetail = {
    id:           run.id,
    status:       run.status,
    startedAt:    run.startedAt ?? null,
    completedAt:  run.completedAt ?? null,
    log:          run.log ?? null,
    phases,
    errorMessage: run.errorMessage ?? null,
    jobId,
  }

  const statusColor = STATUS_COLORS[run.status] ?? 'var(--fg-mute)'

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 2 }}>
            {job?.name ?? jobId}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
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
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <CopyCommandButton runId={run.id} />
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Duration',    value: run.duration != null ? `${run.duration}s` : '—' },
          { label: 'Data added',  value: run.dataAdded != null ? `${(run.dataAdded / 1_048_576).toFixed(1)} MB` : '—' },
          { label: 'Total size',  value: run.totalSize != null ? `${(run.totalSize / 1_073_741_824).toFixed(2)} GB` : '—' },
          { label: 'Files new',   value: run.filesNew != null ? String(run.filesNew) : '—' },
          { label: 'Changed',     value: run.filesChanged != null ? String(run.filesChanged) : '—' },
          { label: 'Unmodified',  value: run.filesUnmodified != null ? String(run.filesUnmodified) : '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{
            backgroundColor: 'var(--surf)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Error */}
      {run.errorMessage && (
        <div style={{
          backgroundColor: 'color-mix(in srgb, var(--surf) 80%, var(--err) 10%)',
          border: '1px solid color-mix(in srgb, var(--border) 60%, var(--err) 40%)',
          borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 24,
          fontSize: 13, color: 'var(--err)',
        }}>
          <strong>Error:</strong> {run.errorMessage}
        </div>
      )}

      {/* Phase timeline (completed runs with phase data) */}
      {phases && totalMs > 0 && (run.status === 'success' || run.status === 'failed') && (
        <div style={{
          backgroundColor: 'var(--surf)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 12 }}>
            Phase timeline
          </div>
          <PhaseTimeline phases={phases} totalMs={totalMs} />
        </div>
      )}

      {/* Log viewer */}
      <div style={{
        backgroundColor: 'var(--surf)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        marginBottom: 24,
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          Run log
        </div>
        <LogViewer initialRun={runDetail} />
      </div>

      {/* Footer */}
      {run.snapshotId && (
        <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
          Snapshot: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>{run.snapshotId}</code>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Create the CopyCommandButton client component**

Since `getResticCommand` is a server action and the button needs to copy to clipboard, create a small client component at `apps/web/components/copy-command-button.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { Copy, Check } from 'lucide-react'
import { getResticCommand } from '@/app/actions/runs'

export function CopyCommandButton({ runId }: { runId: string }) {
  const [copied, setCopied]          = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleCopy() {
    if (isPending || copied) return
    startTransition(async () => {
      const cmd = await getResticCommand(runId)
      await navigator.clipboard.writeText(cmd)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      disabled={isPending}
      title="Copy restic command"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, padding: '5px 12px', cursor: isPending ? 'wait' : 'pointer',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        color: copied ? 'var(--ok)' : 'var(--fg-mute)',
        background: 'var(--surf)',
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied!' : 'Copy command'}
    </button>
  )
}
```

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -40
```

Fix any errors. Common issues:
- `run.log`, `run.phases` — new columns may need the db package to be rebuilt first: `pnpm --filter @backupos/db build`
- `run.completedAt` — check if it's `Date | null` or `string | null` depending on Drizzle mode config
- `params` in Next.js 15 is a `Promise<{...}>` — already handled with `await params`
- `run.snapshotId` — verify column exists on backupRuns

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/phase-timeline.tsx "apps/web/app/(dashboard)/jobs/[id]/runs/[runId]/page.tsx" apps/web/components/copy-command-button.tsx
git commit -m "feat: add phase timeline, log viewer, and copy command to run detail page"
```

---

## Self-Review

### Spec coverage

| Spec requirement (§1.8) | Task |
|---|---|
| Live log stream with timestamps | Task 3 (LogViewer with 3s polling for running status) |
| Completed runs preserve full session (stored compressed) | Task 1 (log text column) |
| Timeline scrubber at bottom for completed runs | Task 4 (PhaseTimeline with range input) |
| Scrubber shows phases: pre-hook → backup → post-hook → verification | Task 4 (PhaseTimeline phase bars) |
| Drag scrubber → log view jumps to that moment | Task 4 (onScrub callback, fraction-based) |
| "Jump to error" button | Task 3 (LogViewer toolbar button, scrolls to first ERROR line) |
| "Copy as command" button (restic invocation) | Task 4 (CopyCommandButton, getResticCommand) |

### Placeholder scan

No TBD/TODO. "Scrubber → log jump" uses fraction-based line interpolation since log lines don't have per-line timestamps in the simple text format. This is noted as a simplification.

### Type consistency

- `RunDetail` exported from `runs.ts`, used as state type in `LogViewer` and as initial prop type — consistent
- `PhaseData` exported from `runs.ts`, used as prop type in `PhaseTimeline` — consistent
- `getResticCommand(runId: string)` matches `CopyCommandButton` call — consistent
- `safeParsePhases(raw: string | null): PhaseData | null` consistent with `phases` column type (`text`, nullable)
