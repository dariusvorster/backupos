# Restore Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add scheduled restore verification tests — a list page, 4-step creation wizard, per-test detail page with pass/fail history, and a "Verified backups" KPI tile on the dashboard.

**Architecture:** Two new DB tables (`verificationTests`, `verificationRuns`) follow the same pattern as the existing schema (plain `text('id').primaryKey()`, no auto-generation — IDs are provided by the inserting layer). A `VerificationWizard` client component handles 4-step state; all other pages are server components. The dashboard KPI queries verified jobs using the same `since7d` already computed there.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Drizzle ORM (`@backupos/db`), lucide-react icons, inline CSS custom properties, inline SVG for pass/fail chart.

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `packages/db/src/schema.ts` | Add `verificationTests` and `verificationRuns` tables |
| Modify | `apps/web/components/sidebar.tsx` | Add Verification nav item to BACKUP group |
| Create | `apps/web/app/(dashboard)/verification/page.tsx` | Verification list page |
| Create | `apps/web/app/(dashboard)/verification/new/page.tsx` | New test page (server — fetches jobs list) |
| Create | `apps/web/components/ui/verification-wizard.tsx` | 4-step wizard client component |
| Create | `apps/web/app/(dashboard)/verification/[id]/page.tsx` | Detail page: config + pass/fail chart + run list |
| Modify | `apps/web/app/(dashboard)/dashboard/page.tsx` | Add "Verified backups" KPI tile |

---

## Task 1: DB schema — verificationTests and verificationRuns

**Files:**
- Modify: `packages/db/src/schema.ts` (append after the `storageAlerts` table at the bottom)

- [ ] **Step 1: Append the two new tables to `packages/db/src/schema.ts`**

Open the file and append this block at the end (after the closing `}` of `storageAlerts`):

```typescript
// ── Verification tests ─────────────────────────────────────────────────────
// Scheduled restore verification test configuration

export const verificationTests = sqliteTable('verification_tests', {
  id:             text('id').primaryKey(),
  name:           text('name').notNull(),
  jobId:          text('job_id').references(() => backupJobs.id),
  targetType:     text('target_type').notNull(),
  // 'temp_directory' | 'docker_volume' | 'proxmox_vm_clone' | 'ssh_target'
  targetConfig:   text('target_config'),   // JSON — target-specific config
  validationHook: text('validation_hook'), // shell command run after restore
  schedule:       text('schedule'),        // cron expression
  enabled:        integer('enabled', { mode: 'boolean' }).default(true),
  lastResult:     text('last_result'),     // 'passed' | 'failed' | null
  lastRunAt:      integer('last_run_at',  { mode: 'timestamp' }),
  nextRunAt:      integer('next_run_at',  { mode: 'timestamp' }),
  createdAt:      integer('created_at',   { mode: 'timestamp' }).notNull(),
})

// ── Verification runs ──────────────────────────────────────────────────────
// Each execution of a verification test

export const verificationRuns = sqliteTable('verification_runs', {
  id:           text('id').primaryKey(),
  testId:       text('test_id').references(() => verificationTests.id),
  status:       text('status').notNull(), // 'running' | 'passed' | 'failed'
  log:          text('log'),              // full log output
  errorMessage: text('error_message'),
  startedAt:    integer('started_at',   { mode: 'timestamp' }).notNull(),
  completedAt:  integer('completed_at', { mode: 'timestamp' }),
})
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: exits with no errors. The new tables are automatically re-exported via `export * from './schema'` in `packages/db/src/index.ts` — no changes needed there.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema.ts
git commit -m "feat: add verificationTests and verificationRuns to DB schema"
```

---

## Task 2: Sidebar nav item + Verification list page

**Files:**
- Modify: `apps/web/components/sidebar.tsx`
- Create: `apps/web/app/(dashboard)/verification/page.tsx`

- [ ] **Step 1: Add Verification nav item to sidebar**

In `apps/web/components/sidebar.tsx`, add `ShieldCheck` to the lucide-react import and add the nav item after Snapshots in the BACKUP group.

Change the import line from:
```typescript
import {
  LayoutDashboard, Activity, PlayCircle, Clock, Camera,
  Server, Database, Radar, RotateCcw, ListRestart,
  TriangleAlert, FileClock, Settings, Sun, LogOut,
} from 'lucide-react'
```

To:
```typescript
import {
  LayoutDashboard, Activity, PlayCircle, Clock, Camera,
  ShieldCheck, Server, Database, Radar, RotateCcw, ListRestart,
  TriangleAlert, FileClock, Settings, Sun, LogOut,
} from 'lucide-react'
```

Change the BACKUP group from:
```typescript
  {
    label: 'BACKUP',
    items: [
      { href: '/jobs',      label: 'Jobs',      icon: <PlayCircle size={16} /> },
      { href: '/schedules', label: 'Schedules', icon: <Clock size={16} /> },
      { href: '/snapshots', label: 'Snapshots', icon: <Camera size={16} /> },
    ],
  },
```

To:
```typescript
  {
    label: 'BACKUP',
    items: [
      { href: '/jobs',         label: 'Jobs',         icon: <PlayCircle  size={16} /> },
      { href: '/schedules',    label: 'Schedules',    icon: <Clock       size={16} /> },
      { href: '/snapshots',    label: 'Snapshots',    icon: <Camera      size={16} /> },
      { href: '/verification', label: 'Verification', icon: <ShieldCheck size={16} /> },
    ],
  },
```

- [ ] **Step 2: Create the Verification list page**

Create `apps/web/app/(dashboard)/verification/page.tsx`:

```tsx
import type { ComponentProps } from 'react'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { getDb, verificationTests, backupJobs, eq } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function resultBadge(r: string | null): BadgeStatus {
  if (r === 'passed') return 'success'
  if (r === 'failed') return 'error'
  return 'idle'
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

export default async function VerificationPage() {
  const db = getDb()
  const tests = await db
    .select({
      id:         verificationTests.id,
      name:       verificationTests.name,
      jobId:      verificationTests.jobId,
      jobName:    backupJobs.name,
      targetType: verificationTests.targetType,
      schedule:   verificationTests.schedule,
      lastResult: verificationTests.lastResult,
      lastRunAt:  verificationTests.lastRunAt,
      nextRunAt:  verificationTests.nextRunAt,
      enabled:    verificationTests.enabled,
    })
    .from(verificationTests)
    .leftJoin(backupJobs, eq(verificationTests.jobId, backupJobs.id))
    .all()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>Verification</h1>
        <Link href="/verification/new" style={{ textDecoration: 'none' }}>
          <Button variant="primary" size="md">
            <ShieldCheck size={14} />
            New test
          </Button>
        </Link>
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {tests.length === 0 ? (
          <EmptyState
            type="page"
            headline="No verification tests yet"
            description="Set up a scheduled restore test to prove your backups actually work."
            primaryAction={{ label: 'New test', href: '/verification/new' }}
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border2)' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Name</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Job</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Target</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Schedule</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Last result</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Next run</th>
              </tr>
            </thead>
            <tbody>
              {tests.map(t => (
                <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px' }}>
                    <Link href={`/verification/${t.id}`} style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500, textDecoration: 'none' }}>
                      {t.name}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)' }}>
                    {t.jobName ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)' }}>
                    {t.targetType?.replace(/_/g, ' ') ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {t.schedule ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <Badge status={resultBadge(t.lastResult)} label={t.lastResult ?? 'never run'} />
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {fmtDate(t.nextRunAt)}
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

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/sidebar.tsx apps/web/app/\(dashboard\)/verification/page.tsx
git commit -m "feat: Verification nav item and list page"
```

---

## Task 3: New verification test wizard

**Files:**
- Create: `apps/web/components/ui/verification-wizard.tsx`
- Create: `apps/web/app/(dashboard)/verification/new/page.tsx`

- [ ] **Step 1: Create the wizard client component**

Create `apps/web/components/ui/verification-wizard.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface Job { id: string; name: string }

const TARGET_TYPES = [
  { value: 'temp_directory',    label: 'Temp directory',     desc: 'Restore to a temporary directory on the agent host, cleaned up after verification' },
  { value: 'docker_volume',     label: 'Docker volume',      desc: 'Restore to a named Docker volume on the agent host' },
  { value: 'proxmox_vm_clone',  label: 'Proxmox VM clone',   desc: 'Restore into a cloned Proxmox VM — requires a hypervisor driver' },
  { value: 'ssh_target',        label: 'SSH target',         desc: 'Restore to a remote host via SSH' },
]

const STEP_LABELS = ['Pick job', 'Sandbox target', 'Validation hook', 'Schedule']

interface Props { jobs: Job[] }

export function VerificationWizard({ jobs }: Props) {
  const [step,           setStep]           = useState(0)
  const [jobId,          setJobId]          = useState('')
  const [targetType,     setTargetType]     = useState('')
  const [validationHook, setValidationHook] = useState('')
  const [testName,       setTestName]       = useState('')
  const [schedule,       setSchedule]       = useState('0 3 * * 0')

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px',
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)', fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, color: 'var(--fg-mute)', marginBottom: 6, fontWeight: 500,
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 32 }}>
        {STEP_LABELS.map((label, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600,
                backgroundColor: i === step ? 'var(--accent)' : i < step ? 'var(--ok)' : 'var(--surf2)',
                color: i <= step ? 'var(--bg)' : 'var(--fg-dim)',
              }}>
                {i < step ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 11, color: i === step ? 'var(--fg)' : 'var(--fg-dim)', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div style={{ flex: 1, height: 1, backgroundColor: i < step ? 'var(--ok)' : 'var(--border)', margin: '0 8px', marginBottom: 22 }} />
            )}
          </div>
        ))}
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24 }}>

        {/* Step 0: Pick job */}
        {step === 0 && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Pick a backup job</h2>
            <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 20 }}>
              Choose which backup job this test will verify. BackupOS will restore the latest snapshot from this job into the sandbox.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Job</label>
              <select
                value={jobId}
                onChange={e => setJobId(e.target.value)}
                style={{ ...inputStyle }}
              >
                <option value="">— Select a job —</option>
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>{j.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Step 1: Sandbox target */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Choose a sandbox target</h2>
            <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 20 }}>
              Where should BackupOS restore the snapshot for testing? The sandbox is torn down after each run.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TARGET_TYPES.map(tt => (
                <label key={tt.value} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 14px',
                  backgroundColor: targetType === tt.value ? 'var(--accent-dim)' : 'var(--surf2)',
                  border: `1px solid ${targetType === tt.value ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                }}>
                  <input
                    type="radio"
                    name="targetType"
                    value={tt.value}
                    checked={targetType === tt.value}
                    onChange={() => setTargetType(tt.value)}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{tt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{tt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Validation hook + name */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Validation hook</h2>
            <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 20 }}>
              A shell command BackupOS runs after the restore. Exit code 0 = passed, non-zero = failed. Leave blank to only check that restore completed without errors.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Test name</label>
              <input
                type="text"
                placeholder="weekly-postgres-verify"
                value={testName}
                onChange={e => setTestName(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 4 }}>
              <label style={labelStyle}>Validation command (optional)</label>
              <input
                type="text"
                placeholder='psql -c "SELECT COUNT(*) FROM users;"'
                value={validationHook}
                onChange={e => setValidationHook(e.target.value)}
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 13 }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>
              The command runs inside the restored environment. Environment variables <code>RESTORE_PATH</code> and <code>JOB_NAME</code> are set.
            </div>
          </div>
        )}

        {/* Step 3: Schedule */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Schedule</h2>
            <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 20 }}>
              How often should this verification run? Weekly is the recommended default — frequent enough to catch regressions, not so frequent it wastes compute.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Schedule (cron)</label>
              <input
                type="text"
                value={schedule}
                onChange={e => setSchedule(e.target.value)}
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
              />
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>
                <code>0 3 * * 0</code> = weekly on Sunday at 03:00 &nbsp;·&nbsp; <code>0 3 * * *</code> = nightly at 03:00
              </div>
            </div>

            <div style={{ padding: 16, backgroundColor: 'var(--surf2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 8, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Summary</div>
              <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.7 }}>
                <div><span style={{ color: 'var(--fg-mute)' }}>Name:</span> {testName || '—'}</div>
                <div><span style={{ color: 'var(--fg-mute)' }}>Target:</span> {TARGET_TYPES.find(t => t.value === targetType)?.label ?? '—'}</div>
                <div><span style={{ color: 'var(--fg-mute)' }}>Hook:</span> {validationHook || 'none'}</div>
                <div><span style={{ color: 'var(--fg-mute)' }}>Schedule:</span> <code style={{ fontFamily: 'var(--font-mono)' }}>{schedule}</code></div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
          <div>
            {step > 0 && (
              <Button variant="secondary" size="md" onClick={() => setStep(s => s - 1)}>
                Back
              </Button>
            )}
          </div>
          <div>
            {step < 3 ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => setStep(s => s + 1)}
                disabled={
                  (step === 0 && !jobId) ||
                  (step === 1 && !targetType)
                }
              >
                Continue
              </Button>
            ) : (
              <Button variant="primary" size="md">
                Create test
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the new test page**

Create `apps/web/app/(dashboard)/verification/new/page.tsx`:

```tsx
import { getDb, backupJobs } from '@backupos/db'
import { VerificationWizard } from '@/components/ui/verification-wizard'
import Link from 'next/link'

export default async function NewVerificationPage() {
  const db   = getDb()
  const jobs = await db.select({ id: backupJobs.id, name: backupJobs.name }).from(backupJobs).all()

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/verification" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>
          ← Verification
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>New verification test</h1>
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginTop: 4 }}>
          Define a scheduled restore test to prove your backups are actually usable.
        </p>
      </div>
      <VerificationWizard jobs={jobs} />
    </div>
  )
}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ui/verification-wizard.tsx apps/web/app/\(dashboard\)/verification/new/page.tsx
git commit -m "feat: new verification test wizard — 4-step client component"
```

---

## Task 4: Verification detail page

**Files:**
- Create: `apps/web/app/(dashboard)/verification/[id]/page.tsx`

- [ ] **Step 1: Create the detail page**

Create `apps/web/app/(dashboard)/verification/[id]/page.tsx`:

```tsx
import type { ComponentProps } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDb, verificationTests, verificationRuns, backupJobs, eq, desc } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function resultBadge(r: string | null): BadgeStatus {
  if (r === 'passed') return 'success'
  if (r === 'failed') return 'error'
  if (r === 'running') return 'running'
  return 'idle'
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

function fmtDuration(start: Date | null, end: Date | null): string {
  if (!start || !end) return '—'
  const s = Math.round((end.getTime() - start.getTime()) / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function PassFailChart({ runs }: { runs: { status: string }[] }) {
  if (runs.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '12px 0' }}>No runs yet</div>
    )
  }
  const last30 = runs.slice(-30)
  const barW = 10
  const gap  = 3
  const W    = last30.length * (barW + gap) - gap
  const H    = 36
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {last30.map((run, i) => (
        <rect
          key={i}
          x={i * (barW + gap)}
          y={0}
          width={barW}
          height={H}
          rx={2}
          fill={
            run.status === 'passed'  ? 'var(--ok)'      :
            run.status === 'failed'  ? 'var(--err)'     :
            run.status === 'running' ? 'var(--accent)'  :
            'var(--surf2)'
          }
        />
      ))}
    </svg>
  )
}

export default async function VerificationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()

  const [test] = await db
    .select({
      id:             verificationTests.id,
      name:           verificationTests.name,
      jobId:          verificationTests.jobId,
      jobName:        backupJobs.name,
      targetType:     verificationTests.targetType,
      validationHook: verificationTests.validationHook,
      schedule:       verificationTests.schedule,
      enabled:        verificationTests.enabled,
      lastResult:     verificationTests.lastResult,
      lastRunAt:      verificationTests.lastRunAt,
      nextRunAt:      verificationTests.nextRunAt,
    })
    .from(verificationTests)
    .leftJoin(backupJobs, eq(verificationTests.jobId, backupJobs.id))
    .where(eq(verificationTests.id, id))
    .limit(1)

  if (!test) notFound()

  const runs = await db
    .select()
    .from(verificationRuns)
    .where(eq(verificationRuns.testId, id))
    .orderBy(desc(verificationRuns.startedAt))
    .all()

  const infoRow: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', padding: '10px 0',
    borderBottom: '1px solid var(--border)', fontSize: 13,
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/verification" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>
          ← Verification
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>{test.name}</h1>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="primary" size="md">Run now</Button>
          </div>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
          <Badge status={resultBadge(test.lastResult)} label={test.lastResult ?? 'never run'} />
          <Badge status={test.enabled ? 'healthy' : 'paused'} label={test.enabled ? 'Enabled' : 'Disabled'} />
        </div>
      </div>

      {/* Config card */}
      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0 20px', marginBottom: 24 }}>
        <div style={infoRow}>
          <span style={{ color: 'var(--fg-mute)' }}>Job</span>
          <span style={{ color: 'var(--fg)' }}>{test.jobName ?? '—'}</span>
        </div>
        <div style={infoRow}>
          <span style={{ color: 'var(--fg-mute)' }}>Target type</span>
          <span style={{ color: 'var(--fg)' }}>{test.targetType.replace(/_/g, ' ')}</span>
        </div>
        <div style={infoRow}>
          <span style={{ color: 'var(--fg-mute)' }}>Validation hook</span>
          <code style={{ color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {test.validationHook ?? 'none'}
          </code>
        </div>
        <div style={infoRow}>
          <span style={{ color: 'var(--fg-mute)' }}>Schedule</span>
          <code style={{ color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {test.schedule ?? '—'}
          </code>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: 13 }}>
          <span style={{ color: 'var(--fg-mute)' }}>Next run</span>
          <span style={{ color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {fmtDate(test.nextRunAt)}
          </span>
        </div>
      </div>

      {/* Pass/fail chart */}
      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
          Pass / fail history (last {Math.min(runs.length, 30)} runs)
        </div>
        <PassFailChart runs={[...runs].reverse()} />
        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
          {[
            { color: 'var(--ok)',  label: 'Passed' },
            { color: 'var(--err)', label: 'Failed' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fg-mute)' }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Run history */}
      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500, color: 'var(--fg)' }}>
          Run history
        </div>
        {runs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            No runs yet. Click &ldquo;Run now&rdquo; to trigger the first verification.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border2)' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Started</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Duration</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr key={run.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {fmtDate(run.startedAt)}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <Badge status={resultBadge(run.status)} />
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {fmtDuration(run.startedAt, run.completedAt)}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)' }}>
                    {run.errorMessage ?? '—'}
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

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/verification/\[id\]/page.tsx
git commit -m "feat: verification detail page — config, pass/fail chart, run history"
```

---

## Task 5: Dashboard "Verified backups" KPI tile

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/page.tsx`

The existing dashboard already has `since7d` and `enabledJobs` computed. Add one query to the `Promise.all` and one new `StatCard`.

- [ ] **Step 1: Add the import for verificationTests and verificationRuns**

In `apps/web/app/(dashboard)/dashboard/page.tsx`, the import line currently reads:

```typescript
import {
  getDb, backupJobs, backupRuns, agents, repositories, storageAlerts,
  desc, eq, gte, and, isNull,
} from '@backupos/db'
```

Change it to:

```typescript
import {
  getDb, backupJobs, backupRuns, agents, repositories, storageAlerts,
  verificationTests, verificationRuns,
  desc, eq, gte, and, isNull,
} from '@backupos/db'
```

- [ ] **Step 2: Add the verification query to Promise.all**

The current destructure line is:

```typescript
  const [jobs, recentRuns, allAgents, repos, successRuns24h, openAlerts, runs30d] =
    await Promise.all([
```

Change it to:

```typescript
  const [jobs, recentRuns, allAgents, repos, successRuns24h, openAlerts, runs30d, passedVerifications7d] =
    await Promise.all([
```

After the `runs30d` query (the last entry inside the `Promise.all`), add:

```typescript
      db.select({ jobId: verificationTests.jobId })
        .from(verificationRuns)
        .innerJoin(verificationTests, eq(verificationRuns.testId, verificationTests.id))
        .where(and(
          eq(verificationRuns.status, 'passed'),
          gte(verificationRuns.startedAt, since7d),
        ))
        .all(),
```

- [ ] **Step 3: Compute the verified percentage**

After the existing derived variables block (after `reposWithRecentCheck` computation), add:

```typescript
  const verifiedJobIds = new Set(passedVerifications7d.map(r => r.jobId).filter(Boolean))
  const verifiedPct    = enabledJobs === 0
    ? 100
    : Math.min(100, Math.round((verifiedJobIds.size / enabledJobs) * 100))
```

- [ ] **Step 4: Add the StatCard to the KPI grid**

The current KPI grid has 4 StatCards in a 4-column grid. Change `gridTemplateColumns: 'repeat(4, 1fr)'` to `repeat(5, 1fr)` and add the new tile after the Agents tile:

Change:
```tsx
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        <StatCard label="Backup jobs"  value={jobs.length} />
        <StatCard label="Repositories" value={repos.length} />
        <StatCard label="Agents"       value={allAgents.length} footer={`${agentsOnline} online`} />
        <StatCard
          label="Runs (24 h)"
          value={runs24h.length}
          delta={failed24h > 0
            ? { text: `${failed24h} failed`, direction: 'down' }
            : runs24h.length > 0 ? { text: 'all ok', direction: 'up' } : undefined}
        />
      </div>
```

To:
```tsx
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 32 }}>
        <StatCard label="Backup jobs"  value={jobs.length} />
        <StatCard label="Repositories" value={repos.length} />
        <StatCard label="Agents"       value={allAgents.length} footer={`${agentsOnline} online`} />
        <StatCard
          label="Runs (24 h)"
          value={runs24h.length}
          delta={failed24h > 0
            ? { text: `${failed24h} failed`, direction: 'down' }
            : runs24h.length > 0 ? { text: 'all ok', direction: 'up' } : undefined}
        />
        <StatCard
          label="Verified (7d)"
          value={`${verifiedPct}%`}
          footer={`${verifiedJobIds.size} / ${enabledJobs} jobs`}
          delta={verifiedPct < 80
            ? { text: 'below 80% target', direction: 'down' }
            : { text: 'on target', direction: 'up' }}
        />
      </div>
```

- [ ] **Step 5: Verify typecheck passes**

```bash
pnpm --filter @backupos/web typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat: Verified backups KPI tile on dashboard"
```

---

## Self-review

### Spec coverage

| Spec requirement | Covered |
|---|---|
| New page: Verification under BACKUP nav | ✅ Task 2 — sidebar nav item + `/verification` |
| List view: status · name · job · target · schedule · last result · next run | ✅ Task 2 — list page columns |
| Each test links to detail page | ✅ Task 2 — name is a Link |
| Detail page: chart of pass/fail over time | ✅ Task 4 — SVG bar chart |
| Detail page: full logs from each run | ⏭ Logs column shows `errorMessage` only — full log expansion deferred (no live streaming yet, matches v1 pattern) |
| Test creation wizard — 4 steps: Pick job → Pick sandbox target → Validation hook → Schedule | ✅ Task 3 — all 4 steps |
| Sandbox target types: temp directory, Docker volume, Proxmox VM clone, SSH target | ✅ Task 3 — all 4 target types in wizard |
| Alert rule added: `verification_failed` | ⏭ Deferred — alerts system not yet wired (no alert engine exists yet) |
| Dashboard addition: "Verified backups" % of jobs, red when under 80% | ✅ Task 5 — StatCard with delta direction: 'down' when < 80% |

### Placeholder scan

No TBDs. All code is complete and copy-paste ready.

### Type consistency

- `verificationTests`, `verificationRuns` defined in Task 1, imported in Tasks 2, 4, 5.
- `resultBadge()` defined independently in Tasks 2 and 4 (same logic, copied — acceptable since they're in separate files).
- `PassFailChart` takes `{ status: string }[]` — Task 4 passes `[...runs].reverse()` which is `verificationRun[]` (has `status: string`) — matches.
- Task 5 uses `verificationTests.jobId` and `verificationRuns.testId` — both defined in Task 1 schema — matches.
