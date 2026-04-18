import { getDb, repositories } from '@backupos/db'
import { eq } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'

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
        {[
          { label: 'Backend',        value: repo.backend },
          { label: 'Total size',     value: bytes(repo.sizeBytes), mono: true },
          { label: 'Snapshots',      value: repo.snapshotCount ?? '—', mono: true },
          { label: 'Last check',     value: repo.lastCheckStatus ?? 'unchecked' },
        ].map(f => (
          <div key={f.label} style={{
            backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '16px 20px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>{f.label}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', fontFamily: f.mono ? 'var(--font-mono)' : undefined }}>
              {String(f.value)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <Link href={`/repositories/${id}/snapshots`} style={{
          padding: '8px 16px', backgroundColor: 'var(--surf2)', color: 'var(--fg)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          fontSize: 13, fontWeight: 500, textDecoration: 'none',
        }}>
          Browse snapshots
        </Link>
        <button style={{
          padding: '8px 16px', backgroundColor: 'var(--surf2)', color: 'var(--fg)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>
          Run check
        </button>
      </div>
    </div>
  )
}
