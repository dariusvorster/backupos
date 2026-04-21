import type { ComponentProps } from 'react'
import Link from 'next/link'
import { Radar } from 'lucide-react'
import { getDb, backupMonitors } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { GroupFilter } from './group-filter'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function fmtDate(d: Date | null): string {
  if (!d) return 'never'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

export default async function MonitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>
}) {
  const { group } = await searchParams
  const db        = getDb()
  const allMonitors = await db.select().from(backupMonitors).all()

  const groups = [...new Set(
    allMonitors.map(m => m.group).filter((g): g is string => !!g)
  )].sort()

  const monitors = group
    ? allMonitors.filter(m => m.group === group)
    : allMonitors

  const th: React.CSSProperties = {
    padding: '10px 20px', textAlign: 'left', fontWeight: 500,
    fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>Monitors</h1>
          <Link
            href="/monitors/timeline"
            style={{ fontSize: 12, color: 'var(--fg-mute)', textDecoration: 'none' }}
          >
            View timeline →
          </Link>
        </div>
        <Button variant="primary" size="md">
          <Radar size={14} />
          Add monitor
        </Button>
      </div>

      <GroupFilter groups={groups} />

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {monitors.length === 0 ? (
          <EmptyState
            type="page"
            icon={<Radar size={48} />}
            headline="No monitors yet"
            description="Connect Proxmox PBS, BorgBackup, Duplicati, or Veeam to see their backup status alongside your native jobs."
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border2)' }}>
                <th style={th}>Name</th>
                <th style={th}>Type</th>
                <th style={th}>Group</th>
                <th style={th}>Status</th>
                <th style={th}>Last sync</th>
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
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-dim)' }}>
                    {monitor.group ?? <span style={{ fontStyle: 'italic' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <Badge status={(monitor.status ?? 'idle') as BadgeStatus} />
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {fmtDate(monitor.lastSyncedAt)}
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
