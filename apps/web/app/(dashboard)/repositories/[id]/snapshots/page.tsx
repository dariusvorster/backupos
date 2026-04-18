import { getDb, snapshots, repositories } from '@backupos/db'
import { eq, desc } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'

function bytes(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export default async function SnapshotsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }   = await params
  const db       = getDb()
  const [repo]   = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1)
  if (!repo) notFound()

  const snapshotList = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.repositoryId, id))
    .orderBy(desc(snapshots.createdAt))
    .all()

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/repositories/${id}`} style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>
          ← {repo.name}
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>Snapshots</h1>
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {snapshotList.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            No snapshots cached. Run a backup job to create snapshots.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border2)' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>ID</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Hostname</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Created</th>
                <th style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 500 }}>Size</th>
              </tr>
            </thead>
            <tbody>
              {snapshotList.map(snap => (
                <tr key={snap.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    <Link href={`/repositories/${id}/snapshots/${snap.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                      {snap.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--fg)', fontFamily: 'var(--font-mono)' }}>
                    {snap.hostname ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {snap.createdAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {bytes(snap.sizeBytes)}
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
