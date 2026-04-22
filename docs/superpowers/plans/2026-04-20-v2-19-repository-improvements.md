# Repository Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repository groups (tag + filter by environment), a dedup ratio bar (stored vs. raw size), and a multi-backend replication view to the repositories list and detail pages.

**Architecture:** Three new nullable columns on `repositories` (`group`, `rawSizeBytes`, `replicas` JSON). The list page gains URL-param-driven group filtering via a `GroupFilter` client component and a `DedupBar` column. The detail page gains a replication section (read + write via a server action) and the same dedup bar. No new tables needed.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, SQLite, pnpm workspaces.

---

## File Map

| File | Action |
|---|---|
| `packages/db/src/schema.ts` | Modify — add `group`, `rawSizeBytes`, `replicas` to repositories |
| `apps/web/app/(dashboard)/repositories/group-filter.tsx` | Create — client component: group chips |
| `apps/web/app/(dashboard)/repositories/dedup-bar.tsx` | Create — `DedupBar` + `fmtBytes` shared component |
| `apps/web/app/(dashboard)/repositories/page.tsx` | Modify — group filter chips, group param filtering, dedup bar column |
| `apps/web/app/actions/repositories.ts` | Create — `setReplicas` server action |
| `apps/web/app/(dashboard)/repositories/[id]/page.tsx` | Modify — dedup bar section + replication section |

---

### Task 1: DB schema — add group, rawSizeBytes, replicas columns

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Read the current schema file**

Read `/Users/dariusvorster/Projects/backupos/packages/db/src/schema.ts` to find the `repositories` table definition.

- [ ] **Step 2: Add three columns to the repositories table**

Find the closing `})` of the `repositories` table and add before it:

```typescript
  group:         text('group'),
  rawSizeBytes:  integer('raw_size_bytes'),
  replicas:      text('replicas'),
```

The full tail of the table should look like:

```typescript
  costPerGbMonth:     integer('cost_per_gb_month'),
  monthlyBudgetCents: integer('monthly_budget_cents'),
  escrowedKey:        text('escrowed_key'),
  group:              text('group'),
  rawSizeBytes:       integer('raw_size_bytes'),
  replicas:           text('replicas'),
})
```

- [ ] **Step 3: Push the schema change**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter db push
```

Expected: `Everything's fine 🐶🔥` or similar "No changes" / "Pushed" message.

- [ ] **Step 4: Verify columns exist**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter db exec sqlite3 local.db ".schema repositories" 2>/dev/null || sqlite3 apps/web/local.db ".schema repositories"
```

Expected: output includes `group`, `raw_size_bytes`, `replicas`.

- [ ] **Step 5: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter db exec tsc --noEmit 2>&1 | head -10
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add packages/db/src/schema.ts
git commit -m "feat: repositories schema — group, rawSizeBytes, replicas columns"
```

---

### Task 2: Group filter client component + list page wiring

**Files:**
- Create: `apps/web/app/(dashboard)/repositories/group-filter.tsx`
- Modify: `apps/web/app/(dashboard)/repositories/page.tsx`

- [ ] **Step 1: Create `group-filter.tsx`**

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
    router.push(`/repositories?${params.toString()}`)
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

- [ ] **Step 2: Read the current repositories list page**

Read `/Users/dariusvorster/Projects/backupos/apps/web/app/(dashboard)/repositories/page.tsx`.

- [ ] **Step 3: Rewrite the list page to add group filtering and dedup bar column**

Replace the entire file with:

```typescript
import Link                from 'next/link'
import { Database }        from 'lucide-react'
import { getDb, repositories, eq, isNotNull } from '@backupos/db'
import { GroupFilter }     from './group-filter'
import { DedupBar, fmtBytes } from './dedup-bar'

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 10)
}

const th: React.CSSProperties = {
  padding: '10px 20px', textAlign: 'left', fontWeight: 500,
  fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

export default async function RepositoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>
}) {
  const { group } = await searchParams
  const db        = getDb()

  const allRepos = await db.select().from(repositories).all()

  const groups = [...new Set(
    allRepos.map(r => r.group).filter((g): g is string => !!g)
  )].sort()

  const filtered = group
    ? allRepos.filter(r => r.group === group)
    : allRepos

  const statusLabel = (s: string | null) => {
    if (s === 'ok')     return { label: 'Healthy', color: 'var(--ok)'  }
    if (s === 'errors') return { label: 'Errors',  color: 'var(--err)' }
    return               { label: 'Unchecked',     color: 'var(--fg-dim)' }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>Repositories</h1>
        <Link
          href="/repositories/new"
          style={{
            padding: '7px 16px', fontSize: 13, fontWeight: 500,
            borderRadius: 'var(--radius-sm)', background: 'var(--accent)',
            color: '#fff', textDecoration: 'none',
          }}
        >
          Add repository
        </Link>
      </div>

      <GroupFilter groups={groups} />

      {filtered.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 48, textAlign: 'center',
          color: 'var(--fg-mute)',
        }}>
          <Database size={32} color="var(--fg-dim)" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>No repositories yet</div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>Add a Restic repository to start tracking backups.</div>
          <Link
            href="/repositories/new"
            style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 500,
              borderRadius: 'var(--radius-sm)', background: 'var(--accent)',
              color: '#fff', textDecoration: 'none',
            }}
          >
            Add repository
          </Link>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border2)' }}>
                <th style={th}>Name</th>
                <th style={th}>Backend</th>
                <th style={th}>Group</th>
                <th style={{ ...th, textAlign: 'right' }}>Size / dedup</th>
                <th style={{ ...th, textAlign: 'right' }}>Snapshots</th>
                <th style={th}>Last check</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(repo => {
                const { label, color } = statusLabel(repo.lastCheckStatus)
                return (
                  <tr key={repo.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 20px', fontSize: 13 }}>
                      <Link href={`/repositories/${repo.id}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                        {repo.name}
                      </Link>
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                      {repo.backend}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-dim)' }}>
                      {repo.group ?? <span style={{ color: 'var(--fg-dim)', fontStyle: 'italic' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                      <DedupBar stored={repo.sizeBytes ?? null} raw={repo.rawSizeBytes ?? null} />
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {repo.snapshotCount ?? '—'}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 12 }}>
                      <span style={{ color }}>{label}</span>
                      {repo.lastCheckedAt && (
                        <span style={{ color: 'var(--fg-dim)', marginLeft: 6 }}>
                          {fmtDate(repo.lastCheckedAt)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
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

Expected: errors only about missing `dedup-bar` module — that's fine, it's added in Task 3.

- [ ] **Step 5: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add "apps/web/app/(dashboard)/repositories/group-filter.tsx" \
        "apps/web/app/(dashboard)/repositories/page.tsx"
git commit -m "feat: repositories list — group filter chips + group column"
```

---

### Task 3: DedupBar component + list and detail page integration

**Files:**
- Create: `apps/web/app/(dashboard)/repositories/dedup-bar.tsx`
- Modify: `apps/web/app/(dashboard)/repositories/[id]/page.tsx`

- [ ] **Step 1: Create `dedup-bar.tsx`**

```typescript
export function fmtBytes(b: number | null): string {
  if (b == null) return '—'
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

export function DedupBar({
  stored,
  raw,
}: {
  stored: number | null
  raw:    number | null
}) {
  if (!stored) {
    return <span style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>—</span>
  }

  if (!raw || raw <= stored) {
    return (
      <span style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
        {fmtBytes(stored)}
      </span>
    )
  }

  const storedPct  = Math.round((stored / raw) * 100)
  const savingsPct = 100 - storedPct

  return (
    <div style={{ display: 'inline-block', textAlign: 'right' }}>
      <div style={{
        display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden',
        width: 80, background: 'var(--border)', marginLeft: 'auto',
      }}>
        <div
          style={{ width: `${storedPct}%`, background: 'var(--accent)' }}
          title={`Stored: ${fmtBytes(stored)}`}
        />
        <div
          style={{ width: `${savingsPct}%`, background: '#22c55e' }}
          title={`Savings: ${fmtBytes(raw - stored)}`}
        />
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
        {fmtBytes(stored)} · {savingsPct}% saved
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Read the current detail page**

Read `/Users/dariusvorster/Projects/backupos/apps/web/app/(dashboard)/repositories/[id]/page.tsx`.

- [ ] **Step 3: Add DedupBar section to the detail page**

Find the section with the cost config card (look for `costPerGbMonth`) and add a dedup card **before** it:

```typescript
      {/* Dedup ratio */}
      {repo.sizeBytes != null && (
        <div style={{
          backgroundColor: 'var(--surf)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '18px 20px',
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 12 }}>
            Storage efficiency
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <DedupBar stored={repo.sizeBytes} raw={repo.rawSizeBytes ?? null} />
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
              {repo.rawSizeBytes
                ? `${fmtBytes(repo.sizeBytes)} stored of ${fmtBytes(repo.rawSizeBytes)} original`
                : `${fmtBytes(repo.sizeBytes)} stored (no dedup data yet)`}
            </div>
          </div>
        </div>
      )}
```

Also add the import at the top of the file:
```typescript
import { DedupBar, fmtBytes } from '../dedup-bar'
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add "apps/web/app/(dashboard)/repositories/dedup-bar.tsx" \
        "apps/web/app/(dashboard)/repositories/[id]/page.tsx"
git commit -m "feat: DedupBar component + storage efficiency section on repo detail"
```

---

### Task 4: Multi-backend replication view + server action

**Files:**
- Create: `apps/web/app/actions/repositories.ts`
- Modify: `apps/web/app/(dashboard)/repositories/[id]/page.tsx`

The `replicas` column stores JSON: `Array<{ label: string; backend: string }>`. The detail page shows them read-only and provides a small form to add/remove entries.

- [ ] **Step 1: Create `apps/web/app/actions/repositories.ts`**

```typescript
'use server'

import { revalidatePath }               from 'next/cache'
import { getDb, repositories, eq }      from '@backupos/db'

export interface ReplicaEntry {
  label:   string
  backend: string
}

export async function setReplicas(repoId: string, replicas: ReplicaEntry[]): Promise<void> {
  const db = getDb()
  await db
    .update(repositories)
    .set({ replicas: JSON.stringify(replicas) })
    .where(eq(repositories.id, repoId))
  revalidatePath(`/repositories/${repoId}`)
}

export async function setRepoGroup(repoId: string, group: string | null): Promise<void> {
  const db = getDb()
  await db
    .update(repositories)
    .set({ group: group || null })
    .where(eq(repositories.id, repoId))
  revalidatePath(`/repositories/${repoId}`)
  revalidatePath('/repositories')
}
```

- [ ] **Step 2: Read the current detail page again** (it changed in Task 3)

Read `/Users/dariusvorster/Projects/backupos/apps/web/app/(dashboard)/repositories/[id]/page.tsx`.

- [ ] **Step 3: Add replication section + group editor to detail page**

Add this import at the top of the file (with the other imports):
```typescript
import { setReplicas, setRepoGroup } from '@/app/actions/repositories'
import type { ReplicaEntry }          from '@/app/actions/repositories'
```

Parse replicas from the JSON column immediately after fetching `repo`:
```typescript
  const replicas: ReplicaEntry[] = (() => {
    try { return repo.replicas ? JSON.parse(repo.replicas) : [] }
    catch { return [] }
  })()
```

Then add a **Group** card after the existing info grid (and before the bandwidth / cost sections):

```typescript
      {/* Group */}
      {(() => {
        const boundSetGroup = setRepoGroup.bind(null, repo.id)
        return (
          <div style={{
            backgroundColor: 'var(--surf)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '14px 20px',
            marginBottom: 24,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>Environment group</div>
            <form action={boundSetGroup} style={{ display: 'flex', gap: 8 }}>
              <input
                name="group"
                defaultValue={repo.group ?? ''}
                placeholder="prod / home / lab"
                style={{
                  padding: '5px 10px', fontSize: 13,
                  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none', width: 160,
                }}
              />
              <button type="submit" style={{
                padding: '5px 14px', fontSize: 13, cursor: 'pointer',
                borderRadius: 'var(--radius-sm)', border: 'none',
                background: 'var(--accent)', color: '#fff',
              }}>Save</button>
            </form>
          </div>
        )
      })()}
```

Wait — `setRepoGroup` takes `(repoId, group)` but server actions via `form action` receive a `FormData`. Rewrite `setRepoGroup` as a form-compatible action:

Instead of the above, use a wrapper:

```typescript
  const boundSetGroup = async (formData: FormData) => {
    'use server'
    const group = (formData.get('group') as string || '').trim() || null
    await setRepoGroup(repo.id, group)
  }
```

Add the **Replication** card after the group card:

```typescript
      {/* Replication */}
      {(() => {
        const boundAddReplica = async (formData: FormData) => {
          'use server'
          const label   = (formData.get('label')   as string).trim()
          const backend = (formData.get('backend') as string).trim()
          if (!label || !backend) return
          const current: ReplicaEntry[] = (() => {
            try { return repo.replicas ? JSON.parse(repo.replicas) : [] } catch { return [] }
          })()
          await setReplicas(repo.id, [...current, { label, backend }])
        }
        const removeReplica = async (idx: number) => {
          'use server'
          const current: ReplicaEntry[] = (() => {
            try { return repo.replicas ? JSON.parse(repo.replicas) : [] } catch { return [] }
          })()
          await setReplicas(repo.id, current.filter((_, i) => i !== idx))
        }
        return (
          <div style={{
            backgroundColor: 'var(--surf)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '18px 20px',
            marginBottom: 24,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 12 }}>
              Replication targets
            </div>

            {replicas.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 12 }}>
                No replication targets configured.
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                {replicas.map((r, i) => {
                  const boundRemove = removeReplica.bind(null, i)
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '6px 0', borderBottom: '1px solid var(--border)',
                    }}>
                      <span style={{ fontSize: 13, color: 'var(--fg)', flex: 1 }}>{r.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>{r.backend}</span>
                      <form action={boundRemove}>
                        <button type="submit" style={{
                          fontSize: 11, color: 'var(--err)', background: 'none',
                          border: 'none', cursor: 'pointer', padding: '2px 6px',
                        }}>Remove</button>
                      </form>
                    </div>
                  )
                })}
              </div>
            )}

            <form action={boundAddReplica} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                name="label"
                placeholder="Label (e.g. R2 offsite)"
                required
                style={{
                  flex: 1, padding: '5px 10px', fontSize: 13,
                  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
                }}
              />
              <input
                name="backend"
                placeholder="Backend (e.g. rclone:r2)"
                required
                style={{
                  flex: 1, padding: '5px 10px', fontSize: 13,
                  backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
                }}
              />
              <button type="submit" style={{
                padding: '5px 14px', fontSize: 13, cursor: 'pointer',
                borderRadius: 'var(--radius-sm)', border: 'none',
                background: 'var(--accent)', color: '#fff',
              }}>Add</button>
            </form>
          </div>
        )
      })()}
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add apps/web/app/actions/repositories.ts \
        "apps/web/app/(dashboard)/repositories/[id]/page.tsx"
git commit -m "feat: repo detail — group editor + replication targets section"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Repository groups — tag repos with environments | Task 1 (schema), Task 2 (filter chips), Task 4 (group editor on detail) |
| Filter dashboard by group | Task 2 (URL param `?group=`) |
| Multi-backend replication view — read-only + add/remove | Task 4 (replication section) |
| Dedup ratio visualisation — stacked bar on repo card | Task 3 (DedupBar on list + detail) |

### Placeholder scan

No TBDs. All code blocks complete.

### Type consistency

- `ReplicaEntry` defined in `repositories.ts` and imported into the detail page — consistent.
- `DedupBar` / `fmtBytes` exported from `dedup-bar.tsx`, imported in both `page.tsx` files — consistent.
- `group`, `rawSizeBytes`, `replicas` added to schema in Task 1, used in Tasks 2–4 — consistent.
- `setRepoGroup(repoId, group | null)` used via inline `'use server'` wrapper to bridge FormData → typed args — consistent pattern with other pages in this codebase.
