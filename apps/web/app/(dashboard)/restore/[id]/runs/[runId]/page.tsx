import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getDb, restoreRuns, restoreSpecs } from '@backupos/db'
import { eq } from '@backupos/db'
import { PollWrapper } from '@/components/poll-wrapper'

interface StepResult {
  step: { name: string; type: string }
  success: boolean
  output?: string
  error?: string
  durationMs: number
}

function safeParseSteps(raw: string | null | undefined): StepResult[] {
  if (!raw) return []
  try { return JSON.parse(raw) as StepResult[] } catch { return [] }
}

const STATUS_COLORS: Record<string, string> = {
  running: 'var(--accent)',
  success: 'var(--ok)',
  failed:  'var(--err)',
}

export default async function RestoreRunDetailPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>
}) {
  const { id, runId } = await params
  const db = getDb()

  const [run] = await db.select().from(restoreRuns).where(eq(restoreRuns.id, runId)).limit(1)
  if (!run) notFound()

  const [spec] = await db.select().from(restoreSpecs).where(eq(restoreSpecs.id, id)).limit(1)

  const steps = safeParseSteps(run.log)
  const statusColor = STATUS_COLORS[run.status] ?? 'var(--fg-mute)'

  const durationMs =
    run.completedAt && run.startedAt
      ? run.completedAt.getTime() - run.startedAt.getTime()
      : null

  return (
    <div style={{ maxWidth: 900 }}>
      {run.status === 'running' && <PollWrapper initialStatus="running" />}

      {/* Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link
          href={`/restore/${id}/runs`}
          style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}
        >
          ← {spec?.name ?? id} / Run history
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
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
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-dim)' }}>
          {run.startedAt?.toISOString().slice(0, 16).replace('T', ' ')}
          {durationMs != null ? ` · ${(durationMs / 1000).toFixed(1)}s` : ''}
          {run.snapshotId ? ` · ${run.snapshotId.slice(0, 8)}` : ''}
        </span>
      </div>

      {/* Steps */}
      <div style={{
        backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid var(--border)',
          fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          Steps
        </div>

        {run.status === 'running' && steps.length === 0 ? (
          <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--fg-mute)' }}>
            Restore in progress…
          </div>
        ) : steps.length === 0 ? (
          <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--fg-mute)' }}>
            No log available
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {steps.map((s, i) => {
              const outputColor = s.success ? 'var(--fg-mute)' : 'var(--err)'
              return (
                <div
                  key={i}
                  style={{
                    borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                    padding: '10px 16px',
                    backgroundColor: s.success
                      ? 'color-mix(in srgb, var(--surf) 95%, var(--ok) 5%)'
                      : 'color-mix(in srgb, var(--surf) 93%, var(--err) 7%)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: s.success ? 'var(--ok)' : 'var(--err)', fontWeight: 500 }}>
                      {s.success ? '✓' : '✗'} {s.step.name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                      {(s.durationMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                  {(s.output || s.error) && (
                    <pre style={{
                      margin: '6px 0 0 0', fontSize: 11, fontFamily: 'var(--font-mono)',
                      color: outputColor, lineHeight: 1.5,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                    }}>
                      {s.error ?? s.output}
                    </pre>
                  )}
                </div>
              )
            })}
            {run.status === 'running' && (
              <div style={{
                borderTop: '1px solid var(--border)', padding: '10px 16px',
                fontSize: 12, color: 'var(--accent)',
              }}>
                Running…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
