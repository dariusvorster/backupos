import type { ComponentProps } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDb, backupRuns, eq } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/ui/stat-card'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function fmtDuration(s: number | null): string {
  if (s == null) return '—'
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function fmtBytes(b: number | null): string {
  if (b == null) return '—'
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

export default async function RunDetailPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params
  const db            = getDb()
  const [run]         = await db.select().from(backupRuns).where(eq(backupRuns.id, runId)).limit(1)
  if (!run) notFound()

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link href={`/jobs/${id}`} style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Job</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-mono)' }}>
            Run {run.id.slice(0, 8)}
          </h1>
          <Badge status={run.status as BadgeStatus} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard label="Duration"   value={fmtDuration(run.duration)} />
        <StatCard label="Data added" value={fmtBytes(run.dataAdded)} />
        <StatCard label="Total size" value={fmtBytes(run.totalSize)} />
        <StatCard label="Files new"        value={run.filesNew        ?? '—'} />
        <StatCard label="Files changed"    value={run.filesChanged    ?? '—'} />
        <StatCard label="Files unmodified" value={run.filesUnmodified ?? '—'} />
      </div>

      {run.errorMessage && (
        <div style={{
          backgroundColor: 'var(--err-dim)', border: '1px solid var(--err)',
          borderRadius: 'var(--radius)', padding: 16, marginBottom: 24,
          fontSize: 13, color: 'var(--err)', fontFamily: 'var(--font-mono)',
        }}>
          {run.errorMessage}
        </div>
      )}

      {run.snapshotId && (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 16,
          fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)',
        }}>
          Snapshot ID: <span style={{ color: 'var(--fg)' }}>{run.snapshotId}</span>
        </div>
      )}
    </div>
  )
}
