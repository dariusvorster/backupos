import { getDb, backupJobs, backupRuns, desc, gte } from '@backupos/db'
import { JobsTable } from './jobs-table'

export type RunDot = 'success' | 'failed' | 'none'

function buildStrips(
  jobs: { id: string }[],
  runs: { jobId: string; status: string; startedAt: Date | null }[],
): Record<string, RunDot[]> {
  const today = new Date()
  const strips: Record<string, RunDot[]> = {}
  for (const job of jobs) {
    strips[job.id] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (6 - i))
      const dayStr = d.toISOString().slice(0, 10)
      const run = runs.find(
        r => r.jobId === job.id && r.startedAt?.toISOString().slice(0, 10) === dayStr,
      )
      if (!run) return 'none'
      return run.status === 'success' ? 'success' : 'failed'
    })
  }
  return strips
}

export default async function JobsPage() {
  const db   = getDb()
  const jobs = await db.select().from(backupJobs).all()

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)

  const allRuns = await db
    .select({
      jobId:     backupRuns.jobId,
      status:    backupRuns.status,
      startedAt: backupRuns.startedAt,
    })
    .from(backupRuns)
    .where(gte(backupRuns.startedAt, cutoff))
    .orderBy(desc(backupRuns.startedAt))
    .all()

  const recentRuns = allRuns.filter((r) => r.jobId !== null) as {
    jobId: string
    status: string
    startedAt: Date | null
  }[]

  const strips = buildStrips(jobs, recentRuns)

  return <JobsTable jobs={jobs} strips={strips} />
}
