'use server'

import { revalidatePath } from 'next/cache'
import { getDb, hypervisorIntegrations, hypervisorTargets, eq } from '@backupos/db'
import { ProxmoxHypervisorDriver, VMwareHypervisorDriver } from '@backupos/hypervisors'
import type { ProxmoxConfig, VMwareConfig } from '@backupos/hypervisors'
import { requireAdminAction } from '@/lib/user'

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
  await requireAdminAction()
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
      const cfg = config as { host: string; username: string; password: string; cert_fingerprint_sha256?: string }
      const xcpURL = process.env.BACKUPOS_XCP_URL
      if (!xcpURL) throw new Error('BACKUPOS_XCP_URL not configured')
      const secret = process.env.BACKUPOS_INTERNAL_SECRET
      if (!secret) throw new Error('BACKUPOS_INTERNAL_SECRET not configured')
      const res = await fetch(`${xcpURL}/internal/inventory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secret}`,
        },
        body: JSON.stringify({
          pool_master_url:          cfg.host,
          username:                 cfg.username,
          password:                 cfg.password,
          cert_fingerprint_sha256:  cfg.cert_fingerprint_sha256 ?? '',
        }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'unknown error' })) as { error?: string }
        throw new Error(errBody.error ?? `XCP inventory HTTP ${res.status}`)
      }
      type XCPDisk = { uuid: string; name_label: string; virtual_size: number; type: string; cbt_enabled: boolean; user_device: string; bootable: boolean }
      type XCPVM  = { uuid: string; name_label: string; power_state: string; is_template: boolean; is_control_domain: boolean; disks: XCPDisk[] }
      const inv = await res.json() as { pool_uuid: string; pool_name: string; host_count: number; vms: XCPVM[] }
      rows = inv.vms
        .filter(vm => !vm.is_template && !vm.is_control_domain)
        .map(vm => ({
          id:           crypto.randomUUID(),
          integrationId,
          externalId:   vm.uuid,
          name:         vm.name_label,
          type:         'xcpng_vm',
          node:         inv.pool_name,
          status:       vm.power_state.toLowerCase(),
          tags:         JSON.stringify({ disks: vm.disks }),
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
    .set({ status: 'ok', lastSyncedAt: new Date() })
    .where(eq(hypervisorIntegrations.id, integrationId))

  revalidatePath('/hypervisors')
  return { ok: true, count: rows.length }
}

export async function updateHypervisorIntegration(
  id: string,
  formData: FormData,
): Promise<{ error: string } | undefined> {
  await requireAdminAction()

  const name            = String(formData.get('name') ?? '').trim()
  const host            = String(formData.get('host') ?? '').trim()
  const username        = String(formData.get('username') ?? '').trim()
  const password        = String(formData.get('password') ?? '').trim()
  const port            = formData.get('port') ? Number(formData.get('port')) : undefined
  const certFingerprint = String(formData.get('cert_fingerprint_sha256') ?? '').trim()

  if (!name || !host) return { error: 'name and host required' }

  const db = getDb()
  const [existing] = await db
    .select()
    .from(hypervisorIntegrations)
    .where(eq(hypervisorIntegrations.id, id))
    .limit(1)

  if (!existing) return { error: 'integration not found' }

  // Preserve existing password if the form left it blank (security: don't require
  // re-entering the password just to update the host or username).
  let nextPassword = password
  if (!nextPassword) {
    try {
      const cfg = JSON.parse(existing.config) as { password?: string }
      nextPassword = cfg.password ?? ''
    } catch {
      nextPassword = ''
    }
  }

  await db.update(hypervisorIntegrations)
    .set({
      name,
      config: JSON.stringify({
        host,
        username,
        password: nextPassword,
        port,
        cert_fingerprint_sha256: certFingerprint,
      }),
      // Reset status — the user may have just rotated credentials, so let
      // the next sync reflect reality rather than carrying over a stale 'ok'.
      status: 'unknown',
    })
    .where(eq(hypervisorIntegrations.id, id))

  revalidatePath('/hypervisors')
  return undefined
}

export async function deleteHypervisorIntegration(
  id: string,
): Promise<{ error: string } | undefined> {
  await requireAdminAction()

  const db = getDb()

  // Cascade: remove all hypervisor_targets pointing at this integration first
  // (the schema has no foreign-key cascade — this is application-level).
  await db.delete(hypervisorTargets).where(eq(hypervisorTargets.integrationId, id))
  await db.delete(hypervisorIntegrations).where(eq(hypervisorIntegrations.id, id))

  revalidatePath('/hypervisors')
  return undefined
}
