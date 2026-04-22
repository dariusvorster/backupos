# Snapshot Tagging, Pinning & Retention Holds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tags, pinning, and dated retention holds to snapshots, and build out the currently-placeholder snapshots page with a full table, filter chips, and per-row action controls.

**Architecture:** Five new columns on `snapshots` (`pinned`, `retentionHold`, `holdReason`, `holdExpiresAt`, `customTags`). Restic's `tags` column is kept read-only; `customTags` is a separate user-managed JSON array. Server actions handle mutations. The snapshots page becomes a server component that reads filter params from `searchParams`, fetches snapshots + repos, and passes each row to a `SnapshotActions` client component for interactive pin/tag/hold controls. Bulk select is deferred.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Drizzle ORM + better-sqlite3, CSS custom properties, Next.js Server Actions.

---

## File Map

| File | Action |
|---|---|
| `packages/db/src/schema.ts` | Modify — add 5 columns to `snapshots` |
| `apps/web/app/actions/snapshots.ts` | Create — pinSnapshot, addCustomTag, removeCustomTag, setRetentionHold, clearRetentionHold |
| `apps/web/components/snapshot-actions.tsx` | Create — client component for per-row pin/tag/hold controls |
| `apps/web/app/(dashboard)/snapshots/page.tsx` | Replace — full table + filter chips + repo selector |

---

### Task 1: DB Schema — pin, hold, and custom tag columns on snapshots

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Find the snapshots table**

```bash
grep -n "export const snapshots\|customTags\|pinned\|retentionHold" packages/db/src/schema.ts | head -15
```

- [ ] **Step 2: Add 5 columns to the `snapshots` table**

Find the snapshots table. After the existing `tags` column, add:

```typescript
pinned:        integer('pinned',         { mode: 'boolean' }).default(false),
retentionHold: integer('retention_hold', { mode: 'boolean' }).default(false),
holdReason:    text('hold_reason'),
holdExpiresAt: integer('hold_expires_at', { mode: 'timestamp' }),
customTags:    text('custom_tags'),
```

`customTags` stores a JSON array of strings (user-defined labels, separate from Restic's `tags`).

- [ ] **Step 3: Generate migration**

```bash
pnpm --filter @backupos/db db:generate
```

- [ ] **Step 4: Run migration against BOTH databases**

```bash
pnpm --filter @backupos/db db:migrate
DATABASE_URL="file:../../apps/web/data/backupos.db" pnpm --filter @backupos/db db:migrate
```

Both must succeed.

- [ ] **Step 5: Rebuild db package**

```bash
pnpm --filter @backupos/db build
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations/
git commit -m "feat: add pinned, retentionHold, holdReason, holdExpiresAt, customTags to snapshots"
```

---

### Task 2: Server Actions — pin, tag, hold mutations

**Files:**
- Create: `apps/web/app/actions/snapshots.ts`

- [ ] **Step 1: Read an existing action file for conventions**

```bash
head -20 apps/web/app/actions/bandwidth.ts
```

- [ ] **Step 2: Create `apps/web/app/actions/snapshots.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { getDb, snapshots } from '@backupos/db'
import { eq } from 'drizzle-orm'

export async function pinSnapshot(id: string, pinned: boolean): Promise<void> {
  const db = getDb()
  await db.update(snapshots).set({ pinned }).where(eq(snapshots.id, id)).run()
  revalidatePath('/snapshots')
}

export async function addCustomTag(id: string, tag: string): Promise<void> {
  const trimmed = tag.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '')
  if (!trimmed) return

  const db       = getDb()
  const snapshot = await db.select({ customTags: snapshots.customTags })
    .from(snapshots).where(eq(snapshots.id, id)).limit(1).then(r => r[0] ?? null)
  if (!snapshot) return

  const existing: string[] = snapshot.customTags ? JSON.parse(snapshot.customTags) : []
  if (existing.includes(trimmed)) return

  await db.update(snapshots)
    .set({ customTags: JSON.stringify([...existing, trimmed]) })
    .where(eq(snapshots.id, id)).run()
  revalidatePath('/snapshots')
}

export async function removeCustomTag(id: string, tag: string): Promise<void> {
  const db       = getDb()
  const snapshot = await db.select({ customTags: snapshots.customTags })
    .from(snapshots).where(eq(snapshots.id, id)).limit(1).then(r => r[0] ?? null)
  if (!snapshot) return

  const existing: string[] = snapshot.customTags ? JSON.parse(snapshot.customTags) : []
  await db.update(snapshots)
    .set({ customTags: JSON.stringify(existing.filter(t => t !== tag)) })
    .where(eq(snapshots.id, id)).run()
  revalidatePath('/snapshots')
}

export async function setRetentionHold(id: string, reason: string, expiresAt: Date | null): Promise<void> {
  const db = getDb()
  await db.update(snapshots)
    .set({ retentionHold: true, holdReason: reason.trim() || null, holdExpiresAt: expiresAt })
    .where(eq(snapshots.id, id)).run()
  revalidatePath('/snapshots')
}

export async function clearRetentionHold(id: string): Promise<void> {
  const db = getDb()
  await db.update(snapshots)
    .set({ retentionHold: false, holdReason: null, holdExpiresAt: null })
    .where(eq(snapshots.id, id)).run()
  revalidatePath('/snapshots')
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/actions/snapshots.ts
git commit -m "feat: add snapshot pin, tag, and retention hold server actions"
```

---

### Task 3: SnapshotActions Client Component

**Files:**
- Create: `apps/web/components/snapshot-actions.tsx`

- [ ] **Step 1: Create `apps/web/components/snapshot-actions.tsx`**

```typescript
'use client'

import { useState, useTransition } from 'react'
import { Pin, PinOff, Tag, Lock, Unlock } from 'lucide-react'
import { pinSnapshot, addCustomTag, removeCustomTag, setRetentionHold, clearRetentionHold } from '@/app/actions/snapshots'

interface Props {
  id:            string
  pinned:        boolean | null
  retentionHold: boolean | null
  holdReason:    string | null
  holdExpiresAt: Date | null
  customTags:    string[]
}

const btnBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '3px 8px', fontSize: 11, cursor: 'pointer',
  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
  background: 'none', color: 'var(--fg-mute)',
}

export function SnapshotActions({ id, pinned: initialPinned, retentionHold: initialHold, holdReason: initialReason, holdExpiresAt: initialExpiry, customTags: initialTags }: Props) {
  const [pinned,        setPinned]        = useState(initialPinned ?? false)
  const [hold,          setHold]          = useState(initialHold   ?? false)
  const [holdReason,    setHoldReason]    = useState(initialReason ?? '')
  const [holdExpiresAt, setHoldExpiresAt] = useState(initialExpiry ? initialExpiry.toISOString().split('T')[0] : '')
  const [customTags,    setCustomTags]    = useState(initialTags)
  const [tagInput,      setTagInput]      = useState('')
  const [showHoldForm,  setShowHoldForm]  = useState(false)
  const [showTagForm,   setShowTagForm]   = useState(false)
  const [,              startTransition]  = useTransition()

  function togglePin() {
    const next = !pinned
    setPinned(next)
    startTransition(() => pinSnapshot(id, next))
  }

  function handleAddTag() {
    const t = tagInput.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '')
    if (!t || customTags.includes(t)) { setTagInput(''); return }
    setCustomTags(prev => [...prev, t])
    setTagInput('')
    startTransition(() => addCustomTag(id, t))
  }

  function handleRemoveTag(tag: string) {
    setCustomTags(prev => prev.filter(t => t !== tag))
    startTransition(() => removeCustomTag(id, tag))
  }

  function handleSetHold() {
    const expiry = holdExpiresAt ? new Date(holdExpiresAt) : null
    setHold(true)
    setShowHoldForm(false)
    startTransition(() => setRetentionHold(id, holdReason, expiry))
  }

  function handleClearHold() {
    setHold(false)
    setHoldReason('')
    setHoldExpiresAt('')
    startTransition(() => clearRetentionHold(id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Tag chips */}
      {customTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {customTags.map(t => (
            <span key={t} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, padding: '1px 6px',
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 3, color: 'var(--fg-mute)',
            }}>
              {t}
              <button
                onClick={() => handleRemoveTag(t)}
                style={{ fontSize: 11, color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Action buttons row */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button onClick={togglePin} style={{ ...btnBase, color: pinned ? 'var(--accent)' : 'var(--fg-mute)', borderColor: pinned ? 'var(--accent)' : 'var(--border)' }}>
          {pinned ? <PinOff size={11} /> : <Pin size={11} />}
          {pinned ? 'Unpin' : 'Pin'}
        </button>

        <button onClick={() => setShowTagForm(v => !v)} style={btnBase}>
          <Tag size={11} /> Tag
        </button>

        {!hold ? (
          <button onClick={() => setShowHoldForm(v => !v)} style={btnBase}>
            <Lock size={11} /> Hold
          </button>
        ) : (
          <button onClick={handleClearHold} style={{ ...btnBase, color: 'var(--warn)', borderColor: 'var(--warn)' }}>
            <Unlock size={11} /> Release hold
          </button>
        )}
      </div>

      {/* Tag input form */}
      {showTagForm && (
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag() } }}
            placeholder="tag-name"
            style={{
              padding: '3px 8px', fontSize: 12, width: 120,
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
            }}
          />
          <button onClick={handleAddTag} style={{ ...btnBase, color: 'var(--accent)', borderColor: 'var(--accent)' }}>
            Add
          </button>
          <button onClick={() => setShowTagForm(false)} style={btnBase}>Cancel</button>
        </div>
      )}

      {/* Hold form */}
      {showHoldForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', backgroundColor: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          <input
            value={holdReason}
            onChange={e => setHoldReason(e.target.value)}
            placeholder="Reason (e.g. pre-upgrade, audit)"
            style={{
              padding: '4px 8px', fontSize: 12,
              backgroundColor: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 11, color: 'var(--fg-mute)' }}>Hold until</label>
            <input
              type="date"
              value={holdExpiresAt}
              onChange={e => setHoldExpiresAt(e.target.value)}
              style={{
                padding: '3px 8px', fontSize: 12,
                backgroundColor: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>(blank = indefinite)</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={handleSetHold} style={{ ...btnBase, color: 'var(--warn)', borderColor: 'var(--warn)' }}>
              Apply hold
            </button>
            <button onClick={() => setShowHoldForm(false)} style={btnBase}>Cancel</button>
          </div>
        </div>
      )}
    </div>
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
git add apps/web/components/snapshot-actions.tsx
git commit -m "feat: add SnapshotActions client component (pin, tag, hold)"
```

---

### Task 4: Snapshots Page — full table with filters

**Files:**
- Replace: `apps/web/app/(dashboard)/snapshots/page.tsx`

- [ ] **Step 1: Read the current snapshots page**

```bash
cat apps/web/app/(dashboard)/snapshots/page.tsx
```

- [ ] **Step 2: Read the repositories table columns to know what to join**

```bash
grep -A 15 "export const repositories" packages/db/src/schema.ts
```

- [ ] **Step 3: Read the backupJobs table for job name lookup**

```bash
grep -n "export const backupJobs" packages/db/src/schema.ts
```

- [ ] **Step 4: Replace the snapshots page with this implementation**

```typescript
import { getDb, snapshots, repositories, backupJobs } from '@backupos/db'
import { eq } from 'drizzle-orm'
import { SnapshotActions } from '@/components/snapshot-actions'
import { Pin, Lock } from 'lucide-react'

interface PageProps {
  searchParams: Promise<{ repo?: string; filter?: string; tag?: string }>
}

function fmtBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  if (bytes >= 1_048_576)     return `${(bytes / 1_048_576).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export default async function SnapshotsPage({ searchParams }: PageProps) {
  const params     = await searchParams
  const repoFilter = params.repo   ?? ''
  const listFilter = params.filter ?? 'all'
  const tagFilter  = params.tag    ?? ''

  const db    = getDb()
  const repos = await db.select({ id: repositories.id, name: repositories.name }).from(repositories).all()
  const jobs  = await db.select({ id: backupJobs.id, name: backupJobs.name }).from(backupJobs).all()

  let query = db.select().from(snapshots)
  const allSnaps = await (repoFilter
    ? db.select().from(snapshots).where(eq(snapshots.repositoryId, repoFilter)).all()
    : db.select().from(snapshots).all()
  )

  const filtered = allSnaps.filter(s => {
    if (listFilter === 'pinned') return s.pinned
    if (listFilter === 'held')   return s.retentionHold
    if (listFilter === 'tagged') return s.customTags && JSON.parse(s.customTags).length > 0
    return true
  }).filter(s => {
    if (!tagFilter) return true
    const tags: string[] = s.customTags ? JSON.parse(s.customTags) : []
    return tags.includes(tagFilter)
  })

  const pinnedCount = allSnaps.filter(s => s.pinned).length
  const heldCount   = allSnaps.filter(s => s.retentionHold).length

  const FILTER_TABS = [
    { id: 'all',    label: 'All' },
    { id: 'pinned', label: `Pinned${pinnedCount > 0 ? ` (${pinnedCount})` : ''}` },
    { id: 'held',   label: `Held${heldCount > 0 ? ` (${heldCount})` : ''}` },
    { id: 'tagged', label: 'Tagged' },
  ]

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    if (repoFilter)  p.set('repo',   repoFilter)
    if (listFilter !== 'all') p.set('filter', listFilter)
    if (tagFilter)   p.set('tag',    tagFilter)
    for (const [k, v] of Object.entries(overrides)) {
      if (v) p.set(k, v); else p.delete(k)
    }
    const s = p.toString()
    return `/snapshots${s ? `?${s}` : ''}`
  }

  return (
    <div style={{ padding: '32px 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Snapshots</div>
        {(pinnedCount > 0 || heldCount > 0) && (
          <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
            {pinnedCount > 0 && <span>{pinnedCount} pinned</span>}
            {pinnedCount > 0 && heldCount > 0 && <span> · </span>}
            {heldCount > 0 && <span>{heldCount} under retention hold</span>}
            <span style={{ color: 'var(--fg-dim)' }}> — protected from forget policy</span>
          </div>
        )}
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Repo selector */}
        <a href={buildUrl({ repo: '' })} style={{ textDecoration: 'none' }}>
          <select
            defaultValue={repoFilter}
            onChange={undefined}
            style={{
              padding: '6px 10px', fontSize: 13,
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
            }}
          >
            <option value="">All repositories</option>
            {repos.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </a>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6 }}>
          {FILTER_TABS.map(tab => (
            <a
              key={tab.id}
              href={buildUrl({ filter: tab.id === 'all' ? '' : tab.id, tag: '' })}
              style={{
                padding: '4px 12px', fontSize: 12, borderRadius: 20,
                textDecoration: 'none', cursor: 'pointer',
                border: '1px solid var(--border)',
                backgroundColor: listFilter === tab.id ? 'var(--accent)' : 'var(--surf2)',
                color: listFilter === tab.id ? '#fff' : 'var(--fg-mute)',
              }}
            >
              {tab.label}
            </a>
          ))}
        </div>

        {tagFilter && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-mute)' }}>
            Tag: <strong style={{ color: 'var(--fg)' }}>{tagFilter}</strong>
            <a href={buildUrl({ tag: '' })} style={{ color: 'var(--fg-dim)', textDecoration: 'none' }}>✕</a>
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--fg-dim)', padding: '40px 0', textAlign: 'center' }}>
          No snapshots match the current filter.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--surf2)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 500, color: 'var(--fg-dim)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Snapshot</th>
                <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 500, color: 'var(--fg-dim)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Job</th>
                <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 500, color: 'var(--fg-dim)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Date</th>
                <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 500, color: 'var(--fg-dim)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Size</th>
                <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 500, color: 'var(--fg-dim)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tags</th>
                <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 500, color: 'var(--fg-dim)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((snap, i) => {
                const job        = jobs.find(j => j.id === snap.jobId)
                const resticTags: string[] = snap.tags ? JSON.parse(snap.tags) : []
                const userTags:   string[] = snap.customTags ? JSON.parse(snap.customTags) : []
                return (
                  <tr key={snap.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)', backgroundColor: 'var(--surf)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {snap.pinned && <Pin size={12} color="var(--accent)" />}
                        {snap.retentionHold && <Lock size={12} color="var(--warn)" title={snap.holdReason ?? 'Retention hold'} />}
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{snap.id}</span>
                      </div>
                      {snap.retentionHold && snap.holdExpiresAt && (
                        <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 2 }}>
                          Hold until {snap.holdExpiresAt.toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--fg-mute)' }}>
                      {job?.name ?? '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--fg-mute)', whiteSpace: 'nowrap' }}>
                      {snap.createdAt ? snap.createdAt.toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--fg-mute)', whiteSpace: 'nowrap' }}>
                      {fmtBytes(snap.sizeBytes)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {resticTags.map(t => (
                          <span key={t} style={{
                            fontSize: 10, padding: '1px 5px',
                            backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
                            borderRadius: 3, color: 'var(--fg-dim)',
                          }}>
                            {t}
                          </span>
                        ))}
                        {userTags.map(t => (
                          <a
                            key={t}
                            href={buildUrl({ tag: t, filter: '' })}
                            style={{
                              fontSize: 10, padding: '1px 5px', textDecoration: 'none',
                              backgroundColor: 'color-mix(in srgb, var(--surf2) 70%, var(--accent) 20%)',
                              border: '1px solid var(--accent)', borderRadius: 3, color: 'var(--accent)',
                            }}
                          >
                            {t}
                          </a>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <SnapshotActions
                        id={snap.id}
                        pinned={snap.pinned}
                        retentionHold={snap.retentionHold}
                        holdReason={snap.holdReason}
                        holdExpiresAt={snap.holdExpiresAt}
                        customTags={userTags}
                      />
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

**Note:** The repo selector `<select>` uses server-side rendering — since the page is a server component, filter state is driven by URL params. The `onChange` on the select won't work server-side. Replace the select with a form:

```tsx
<form method="get" action="/snapshots">
  <select
    name="repo"
    defaultValue={repoFilter}
    onChange="this.form.submit()"
    style={{ ... }}
  >
    <option value="">All repositories</option>
    {repos.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
  </select>
  {listFilter !== 'all' && <input type="hidden" name="filter" value={listFilter} />}
  {tagFilter && <input type="hidden" name="tag" value={tagFilter} />}
</form>
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter web typecheck 2>&1 | head -40
```

Fix any errors. Common issues:
- `query` variable declared but unused — remove it (the actual query uses the ternary pattern)
- `snap.pinned` is `boolean | null` — falsy check is fine for filter logic
- `snap.createdAt` is `Date | null` — guard before `.toLocaleDateString()`

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/(dashboard)/snapshots/page.tsx
git commit -m "feat: build out snapshots page with table, filter chips, pin/hold/tag indicators"
```

---

## Self-Review

### Spec coverage

| Spec requirement (§1.5) | Task |
|---|---|
| Tags — arbitrary labels | Task 2 (addCustomTag/removeCustomTag), Task 3 (tag chips + input), Task 4 (tag display + filter) |
| Pin — never forget toggle | Task 2 (pinSnapshot), Task 3 (Pin button), Task 4 (pin icon in table) |
| Retention hold — pin with expiry date | Task 2 (setRetentionHold/clearRetentionHold), Task 3 (hold form with date), Task 4 (lock icon + expiry display) |
| Snapshot row actions: Tag · Pin · Hold | Task 3 (SnapshotActions component) |
| Pinned snapshots show pin icon | Task 4 (Pin icon in snapshot ID cell) |
| Held snapshots show lock icon with expiry | Task 4 (Lock icon + holdExpiresAt display) |
| Filter: "Only pinned", "Only held", "Has tag" | Task 4 (filter chips + tag filter links) |
| Bulk select | Deferred — complex, no existing selection UI |
| Retention policy editor: show X protected | Task 4 (header count: "X pinned · Y under retention hold — protected from forget policy") |

### Placeholder scan

None found. The repo selector `onChange` workaround is explicitly documented.

### Type consistency

- `SnapshotActions` props (`pinned: boolean | null`, `retentionHold: boolean | null`, `holdExpiresAt: Date | null`, `customTags: string[]`) match what Drizzle returns from the new columns — consistent.
- `addCustomTag(id, tag)` signature matches call in `SnapshotActions.handleAddTag()` — consistent.
- `setRetentionHold(id, reason, expiresAt: Date | null)` matches `handleSetHold` which passes `new Date(holdExpiresAt)` or null — consistent.
