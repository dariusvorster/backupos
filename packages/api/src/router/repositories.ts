import { eq } from 'drizzle-orm'
import { repositories, snapshots } from '@backupos/db'
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
})
