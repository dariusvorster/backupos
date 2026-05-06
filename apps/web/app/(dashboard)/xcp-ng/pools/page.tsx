import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { getDb, xcpPools, desc } from '@backupos/db'
import { PoolList } from '../client'
import type { PoolRow } from '../client'

export const dynamic = 'force-dynamic'

export default async function XcpPoolsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/dashboard')

  const db = getDb()
  const rows = await db.select().from(xcpPools).orderBy(desc(xcpPools.createdAt))

  const pools: PoolRow[] = rows.map(p => ({
    id:             p.id,
    name:           p.name,
    poolMasterUrl:  p.poolMasterUrl,
    lastTestStatus: p.lastTestStatus ?? null,
    lastSeenAt:     p.lastSeenAt ? p.lastSeenAt.toISOString() : null,
  }))

  return (
    <div style={{ padding: '32px 24px', maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>XCP-ng Pools</h1>
        <a
          href="/xcp-ng/connect"
          style={{
            padding: '8px 14px', fontSize: 13, fontWeight: 500,
            borderRadius: 'var(--radius-sm)', border: 'none',
            backgroundColor: 'var(--accent)', color: '#fff',
            textDecoration: 'none',
          }}
        >
          Add pool
        </a>
      </div>
      <PoolList initialPools={pools} />
    </div>
  )
}
