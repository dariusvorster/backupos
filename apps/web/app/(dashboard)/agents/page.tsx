import { getDb, agents } from '@backupos/db'

export default async function AgentsPage() {
  const db         = getDb()
  const agentList  = await db.select().from(agents).all()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>Agents</h1>
        <button style={{
          padding: '8px 16px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
          borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
        }}>
          Enroll agent
        </button>
      </div>

      {agentList.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 60, textAlign: 'center',
        }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg)', marginBottom: 8 }}>
            No agents enrolled
          </div>
          <div style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 20 }}>
            Install the BackupOS agent on your Linux or Windows hosts to start backing up.
          </div>
          <div style={{
            display: 'inline-block',
            backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '10px 16px',
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)',
          }}>
            curl -fsSL http://localhost:3000/install.sh | bash
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {agentList.map(agent => (
            <div key={agent.id} style={{
              backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: 20,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{agent.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {agent.hostname ?? agent.ip ?? '—'}
                  </div>
                </div>
                <span style={{
                  padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                  backgroundColor: agent.status === 'connected' ? 'var(--ok-dim)' : 'var(--err-dim)',
                  color: agent.status === 'connected' ? 'var(--ok)' : 'var(--err)',
                }}>
                  {agent.status ?? 'disconnected'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 2 }}>Platform</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {agent.platform ?? '—'} {agent.arch ? `/ ${agent.arch}` : ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 2 }}>VSS</div>
                  <div style={{ fontSize: 12, color: agent.vssAvailable ? 'var(--ok)' : 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {agent.vssAvailable ? 'available' : agent.platform === 'windows' ? 'unavailable' : 'N/A'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 2 }}>Version</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {agent.agentVersion ?? '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 2 }}>Last seen</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {agent.lastSeenAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
