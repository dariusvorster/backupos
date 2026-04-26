import type { ComponentProps } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDb, backupJobs, backupRuns, bandwidthProfiles, eq, desc } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import { AutoRefresh } from '@/components/ui/auto-refresh'
import { getLogsPage } from '@/app/actions/logs'
import { setJobProfile } from '@/app/actions/bandwidth'
import { fmtLimit } from '@/lib/bandwidth'
import { PreflightButton } from '@/components/preflight-modal'
import { togglePreflight } from '@/app/actions/preflight'
import { PreflightToggle } from '@/components/preflight-toggle'
import { triggerJob, saveJobRetention, cancelJob, retryRun } from '@/app/actions/jobs'
import { validateCron } from '@/lib/cron-validate'

type BadgeStatus = ComponentProps<typeof Badge>['status']

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

function fmtBytes(b: number | null): string {
  if (b == null) return '—'
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db     = getDb()
  const [job]  = await db.select().from(backupJobs).where(eq(backupJobs.id, id)).limit(1)
  if (!job) notFound()

  const runs = await db
    .select()
    .from(backupRuns)
    .where(eq(backupRuns.jobId, id))
    .orderBy(desc(backupRuns.startedAt))
    .limit(20)
    .all()

  const profiles    = await db.select().from(bandwidthProfiles).all()
  const recentLogs  = await getLogsPage({ entityType: 'job', entityId: id }, 50)
  const boundSetJobProfile  = setJobProfile.bind(null, job.id)
  const boundTrigger        = triggerJob.bind(null, job.id)
  const boundSaveRetention  = saveJobRetention.bind(null, job.id)
  const boundRetry          = retryRun.bind(null, job.id)

  const activeRun = runs.find(r => r.status === 'running')

  const fieldStyle: React.CSSProperties = {
    backgroundColor: 'var(--surf)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '16px 20px',
  }
  const th: React.CSSProperties = {
    padding: '10px 20px', textAlign: 'left', fontWeight: 500,
    fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
  }

  return (
    <div>
      <AutoRefresh intervalMs={10_000} />
      <div style={{ marginBottom: 24 }}>
        <Link href="/jobs" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Jobs</Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>{job.name}</h1>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <PreflightButton jobId={job.id} jobName={job.name} />
        <form action={boundTrigger}>
          <button
            type="submit"
            disabled={!!activeRun}
            style={{
              padding: '6px 16px', fontSize: 13, cursor: activeRun ? 'not-allowed' : 'pointer',
              borderRadius: 'var(--radius-sm)', border: 'none',
              background: activeRun ? 'var(--surf2)' : 'var(--accent)',
              color: activeRun ? 'var(--fg-mute)' : '#fff',
            }}
          >
            Run now
          </button>
        </form>
        {activeRun && (
          <form action={cancelJob.bind(null, job.id)}>
            <button
              type="submit"
              style={{
                padding: '6px 16px', fontSize: 13, cursor: 'pointer',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--err)',
                background: 'transparent', color: 'var(--err)',
              }}
            >
              Stop run
            </button>
          </form>
        )}
        <Link
          href={`/jobs/${id}/edit`}
          style={{
            padding: '6px 16px', fontSize: 13,
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            color: 'var(--fg)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
          }}
        >
          Edit
        </Link>
      </div>

      {/* Live run banner */}
      {activeRun && (
        <Link
          href={`/jobs/${id}/runs/${activeRun.id}`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
            borderRadius: 'var(--radius)', padding: '12px 20px', marginBottom: 20,
            textDecoration: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--accent)',
              display: 'inline-block', animation: 'pulse 1.5s infinite',
            }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent)' }}>
              Backup in progress
            </span>
            <span style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
              · Started {activeRun.startedAt ? activeRun.startedAt.toISOString().slice(11, 19) : '—'}
            </span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--accent)' }}>View live logs →</span>
        </Link>
      )}

      {job.lastPreflightStatus && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 12, color: 'var(--fg-mute)' }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
            backgroundColor:
              job.lastPreflightStatus === 'ok'      ? 'var(--ok)'   :
              job.lastPreflightStatus === 'warning' ? 'var(--warn)' : 'var(--err)',
          }} />
          Last pre-flight: <strong style={{ color: 'var(--fg)' }}>{job.lastPreflightStatus}</strong>
          {job.lastPreflightAt && <span> · {job.lastPreflightAt.toLocaleDateString()}</span>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={fieldStyle}>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6 }}>Source type</div>
          <div style={{ fontSize: 14, color: 'var(--fg)' }}>{job.sourceType}</div>
        </div>
        <div style={fieldStyle}>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6 }}>Schedule</div>
          {(() => {
            const check = validateCron(job.schedule)
            return check.valid ? (
              <div style={{ fontSize: 14, color: 'var(--fg)', fontFamily: 'var(--font-mono)' }}>{job.schedule}</div>
            ) : (
              <div>
                <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--err)' }}>⚠ {job.schedule}</div>
                <div style={{ fontSize: 11, color: 'var(--err)', marginTop: 4 }}>{check.error} — <Link href={`/jobs/${id}/edit`} style={{ color: 'var(--err)' }}>Fix schedule</Link></div>
              </div>
            )
          })()}
        </div>
        <div style={fieldStyle}>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 8 }}>Status</div>
          <Badge status={job.enabled ? 'healthy' : 'paused'} label={job.enabled ? 'Enabled' : 'Disabled'} />
        </div>
        <div style={fieldStyle}>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6 }}>Last run</div>
          <div style={{ fontSize: 14, color: 'var(--fg)', fontFamily: 'var(--font-mono)' }}>{fmtDate(job.lastRunAt)}</div>
        </div>
      </div>

      <div style={{
        backgroundColor: 'var(--surf)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '18px 20px',
        marginBottom: 24,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 12 }}>
          Bandwidth profile
        </div>
        <form action={boundSetJobProfile} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            name="profileId"
            defaultValue={(job.bandwidthProfileId ?? '') as string}
            style={{
              padding: '6px 10px', fontSize: 13,
              backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--fg)', outline: 'none',
            }}
          >
            <option value="">Use global default</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}{p.isGlobal ? ' (global)' : ''}</option>
            ))}
          </select>
          <button type="submit" style={{
            padding: '6px 14px', fontSize: 13, cursor: 'pointer',
            borderRadius: 'var(--radius-sm)', border: 'none',
            background: 'var(--accent)', color: '#fff',
          }}>
            Save
          </button>
        </form>
        {profiles.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 8 }}>
            No profiles configured. <a href="/settings/bandwidth" style={{ color: 'var(--accent)' }}>Create one in settings.</a>
          </div>
        )}
      </div>

      {/* Auto-preflight toggle */}
      <div style={{
        backgroundColor: 'var(--surf)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '14px 20px',
        marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>
            Auto pre-flight before scheduled runs
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginTop: 2 }}>
            Runs checks 15 minutes before each scheduled backup. Fires an alert if any check fails.
          </div>
        </div>
        <PreflightToggle
          enabled={job.preflightEnabled ?? true}
          action={togglePreflight.bind(null, job.id)}
        />
      </div>

      {/* Retention policy */}
      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
          Retention policy
        </div>
        <form
          action={boundSaveRetention}
          style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}
        >
          {([ 'keepLast', 'keepDaily', 'keepWeekly', 'keepMonthly', 'keepYearly' ] as const).map(key => (
            <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--fg-mute)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {key.replace('keep', '')}
              </span>
              <input
                type="number"
                name={key}
                min={0}
                defaultValue={job[key] ?? ''}
                placeholder="default"
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--fg)',
                  fontSize: 13,
                  padding: '6px 10px',
                  width: '100%',
                }}
              />
            </label>
          ))}
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Leave blank to use global defaults</span>
            <button
              type="submit"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 16px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Save
            </button>
          </div>
        </form>
      </div>

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border2)', fontSize: 14, fontWeight: 500 }}>
          Run history
        </div>
        {runs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>No runs yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border2)' }}>
                <th style={th}>Status</th>
                <th style={th}>Started</th>
                <th style={{ ...th, textAlign: 'right' }}>Duration</th>
                <th style={{ ...th, textAlign: 'right' }}>Data added</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr
                  key={run.id}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  <td style={{ padding: '12px 20px' }}>
                    <Link href={`/jobs/${id}/runs/${run.id}`} style={{ display: 'flex', textDecoration: 'none' }}>
                      <Badge status={run.status as BadgeStatus} />
                    </Link>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)' }}>
                    <Link href={`/jobs/${id}/runs/${run.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {fmtDate(run.startedAt)}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtDuration(run.duration)}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--fg-mute)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtBytes(run.dataAdded)}
                  </td>
                  <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                    {run.status === 'running' ? (
                      <Link href={`/jobs/${id}/runs/${run.id}`} style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>
                        View logs →
                      </Link>
                    ) : (run.status === 'failed' || run.status === 'cancelled') ? (
                      <form action={boundRetry} style={{ display: 'inline' }}>
                        <button type="submit" style={{
                          fontSize: 11, padding: '3px 10px', cursor: 'pointer',
                          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                          background: 'var(--surf2)', color: 'var(--fg)',
                        }}>
                          Retry
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Operational logs */}
      <div style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)', marginBottom: 12 }}>Recent logs</h2>
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          {recentLogs.length === 0 ? (
            <div style={{ padding: '20px 24px', fontSize: 13, color: 'var(--fg-dim)' }}>
              No operational logs for this job yet.
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {recentLogs.map(entry => (
                <div key={entry.id} style={{ display: 'flex', gap: 12, padding: '6px 16px', borderBottom: '1px solid var(--border)', alignItems: 'baseline' }}>
                  <span style={{ color: 'var(--fg-dim)', flexShrink: 0, width: 152 }}>
                    {new Date(entry.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                  </span>
                  <span style={{
                    fontWeight: 600, width: 44, flexShrink: 0,
                    color: ({ debug: 'var(--fg-dim)', info: 'var(--ok)', warn: 'var(--warn)', error: 'var(--err)', fatal: 'var(--err)' } as Record<string,string>)[entry.level] ?? 'var(--fg)',
                  }}>
                    {entry.level.toUpperCase().slice(0, 4)}
                  </span>
                  <span style={{ color: 'var(--fg)', flex: 1 }}>{entry.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
