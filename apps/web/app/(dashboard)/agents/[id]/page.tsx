import { getDb, agents, backupJobs } from '@backupos/db'
import { eq } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = await params
  const db      = getDb()
  const [agent] = await db.select().from(agents).where(eq(agents.id, id)).limit(1)
  if (!agent) notFound()

  const jobs = await db.select().from(backupJobs).where(eq(backupJobs.agentId, id)).all()

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/agents" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Agents</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>{agent.name}</h1>
          <span style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
            backgroundColor: agent.status === 'connected' ? 'var(--ok-dim)' : 'var(--err-dim)',
            color: agent.status === 'connected' ? 'var(--ok)' : 'var(--err)',
          }}>
            {agent.status ?? 'disconnected'}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Platform', value: `${agent.platform ?? '—'} / ${agent.arch ?? '—'}` },
          { label: 'Hostname', value: agent.hostname ?? '—', mono: true },
          { label: 'IP',       value: agent.ip ?? '—', mono: true },
          { label: 'Version',  value: agent.agentVersion ?? '—', mono: true },
          { label: 'VSS',      value: agent.vssAvailable ? 'Available' : agent.platform === 'windows' ? 'Unavailable' : 'N/A' },
          { label: 'Last seen', value: agent.lastSeenAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—', mono: true },
        ].map(f => (
          <div key={f.label} style={{
            backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '16px 20px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>{f.label}</div>
            <div style={{ fontSize: 14, color: 'var(--fg)', fontFamily: f.mono ? 'var(--font-mono)' : undefined }}>
              {f.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
          Backup jobs on this agent ({jobs.length})
        </div>
        {jobs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            No jobs assigned to this agent
          </div>
        ) : (
          jobs.map(job => (
            <div key={job.id} style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
              <Link href={`/jobs/${job.id}`} style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', textDecoration: 'none' }}>
                {job.name}
              </Link>
              <span style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>{job.schedule}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
