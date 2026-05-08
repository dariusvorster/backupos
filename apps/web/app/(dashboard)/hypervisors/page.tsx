import type { ComponentProps } from 'react'
import { getDb, hypervisorIntegrations, hypervisorTargets } from '@backupos/db'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SyncButton } from './sync-button'
import { DeleteHypervisorButton } from './delete-button'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function integrationBadge(s: string | null): BadgeStatus {
  if (s === 'ok') return 'healthy'
  return 'idle'
}

function vmBadge(s: string | null): BadgeStatus {
  if (s === 'running') return 'healthy'
  return 'idle'
}

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
        <Link href="/hypervisors/new" style={{ textDecoration: 'none' }}>
          <Button variant="primary" size="md">Add hypervisor</Button>
        </Link>
      </div>

      {integrations.length === 0 ? (
        <EmptyState
          type="page"
          headline="No hypervisors configured"
          description="Add a Proxmox, XCP-ng, or VMware integration."
        />
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Badge status={integrationBadge(integration.status)} label={integration.status ?? 'unknown'} />
                    <SyncButton integrationId={integration.id} />
                    <Link href={`/hypervisors/${integration.id}/edit`} style={{ textDecoration: 'none' }}>
                      <Button variant="secondary" size="sm">Edit</Button>
                    </Link>
                    <DeleteHypervisorButton
                      integrationId={integration.id}
                      integrationName={integration.name}
                      targetCount={vmList.length}
                    />
                  </div>
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
                            <Badge status={vmBadge(vm.status)} label={vm.status ?? 'unknown'} />
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
