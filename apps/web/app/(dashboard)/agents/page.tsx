import type { ComponentProps } from 'react'
import { Server } from 'lucide-react'
import { getDb, agents } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

function CapBadge({ label, ok, na }: { label: string; ok: boolean | null; na?: boolean }) {
  const color = na ? 'var(--fg-dim)' : ok ? 'var(--ok)' : 'var(--fg-dim)'
  return (
    <span style={{
      fontSize: 10, padding: '2px 6px', borderRadius: 10,
      border: '1px solid var(--border)', color,
      backgroundColor: ok && !na ? 'color-mix(in srgb, var(--surf2) 60%, var(--ok) 10%)' : 'var(--surf2)',
    }}>
      {label}
    </span>
  )
}

export default async function AgentsPage() {
  const db        = getDb()
  const agentList = await db.select().from(agents).all()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>Agents</h1>
        <Button variant="primary" size="md">
          <Server size={14} />
          Enrol agent
        </Button>
      </div>

      {agentList.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}>
          <EmptyState
            type="page"
            icon={<Server size={48} />}
            headline="No agents enrolled"
            description="Install the BackupOS agent on your Linux or Windows hosts to start backing up."
          />
          <div style={{ padding: '0 24px 32px', display: 'flex', justifyContent: 'center' }}>
            <code style={{
              display: 'block',
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '10px 16px',
              fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)',
            }}>
              curl -fsSL http://localhost:3000/install.sh | bash
            </code>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {agentList.map(agent => (
            <a
              key={agent.id}
              href={`/agents/${agent.id}`}
              style={{
                backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: 20, textDecoration: 'none',
                display: 'block',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{agent.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {agent.hostname ?? agent.ip ?? '—'}
                  </div>
                </div>
                <Badge status={(agent.status ?? 'disconnected') as BadgeStatus} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 2 }}>Platform</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {agent.platform ?? '—'}{agent.arch ? ` / ${agent.arch}` : ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 2 }}>Version</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {agent.agentVersion ?? '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 2 }}>Channel</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {agent.updateChannel ?? 'stable'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 2 }}>Last seen</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {fmtDate(agent.lastSeenAt)}
                  </div>
                </div>
              </div>

              {/* Capability badges */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <CapBadge label="VSS" ok={agent.vssAvailable ?? false} na={agent.platform !== 'windows'} />
                <CapBadge label="Hypervisor" ok={!!agent.hypervisorDriver} />
                <CapBadge label="App hooks" ok={agent.appHooksAvailable ?? false} />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
