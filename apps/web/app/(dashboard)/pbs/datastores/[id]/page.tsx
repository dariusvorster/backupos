import { redirect, notFound } from 'next/navigation'
import { getDb, pbsDatastores, eq } from '@backupos/db'
import { getCurrentUser } from '@/lib/user'
import { EditScheduleForm } from './EditScheduleForm'
import { StatsRefreshButton } from './StatsRefreshButton'
import { TriggerGcButton } from './TriggerGcButton'
import { DangerZone } from './DangerZone'

export const dynamic = 'force-dynamic'

function bytesToHuman(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB', 'PB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}

export default async function PbsDatastoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/dashboard')

  const { id } = await params
  const db = getDb()
  const [ds] = await db.select().from(pbsDatastores).where(eq(pbsDatastores.id, id)).limit(1)
  if (!ds) notFound()

  return (
    <div style={{ maxWidth: 800, padding: '32px 0' }}>
      <a href="/pbs" style={{ display: 'inline-block', fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>
        ← Back to datastores
      </a>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', marginBottom: 4 }}>
        <code style={{ fontSize: 22 }}>{ds.name}</code>
      </h1>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 28 }}>
        <code style={{ fontSize: 12 }}>{ds.path}</code>
      </p>

      {/* Stats panel */}
      <section style={{ marginBottom: 32, padding: 20, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>Storage</h2>
          <StatsRefreshButton id={ds.id} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <Stat label="Total"  value={bytesToHuman(ds.totalSizeBytes)}  />
          <Stat label="Used"   value={bytesToHuman(ds.uniqueSizeBytes)} />
          <Stat label="Chunks" value={ds.chunkCount?.toLocaleString() ?? '—'} />
        </div>
      </section>

      {/* Schedules panel */}
      <section style={{ marginBottom: 32, padding: 20, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginTop: 0, marginBottom: 16 }}>Schedules</h2>
        <EditScheduleForm
          id={ds.id}
          initialPruneSchedule={ds.pruneSchedule ?? ''}
          initialGcSchedule={ds.gcSchedule ?? ''}
        />
      </section>

      {/* Garbage collection panel */}
      <section style={{ marginBottom: 32, padding: 20, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>Garbage collection</h2>
          <TriggerGcButton id={ds.id} />
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>
          Last run: {ds.lastGcAt ? new Date(ds.lastGcAt).toLocaleString() : '—'}
        </p>
      </section>

      {/* Danger zone */}
      <DangerZone id={ds.id} name={ds.name} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)', marginTop: 4 }}>{value}</div>
    </div>
  )
}
