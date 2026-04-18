import { getDb, backupMonitors, monitorResults } from '@backupos/db'
import { eq, desc } from '@backupos/db'
import Link from 'next/link'

export default async function MonitorsPage() {
  const db       = getDb()
  const monitors = await db.select().from(backupMonitors).all()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>Monitors</h1>
        <button style={{
          padding: '8px 16px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
          borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
        }}>
          Add monitor
        </button>
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {monitors.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            No monitors yet. Connect Proxmox PBS, BorgBackup, Duplicati, or Veeam to see their status here.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border2)' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Name</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Type</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Last sync</th>
              </tr>
            </thead>
            <tbody>
              {monitors.map(monitor => (
                <tr key={monitor.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px' }}>
                    <Link href={`/monitors/${monitor.id}`} style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', textDecoration: 'none' }}>
                      {monitor.name}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {monitor.type}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6,
                      backgroundColor:
                        monitor.status === 'healthy' ? 'var(--ok-dim)' :
                        monitor.status === 'warning' ? 'var(--warn-dim)' :
                        monitor.status === 'error'   ? 'var(--err-dim)' : 'var(--surf2)',
                      color:
                        monitor.status === 'healthy' ? 'var(--ok)' :
                        monitor.status === 'warning' ? 'var(--warn)' :
                        monitor.status === 'error'   ? 'var(--err)' : 'var(--fg-mute)',
                    }}>
                      {monitor.status ?? 'unknown'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {monitor.lastSyncedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? 'never'}
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
