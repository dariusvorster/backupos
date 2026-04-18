import { eq, desc } from 'drizzle-orm'
import { backupJobs, backupRuns } from '@backupos/db'
import { z } from 'zod'
import { router, authedProcedure } from '../trpc'
import { JobSchema, JobUpdateSchema } from '../schemas'

export const jobsRouter = router({
  list: authedProcedure.query(({ ctx }) =>
    ctx.db.select().from(backupJobs).all(),
  ),

  get: authedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(backupJobs)
        .where(eq(backupJobs.id, input.id))
        .limit(1)
      if (!row) throw new Error('Job not found')
      return row
    }),

  create: authedProcedure
    .input(JobSchema)
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID()
      await ctx.db.insert(backupJobs).values({
        id,
        name:         input.name,
        agentId:      input.agentId,
        repositoryId: input.repositoryId,
        sourceType:   input.sourceType,
        sourceConfig: JSON.stringify(input.sourceConfig),
        schedule:     input.schedule,
        enabled:      input.enabled,
        keepLast:     input.keepLast,
        keepDaily:    input.keepDaily,
        keepWeekly:   input.keepWeekly,
        keepMonthly:  input.keepMonthly,
        keepYearly:   input.keepYearly,
        tags:         input.tags ? JSON.stringify(input.tags) : undefined,
        preHook:      input.preHook  ? JSON.stringify(input.preHook)  : undefined,
        postHook:     input.postHook ? JSON.stringify(input.postHook) : undefined,
        createdAt:    new Date(),
      })
      return { id }
    }),

  update: authedProcedure
    .input(JobUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      await ctx.db
        .update(backupJobs)
        .set({
          ...rest,
          sourceConfig: rest.sourceConfig ? JSON.stringify(rest.sourceConfig) : undefined,
          tags:         rest.tags         ? JSON.stringify(rest.tags)         : undefined,
          preHook:      rest.preHook      ? JSON.stringify(rest.preHook)      : undefined,
          postHook:     rest.postHook     ? JSON.stringify(rest.postHook)     : undefined,
        })
        .where(eq(backupJobs.id, id))
      return { ok: true }
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(backupJobs).where(eq(backupJobs.id, input.id))
      return { ok: true }
    }),

  run: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const runId = crypto.randomUUID()
      const [job] = await ctx.db
        .select()
        .from(backupJobs)
        .where(eq(backupJobs.id, input.id))
        .limit(1)
      if (!job) throw new Error('Job not found')

      await ctx.db.insert(backupRuns).values({
        id:           runId,
        jobId:        input.id,
        agentId:      job.agentId,
        repositoryId: job.repositoryId,
        status:       'running',
        trigger:      'manual',
        startedAt:    new Date(),
      })

      return { runId }
    }),

  runs: authedProcedure
    .input(z.object({ jobId: z.string(), limit: z.number().int().default(20) }))
    .query(({ ctx, input }) =>
      ctx.db
        .select()
        .from(backupRuns)
        .where(eq(backupRuns.jobId, input.jobId))
        .orderBy(desc(backupRuns.startedAt))
        .limit(input.limit)
        .all(),
    ),
})
