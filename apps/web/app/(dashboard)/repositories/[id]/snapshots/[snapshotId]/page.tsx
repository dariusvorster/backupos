import { getDb, repositories, snapshots } from '@backupos/db'
import { eq } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ResticEngine } from '@backupos/engine'

function bytes(n: number | undefined): string {
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

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/repositories/${id}/snapshots`} style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>
          ← {repo.name} / Snapshots
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>
          Snapshot{' '}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--accent)' }}>
            {snapshotId.slice(0, 8)}
          </span>
        </h1>
        <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
          {snap.createdAt?.toISOString().slice(0, 19).replace('T', ' ')} · {snap.hostname ?? '—'}
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {lsError ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--err)', fontSize: 13 }}>
            Failed to list files: {lsError}
          </div>
        ) : files.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            No files found in snapshot.
          </div>
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
