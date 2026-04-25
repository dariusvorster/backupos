import type { ComponentProps } from 'react'
import { getDb, backupMonitors, monitorResults, repositories } from '@backupos/db'
import { eq, desc } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/ui/stat-card'
import { SyncButton } from './sync-button'
import { EmptyState } from '@/components/ui/empty-state'

type BadgeStatus = ComponentProps<typeof Badge>['status']

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
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={`/monitors/${id}/edit`} style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 500,
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'var(--surf2)', color: 'var(--fg)', textDecoration: 'none',
              display: 'inline-block',
            }}>
              Edit
            </Link>
            <SyncButton monitorId={id} />
          </div>
        </div>
      </div>

      {latest && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          <StatCard label="Status"      value={latest.status ?? '—'} />
          <StatCard label="Last backup" value={latest.lastBackupAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'} />
          <StatCard label="Size"        value={bytes(latest.sizeBytes)} />
        </div>
      )}

      {monitor.type === 'proxmox_pbs' && (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '18px 20px', marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>
              Promote to managed repository
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
              Import this PBS datastore as a native Restic repository so BackupOS can schedule and verify backups directly.
            </div>
          </div>
          <Link
            href={`/monitors/${id}/promote`}
            style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
              borderRadius: 'var(--radius-sm)', border: 'none',
              background: 'var(--accent)', color: '#fff', textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Promote →
          </Link>
        </div>
      )}

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
          Sync history
        </div>
        {results.length === 0 ? (
          <EmptyState type="inline" headline="No syncs yet" description='Click "Sync now" to fetch the current status.' />
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
                    <Badge status={(r.status ?? 'idle') as BadgeStatus} />
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
