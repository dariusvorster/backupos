import { getDb, repositories, snapshots } from '@backupos/db'
import { eq, desc } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ResticEngine } from '@backupos/engine'
import { decryptField } from '@/lib/repo-crypto'

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

  const repoConfig = JSON.parse(decryptField(repo.config)) as RepoConfig
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
                        {f.sizeB > f.sizeA ? '+' : '-'}{bytes(Math.abs(f.sizeB - f.sizeA))}
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
