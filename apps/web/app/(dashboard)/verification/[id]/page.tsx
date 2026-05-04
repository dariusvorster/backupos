import type { ComponentProps } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDb, verificationTests, verificationRuns, backupJobs, eq, desc } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RunVerificationButton } from './run-verification-button'
import { DeleteTestButton } from './DeleteTestButton'
import { PollWrapper } from '@/components/poll-wrapper'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function resultBadge(r: string | null): BadgeStatus {
  if (r === 'passed') return 'success'
  if (r === 'failed') return 'error'
  if (r === 'running') return 'running'
  return 'idle'
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

function fmtDuration(start: Date | null, end: Date | null): string {
  if (!start || !end) return '—'
  const s = Math.round((end.getTime() - start.getTime()) / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function PassFailChart({ runs }: { runs: { status: string }[] }) {
  if (runs.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '12px 0' }}>No runs yet</div>
    )
  }
  const last30 = runs.slice(-30)
  const barW = 10
  const gap  = 3
  const W    = last30.length * (barW + gap) - gap
  const H    = 36
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {last30.map((run, i) => (
        <rect
          key={i}
          x={i * (barW + gap)}
          y={0}
          width={barW}
          height={H}
          rx={2}
          fill={
            run.status === 'passed'  ? 'var(--ok)'     :
            run.status === 'failed'  ? 'var(--err)'    :
            run.status === 'running' ? 'var(--accent)' :
            'var(--surf2)'
          }
        />
      ))}
    </svg>
  )
}

export default async function VerificationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()

  const [test] = await db
    .select({
      id:             verificationTests.id,
      name:           verificationTests.name,
      jobId:          verificationTests.jobId,
      jobName:        backupJobs.name,
      targetType:     verificationTests.targetType,
      validationHook: verificationTests.validationHook,
      schedule:       verificationTests.schedule,
      enabled:        verificationTests.enabled,
      lastResult:     verificationTests.lastResult,
      lastRunAt:      verificationTests.lastRunAt,
      nextRunAt:      verificationTests.nextRunAt,
    })
    .from(verificationTests)
    .leftJoin(backupJobs, eq(verificationTests.jobId, backupJobs.id))
    .where(eq(verificationTests.id, id))
    .limit(1)

  if (!test) notFound()

  const runs = await db
    .select()
    .from(verificationRuns)
    .where(eq(verificationRuns.testId, id))
    .orderBy(desc(verificationRuns.startedAt))
    .all()

  const hasRunning = runs.some(r => r.status === 'running')

  const infoRow: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', padding: '10px 0',
    borderBottom: '1px solid var(--border)', fontSize: 13,
  }

  return (
    <div>
      <PollWrapper initialStatus={hasRunning ? 'running' : 'idle'} />
      <div style={{ marginBottom: 24 }}>
        <Link href="/verification" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>
          ← Verification
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)' }}>{test.name}</h1>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href={`/verification/${id}/edit`} style={{ textDecoration: 'none' }}>
              <Button variant="ghost" size="md">Edit</Button>
            </Link>
            <DeleteTestButton id={id} name={test.name} />
            <RunVerificationButton testId={id} />
          </div>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
          <Badge status={resultBadge(test.lastResult)} label={test.lastResult ?? 'never run'} />
          <Badge status={test.enabled ? 'healthy' : 'paused'} label={test.enabled ? 'Enabled' : 'Disabled'} />
        </div>
      </div>

      {/* Config card */}
      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0 20px', marginBottom: 24 }}>
        <div style={infoRow}>
          <span style={{ color: 'var(--fg-mute)' }}>Job</span>
          <span style={{ color: 'var(--fg)' }}>{test.jobName ?? '—'}</span>
        </div>
        <div style={infoRow}>
          <span style={{ color: 'var(--fg-mute)' }}>Target type</span>
          <span style={{ color: 'var(--fg)' }}>{test.targetType.replace(/_/g, ' ')}</span>
        </div>
        <div style={infoRow}>
          <span style={{ color: 'var(--fg-mute)' }}>Validation hook</span>
          <code style={{ color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {test.validationHook ?? 'none'}
          </code>
        </div>
        <div style={infoRow}>
          <span style={{ color: 'var(--fg-mute)' }}>Schedule</span>
          <code style={{ color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {test.schedule ?? '—'}
          </code>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: 13 }}>
          <span style={{ color: 'var(--fg-mute)' }}>Next run</span>
          <span style={{ color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {fmtDate(test.nextRunAt)}
          </span>
        </div>
      </div>

      {/* Pass/fail chart */}
      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
          Pass / fail history (last {Math.min(runs.length, 30)} runs)
        </div>
        <PassFailChart runs={[...runs].reverse()} />
        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
          {[
            { color: 'var(--ok)',  label: 'Passed' },
            { color: 'var(--err)', label: 'Failed' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fg-mute)' }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Run history */}
      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500, color: 'var(--fg)' }}>
          Run history
        </div>
        {runs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            No runs yet. Click &ldquo;Run now&rdquo; to trigger the first verification.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border2)' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Started</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Duration</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500 }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr key={run.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {fmtDate(run.startedAt)}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <Badge status={resultBadge(run.status)} />
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    {fmtDuration(run.startedAt, run.completedAt)}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)' }}>
                    {run.errorMessage ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
