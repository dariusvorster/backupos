import type { ComponentProps } from 'react'
import { getDb, restoreRuns, restoreSpecs } from '@backupos/db'
import { eq, desc } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PollWrapper } from './poll-wrapper'

type BadgeStatus = ComponentProps<typeof Badge>['status']

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

  const hasRunning = runs.some(r => r.status === 'running')

  return (
    <div>
      <PollWrapper initialStatus={hasRunning ? 'running' : 'done'} />

      <div style={{ marginBottom: 24 }}>
        <Link href={`/restore/${id}`} style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>
          ← {spec.name}
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>Restore run history</h1>
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {runs.length === 0 ? (
          <EmptyState type="inline" headline="No runs yet" />
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
                <tr
                  key={run.id}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  <td style={{ padding: 0 }} colSpan={4}>
                    <Link
                      href={`/restore/${id}/runs/${run.id}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto auto auto',
                        gap: 0,
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
                      <span style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                        {run.startedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'}
                      </span>
                      <span style={{ padding: '12px 20px' }}>
                        <Badge status={(run.status ?? 'idle') as BadgeStatus} />
                      </span>
                      <span style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', whiteSpace: 'nowrap' }}>
                        {run.trigger ?? '—'}
                      </span>
                      <span style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                        {run.snapshotId?.slice(0, 8) ?? '—'}
                      </span>
                    </Link>
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
