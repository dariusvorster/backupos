import type { ComponentProps } from 'react'
import Link from 'next/link'
import { PlayCircle } from 'lucide-react'
import { getDb, backupJobs } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

export default async function JobsPage() {
  const db   = getDb()
  const jobs = await db.select().from(backupJobs).all()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>Jobs</h1>
        <Link href="/jobs/new" style={{ textDecoration: 'none' }}>
          <Button variant="primary" size="md">
            <PlayCircle size={14} />
            New job
          </Button>
        </Link>
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {jobs.length === 0 ? (
          <EmptyState
            type="page"
            headline="No backup jobs yet"
            description="Create a job to define what gets backed up, where, and on what schedule."
            primaryAction={{ label: 'New job', href: '/jobs/new' }}
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border2)' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Name</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Schedule</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Enabled</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Last status</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Last run</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px' }}>
                    <Link href={`/jobs/${job.id}`} style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500, textDecoration: 'none' }}>
                      {job.name}
                    </Link>

                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {job.schedule}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <Badge status={job.enabled ? 'healthy' : 'paused'} label={job.enabled ? 'Enabled' : 'Disabled'} />
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    {job.lastRunStatus
                      ? <Badge status={job.lastRunStatus as BadgeStatus} />
                      : <span style={{ fontSize: 12, color: 'var(--fg-faint)' }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {fmtDate(job.lastRunAt)}
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
