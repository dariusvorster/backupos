import { getDb } from '@backupos/db'
import { backupJobs, backupRuns, agents, repositories } from '@backupos/db'
import { desc } from '@backupos/db'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    success:     { bg: 'var(--ok-dim)',   color: 'var(--ok)' },
    failed:      { bg: 'var(--err-dim)',  color: 'var(--err)' },
    running:     { bg: 'var(--info-dim)', color: 'var(--info)' },
    warning:     { bg: 'var(--warn-dim)', color: 'var(--warn)' },
    connected:   { bg: 'var(--ok-dim)',   color: 'var(--ok)' },
    disconnected:{ bg: 'var(--err-dim)',  color: 'var(--err)' },
  }
  const style = map[status] ?? { bg: 'var(--surf2)', color: 'var(--fg-mute)' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 500,
      backgroundColor: style.bg,
      color: style.color,
    }}>
      {status}
    </span>
  )
}

function KpiCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div style={{
      backgroundColor: 'var(--surf)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '20px 24px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default async function DashboardPage() {
  const db = getDb()
  const [jobs, recentRuns, allAgents, repos] = await Promise.all([
    db.select().from(backupJobs).all(),
    db.select().from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(10).all(),
    db.select().from(agents).all(),
    db.select().from(repositories).all(),
  ])

  const runsSince24h = recentRuns.filter(r => {
    const ts = r.startedAt?.getTime() ?? 0
    return Date.now() - ts < 24 * 60 * 60 * 1000
  })

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 24 }}>
        Dashboard
      </h1>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        <KpiCard label="Backup jobs" value={jobs.length} />
        <KpiCard label="Repositories" value={repos.length} />
        <KpiCard label="Agents" value={allAgents.length} sub={`${allAgents.filter(a => a.status === 'connected').length} online`} />
        <KpiCard
          label="Runs (24h)"
          value={runsSince24h.length}
          sub={`${runsSince24h.filter(r => r.status === 'failed').length} failed`}
        />
      </div>

      {/* Recent runs */}
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
            No backup runs yet
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Job</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Started</th>
                <th style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 500 }}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map(run => (
                <tr key={run.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--fg)', fontFamily: 'var(--font-mono)' }}>
                    {run.jobId ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <StatusBadge status={run.status} />
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {run.startedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {run.duration != null ? `${run.duration}s` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Agents grid */}
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
                <StatusBadge status={agent.status ?? 'disconnected'} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
