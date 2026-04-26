import Link from 'next/link'
import { getDb, backupRuns, backupJobs, backupMonitors, monitorResults, desc } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import type { ComponentProps } from 'react'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

function fmtBytes(b: number | null | undefined): string {
  if (b == null) return '—'
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

type TimelineEntry =
  | { kind: 'run';    ts: Date; id: string; jobId: string | null; jobName: string; status: string; duration: number | null; dataAdded: number | null }
  | { kind: 'result'; ts: Date; id: string; monitorId: string; monitorName: string; status: string; sizeBytes: number | null }

export default async function TimelinePage() {
  const db = getDb()

  const [runs, jobs, results, monitors] = await Promise.all([
    db.select().from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(100).all(),
    db.select({ id: backupJobs.id, name: backupJobs.name }).from(backupJobs).all(),
    db.select().from(monitorResults).orderBy(desc(monitorResults.checkedAt)).limit(100).all(),
    db.select({ id: backupMonitors.id, name: backupMonitors.name }).from(backupMonitors).all(),
  ])

  const jobMap     = new Map(jobs.map(j => [j.id, j.name]))
  const monitorMap = new Map(monitors.map(m => [m.id, m.name]))

  const entries: TimelineEntry[] = [
    ...runs
      .filter(r => r.startedAt != null)
      .map(r => ({
        kind:      'run'    as const,
        ts:        r.startedAt!,
        id:        r.id,
        jobId:     r.jobId,
        jobName:   r.jobId ? (jobMap.get(r.jobId) ?? 'Unknown job') : 'Unknown job',
        status:    r.status ?? 'unknown',
        duration:  r.duration,
        dataAdded: r.dataAdded,
      })),
    ...results
      .filter(r => r.checkedAt != null)
      .map(r => ({
        kind:        'result'  as const,
        ts:          r.checkedAt!,
        id:          r.id,
        monitorId:   r.monitorId ?? '',
        monitorName: r.monitorId ? (monitorMap.get(r.monitorId) ?? 'Unknown monitor') : 'Unknown monitor',
        status:      r.status ?? 'unknown',
        sizeBytes:   r.sizeBytes,
      })),
  ].sort((a, b) => b.ts.getTime() - a.ts.getTime())

  const th: React.CSSProperties = {
    padding: '10px 20px', textAlign: 'left', fontWeight: 500,
    fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
  }
  const td: React.CSSProperties = {
    padding: '12px 20px', fontSize: 12,
    color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)',
    borderTop: '1px solid var(--border)',
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/monitors" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Monitors</Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>Activity timeline</h1>
        <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginTop: 4 }}>
          All backup activity — native jobs and monitored systems — in one view.
        </p>
      </div>

      {entries.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 48, textAlign: 'center',
          color: 'var(--fg-mute)', fontSize: 13,
        }}>
          No backup activity yet.
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border2)' }}>
                <th style={th}>Time</th>
                <th style={th}>Source</th>
                <th style={th}>Name</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Size / duration</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={`${e.kind}-${e.id}`}>
                  <td style={td}>{fmtDate(e.ts)}</td>
                  <td style={{ ...td, color: e.kind === 'run' ? 'var(--accent)' : 'var(--fg-dim)' }}>
                    {e.kind === 'run' ? 'job' : 'monitor'}
                  </td>
                  <td style={{ ...td, color: 'var(--fg)', fontFamily: 'inherit', fontWeight: 500 }}>
                    {e.kind === 'run' ? (
                      <Link href={`/jobs/${e.jobId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {e.jobName}
                      </Link>
                    ) : (
                      <Link href={`/monitors/${e.monitorId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {e.monitorName}
                      </Link>
                    )}
                  </td>
                  <td style={{ ...td, fontFamily: 'inherit' }}>
                    <Badge status={e.status as BadgeStatus} />
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {e.kind === 'run'
                      ? fmtDuration(e.duration)
                      : fmtBytes(e.sizeBytes)
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
