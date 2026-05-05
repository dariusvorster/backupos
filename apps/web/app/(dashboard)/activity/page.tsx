import { getDb, backupRuns, backupJobs, alerts, eq, desc, gte, and } from '@backupos/db'
import { PageHeader } from '@/components/ui/page-header'
import { AutoRefresh } from '@/components/ui/auto-refresh'
import { ActivityFeed } from './activity-feed'

export type FeedItem = {
  key:      string
  date:     Date
  kind:     'run' | 'alert'
  status:   string
  title:    string
  href?:    string
  jobId?:   string
  jobName?: string
}

export type UpcomingItem = {
  id:         string
  name:       string
  nextRunAt:  Date | null
  sourceType: string | null
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
      key:     `run-${r.id}`,
      date:    r.startedAt,
      kind:    'run' as const,
      status:  r.status,
      title:   `${r.runType === 'restore' ? 'Restore' : 'Backup'} run ${r.status} — ${r.jobName ?? 'unknown job'}${r.trigger === 'manual' ? ' (manual)' : ''}`,
      href:    r.jobId ? `/jobs/${r.jobId}` : undefined,
      jobId:   r.jobId ?? undefined,
      jobName: r.jobName ?? undefined,
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
      <PageHeader
        title="Activity"
        description="Backup and restore activity from the last 30 days, plus upcoming scheduled jobs."
      />
      <ActivityFeed feed={recent} upcoming={upcoming} />
    </div>
  )
}
