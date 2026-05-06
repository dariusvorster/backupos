import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { getDb, xcpVms, xcpPools, eq } from '@backupos/db'
import { VmList } from '../client'
import type { VmRow } from '../client'

export const dynamic = 'force-dynamic'

export default async function XcpVmsPage({
  searchParams,
}: {
  searchParams: Promise<{ pool?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/dashboard')

  const { pool: poolId } = await searchParams

  const db = getDb()

  // Fetch all VMs joined with pool name
  const rows = await db
    .select({
      uuid:         xcpVms.uuid,
      nameLabel:    xcpVms.nameLabel,
      poolName:     xcpPools.name,
      powerState:   xcpVms.powerState,
      isCbtCapable: xcpVms.isCbtCapable,
      lastSeenAt:   xcpVms.lastSeenAt,
    })
    .from(xcpVms)
    .innerJoin(xcpPools, eq(xcpVms.poolId, xcpPools.id))
    .where(poolId ? eq(xcpVms.poolId, poolId) : undefined)

  const vms: VmRow[] = rows.map(v => ({
    uuid:         v.uuid,
    nameLabel:    v.nameLabel,
    poolName:     v.poolName,
    powerState:   v.powerState,
    isCbtCapable: v.isCbtCapable ?? false,
    lastSeenAt:   v.lastSeenAt ? v.lastSeenAt.toISOString() : null,
  }))

  return (
    <div style={{ padding: '32px 24px', maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>XCP-ng VMs</h1>
        <a href="/xcp-ng/pools" style={{ fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none' }}>
          Manage pools
        </a>
      </div>
      <VmList vms={vms} />
    </div>
  )
}
