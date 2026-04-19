import type { ComponentProps } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDb, backupJobs, backupRuns, bandwidthProfiles, eq, desc } from '@backupos/db'
import { Badge } from '@/components/ui/badge'
import { setJobProfile } from '@/app/actions/bandwidth'
import { fmtLimit } from '@/lib/bandwidth'
import { PreflightButton } from '@/components/preflight-modal'
import { togglePreflight } from '@/app/actions/preflight'

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

  const profiles = await db.select().from(bandwidthProfiles).all()
  const boundSetJobProfile = setJobProfile.bind(null, job.id)

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
      <div style={{ marginBottom: 24 }}>
        <Link href="/jobs" style={{ fontSize: 13, color: 'var(--fg-mute)', textDecoration: 'none' }}>← Jobs</Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginTop: 8 }}>{job.name}</h1>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <PreflightButton jobId={job.id} jobName={job.name} />
        <button
          style={{
            padding: '6px 16px', fontSize: 13, cursor: 'pointer',
            borderRadius: 'var(--radius-sm)', border: 'none',
            background: 'var(--accent)', color: '#fff',
          }}
        >
          Run now
        </button>
      </div>

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
          <div style={{ fontSize: 14, color: 'var(--fg)', fontFamily: 'var(--font-mono)' }}>{job.schedule}</div>
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
      {(() => {
        const boundToggle = togglePreflight.bind(null, job.id)
        return (
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
            <form action={boundToggle}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  name="preflightEnabled"
                  defaultChecked={job.preflightEnabled ?? true}
                  onChange={e => (e.currentTarget.form as HTMLFormElement).requestSubmit()}
                />
                <span style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
                  {(job.preflightEnabled ?? true) ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </form>
          </div>
        )
      })()}

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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
