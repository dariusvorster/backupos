import { getDb, hypervisorIntegrations, hypervisorTargets } from '@backupos/db'
import { eq } from '@backupos/db'

export default async function HypervisorsPage() {
  const db           = getDb()
  const integrations = await db.select().from(hypervisorIntegrations).all()
  const targets      = await db.select().from(hypervisorTargets).all()

  const targetsByIntegration = targets.reduce<Record<string, typeof targets>>((acc, t) => {
    const key = t.integrationId ?? ''
    acc[key] = acc[key] ?? []
    acc[key].push(t)
    return acc
  }, {})

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>Hypervisors</h1>
        <button style={{
          padding: '8px 16px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
          borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
        }}>
          Add hypervisor
        </button>
      </div>

      {integrations.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 60, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13,
        }}>
          No hypervisors configured. Add a Proxmox, XCP-ng, or VMware integration.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {integrations.map(integration => {
            const vmList = targetsByIntegration[integration.id] ?? []
            return (
              <div key={integration.id} style={{
                backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '16px 20px', borderBottom: vmList.length > 0 ? '1px solid var(--border2)' : 'none',
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{integration.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                      {integration.type} · {vmList.length} VMs/LXCs
                    </div>
                  </div>
                  <span style={{
                    padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                    backgroundColor: integration.status === 'ok' ? 'var(--ok-dim)' : 'var(--surf2)',
                    color: integration.status === 'ok' ? 'var(--ok)' : 'var(--fg-mute)',
                  }}>
                    {integration.status ?? 'unknown'}
                  </span>
                </div>

                {vmList.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        <th style={{ padding: '8px 20px', textAlign: 'left', fontWeight: 500 }}>VM / LXC</th>
                        <th style={{ padding: '8px 20px', textAlign: 'left', fontWeight: 500 }}>Type</th>
                        <th style={{ padding: '8px 20px', textAlign: 'left', fontWeight: 500 }}>Node</th>
                        <th style={{ padding: '8px 20px', textAlign: 'left', fontWeight: 500 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vmList.map(vm => (
                        <tr key={vm.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 20px', fontSize: 13, color: 'var(--fg)' }}>
                            {vm.name}
                            <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', marginLeft: 8 }}>
                              #{vm.externalId}
                            </span>
                          </td>
                          <td style={{ padding: '10px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                            {vm.type}
                          </td>
                          <td style={{ padding: '10px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                            {vm.node ?? '—'}
                          </td>
                          <td style={{ padding: '10px 20px' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                              backgroundColor: vm.status === 'running' ? 'var(--ok-dim)' : 'var(--surf2)',
                              color: vm.status === 'running' ? 'var(--ok)' : 'var(--fg-mute)',
                            }}>
                              {vm.status ?? 'unknown'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
