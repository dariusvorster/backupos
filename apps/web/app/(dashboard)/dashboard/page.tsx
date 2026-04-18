import type { ComponentProps } from 'react'
import { getDb, backupJobs, backupRuns, agents, repositories, desc, eq } from '@backupos/db'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'

type BadgeStatus = ComponentProps<typeof Badge>['status']

const VALID_STATUSES = new Set<string>([
  'healthy', 'success', 'connected', 'online', 'running',
  'warning', 'missed', 'failed', 'error', 'disconnected',
  'offline', 'idle', 'paused', 'verifying',
])

function toBadge(s: string): BadgeStatus {
  return VALID_STATUSES.has(s) ? (s as BadgeStatus) : 'idle'
}

function fmtDuration(s: number | null): string {
  if (s == null) return '—'
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function fmtBytes(b: number | null): string {
  if (b == null) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

function fmtAge(d: Date | null): string {
  if (!d) return '—'
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default async function DashboardPage() {
  const db = getDb()
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [jobs, recentRuns, allAgents, repos] = await Promise.all([
    db.select().from(backupJobs).all(),
    db.select({
      id:          backupRuns.id,
      jobId:       backupRuns.jobId,
      jobName:     backupJobs.name,
      status:      backupRuns.status,
      startedAt:   backupRuns.startedAt,
      duration:    backupRuns.duration,
      dataAdded:   backupRuns.dataAdded,
    })
      .from(backupRuns)
      .leftJoin(backupJobs, eq(backupRuns.jobId, backupJobs.id))
      .orderBy(desc(backupRuns.startedAt))
      .limit(20)
      .all(),
    db.select().from(agents).all(),
    db.select().from(repositories).all(),
  ])

  const runs24h    = recentRuns.filter(r => r.startedAt && r.startedAt >= since24h)
  const failed24h  = runs24h.filter(r => r.status === 'failed').length
  const agentsOnline = allAgents.filter(a => a.status === 'connected').length

  const th: React.CSSProperties = {
    padding: '10px 20px', textAlign: 'left', fontWeight: 500,
    fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
  }
  const thR: React.CSSProperties = { ...th, textAlign: 'right' }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>Dashboard</h1>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        <StatCard label="Backup jobs"  value={jobs.length} />
        <StatCard label="Repositories" value={repos.length} />
        <StatCard label="Agents"       value={allAgents.length} footer={`${agentsOnline} online`} />
        <StatCard
          label="Runs (24 h)"
          value={runs24h.length}
          delta={failed24h > 0
            ? { text: `${failed24h} failed`, direction: 'down' }
            : runs24h.length > 0 ? { text: 'all ok', direction: 'up' } : undefined}
        />
      </div>

      {/* Recent runs table */}
      <div style={{
        backgroundColor: 'var(--surf)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        marginBottom: 24,
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
          Recent runs
        </div>
        {recentRuns.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            No backup runs yet. Enrol an agent to get started.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Status</th>
                <th style={th}>Job</th>
                <th style={thR}>Duration</th>
                <th style={thR}>Size added</th>
                <th style={thR}>Age</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map(run => (
                <tr key={run.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px' }}>
                    <Badge status={toBadge(run.status)} />
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--fg)' }}>
                    {run.jobName ?? run.jobId ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtDuration(run.duration)}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtBytes(run.dataAdded)}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtAge(run.startedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Agents card */}
      <div style={{
        backgroundColor: 'var(--surf)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
          Agents
        </div>
        {allAgents.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            No agents enrolled — install an agent to start backing up
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 1, padding: 16 }}>
            {allAgents.map(agent => (
              <div key={agent.id} style={{
                backgroundColor: 'var(--surf2)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 14px',
              }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', marginBottom: 4 }}>{agent.name}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                  {agent.hostname ?? agent.ip ?? '—'}
                </div>
                <Badge status={toBadge(agent.status ?? 'disconnected')} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
