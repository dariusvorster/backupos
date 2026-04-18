import { eq, desc } from 'drizzle-orm'
import { restoreSpecs, restoreRuns } from '@backupos/db'
import { parseRestoreSpec, executeRestoreSpec } from '@backupos/restore'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { router, authedProcedure } from '../trpc'
import { RestoreSpecSchema } from '../schemas'

export const restoreRouter = router({
  specs: router({
    list: authedProcedure.query(({ ctx }) =>
      ctx.db.select().from(restoreSpecs).all(),
    ),

    get: authedProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        const [row] = await ctx.db
          .select()
          .from(restoreSpecs)
          .where(eq(restoreSpecs.id, input.id))
          .limit(1)
        if (!row) throw new TRPCError({ code: 'NOT_FOUND' })
        return row
      }),

    upsert: authedProcedure
      .input(RestoreSpecSchema)
      .mutation(async ({ ctx, input }) => {
        // Validate YAML before storing
        try {
          parseRestoreSpec(input.yamlContent)
        } catch (err) {
          throw new TRPCError({
            code:    'BAD_REQUEST',
            message: err instanceof Error ? err.message : 'Invalid YAML',
          })
        }

        const now = new Date()
        if (input.id) {
          await ctx.db
            .update(restoreSpecs)
            .set({
              name:             input.name,
              description:      input.description,
              yamlContent:      input.yamlContent,
              repositoryId:     input.repositoryId,
              jobId:            input.jobId,
              validationStatus: 'valid',
              lastValidatedAt:  now,
            })
            .where(eq(restoreSpecs.id, input.id))
          return { id: input.id }
        }

        const id = crypto.randomUUID()
        await ctx.db.insert(restoreSpecs).values({
          id,
          name:             input.name,
          description:      input.description,
          yamlContent:      input.yamlContent,
          repositoryId:     input.repositoryId,
          jobId:            input.jobId,
          validationStatus: 'valid',
          lastValidatedAt:  now,
          createdAt:        now,
        })
        return { id }
      }),

    validate: authedProcedure
      .input(z.object({ yaml: z.string() }))
      .mutation(({ input }) => {
        try {
          const spec = parseRestoreSpec(input.yaml)
          return { valid: true, spec }
        } catch (err) {
          return { valid: false, error: err instanceof Error ? err.message : 'Invalid YAML' }
        }
      }),

    delete: authedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await ctx.db.delete(restoreSpecs).where(eq(restoreSpecs.id, input.id))
        return { ok: true }
      }),
  }),

  run: authedProcedure
    .input(z.object({ specId: z.string(), snapshotId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [spec] = await ctx.db
        .select()
        .from(restoreSpecs)
        .where(eq(restoreSpecs.id, input.specId))
        .limit(1)
      if (!spec) throw new TRPCError({ code: 'NOT_FOUND' })

      const parsed     = parseRestoreSpec(spec.yamlContent)
      const snapshotId = input.snapshotId ?? 'latest'
      const runId      = crypto.randomUUID()

      await ctx.db.insert(restoreRuns).values({
        id:        runId,
        specId:    input.specId,
        snapshotId,
        status:    'running',
        trigger:   'manual',
        startedAt: new Date(),
      })

      // Run async — result stored by a background worker in V2
      // For V1 we execute inline and update immediately
      executeRestoreSpec(parsed, snapshotId, 'local').then(async result => {
        await ctx.db
          .update(restoreRuns)
          .set({
            status:      result.success ? 'success' : 'failed',
            log:         JSON.stringify(result.steps),
            completedAt: result.completedAt ?? result.abortedAt ?? new Date(),
          })
          .where(eq(restoreRuns.id, runId))
      }).catch(() => { /* logged by executor */ })

      return { runId }
    }),

  history: authedProcedure
    .input(z.object({ specId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db
        .select()
        .from(restoreRuns)
        .where(eq(restoreRuns.specId, input.specId))
        .orderBy(desc(restoreRuns.startedAt))
        .all(),
    ),

  browse: authedProcedure
    .input(z.object({ repositoryId: z.string(), snapshotId: z.string(), path: z.string() }))
    .query(() => {
      // restic ls via agent — implemented in V2 with agent WebSocket
      return { entries: [] as { name: string; type: 'file' | 'dir'; size?: number }[] }
    }),
})
