import { desc, eq, gte, sql } from 'drizzle-orm'
import { agents, backupJobs, backupRuns, repositories } from '@backupos/db'
import { router, authedProcedure } from '../trpc'

export const dashboardRouter = router({
  summary: authedProcedure.query(async ({ ctx }) => {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [jobCount]  = await ctx.db.select({ count: sql<number>`count(*)` }).from(backupJobs)
    const [repoCount] = await ctx.db.select({ count: sql<number>`count(*)` }).from(repositories)
    const [agentCount] = await ctx.db.select({ count: sql<number>`count(*)` }).from(agents)

    const recentRuns = await ctx.db
      .select()
      .from(backupRuns)
      .where(gte(backupRuns.startedAt, since24h))
      .all()

    return {
      jobs:      jobCount?.count  ?? 0,
      repos:     repoCount?.count ?? 0,
      agents:    agentCount?.count ?? 0,
      runs24h: {
        total:   recentRuns.length,
        success: recentRuns.filter((r: { status: string }) => r.status === 'success').length,
        failed:  recentRuns.filter((r: { status: string }) => r.status === 'failed').length,
        running: recentRuns.filter((r: { status: string }) => r.status === 'running').length,
      },
    }
  }),

  recentRuns: authedProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(backupRuns)
      .orderBy(desc(backupRuns.startedAt))
      .limit(20)
      .all(),
  ),

  storageUsage: authedProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id:            repositories.id,
        name:          repositories.name,
        backend:       repositories.backend,
        sizeBytes:     repositories.sizeBytes,
        snapshotCount: repositories.snapshotCount,
      })
      .from(repositories)
      .all(),
  ),
})
