'use server'
import { requireAdmin } from '@/lib/user'
import { getDb, xcpPools, xcpVms, eq } from '@backupos/db'
import { XCPNGHypervisorDriver } from '@backupos/hypervisors'
import type { XCPNGConfig } from '@backupos/hypervisors'
import { encryptField, decryptField } from '@/lib/repo-crypto'

interface AddXcpPoolInput {
  name: string
  poolMasterUrl: string
  username: string
  password: string
  verifySsl?: boolean
  certFingerprint?: string
}

export async function addXcpPool(
  input: AddXcpPoolInput,
): Promise<{ ok: true; poolId: string } | { ok: false; error: string }> {
  await requireAdmin()
  const config: XCPNGConfig = {
    poolMasterUrl:   input.poolMasterUrl,
    username:        input.username,
    password:        input.password,
    verifySsl:       input.verifySsl ?? true,
    certFingerprint: input.certFingerprint,
  }
  const driver = new XCPNGHypervisorDriver(config)
  const result = await driver.test()
  if (!result.ok) return { ok: false, error: result.message ?? 'Connection test failed' }

  const db = getDb()
  const poolId = crypto.randomUUID()
  try {
    await db.insert(xcpPools).values({
      id:              poolId,
      name:            input.name,
      poolMasterUrl:   input.poolMasterUrl,
      username:        input.username,
      passwordEnc:     encryptField(input.password),
      verifySsl:       input.verifySsl ?? true,
      certFingerprint: input.certFingerprint ?? null,
      createdAt:       new Date(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('UNIQUE constraint failed: xcp_pools.pool_master_url')) {
      return { ok: false, error: 'A pool with this master URL is already registered' }
    }
    throw err
  }
  return { ok: true, poolId }
}

export async function refreshXcpPool(
  poolId: string,
): Promise<{ ok: true; vmCount: number } | { ok: false; error: string }> {
  await requireAdmin()
  const db = getDb()
  const [pool] = await db.select().from(xcpPools).where(eq(xcpPools.id, poolId)).limit(1)
  if (!pool) return { ok: false, error: 'Pool not found' }

  const password = decryptField(pool.passwordEnc)
  const driver = new XCPNGHypervisorDriver({
    poolMasterUrl:   pool.poolMasterUrl,
    username:        pool.username,
    password,
    verifySsl:       pool.verifySsl ?? true,
    certFingerprint: pool.certFingerprint ?? undefined,
  })

  try {
    const targets = await driver.listTargets()
    const now = new Date()
    for (const vm of targets) {
      await db
        .insert(xcpVms)
        .values({
          uuid:         vm.uuid,
          poolId,
          nameLabel:    vm.nameLabel,
          powerState:   vm.powerState,
          hostUuid:     vm.hostUuid,
          isCbtCapable: vm.isCbtCapable,
          vdiUuidsJson: '[]',
          lastSeenAt:   now,
        })
        .onConflictDoUpdate({
          target: xcpVms.uuid,
          set: {
            nameLabel:    vm.nameLabel,
            powerState:   vm.powerState,
            hostUuid:     vm.hostUuid,
            isCbtCapable: vm.isCbtCapable,
            lastSeenAt:   now,
          },
        })
    }
    await db
      .update(xcpPools)
      .set({ lastSeenAt: now, lastTestStatus: 'ok', lastTestError: null })
      .where(eq(xcpPools.id, poolId))
    return { ok: true, vmCount: targets.length }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await db
      .update(xcpPools)
      .set({ lastTestStatus: 'error', lastTestError: error })
      .where(eq(xcpPools.id, poolId))
    return { ok: false, error }
  }
}

export async function deleteXcpPool(
  poolId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin()
  const db = getDb()
  await db.delete(xcpPools).where(eq(xcpPools.id, poolId))
  return { ok: true }
}
