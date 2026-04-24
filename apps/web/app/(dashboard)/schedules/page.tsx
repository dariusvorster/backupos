import type { ComponentProps } from 'react'
import Link from 'next/link'
import { getDb, backupJobs } from '@backupos/db'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

const th: React.CSSProperties = {
  padding: '10px 20px', textAlign: 'left', fontWeight: 500,
  fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
}

export default async function SchedulesPage() {
  const db   = getDb()
  const jobs = await db
    .select({
      id:        backupJobs.id,
      name:      backupJobs.name,
      schedule:  backupJobs.schedule,
      enabled:   backupJobs.enabled,
      lastRunAt: backupJobs.lastRunAt,
      nextRunAt: backupJobs.nextRunAt,
    })
    .from(backupJobs)
    .all()

  const scheduled = jobs.filter(j => j.schedule).sort((a, b) => {
    if (!a.nextRunAt && !b.nextRunAt) return 0
    if (!a.nextRunAt) return 1
    if (!b.nextRunAt) return -1
    return a.nextRunAt.getTime() - b.nextRunAt.getTime()
  })

  return (
    <div>
      <PageHeader
        title="Schedules"
        description="All jobs with a cron schedule, ordered by next run time."
      />

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {scheduled.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            No scheduled jobs.{' '}
            <Link href="/jobs/new" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Create a job</Link>
            {' '}to get started.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border2)' }}>
                <th style={th}>Job</th>
                <th style={th}>Schedule</th>
                <th style={th}>Status</th>
                <th style={th}>Last run</th>
                <th style={th}>Next run</th>
              </tr>
            </thead>
            <tbody>
              {scheduled.map(job => (
                <tr key={job.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px' }}>
                    <Link
                      href={`/jobs/${job.id}`}
                      style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', textDecoration: 'none' }}
                    >
                      {job.name}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {job.schedule ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <Badge
                      status={(job.enabled ? 'healthy' : 'paused') as BadgeStatus}
                      label={job.enabled ? 'Enabled' : 'Paused'}
                    />
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {fmtDate(job.lastRunAt)}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {fmtDate(job.nextRunAt)}
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
