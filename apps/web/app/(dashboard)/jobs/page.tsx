import { getDb, backupJobs } from '@backupos/db'
import Link from 'next/link'

export default async function JobsPage() {
  const db   = getDb()
  const jobs = await db.select().from(backupJobs).all()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>Jobs</h1>
        <Link href="/jobs/new" style={{
          padding: '8px 16px',
          backgroundColor: 'var(--accent)',
          color: 'var(--accent-fg)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
        }}>
          New job
        </Link>
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {jobs.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            No jobs yet.{' '}
            <Link href="/jobs/new" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              Create your first backup job
            </Link>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border2)' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Name</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Source</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Schedule</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Status</th>
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
                    {job.sourceType}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {job.schedule}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      backgroundColor: job.enabled ? 'var(--ok-dim)' : 'var(--surf2)',
                      color: job.enabled ? 'var(--ok)' : 'var(--fg-mute)',
                    }}>
                      {job.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {job.lastRunAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'}
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
