import { getDb, repositories } from '@backupos/db'
import Link from 'next/link'

function bytes(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export default async function RepositoriesPage() {
  const db    = getDb()
  const repos = await db.select().from(repositories).all()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>Repositories</h1>
        <button style={{
          padding: '8px 16px',
          backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
          borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
        }}>
          Add repository
        </button>
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {repos.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            No repositories yet. Add a Restic repository to start storing backups.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border2)' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Name</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Backend</th>
                <th style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 500 }}>Size</th>
                <th style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 500 }}>Snapshots</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Last check</th>
              </tr>
            </thead>
            <tbody>
              {repos.map(repo => (
                <tr key={repo.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px' }}>
                    <Link href={`/repositories/${repo.id}`} style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', textDecoration: 'none' }}>
                      {repo.name}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {repo.backend}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {bytes(repo.sizeBytes)}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {repo.snapshotCount ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6,
                      backgroundColor: repo.lastCheckStatus === 'ok' ? 'var(--ok-dim)' : repo.lastCheckStatus === 'errors' ? 'var(--err-dim)' : 'var(--surf2)',
                      color: repo.lastCheckStatus === 'ok' ? 'var(--ok)' : repo.lastCheckStatus === 'errors' ? 'var(--err)' : 'var(--fg-mute)',
                    }}>
                      {repo.lastCheckStatus ?? 'unchecked'}
                    </span>
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
