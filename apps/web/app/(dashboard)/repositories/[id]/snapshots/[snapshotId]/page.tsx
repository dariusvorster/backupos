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
