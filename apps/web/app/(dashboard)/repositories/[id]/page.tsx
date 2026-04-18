import { getDb, repositories } from '@backupos/db'
import { eq } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'

function bytes(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export default async function RepoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db     = getDb()
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1)
  if (!repo) notFound()

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href="/repositories" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Repositories</Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>{repo.name}</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard label="Backend"    value={repo.backend} />
        <StatCard label="Total size" value={bytes(repo.sizeBytes)} />
        <StatCard label="Snapshots"  value={String(repo.snapshotCount ?? '—')} />
        <StatCard label="Last check" value={repo.lastCheckStatus ?? 'unchecked'} />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <Link href={`/repositories/${id}/snapshots`} style={{ textDecoration: 'none' }}>
          <Button variant="secondary" size="md">Browse snapshots</Button>
        </Link>
        <Button variant="secondary" size="md">Run check</Button>
      </div>
    </div>
  )
}
