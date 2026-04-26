import { notFound }        from 'next/navigation'
import { getDb, backupRuns, backupJobs, eq } from '@backupos/db'
import { LogViewer }       from '@/components/log-viewer'
import { PhaseTimeline }   from '@/components/phase-timeline'
import { CopyCommandButton } from '@/components/copy-command-button'
import { AutoRefresh }     from '@/components/ui/auto-refresh'
import type { PhaseData }  from '@/app/actions/runs'

const STATUS_COLORS: Record<string, string> = {
  running:   'var(--accent)',
  success:   'var(--ok)',
  failed:    'var(--err)',
  cancelled: 'var(--fg-dim)',
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

function safeParsePhases(raw: string | null | undefined): PhaseData | null {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export default async function RunDetailPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id: jobId, runId } = await params
  const db = getDb()

  const [run] = await db.select().from(backupRuns).where(eq(backupRuns.id, runId)).limit(1)
  if (!run) notFound()

  const job = await db
    .select({ name: backupJobs.name })
    .from(backupJobs)
    .where(eq(backupJobs.id, jobId))
    .get()

  const phases  = safeParsePhases(run.phases)
  const totalMs = run.completedAt && run.startedAt
    ? run.completedAt.getTime() - run.startedAt.getTime()
    : 0

  const runDetail = {
    id:           run.id,
    status:       run.status,
    startedAt:    run.startedAt ?? null,
    completedAt:  run.completedAt ?? null,
    log:          run.log ?? null,
    phases,
    errorMessage: run.errorMessage ?? null,
    jobId,
    progressPct:  run.progressPct  ?? null,
    bytesDone:    run.bytesDone    ?? null,
    bytesTotal:   run.bytesTotal   ?? null,
    filesDone:    run.filesDone    ?? null,
    filesTotal:   run.filesTotal   ?? null,
  }

  const statusColor = STATUS_COLORS[run.status] ?? 'var(--fg-mute)'

  return (
    <div style={{ maxWidth: 900 }}>
      {run.status === 'running' && <AutoRefresh intervalMs={3000} />}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 2 }}>
            {job?.name ?? jobId}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
              Run {run.id.slice(0, 8)}
            </h1>
            <span style={{
              fontSize: 12, fontWeight: 500, padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: `color-mix(in srgb, transparent 85%, ${statusColor} 15%)`,
              color: statusColor,
              border: `1px solid color-mix(in srgb, transparent 70%, ${statusColor} 30%)`,
            }}>
              {run.status}
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <CopyCommandButton runId={run.id} />
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {([
          { label: 'Duration',   value: run.duration    != null ? fmtDuration(run.duration)                           : '—' },
          { label: 'Data added', value: run.dataAdded   != null ? `${(run.dataAdded   / 1_048_576).toFixed(1)} MB`      : '—' },
          { label: 'Total size', value: run.totalSize   != null ? `${(run.totalSize   / 1_073_741_824).toFixed(2)} GB`  : '—' },
          { label: 'Files new',  value: run.filesNew         != null ? String(run.filesNew)         : '—' },
          { label: 'Changed',    value: run.filesChanged     != null ? String(run.filesChanged)     : '—' },
          { label: 'Unmodified', value: run.filesUnmodified  != null ? String(run.filesUnmodified)  : '—' },
          ...(run.snapshotsRemoved != null || run.snapshotsKept != null ? [{
            label: 'Retention',
            value: `${run.snapshotsRemoved ?? 0} removed · ${run.snapshotsKept ?? 0} kept`,
          }] : []),
        ] as { label: string; value: string }[]).map(({ label, value }) => (
          <div key={label} style={{
            backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '10px 14px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Error */}
      {run.errorMessage && (
        <div style={{
          backgroundColor: 'color-mix(in srgb, var(--surf) 80%, var(--err) 10%)',
          border: '1px solid color-mix(in srgb, var(--border) 60%, var(--err) 40%)',
          borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: run.errorDetail ? 0 : 24,
          fontSize: 13, color: 'var(--err)',
        }}>
          <strong>Error:</strong> {run.errorMessage}
        </div>
      )}
      {run.errorDetail && (
        <pre style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderTop: run.errorMessage ? 'none' : undefined,
          borderRadius: run.errorMessage ? '0 0 var(--radius-sm) var(--radius-sm)' : 'var(--radius-sm)',
          padding: '10px 16px', marginBottom: 24, marginTop: 0,
          fontSize: 11, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflowX: 'auto',
        }}>
          {run.errorDetail}
        </pre>
      )}

      {/* Phase timeline */}
      {phases && totalMs > 0 && (run.status === 'success' || run.status === 'failed') && (
        <div style={{
          backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 12 }}>Phase timeline</div>
          <PhaseTimeline phases={phases} totalMs={totalMs} />
        </div>
      )}

      {/* Log viewer */}
      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 24,
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          Run log
        </div>
        <LogViewer initialRun={runDetail} />
      </div>

      {/* Snapshot ID footer */}
      {run.snapshotId && (
        <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
          Snapshot: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>{run.snapshotId}</code>
        </div>
      )}
    </div>
  )
}
