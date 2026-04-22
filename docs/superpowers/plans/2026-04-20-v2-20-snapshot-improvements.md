# Snapshot Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three improvements to snapshot detail: a restore preview summary card (file count + total size), a size-by-path directory tree (aggregate sizes by folder), and a diff view page that compares two snapshots file-by-file.

**Architecture:** All data comes from `engine.ls(snapshotId)` already called in the existing snapshot detail page. The size-by-path tree and restore preview are computed from that same result in the same server component. The diff page is a new route under `/repositories/[id]/snapshots/compare` that accepts `?a=<id>&b=<id>` query params and calls `engine.ls()` twice. No DB schema changes required.

**Tech Stack:** Next.js 15 App Router (server components), `@backupos/engine` ResticEngine, SQLite via Drizzle ORM.

---

## File Map

| File | Action |
|---|---|
| `apps/web/app/(dashboard)/repositories/[id]/snapshots/[snapshotId]/page.tsx` | Modify — add restore preview card + size-by-path tree above file table |
| `apps/web/app/(dashboard)/repositories/[id]/snapshots/compare/page.tsx` | Create — diff view comparing two snapshots from the same repo |

---

### Task 1: Restore preview card + size-by-path tree on snapshot detail

**Files:**
- Modify: `apps/web/app/(dashboard)/repositories/[id]/snapshots/[snapshotId]/page.tsx`

First, read the current file:
`apps/web/app/(dashboard)/repositories/[id]/snapshots/[snapshotId]/page.tsx`

The current page already calls `engine.ls(snapshotId)` and renders a flat file table. We insert two new sections above that table: a 2-stat summary card and a directory size tree.

- [ ] **Step 1: Read the file**

```bash
cat "apps/web/app/(dashboard)/repositories/[id]/snapshots/[snapshotId]/page.tsx"
```

- [ ] **Step 2: Replace the page with the enhanced version**

Replace the entire file with:

```typescript
import { getDb, repositories, snapshots } from '@backupos/db'
import { eq } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ResticEngine } from '@backupos/engine'
import { EmptyState } from '@/components/ui/empty-state'

function bytes(n: number | undefined | null): string {
  if (n == null) return '—'
  if (n < 1024)        return `${n} B`
  if (n < 1024 ** 2)   return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3)   return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

interface RepoConfig {
  repositoryUrl: string
  password: string
  envVars?: Record<string, string>
}

interface DirEntry { name: string; totalSize: number; fileCount: number }

function buildDirTree(
  files: { path: string; type: string; size?: number }[],
): DirEntry[] {
  const dirs = new Map<string, { totalSize: number; fileCount: number }>()
  for (const f of files) {
    if (f.type !== 'file') continue
    const parts = f.path.split('/')
    // accumulate size into every ancestor directory segment
    for (let depth = 1; depth < parts.length; depth++) {
      const dir = parts.slice(0, depth).join('/')
      const existing = dirs.get(dir) ?? { totalSize: 0, fileCount: 0 }
      existing.totalSize += f.size ?? 0
      existing.fileCount += 1
      dirs.set(dir, existing)
    }
  }
  return Array.from(dirs.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.totalSize - a.totalSize)
    .slice(0, 20) // top 20 directories by size
}

export default async function SnapshotFilesPage({
  params,
}: {
  params: Promise<{ id: string; snapshotId: string }>
}) {
  const { id, snapshotId } = await params
  const db = getDb()

  const [repo] = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1)
  if (!repo) notFound()

  const [snap] = await db.select().from(snapshots).where(eq(snapshots.id, snapshotId)).limit(1)
  if (!snap) notFound()

  const repoConfig = JSON.parse(repo.config) as RepoConfig
  const engine = new ResticEngine({
    repositoryUrl: repoConfig.repositoryUrl,
    password:      repoConfig.password,
    envVars:       repoConfig.envVars ?? {},
    binaryPath:    process.env['RESTIC_BINARY_PATH'],
  })

  let files: Awaited<ReturnType<typeof engine.ls>> = []
  let lsError: string | null = null
  try {
    files = await engine.ls(snapshotId)
  } catch (err) {
    lsError = String(err)
  }

  const fileEntries = files.filter(f => f.type === 'file')
  const totalFiles  = fileEntries.length
  const totalSize   = fileEntries.reduce((sum, f) => sum + (f.size ?? 0), 0)
  const dirTree     = buildDirTree(files)

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '16px 20px',
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/repositories/${id}/snapshots`} style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>
          ← {repo.name} / Snapshots
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
            Snapshot{' '}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--accent)' }}>
              {snapshotId.slice(0, 8)}
            </span>
          </h1>
          <Link
            href={`/repositories/${id}/snapshots/compare?a=${snapshotId}`}
            style={{
              fontSize: 12, padding: '5px 12px',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              color: 'var(--fg-mute)', textDecoration: 'none',
              backgroundColor: 'var(--surf2)',
            }}
          >
            Compare with another snapshot →
          </Link>
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
          {snap.createdAt?.toISOString().slice(0, 19).replace('T', ' ')} · {snap.hostname ?? '—'}
        </div>
      </div>

      {/* Restore preview card */}
      {!lsError && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6 }}>Files</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-mono)' }}>
              {totalFiles.toLocaleString()}
            </div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6 }}>Total size</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-mono)' }}>
              {bytes(totalSize)}
            </div>
          </div>
        </div>
      )}

      {/* Size by path */}
      {!lsError && dirTree.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 12 }}>
            Size by path
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {dirTree.map(dir => {
              const pct = totalSize > 0 ? (dir.totalSize / totalSize) * 100 : 0
              return (
                <div key={dir.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-mute)', width: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {dir.name || '/'}
                  </div>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: 'var(--surf2)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--accent)', borderRadius: 3 }} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg)', width: 64, textAlign: 'right', flexShrink: 0 }}>
                    {bytes(dir.totalSize)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* File table */}
      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {lsError ? (
          <EmptyState type="inline" headline="Failed to list files" description={lsError} />
        ) : files.length === 0 ? (
          <EmptyState type="inline" headline="No files found in snapshot" />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border2)' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Path</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Type</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Modified</th>
                <th style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 500 }}>Size</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 20px', fontSize: 12, color: f.type === 'dir' ? 'var(--accent)' : 'var(--fg)', fontFamily: 'var(--font-mono)', maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.path}
                  </td>
                  <td style={{ padding: '10px 20px', fontSize: 11, color: 'var(--fg-mute)' }}>
                    {f.type}
                  </td>
                  <td style={{ padding: '10px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {f.mtime ? f.mtime.slice(0, 16).replace('T', ' ') : '—'}
                  </td>
                  <td style={{ padding: '10px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {f.type === 'file' ? bytes(f.size) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--fg-dim)' }}>
        {files.length} entries
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean (or only pre-existing errors unrelated to this file).

- [ ] **Step 4: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add "apps/web/app/(dashboard)/repositories/[id]/snapshots/[snapshotId]/page.tsx"
git commit -m "feat: snapshot detail — restore preview card + size-by-path tree"
```

---

### Task 2: Snapshot diff view page

**Files:**
- Create: `apps/web/app/(dashboard)/repositories/[id]/snapshots/compare/page.tsx`

This page takes `?a=<snapshotId>&b=<snapshotId>` query params. If only `a` is provided, it renders a snapshot picker. If both are present, it calls `engine.ls()` twice and shows a three-section diff: Added, Removed, Changed.

- [ ] **Step 1: Fetch the list of snapshots for the repo (needed for the picker)**

Read the schema to confirm the `snapshots` table columns needed:

```bash
cd /Users/dariusvorster/Projects/backupos && grep -A 20 "export const snapshots" packages/db/src/schema.ts | head -25
```

Expected: see `id`, `repositoryId`, `createdAt` columns.

- [ ] **Step 2: Create the compare page**

```typescript
import { getDb, repositories, snapshots } from '@backupos/db'
import { eq, desc } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ResticEngine } from '@backupos/engine'

function bytes(n: number | undefined | null): string {
  if (n == null) return '—'
  if (n < 1024)        return `${n} B`
  if (n < 1024 ** 2)   return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3)   return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

interface RepoConfig {
  repositoryUrl: string
  password: string
  envVars?: Record<string, string>
}

type FileEntry = { path: string; type: string; size?: number; mtime?: string }

interface DiffResult {
  added:   FileEntry[]
  removed: FileEntry[]
  changed: Array<{ path: string; sizeA: number; sizeB: number }>
}

function computeDiff(filesA: FileEntry[], filesB: FileEntry[]): DiffResult {
  const mapA = new Map(filesA.filter(f => f.type === 'file').map(f => [f.path, f]))
  const mapB = new Map(filesB.filter(f => f.type === 'file').map(f => [f.path, f]))

  const added:   FileEntry[] = []
  const removed: FileEntry[] = []
  const changed: DiffResult['changed'] = []

  for (const [path, fb] of mapB) {
    if (!mapA.has(path)) {
      added.push(fb)
    } else {
      const fa = mapA.get(path)!
      if ((fa.size ?? 0) !== (fb.size ?? 0)) {
        changed.push({ path, sizeA: fa.size ?? 0, sizeB: fb.size ?? 0 })
      }
    }
  }
  for (const [path, fa] of mapA) {
    if (!mapB.has(path)) removed.push(fa)
  }

  return { added, removed, changed }
}

export default async function SnapshotComparePage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ a?: string; b?: string }>
}) {
  const { id }   = await params
  const sp       = await searchParams
  const snapA    = sp.a ?? ''
  const snapB    = sp.b ?? ''

  const db = getDb()

  const [repo] = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1)
  if (!repo) notFound()

  const repoSnaps = await db
    .select({ id: snapshots.id, createdAt: snapshots.createdAt })
    .from(snapshots)
    .where(eq(snapshots.repositoryId, id))
    .orderBy(desc(snapshots.createdAt))
    .all()

  const repoConfig = JSON.parse(repo.config) as RepoConfig
  const engine = new ResticEngine({
    repositoryUrl: repoConfig.repositoryUrl,
    password:      repoConfig.password,
    envVars:       repoConfig.envVars ?? {},
    binaryPath:    process.env['RESTIC_BINARY_PATH'],
  })

  let diff: DiffResult | null = null
  let diffError: string | null = null

  if (snapA && snapB && snapA !== snapB) {
    try {
      const [filesA, filesB] = await Promise.all([engine.ls(snapA), engine.ls(snapB)])
      diff = computeDiff(filesA, filesB)
    } catch (err) {
      diffError = String(err)
    }
  }

  const th: React.CSSProperties = {
    padding: '8px 16px', fontSize: 11, fontWeight: 500, color: 'var(--fg-dim)',
    textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left',
  }
  const td: React.CSSProperties = {
    padding: '8px 16px', fontSize: 12, fontFamily: 'var(--font-mono)',
    borderTop: '1px solid var(--border)',
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/repositories/${id}/snapshots`} style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>
          ← {repo.name} / Snapshots
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>Compare snapshots</h1>
      </div>

      {/* Picker form */}
      <form method="get" action={`/repositories/${id}/snapshots/compare`}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>Snapshot A (older)</div>
            <select name="a" defaultValue={snapA} style={{
              padding: '6px 10px', fontSize: 13,
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)',
            }}>
              <option value="">Select…</option>
              {repoSnaps.map(s => (
                <option key={s.id} value={s.id}>
                  {s.id.slice(0, 8)} — {s.createdAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'}
                </option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: 18, color: 'var(--fg-dim)', alignSelf: 'flex-end', paddingBottom: 4 }}>→</div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>Snapshot B (newer)</div>
            <select name="b" defaultValue={snapB} style={{
              padding: '6px 10px', fontSize: 13,
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)',
            }}>
              <option value="">Select…</option>
              {repoSnaps.map(s => (
                <option key={s.id} value={s.id}>
                  {s.id.slice(0, 8)} — {s.createdAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" style={{
            alignSelf: 'flex-end', padding: '6px 16px', fontSize: 13, cursor: 'pointer',
            borderRadius: 'var(--radius-sm)', border: 'none',
            background: 'var(--accent)', color: '#fff',
          }}>
            Compare
          </button>
        </div>
      </form>

      {/* Diff error */}
      {diffError && (
        <div style={{ fontSize: 13, color: 'var(--err)', padding: '16px 20px', backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 20 }}>
          {diffError}
        </div>
      )}

      {/* Diff results */}
      {diff && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Summary */}
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { label: 'Added',   count: diff.added.length,   color: '#22c55e' },
              { label: 'Removed', count: diff.removed.length, color: 'var(--err)' },
              { label: 'Changed', count: diff.changed.length, color: 'var(--warn)' },
            ].map(({ label, count, color }) => (
              <div key={label} style={{
                backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '12px 20px', flex: 1,
              }}>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 600, color, fontFamily: 'var(--font-mono)' }}>{count}</div>
              </div>
            ))}
          </div>

          {/* Added */}
          {diff.added.length > 0 && (
            <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border2)', fontSize: 13, fontWeight: 600, color: '#22c55e' }}>
                Added ({diff.added.length})
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Path</th>
                    <th style={{ ...th, textAlign: 'right' }}>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.added.map(f => (
                    <tr key={f.path}>
                      <td style={{ ...td, color: 'var(--fg)', maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</td>
                      <td style={{ ...td, textAlign: 'right', color: 'var(--fg-mute)' }}>{bytes(f.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Removed */}
          {diff.removed.length > 0 && (
            <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border2)', fontSize: 13, fontWeight: 600, color: 'var(--err)' }}>
                Removed ({diff.removed.length})
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Path</th>
                    <th style={{ ...th, textAlign: 'right' }}>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.removed.map(f => (
                    <tr key={f.path}>
                      <td style={{ ...td, color: 'var(--fg)', maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</td>
                      <td style={{ ...td, textAlign: 'right', color: 'var(--fg-mute)' }}>{bytes(f.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Changed */}
          {diff.changed.length > 0 && (
            <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border2)', fontSize: 13, fontWeight: 600, color: 'var(--warn)' }}>
                Changed ({diff.changed.length})
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Path</th>
                    <th style={{ ...th, textAlign: 'right' }}>Size A</th>
                    <th style={{ ...th, textAlign: 'right' }}>Size B</th>
                    <th style={{ ...th, textAlign: 'right' }}>Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.changed.map(f => (
                    <tr key={f.path}>
                      <td style={{ ...td, color: 'var(--fg)', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</td>
                      <td style={{ ...td, textAlign: 'right', color: 'var(--fg-mute)' }}>{bytes(f.sizeA)}</td>
                      <td style={{ ...td, textAlign: 'right', color: 'var(--fg-mute)' }}>{bytes(f.sizeB)}</td>
                      <td style={{ ...td, textAlign: 'right', color: f.sizeB > f.sizeA ? '#22c55e' : 'var(--err)' }}>
                        {f.sizeB > f.sizeA ? '+' : ''}{bytes(f.sizeB - f.sizeA)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--fg-dim)', textAlign: 'center', padding: '32px 0' }}>
              No file differences between these two snapshots.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/dariusvorster/Projects/backupos && pnpm --filter web exec tsc --noEmit 2>&1 | head -20
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/dariusvorster/Projects/backupos
git add "apps/web/app/(dashboard)/repositories/[id]/snapshots/compare/page.tsx"
git commit -m "feat: snapshot diff view — compare two snapshots file-by-file"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Diff view — two-snapshot file comparison (added/removed/changed) | Task 2 (`computeDiff` + compare page) |
| Size by path — directory tree with aggregate sizes | Task 1 (`buildDirTree` + bar chart section) |
| Restore preview — file count + total size | Task 1 (summary stat cards) |

### Placeholder scan

No TBDs or TODOs. All code blocks are complete.

### Type consistency

- `FileEntry` in compare page matches the subset of `engine.ls()` return type used (`path`, `type`, `size`, `mtime`) — consistent.
- `bytes()` helper is duplicated across both files (not shared) — intentional since no shared utility file exists for this and the function is tiny.
- `buildDirTree` receives `files` typed as `{ path: string; type: string; size?: number }[]` which is a safe subset of `engine.ls()` return — consistent.
- `computeDiff` receives `FileEntry[]` arrays — both calls use `engine.ls()` results, which satisfy that interface — consistent.
- `desc` imported from `@backupos/db` in compare page — confirm it's re-exported there (it is, used in other pages like jobs/page.tsx).
