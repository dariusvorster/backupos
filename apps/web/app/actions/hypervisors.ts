'use server'

import { revalidatePath } from 'next/cache'
import { getDb, hypervisorIntegrations, hypervisorTargets, eq } from '@backupos/db'
import { ProxmoxHypervisorDriver, XCPNGHypervisorDriver, VMwareHypervisorDriver } from '@backupos/hypervisors'
import type { ProxmoxConfig, XCPNGConfig, VMwareConfig } from '@backupos/hypervisors'
import { requireAdmin } from '@/lib/user'

type DiscoverResult = { ok: boolean; count?: number; error?: string }

type TargetRow = {
  id: string
  integrationId: string
  externalId: string
  name: string
  type: string
  node: string | null
  status: string | null
  tags?: string | null
  lastSeenAt: Date
}

export async function discoverHypervisorTargets(integrationId: string): Promise<DiscoverResult> {
  await requireAdmin()
  const db = getDb()
  const [integration] = await db
    .select()
    .from(hypervisorIntegrations)
    .where(eq(hypervisorIntegrations.id, integrationId))
    .limit(1)

  if (!integration) return { ok: false, error: 'Integration not found' }

  let config: unknown
  try {
    config = JSON.parse(integration.config)
  } catch {
    return { ok: false, error: 'Invalid integration config' }
  }

  const now = new Date()
  let rows: TargetRow[]

  try {
    if (integration.type === 'proxmox') {
      const driver  = new ProxmoxHypervisorDriver(config as ProxmoxConfig)
      const targets = await driver.listTargets()
      rows = targets.map(p => ({
        id:           crypto.randomUUID(),
        integrationId,
        externalId:   String(p.vmid),
        name:         p.name,
        type:         p.type === 'qemu' ? 'proxmox_vm' : 'proxmox_lxc',
        node:         p.node,
        status:       p.status,
        tags:         JSON.stringify(p.tags ?? []),
        lastSeenAt:   now,
      }))
    } else if (integration.type === 'xcpng') {
      const driver  = new XCPNGHypervisorDriver(config as XCPNGConfig)
      const targets = await driver.listTargets()
      rows = targets.map(x => ({
        id:           crypto.randomUUID(),
        integrationId,
        externalId:   x.uuid,
        name:         x.name,
        type:         'xcpng_vm',
        node:         x.node,
        status:       x.status,
        lastSeenAt:   now,
      }))
    } else if (integration.type === 'vmware') {
      const driver  = new VMwareHypervisorDriver(config as VMwareConfig)
      const targets = await driver.listTargets()
      rows = targets.map(v => ({
        id:           crypto.randomUUID(),
        integrationId,
        externalId:   v.moRef,
        name:         v.name,
        type:         'vmware_vm',
        node:         v.datacenter,
        status:       v.status,
        lastSeenAt:   now,
      }))
    } else {
      return { ok: false, error: `No driver for type: ${integration.type}` }
    }
  } catch (err) {
    await db.update(hypervisorIntegrations)
      .set({ status: 'error' })
      .where(eq(hypervisorIntegrations.id, integrationId))
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  await db.delete(hypervisorTargets).where(eq(hypervisorTargets.integrationId, integrationId))
  if (rows.length > 0) {
    await db.insert(hypervisorTargets).values(rows)
  }

  await db.update(hypervisorIntegrations)
    .set({ status: 'ok' })
    .where(eq(hypervisorIntegrations.id, integrationId))

  revalidatePath('/hypervisors')
  return { ok: true, count: rows.length }
}
