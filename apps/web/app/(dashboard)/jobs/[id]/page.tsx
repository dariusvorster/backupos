import { getDb, backupJobs, backupRuns } from '@backupos/db'
import { eq, desc } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db     = getDb()
  const [job]  = await db.select().from(backupJobs).where(eq(backupJobs.id, id)).limit(1)
  if (!job) notFound()

  const runs = await db
    .select()
    .from(backupRuns)
    .where(eq(backupRuns.jobId, id))
    .orderBy(desc(backupRuns.startedAt))
    .limit(20)
    .all()

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/jobs" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Jobs</Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>{job.name}</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Source type', value: job.sourceType },
          { label: 'Schedule', value: job.schedule, mono: true },
          { label: 'Status', value: job.enabled ? 'enabled' : 'disabled' },
          { label: 'Last run', value: job.lastRunAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—', mono: true },
        ].map(f => (
          <div key={f.label} style={{
            backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '16px 20px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6 }}>{f.label}</div>
            <div style={{ fontSize: 14, color: 'var(--fg)', fontFamily: f.mono ? 'var(--font-mono)' : undefined }}>
              {f.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
          Run history
        </div>
        {runs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>No runs yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Started</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 500 }}>Duration</th>
                <th style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 500 }}>Data added</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr key={run.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {run.startedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6,
                      backgroundColor: run.status === 'success' ? 'var(--ok-dim)' : run.status === 'failed' ? 'var(--err-dim)' : 'var(--info-dim)',
                      color: run.status === 'success' ? 'var(--ok)' : run.status === 'failed' ? 'var(--err)' : 'var(--info)',
                    }}>
                      {run.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {run.duration != null ? `${run.duration}s` : '—'}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {run.dataAdded != null ? `${(run.dataAdded / 1024 / 1024).toFixed(1)} MB` : '—'}
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
