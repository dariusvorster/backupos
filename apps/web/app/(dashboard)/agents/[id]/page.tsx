import type { ComponentProps } from 'react'
import { getDb, agents, backupJobs } from '@backupos/db'
import { eq } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/ui/stat-card'
import { getLogsPage } from '@/app/actions/logs'
import { setAgentChannelFromForm } from '@/app/actions/agents'
import { AutoRefresh } from '@/components/ui/auto-refresh'
import { UpdateAgentButton } from './update-button'

type BadgeStatus = ComponentProps<typeof Badge>['status']

interface ResourceSample { ts: number; cpuPct: number; ramBytes: number }

function parseHistory(raw: string | null): ResourceSample[] {
  if (!raw) return []
  try { return JSON.parse(raw) as ResourceSample[] } catch { return [] }
}

function fmtBytes(b: number | null): string {
  if (b == null) return '—'
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

function Sparkline({ samples, field, color }: {
  samples: ResourceSample[]
  field: 'cpuPct' | 'ramBytes'
  color: string
}) {
  if (samples.length === 0) {
    return <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>No data</span>
  }
  const values = samples.map(s => s[field])
  const max    = Math.max(...values, 1)
  const bars   = samples.slice(-48)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 32 }}>
      {bars.map((s, i) => {
        const h = Math.max(2, Math.round((s[field] / max) * 32))
        return (
          <div
            key={i}
            title={field === 'cpuPct' ? `${s[field]}%` : fmtBytes(s[field])}
            style={{
              width: 4, height: h, borderRadius: 1,
              backgroundColor: color, flexShrink: 0,
            }}
          />
        )
      })}
    </div>
  )
}

function CapabilityBadge({ label, available, na }: { label: string; available: boolean | null; na?: boolean }) {
  const color = na ? 'var(--fg-dim)' : available ? 'var(--ok)' : 'var(--fg-dim)'
  const bg    = na ? 'var(--surf2)' : available ? 'color-mix(in srgb, var(--surf2) 60%, var(--ok) 10%)' : 'var(--surf2)'
  return (
    <span style={{
      fontSize: 11, padding: '3px 8px', borderRadius: 12,
      border: '1px solid var(--border)', backgroundColor: bg, color,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color, display: 'inline-block' }} />
      {label}
    </span>
  )
}

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = await params
  const db      = getDb()
  const [agent] = await db.select().from(agents).where(eq(agents.id, id)).limit(1)
  if (!agent) notFound()

  const hdrs    = await headers()
  const host    = hdrs.get('host') ?? 'localhost:3000'
  const proto   = host.startsWith('localhost') ? 'http' : 'https'
  const wsProto = proto === 'https' ? 'wss' : 'ws'
  const baseUrl = `${proto}://${host}`
  const wsUrl   = `${wsProto}://${host}/ws/agent`

  const jobs      = await db.select().from(backupJobs).where(eq(backupJobs.agentId, id)).all()
  const agentLogs = await getLogsPage({ entityType: 'agent', entityId: id }, 50)
  const history   = parseHistory(agent.resourceHistory ?? null)

  const setChannel = setAgentChannelFromForm.bind(null, id)

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: 20,
  }

  return (
    <div>
      <AutoRefresh intervalMs={5_000} />
      <div style={{ marginBottom: 24 }}>
        <Link href="/agents" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Agents</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>{agent.name}</h1>
          <Badge status={(agent.status ?? 'idle') as BadgeStatus} />
        </div>
      </div>

      {agent.status === 'disconnected' && !agent.lastSeenAt && (
        <div style={{
          backgroundColor: 'color-mix(in srgb, var(--surf) 80%, var(--accent) 5%)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius)', padding: 20, marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>
            Waiting for agent to connect
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginBottom: 12 }}>
            Run this command on <strong>{agent.name}</strong> to install and start the agent:
          </div>
          <pre style={{
            margin: 0, padding: '10px 14px',
            background: 'var(--surf2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)',
            fontSize: 12, color: 'var(--fg)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>{`curl -fsSL ${baseUrl}/install.sh | BACKUPOS_URL=${wsUrl} BACKUPOS_TOKEN=${agent.publicKey} bash`}</pre>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 8 }}>
            Keep this token secret — it grants this agent access to your BackupOS instance.
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        <StatCard label="Platform"  value={`${agent.platform ?? '—'} / ${agent.arch ?? '—'}`} />
        <StatCard label="Hostname"  value={agent.hostname ?? '—'} />
        <StatCard label="IP"        value={agent.ip ?? '—'} />
        <StatCard label="Version"   value={agent.agentVersion ?? '—'} />
        <StatCard label="VSS"       value={agent.vssAvailable ? 'Available' : agent.platform === 'windows' ? 'Unavailable' : 'N/A'} />
        <StatCard label="Last seen" value={agent.lastSeenAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'} />
      </div>

      {/* Capabilities */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 12 }}>Capabilities</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <CapabilityBadge
            label="VSS"
            available={agent.vssAvailable ?? false}
            na={agent.platform !== 'windows'}
          />
          <CapabilityBadge
            label="Hypervisor driver"
            available={agent.hypervisorDriver ?? false}
          />
          <CapabilityBadge
            label="App hooks"
            available={agent.appHooksAvailable ?? false}
          />
        </div>
      </div>

      {/* Resource usage */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 16 }}>Resource usage</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>CPU</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>
                {agent.cpuPct != null ? `${agent.cpuPct}%` : '—'}
              </span>
            </div>
            <Sparkline samples={history} field="cpuPct" color="var(--accent)" />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>RAM</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>
                {fmtBytes(agent.ramBytes ?? null)}
              </span>
            </div>
            <Sparkline samples={history} field="ramBytes" color="#22c55e" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
          <div>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Disk read </span>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-mute)' }}>
              {agent.diskReadBps != null ? `${fmtBytes(agent.diskReadBps)}/s` : '—'}
            </span>
          </div>
          <div>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Disk write </span>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-mute)' }}>
              {agent.diskWriteBps != null ? `${fmtBytes(agent.diskWriteBps)}/s` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Update channel */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Auto-update channel</div>
        <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginBottom: 12 }}>
          Controls which release track this agent follows for automatic updates.
        </div>
        <form action={setChannel} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            key={agent.updateChannel ?? 'stable'}
            name="channel"
            defaultValue={agent.updateChannel ?? 'stable'}
            style={{
              padding: '6px 10px', fontSize: 13,
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)',
            }}
          >
            <option value="stable">Stable</option>
            <option value="beta">Beta</option>
            <option value="pinned">Pinned (no auto-update)</option>
          </select>
          <button type="submit" style={{
            padding: '6px 14px', fontSize: 13, cursor: 'pointer',
            borderRadius: 'var(--radius-sm)', border: 'none',
            background: 'var(--accent)', color: '#fff',
          }}>
            Save
          </button>
        </form>
      </div>

      {/* Manual update */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>Update agent</div>
        <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginBottom: 12 }}>
          Force the agent to download the latest bundle from this server and restart immediately.
        </div>
        <UpdateAgentButton agentId={id} />
      </div>

      {/* Jobs */}
      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 20 }}>
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

      {/* Agent logs */}
      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
          Agent logs
        </div>
        {agentLogs.length === 0 ? (
          <div style={{ padding: '20px 24px', fontSize: 13, color: 'var(--fg-dim)' }}>No operational logs for this agent yet.</div>
        ) : (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {agentLogs.map(entry => (
              <div key={entry.id} style={{ display: 'flex', gap: 12, padding: '6px 16px', borderBottom: '1px solid var(--border)', alignItems: 'baseline' }}>
                <span style={{ color: 'var(--fg-dim)', flexShrink: 0, width: 152 }}>
                  {new Date(entry.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                </span>
                <span style={{
                  fontWeight: 600, width: 44, flexShrink: 0,
                  color: ({ debug: 'var(--fg-dim)', info: 'var(--ok)', warn: 'var(--warn)', error: 'var(--err)', fatal: 'var(--err)' } as Record<string, string>)[entry.level] ?? 'var(--fg)',
                }}>
                  {entry.level.toUpperCase().slice(0, 4)}
                </span>
                <span style={{ color: 'var(--fg)', flex: 1 }}>{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
