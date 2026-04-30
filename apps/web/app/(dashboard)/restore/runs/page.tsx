import type { ComponentProps } from 'react'
import Link from 'next/link'
import { getDb, restoreRuns, restoreSpecs, eq, desc } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PollWrapper } from './poll-wrapper'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function formatDuration(startedAt: Date | null, completedAt: Date | null): string {
  if (!startedAt || !completedAt) return '—'
  const ms = completedAt.getTime() - startedAt.getTime()
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}m`
}

export default async function RestoreRunsPage() {
  const db   = getDb()
  const runs = await db
    .select({
      runId:       restoreRuns.id,
      specId:      restoreRuns.specId,
      specName:    restoreSpecs.name,
      snapshotId:  restoreRuns.snapshotId,
      trigger:     restoreRuns.trigger,
      status:      restoreRuns.status,
      startedAt:   restoreRuns.startedAt,
      completedAt: restoreRuns.completedAt,
    })
    .from(restoreRuns)
    .leftJoin(restoreSpecs, eq(restoreRuns.specId, restoreSpecs.id))
    .orderBy(desc(restoreRuns.startedAt))
    .limit(50)
    .all()

  const anyRunning = runs.some(r => r.status === 'running')

  return (
    <div>
      <PollWrapper initialStatus={anyRunning ? 'running' : 'idle'} />
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Restore runs</h1>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {runs.length === 0 ? (
          <EmptyState
            type="inline"
            headline="No restore runs yet. Runs appear here when you execute a restore spec."
            primaryAction={{ label: 'View specs', href: '/restore' }}
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border2)' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Started</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Spec</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Trigger</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Snapshot</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => {
                const href = run.specId ? `/restore/${run.specId}/runs/${run.runId}` : '#'
                return (
                  <tr key={run.runId} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                    <td style={{ padding: 0 }}>
                      <Link href={href} style={{ display: 'block', padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>
                        {run.startedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'}
                      </Link>
                    </td>
                    <td style={{ padding: 0 }}>
                      <Link href={href} style={{ display: 'block', padding: '12px 20px', fontSize: 12, textDecoration: 'none' }}>
                        {run.specId && run.specName ? (
                          <span style={{ color: 'var(--fg)' }}>{run.specName}</span>
                        ) : (
                          <span style={{ color: 'var(--fg-faint)' }}>&lt;deleted spec&gt;</span>
                        )}
                      </Link>
                    </td>
                    <td style={{ padding: 0 }}>
                      <Link href={href} style={{ display: 'block', padding: '12px 20px', textDecoration: 'none' }}>
                        <Badge status={(run.status ?? 'idle') as BadgeStatus} />
                      </Link>
                    </td>
                    <td style={{ padding: 0 }}>
                      <Link href={href} style={{ display: 'block', padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textDecoration: 'none' }}>
                        {run.trigger ?? '—'}
                      </Link>
                    </td>
                    <td style={{ padding: 0 }}>
                      <Link href={href} style={{ display: 'block', padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>
                        {run.snapshotId?.slice(0, 12) ?? '—'}
                      </Link>
                    </td>
                    <td style={{ padding: 0 }}>
                      <Link href={href} style={{ display: 'block', padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textDecoration: 'none' }}>
                        {formatDuration(run.startedAt, run.completedAt)}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
