import Link from 'next/link'
import { getDb, backupRuns, backupJobs, alerts, eq, desc, gte, and } from '@backupos/db'
import { PageHeader } from '@/components/ui/page-header'
import { AutoRefresh } from '@/components/ui/auto-refresh'

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

function fmtIn(d: Date): string {
  const ms = d.getTime() - Date.now()
  if (ms < 60_000) return 'soon'
  if (ms < 3_600_000) return `in ${Math.floor(ms / 60_000)}m`
  if (ms < 86_400_000) return `in ${Math.floor(ms / 3_600_000)}h`
  return `in ${Math.floor(ms / 86_400_000)}d`
}


const STATUS_COLOR: Record<string, string> = {
  success: 'var(--ok)',
  running: 'var(--accent)',
  failed:  'var(--err)',
  error:   'var(--err)',
  warning: 'var(--warn)',
  open:    'var(--warn)',
}

const STATUS_DOT = (status: string) => (
  <span style={{
    display: 'inline-block', width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
    backgroundColor: STATUS_COLOR[status] ?? 'var(--fg-dim)',
  }} />
)

type FeedItem = {
  key:     string
  date:    Date
  kind:    'run' | 'alert'
  status:  string
  title:   string
  href?:   string
}

export default async function ActivityPage() {
  const db = getDb()

  const [runs, fired, upcoming] = await Promise.all([
    db
      .select({
        id:        backupRuns.id,
        jobId:     backupRuns.jobId,
        jobName:   backupJobs.name,
        status:    backupRuns.status,
        trigger:   backupRuns.trigger,
        startedAt: backupRuns.startedAt,
        runType:   backupRuns.runType,
      })
      .from(backupRuns)
      .leftJoin(backupJobs, eq(backupRuns.jobId, backupJobs.id))
      .orderBy(desc(backupRuns.startedAt))
      .limit(75)
      .all(),

    db
      .select()
      .from(alerts)
      .orderBy(desc(alerts.firedAt))
      .limit(75)
      .all(),

    db
      .select({
        id:         backupJobs.id,
        name:       backupJobs.name,
        nextRunAt:  backupJobs.nextRunAt,
        sourceType: backupJobs.sourceType,
      })
      .from(backupJobs)
      .where(and(
        eq(backupJobs.enabled, true),
        gte(backupJobs.nextRunAt, new Date()),
      ))
      .orderBy(backupJobs.nextRunAt)
      .limit(10)
      .all(),
  ])

  const feed: FeedItem[] = [
    ...runs.map(r => ({
      key:    `run-${r.id}`,
      date:   r.startedAt,
      kind:   'run' as const,
      status: r.status,
      title:  `${r.runType === 'restore' ? 'Restore' : 'Backup'} run ${r.status} — ${r.jobName ?? 'unknown job'}${r.trigger === 'manual' ? ' (manual)' : ''}`,
      href:   r.jobId ? `/jobs/${r.jobId}` : undefined,
    })),
    ...fired.map(a => ({
      key:    `alert-${a.id}`,
      date:   a.firedAt,
      kind:   'alert' as const,
      status: a.severity ?? 'warning',
      title:  a.message,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 100)

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recent = feed.filter(f => f.date >= thirtyDaysAgo)

  return (
    <div>
      <AutoRefresh intervalMs={10_000} />
      <PageHeader title="Activity" description="Backup and restore activity from the last 30 days, plus upcoming scheduled jobs." />

      <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {recent.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            No activity in the last 30 days. Run a backup job to see events here.
          </div>
        ) : (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {recent.map((item, i) => (
              <div
                key={item.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 20px',
                  borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                }}
              >
                {STATUS_DOT(item.status)}
                <span style={{ color: 'var(--fg-dim)', flexShrink: 0, width: 130 }}>
                  {fmtDate(item.date)}
                </span>
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 10, flexShrink: 0,
                  border: '1px solid var(--border)',
                  color:  item.kind === 'alert' ? 'var(--warn)' : 'var(--fg-dim)',
                  backgroundColor: 'var(--surf2)',
                }}>
                  {item.kind}
                </span>
                {item.href ? (
                  <Link href={item.href} style={{ color: 'var(--fg)', textDecoration: 'none', flex: 1 }}>
                    {item.title}
                  </Link>
                ) : (
                  <span style={{ color: 'var(--fg)', flex: 1 }}>{item.title}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming scheduled jobs */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>Upcoming</div>
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          {upcoming.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
              No scheduled jobs queued.
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {upcoming.map((job, i) => (
                <div
                  key={job.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 20px',
                    borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <span style={{
                    display: 'inline-block', width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    backgroundColor: 'var(--accent)',
                  }} />
                  <span style={{ color: 'var(--fg-dim)', flexShrink: 0, width: 130 }}>
                    {fmtDate(job.nextRunAt)}
                  </span>
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 10, flexShrink: 0,
                    border: '1px solid var(--border)',
                    color: 'var(--accent)',
                    backgroundColor: 'var(--surf2)',
                  }}>
                    scheduled
                  </span>
                  <Link href={`/jobs/${job.id}`} style={{ color: 'var(--fg)', textDecoration: 'none', flex: 1 }}>
                    {job.name}
                  </Link>
                  {job.nextRunAt && (
                    <span style={{ color: 'var(--fg-dim)', flexShrink: 0 }}>
                      {fmtIn(job.nextRunAt)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
