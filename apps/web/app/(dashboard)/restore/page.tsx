import { getDb, restoreSpecs, restoreRuns } from '@backupos/db'
import { desc } from '@backupos/db'
import Link from 'next/link'

export default async function RestorePage() {
  const db    = getDb()
  const [specs, recentRuns] = await Promise.all([
    db.select().from(restoreSpecs).all(),
    db.select().from(restoreRuns).orderBy(desc(restoreRuns.startedAt)).limit(10).all(),
  ])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>Restore</h1>
        <Link href="/restore/new" style={{
          padding: '8px 16px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
          borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, textDecoration: 'none',
        }}>
          New restore spec
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Specs */}
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
            Restore specs
          </div>
          {specs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
              No restore specs yet.{' '}
              <Link href="/restore/new" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Create one</Link>
            </div>
          ) : (
            <div>
              {specs.map(spec => (
                <div key={spec.id} style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Link href={`/restore/${spec.id}`} style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', textDecoration: 'none' }}>
                      {spec.name}
                    </Link>
                    {spec.description && (
                      <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginTop: 2 }}>{spec.description}</div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6,
                    backgroundColor: spec.validationStatus === 'valid' ? 'var(--ok-dim)' : spec.validationStatus === 'invalid' ? 'var(--err-dim)' : 'var(--surf2)',
                    color: spec.validationStatus === 'valid' ? 'var(--ok)' : spec.validationStatus === 'invalid' ? 'var(--err)' : 'var(--fg-mute)',
                  }}>
                    {spec.validationStatus ?? 'untested'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent runs */}
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
            Recent restore runs
          </div>
          {recentRuns.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
              No restore runs yet
            </div>
          ) : (
            recentRuns.map(run => (
              <div key={run.id} style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {run.startedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{run.trigger ?? 'manual'}</div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6,
                  backgroundColor: run.status === 'success' ? 'var(--ok-dim)' : run.status === 'failed' ? 'var(--err-dim)' : 'var(--info-dim)',
                  color: run.status === 'success' ? 'var(--ok)' : run.status === 'failed' ? 'var(--err)' : 'var(--info)',
                }}>
                  {run.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
