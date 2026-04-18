import { getDb, backupMonitors, monitorResults } from '@backupos/db'
import { eq, desc } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'

function bytes(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export default async function MonitorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }    = await params
  const db        = getDb()
  const [monitor] = await db.select().from(backupMonitors).where(eq(backupMonitors.id, id)).limit(1)
  if (!monitor) notFound()

  const results = await db
    .select()
    .from(monitorResults)
    .where(eq(monitorResults.monitorId, id))
    .orderBy(desc(monitorResults.checkedAt))
    .limit(20)
    .all()

  const latest = results[0]

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/monitors" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Monitors</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>{monitor.name}</h1>
          <button style={{
            padding: '8px 16px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
            border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            Sync now
          </button>
        </div>
      </div>

      {latest && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Status',      value: latest.status },
            { label: 'Last backup', value: latest.lastBackupAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—', mono: true },
            { label: 'Size',        value: bytes(latest.sizeBytes), mono: true },
          ].map(f => (
            <div key={f.label} style={{
              backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '16px 20px',
            }}>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', fontFamily: f.mono ? 'var(--font-mono)' : undefined }}>
                {f.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
          Sync history
        </div>
        {results.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            No syncs yet. Click &quot;Sync now&quot; to fetch the current status.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Checked at</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 500 }}>Size</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {r.checkedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6,
                      backgroundColor: r.status === 'healthy' ? 'var(--ok-dim)' : r.status === 'error' ? 'var(--err-dim)' : 'var(--warn-dim)',
                      color: r.status === 'healthy' ? 'var(--ok)' : r.status === 'error' ? 'var(--err)' : 'var(--warn)',
                    }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {bytes(r.sizeBytes)}
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
