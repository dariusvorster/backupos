import type { ComponentProps } from 'react'
import { getDb, agents, backupJobs } from '@backupos/db'
import { eq } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/ui/stat-card'

type BadgeStatus = ComponentProps<typeof Badge>['status']

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>{agent.name}</h1>
          <Badge status={(agent.status ?? 'idle') as BadgeStatus} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard label="Platform"  value={`${agent.platform ?? '—'} / ${agent.arch ?? '—'}`} />
        <StatCard label="Hostname"  value={agent.hostname ?? '—'} />
        <StatCard label="IP"        value={agent.ip ?? '—'} />
        <StatCard label="Version"   value={agent.agentVersion ?? '—'} />
        <StatCard label="VSS"       value={agent.vssAvailable ? 'Available' : agent.platform === 'windows' ? 'Unavailable' : 'N/A'} />
        <StatCard label="Last seen" value={agent.lastSeenAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'} />
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
          Backup jobs on this agent ({jobs.length})
        </div>
        {jobs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>No jobs assigned to this agent</div>
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
