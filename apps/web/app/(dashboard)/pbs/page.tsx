import { redirect }      from 'next/navigation'
import { getDb, pbsDatastores, desc } from '@backupos/db'
import { getCurrentUser } from '@/lib/user'
import { Button }         from '@/components/ui/button'
import { DatastoreList }  from './client'

export const dynamic = 'force-dynamic'

export default async function PbsIndexPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/dashboard')

  const db   = getDb()
  const rows = await db
    .select()
    .from(pbsDatastores)
    .orderBy(desc(pbsDatastores.createdAt))

  const datastores = rows.map(r => ({
    id:              r.id,
    name:            r.name,
    path:            r.path,
    createdAt:       r.createdAt.toISOString(),
    pruneSchedule:   r.pruneSchedule,
    gcSchedule:      r.gcSchedule,
    lastGcAt:        r.lastGcAt?.toISOString() ?? null,
    totalSizeBytes:  r.totalSizeBytes,
    uniqueSizeBytes: r.uniqueSizeBytes,
  }))

  return (
    <div style={{ maxWidth: 700, padding: '32px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>PBS datastores</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/pbs/connect" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="sm">Connect to Proxmox</Button>
          </a>
          <a href="/pbs/tokens" style={{ textDecoration: 'none' }}>
            <Button variant="ghost" size="sm">Tokens</Button>
          </a>
          <a href="/pbs/datastores/new" style={{ textDecoration: 'none' }}>
            <Button variant="ghost" size="sm">New datastore</Button>
          </a>
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 28 }}>
        Datastores are storage locations for PBS-protocol backups. PVE clusters point at a specific
        datastore by name when configuring this server as a backup target.
      </p>
      <DatastoreList initialDatastores={datastores} />
    </div>
  )
}
