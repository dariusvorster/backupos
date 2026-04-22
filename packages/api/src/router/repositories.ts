import { eq, and } from 'drizzle-orm'
import { repositories, snapshots, backupJobs, backupDefaults } from '@backupos/db'
import { ResticEngine } from '@backupos/engine'
import { z } from 'zod'
import { router, authedProcedure } from '../trpc'
import { RepositorySchema } from '../schemas'

export const repositoriesRouter = router({
  list: authedProcedure.query(({ ctx }) =>
    ctx.db.select().from(repositories).all(),
  ),

  create: authedProcedure
    .input(RepositorySchema)
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID()
      await ctx.db.insert(repositories).values({
        id,
        name:           input.name,
        backend:        input.backend,
        config:         JSON.stringify(input.config),
        resticPassword: input.resticPassword,
        createdAt:      new Date(),
      })

      const engine = new ResticEngine({
        repositoryUrl: input.backend === 'local'
          ? (input.config['path'] as string)
          : input.backend + ':' + (input.config['bucket'] as string ?? ''),
        password:  input.resticPassword,
        envVars:   input.config as Record<string, string>,
      })
      await engine.init()

      return { id }
    }),

  check: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(repositories)
        .where(eq(repositories.id, input.id))
        .limit(1)
      if (!row) throw new Error('Repository not found')

      const cfg    = JSON.parse(row.config) as Record<string, string>
      const engine = new ResticEngine({ repositoryUrl: cfg['repositoryUrl'] ?? row.id, password: row.resticPassword, envVars: cfg })
      const result = await engine.check()

      await ctx.db
        .update(repositories)
        .set({ lastCheckedAt: new Date(), lastCheckStatus: result.errors.length === 0 ? 'ok' : 'errors' })
        .where(eq(repositories.id, input.id))

      return result
    }),

  stats: authedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(repositories)
        .where(eq(repositories.id, input.id))
        .limit(1)
      if (!row) throw new Error('Repository not found')

      const cfg    = JSON.parse(row.config) as Record<string, string>
      const engine = new ResticEngine({ repositoryUrl: cfg['repositoryUrl'] ?? row.id, password: row.resticPassword, envVars: cfg })
      return engine.stats()
    }),

  snapshots: authedProcedure
    .input(z.object({ id: z.string(), jobId: z.string().optional() }))
    .query(({ ctx, input }) => {
      const q = ctx.db
        .select()
        .from(snapshots)
        .where(eq(snapshots.repositoryId, input.id))
      return q.all()
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(repositories).where(eq(repositories.id, input.id))
      return { ok: true }
    }),

  prune: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [repo] = await ctx.db
        .select()
        .from(repositories)
        .where(eq(repositories.id, input.id))
        .limit(1)
      if (!repo) throw new Error('Repository not found')

      const jobs = await ctx.db
        .select()
        .from(backupJobs)
        .where(and(eq(backupJobs.repositoryId, input.id), eq(backupJobs.enabled, true)))
        .all()

      const [defaults] = await ctx.db.select().from(backupDefaults).limit(1).all()

      type Policy = {
        keepLast?: number; keepDaily?: number; keepWeekly?: number
        keepMonthly?: number; keepYearly?: number
      }
      const jobPolicies: Array<{ policy: Policy; tags: string[] }> = []

      for (const job of jobs) {
        const jobHasRetention = job.keepLast || job.keepDaily || job.keepWeekly || job.keepMonthly || job.keepYearly
        let policy: Policy | null = null

        if (jobHasRetention) {
          policy = {
            keepLast:    job.keepLast    ?? undefined,
            keepDaily:   job.keepDaily   ?? undefined,
            keepWeekly:  job.keepWeekly  ?? undefined,
            keepMonthly: job.keepMonthly ?? undefined,
            keepYearly:  job.keepYearly  ?? undefined,
          }
        } else if (defaults) {
          const defHasAny = defaults.keepLast || defaults.keepDaily || defaults.keepWeekly || defaults.keepMonthly || defaults.keepYearly
          if (defHasAny) {
            policy = {
              keepLast:    defaults.keepLast    ?? undefined,
              keepDaily:   defaults.keepDaily   ?? undefined,
              keepWeekly:  defaults.keepWeekly  ?? undefined,
              keepMonthly: defaults.keepMonthly ?? undefined,
              keepYearly:  defaults.keepYearly  ?? undefined,
            }
          }
        }

        if (policy) {
          const tags = job.tags ? (JSON.parse(job.tags) as string[]) : [`job:${job.id}`]
          jobPolicies.push({ policy, tags })
        }
      }

      const cfg = JSON.parse(repo.config) as Record<string, string>
      const engine = new ResticEngine({
        repositoryUrl: cfg['repositoryUrl'] ?? repo.id,
        password:      repo.resticPassword,
        envVars:       cfg,
        binaryPath:    process.env['RESTIC_BINARY_PATH'],
      })

      if (jobPolicies.length === 0) {
        await engine.prune()
        return { removed: 0, kept: 0, jobsProcessed: 0 }
      }

      let totalRemoved = 0
      let totalKept    = 0
      for (const { policy, tags } of jobPolicies) {
        const result = await engine.forget({ ...policy, keepTags: tags })
        totalRemoved += result.removed
        totalKept    += result.kept
      }
      return { removed: totalRemoved, kept: totalKept, jobsProcessed: jobPolicies.length }
    }),
})
