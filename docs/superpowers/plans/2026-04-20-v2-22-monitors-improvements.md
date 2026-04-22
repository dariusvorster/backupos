# Monitors Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add monitor groups (filterable), a unified backup-activity timeline page, and a "Promote to managed" stub on Proxmox PBS monitor detail pages.

**Architecture:** Add a `group` column to `backupMonitors` via a new migration. The list page stays a server component but gains `searchParams`-based group filtering with a copy of the repositories `GroupFilter` client component. The timeline page is a new server component at `/monitors/timeline` that queries both `backupRuns` and `monitorResults`, merges them chronologically, and renders a single list. The "Promote to managed" button is a disabled stub with a "Coming soon" note — no server action needed.

**Tech Stack:** Next.js 15 App Router (server + client components), Drizzle ORM, SQLite, CSS vars.

---

## File Map

| File | Action |
|---|---|
| `packages/db/src/schema.ts` | Modify — add `group` column to `backupMonitors` |
| `packages/db/migrations/0013_monitor_groups.sql` | Create — `ALTER TABLE` for new column |
| `apps/web/app/(dashboard)/monitors/group-filter.tsx` | Create — client chip filter (mirrors repositories version) |
| `apps/web/app/(dashboard)/monitors/page.tsx` | Modify — accept `searchParams`, derive groups, filter, render `GroupFilter`, add Group column |
| `apps/web/app/(dashboard)/monitors/timeline/page.tsx` | Create — unified chronological activity timeline |
| `apps/web/app/(dashboard)/monitors/[id]/page.tsx` | Modify — "Promote to managed" stub for `proxmox_pbs` monitors |

---

### Task 1: Add `group` column to `backupMonitors` schema + migration

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/migrations/0013_monitor_groups.sql`

- [ ] **Step 1: Read the current `backupMonitors` table definition**

```bash
grep -n "backupMonitors" /Users/dariusvorster/Projects/backupos/packages/db/src/schema.ts | head -10
```

Then read the block starting from that line to see the current column list.

- [ ] **Step 2: Add `group` column to `backupMonitors` in schema.ts**

Find the `backupMonitors` table definition. It looks like:

```typescript
export const backupMonitors = sqliteTable('backup_monitors', {
  id:           text('id').primaryKey(),
  name:         text('name').notNull(),
  type:         text('type').notNull(),
  config:       text('config').notNull(),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  status:       text('status').default('unknown'),
  createdAt:    integer('created_at',     { mode: 'timestamp' }).notNull(),
})
```

Add `group` after `type`:

```typescript
export const backupMonitors = sqliteTable('backup_monitors', {
  id:           text('id').primaryKey(),
  name:         text('name').notNull(),
  type:         text('type').notNull(),
  group:        text('group'),
  config:       text('config').notNull(),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  status:       text('status').default('unknown'),
  createdAt:    integer('created_at',     { mode: 'timestamp' }).notNull(),
})
```

- [ ] **Step 3: Create migration file**

Create `packages/db/migrations/0013_monitor_groups.sql`:

```sql
ALTER TABLE `backup_monitors` ADD `group` text;
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean (or only pre-existing errors unrelated to this change).

- [ ] **Step 5: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add packages/db/src/schema.ts packages/db/migrations/0013_monitor_groups.sql
git commit -m "feat: add group column to backup_monitors schema"
```

---

### Task 2: Monitor group filter chip bar

**Files:**
- Create: `apps/web/app/(dashboard)/monitors/group-filter.tsx`
- Modify: `apps/web/app/(dashboard)/monitors/page.tsx`

- [ ] **Step 1: Create `apps/web/app/(dashboard)/monitors/group-filter.tsx`**

This is a client component — identical in structure to the repositories `GroupFilter` but pushes to `/monitors?...`.

```typescript
'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export function GroupFilter({ groups }: { groups: string[] }) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const current      = searchParams.get('group') ?? ''

  if (groups.length === 0) return null

  const pick = (g: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (g) params.set('group', g)
    else    params.delete('group')
    router.push(`/monitors?${params.toString()}`)
  }

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px', fontSize: 12, fontWeight: 500,
    borderRadius: 9999, border: '1px solid var(--border)',
    background:   active ? 'var(--accent)'  : 'var(--surf2)',
    color:        active ? '#fff'           : 'var(--fg-mute)',
    cursor: 'pointer',
  })

  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
      <button style={chipStyle(current === '')} onClick={() => pick('')}>All</button>
      {groups.map(g => (
        <button key={g} style={chipStyle(current === g)} onClick={() => pick(g)}>
          {g}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Read `apps/web/app/(dashboard)/monitors/page.tsx`** (required before editing)

- [ ] **Step 3: Replace `apps/web/app/(dashboard)/monitors/page.tsx`**

```typescript
import type { ComponentProps } from 'react'
import Link from 'next/link'
import { Radar } from 'lucide-react'
import { getDb, backupMonitors } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { GroupFilter } from './group-filter'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function fmtDate(d: Date | null): string {
  if (!d) return 'never'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

export default async function MonitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>
}) {
  const { group } = await searchParams
  const db        = getDb()
  const allMonitors = await db.select().from(backupMonitors).all()

  const groups = [...new Set(
    allMonitors.map(m => m.group).filter((g): g is string => !!g)
  )].sort()

  const monitors = group
    ? allMonitors.filter(m => m.group === group)
    : allMonitors

  const th: React.CSSProperties = {
    padding: '10px 20px', textAlign: 'left', fontWeight: 500,
    fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>Monitors</h1>
          <Link
            href="/monitors/timeline"
            style={{ fontSize: 12, color: 'var(--fg-mute)', textDecoration: 'none' }}
          >
            View timeline →
          </Link>
        </div>
        <Button variant="primary" size="md">
          <Radar size={14} />
          Add monitor
        </Button>
      </div>

      <GroupFilter groups={groups} />

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {monitors.length === 0 ? (
          <EmptyState
            type="page"
            icon={<Radar size={48} />}
            headline="No monitors yet"
            description="Connect Proxmox PBS, BorgBackup, Duplicati, or Veeam to see their backup status alongside your native jobs."
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border2)' }}>
                <th style={th}>Name</th>
                <th style={th}>Type</th>
                <th style={th}>Group</th>
                <th style={th}>Status</th>
                <th style={th}>Last sync</th>
              </tr>
            </thead>
            <tbody>
              {monitors.map(monitor => (
                <tr key={monitor.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px' }}>
                    <Link href={`/monitors/${monitor.id}`} style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', textDecoration: 'none' }}>
                      {monitor.name}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {monitor.type}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-dim)' }}>
                    {monitor.group ?? <span style={{ fontStyle: 'italic' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <Badge status={(monitor.status ?? 'idle') as BadgeStatus} />
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {fmtDate(monitor.lastSyncedAt)}
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

- [ ] **Step 4: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add "apps/web/app/(dashboard)/monitors/group-filter.tsx" \
        "apps/web/app/(dashboard)/monitors/page.tsx"
git commit -m "feat: monitor group filter chips on monitors list"
```

---

### Task 3: Unified backup-activity timeline page

**Files:**
- Create: `apps/web/app/(dashboard)/monitors/timeline/page.tsx`

The timeline merges the last 100 `backupRuns` (native jobs) and the last 100 `monitorResults` (third-party monitors), sorts them chronologically descending, and renders a single list. No new DB columns needed.

- [ ] **Step 1: Read the `backupRuns` columns available**

```bash
grep -n "backupRuns\|export const backupRuns" /Users/dariusvorster/Projects/backupos/packages/db/src/schema.ts | head -5
```

Then read the table block to confirm available columns: `id`, `jobId`, `status`, `startedAt`, `duration`, `dataAdded`.

Also read `monitorResults` block to confirm: `id`, `monitorId`, `status`, `lastBackupAt`, `sizeBytes`, `checkedAt`.

- [ ] **Step 2: Check what `backupJobs` columns are needed for the join**

We need `name` from `backupJobs` to label native runs. Confirm `backupJobs` exports `name` and `id`.

```bash
grep -n "backupJobs\b" /Users/dariusvorster/Projects/backupos/packages/db/src/schema.ts | head -5
```

- [ ] **Step 3: Create `apps/web/app/(dashboard)/monitors/timeline/page.tsx`**

```typescript
import Link from 'next/link'
import { getDb, backupRuns, backupJobs, backupMonitors, monitorResults, desc } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import type { ComponentProps } from 'react'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

function fmtBytes(b: number | null | undefined): string {
  if (b == null) return '—'
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

function fmtDuration(s: number | null | undefined): string {
  if (s == null) return '—'
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

type TimelineEntry =
  | { kind: 'run';    ts: Date; id: string; jobId: string | null; jobName: string; status: string; duration: number | null; dataAdded: number | null }
  | { kind: 'result'; ts: Date; id: string; monitorId: string; monitorName: string; status: string; sizeBytes: number | null }

export default async function TimelinePage() {
  const db = getDb()

  const [runs, jobs, results, monitors] = await Promise.all([
    db.select().from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(100).all(),
    db.select({ id: backupJobs.id, name: backupJobs.name }).from(backupJobs).all(),
    db.select().from(monitorResults).orderBy(desc(monitorResults.checkedAt)).limit(100).all(),
    db.select({ id: backupMonitors.id, name: backupMonitors.name }).from(backupMonitors).all(),
  ])

  const jobMap     = new Map(jobs.map(j => [j.id, j.name]))
  const monitorMap = new Map(monitors.map(m => [m.id, m.name]))

  const entries: TimelineEntry[] = [
    ...runs
      .filter(r => r.startedAt != null)
      .map(r => ({
        kind:      'run'    as const,
        ts:        r.startedAt!,
        id:        r.id,
        jobId:     r.jobId,
        jobName:   r.jobId ? (jobMap.get(r.jobId) ?? 'Unknown job') : 'Unknown job',
        status:    r.status ?? 'unknown',
        duration:  r.duration,
        dataAdded: r.dataAdded,
      })),
    ...results
      .filter(r => r.checkedAt != null)
      .map(r => ({
        kind:        'result'  as const,
        ts:          r.checkedAt!,
        id:          r.id,
        monitorId:   r.monitorId ?? '',
        monitorName: r.monitorId ? (monitorMap.get(r.monitorId) ?? 'Unknown monitor') : 'Unknown monitor',
        status:      r.status ?? 'unknown',
        sizeBytes:   r.sizeBytes,
      })),
  ].sort((a, b) => b.ts.getTime() - a.ts.getTime())

  const th: React.CSSProperties = {
    padding: '10px 20px', textAlign: 'left', fontWeight: 500,
    fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
  }
  const td: React.CSSProperties = {
    padding: '12px 20px', fontSize: 12,
    color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)',
    borderTop: '1px solid var(--border)',
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/monitors" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Monitors</Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>Activity timeline</h1>
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginTop: 4 }}>
          All backup activity — native jobs and monitored systems — in one view.
        </p>
      </div>

      {entries.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 48, textAlign: 'center',
          color: 'var(--fg-mute)', fontSize: 13,
        }}>
          No backup activity yet.
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border2)' }}>
                <th style={th}>Time</th>
                <th style={th}>Source</th>
                <th style={th}>Name</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Size / duration</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={`${e.kind}-${e.id}`}>
                  <td style={td}>{fmtDate(e.ts)}</td>
                  <td style={{ ...td, color: e.kind === 'run' ? 'var(--accent)' : 'var(--fg-dim)' }}>
                    {e.kind === 'run' ? 'job' : 'monitor'}
                  </td>
                  <td style={{ ...td, color: 'var(--fg)', fontFamily: 'inherit', fontWeight: 500 }}>
                    {e.kind === 'run' ? (
                      <Link href={`/jobs/${e.jobId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {e.jobName}
                      </Link>
                    ) : (
                      <Link href={`/monitors/${e.monitorId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {e.monitorName}
                      </Link>
                    )}
                  </td>
                  <td style={{ ...td, fontFamily: 'inherit' }}>
                    <Badge status={e.status as BadgeStatus} />
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {e.kind === 'run'
                      ? fmtDuration(e.duration)
                      : fmtBytes(e.sizeBytes)
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add "apps/web/app/(dashboard)/monitors/timeline/page.tsx"
git commit -m "feat: unified backup activity timeline at /monitors/timeline"
```

---

### Task 4: "Promote to managed" stub on PBS monitor detail page

**Files:**
- Modify: `apps/web/app/(dashboard)/monitors/[id]/page.tsx`

For `proxmox_pbs` monitors, show a "Promote to managed" card below the stat cards. The button is disabled with a "Coming soon" tooltip — no server action. The card explains what promotion means.

- [ ] **Step 1: Read `apps/web/app/(dashboard)/monitors/[id]/page.tsx`** (required before editing)

- [ ] **Step 2: Add the "Promote to managed" card**

After the stat-card grid (before the sync history table), add this block inside the return JSX:

```typescript
      {monitor.type === 'proxmox_pbs' && (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '18px 20px', marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>
              Promote to managed repository
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
              Import this PBS datastore as a native Restic repository so BackupOS can schedule and verify backups directly.
            </div>
          </div>
          <button
            disabled
            title="Coming soon"
            style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'var(--surf2)', color: 'var(--fg-dim)', cursor: 'not-allowed',
              opacity: 0.6,
            }}
          >
            Promote →
          </button>
        </div>
      )}
```

Place this immediately after the closing `</div>` of the stat-card grid (the `{latest && (...)}` block) and before the sync history card.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add "apps/web/app/(dashboard)/monitors/[id]/page.tsx"
git commit -m "feat: promote-to-managed stub on Proxmox PBS monitor detail"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Unified timeline — all backup activity chronologically | Task 3 (`/monitors/timeline`) |
| Monitor groups — `group` column | Task 1 (schema + migration) |
| Monitor groups — filter chips on list | Task 2 (`GroupFilter` + list page) |
| Monitor groups — Group column in table | Task 2 (list page) |
| "Promote to managed" stub for PBS monitors | Task 4 (detail page) |
| "View timeline" link from monitors list | Task 2 (header link) |

### Placeholder scan

No TBDs, TODOs, or stubs without code. The "Promote to managed" button is intentionally disabled — spec says stub only, so `disabled` + tooltip is the correct implementation.

### Type consistency

- `TimelineEntry` discriminated union uses `kind: 'run' | 'result'` — consistent with rendering logic.
- `monitorId` on `TimelineEntry` result arm is `string` (not `string | null`) because we filter to `r.monitorId != null` before mapping — wait, we use `r.monitorId ?? ''`, which is fine and safe.
- `GroupFilter` receives `groups: string[]` in both monitors and repositories — consistent interface.
- `backupMonitors.group` is `text('group')` (nullable) — `filter((g): g is string => !!g)` type-narrows correctly.
- `monitor.group` in list page — `{monitor.group ?? <span style={{ fontStyle: 'italic' }}>—</span>}` handles null correctly.
