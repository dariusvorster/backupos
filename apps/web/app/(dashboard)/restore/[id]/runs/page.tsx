import { getDb, restoreRuns, restoreSpecs } from '@backupos/db'
import { eq, desc } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export default async function RestoreRunsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db     = getDb()
  const [spec] = await db.select().from(restoreSpecs).where(eq(restoreSpecs.id, id)).limit(1)
  if (!spec) notFound()

  const runs = await db
    .select()
    .from(restoreRuns)
    .where(eq(restoreRuns.specId, id))
    .orderBy(desc(restoreRuns.startedAt))
    .all()

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/restore/${id}`} style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>
          ← {spec.name}
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>Restore run history</h1>
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {runs.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>No runs yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border2)' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Started</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Trigger</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Snapshot</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr key={run.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {run.startedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6,
                      backgroundColor: run.status === 'success' ? 'var(--ok-dim)' : run.status === 'failed' ? 'var(--err-dim)' : 'var(--info-dim)',
                      color: run.status === 'success' ? 'var(--ok)' : run.status === 'failed' ? 'var(--err)' : 'var(--info)',
                    }}>
                      {run.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)' }}>{run.trigger ?? '—'}</td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {run.snapshotId?.slice(0, 8) ?? '—'}
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
