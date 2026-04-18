import { getDb, backupRuns } from '@backupos/db'
import { eq } from '@backupos/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export default async function RunDetailPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params
  const db            = getDb()
  const [run]         = await db.select().from(backupRuns).where(eq(backupRuns.id, runId)).limit(1)
  if (!run) notFound()

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/jobs/${id}`} style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Job</Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
          Run {run.id.slice(0, 8)}
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Status',    value: run.status },
          { label: 'Duration',  value: run.duration != null ? `${run.duration}s` : '—', mono: true },
          { label: 'Data added', value: run.dataAdded != null ? `${(run.dataAdded / 1024 / 1024).toFixed(1)} MB` : '—', mono: true },
          { label: 'Files new',       value: run.filesNew        ?? '—', mono: true },
          { label: 'Files changed',   value: run.filesChanged    ?? '—', mono: true },
          { label: 'Files unmodified', value: run.filesUnmodified ?? '—', mono: true },
        ].map(f => (
          <div key={f.label} style={{
            backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '16px 20px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>{f.label}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', fontFamily: f.mono ? 'var(--font-mono)' : undefined }}>
              {f.value}
            </div>
          </div>
        ))}
      </div>

      {run.errorMessage && (
        <div style={{
          backgroundColor: 'var(--err-dim)', border: '1px solid var(--err)', borderRadius: 'var(--radius)',
          padding: 16, marginBottom: 24, fontSize: 13, color: 'var(--err)', fontFamily: 'var(--font-mono)',
        }}>
          {run.errorMessage}
        </div>
      )}

      {run.snapshotId && (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16,
          fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)',
        }}>
          Snapshot ID: <span style={{ color: 'var(--fg)' }}>{run.snapshotId}</span>
        </div>
      )}
    </div>
  )
}
