import { eq } from 'drizzle-orm'
import { backupMonitors, monitorResults } from '@backupos/db'
import { MONITOR_REGISTRY } from '@backupos/monitors'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, authedProcedure } from '../trpc'
import { MonitorSchema } from '../schemas'

export const monitorsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const monitors = await ctx.db.select().from(backupMonitors).all()
    const latestResults = await Promise.all(
      monitors.map(m =>
        ctx.db
          .select()
          .from(monitorResults)
          .where(eq(monitorResults.monitorId, m.id))
          .orderBy(monitorResults.checkedAt)
          .limit(1)
          .then(rows => rows[0]),
      ),
    )
    return monitors.map((m, i) => ({ ...m, latestResult: latestResults[i] ?? null }))
  }),

  create: authedProcedure
    .input(MonitorSchema)
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID()
      await ctx.db.insert(backupMonitors).values({
        id,
        name:      input.name,
        type:      input.type,
        config:    JSON.stringify(input.config),
        createdAt: new Date(),
      })
      return { id }
    }),

  sync: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(backupMonitors)
        .where(eq(backupMonitors.id, input.id))
        .limit(1)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

      const adapter = MONITOR_REGISTRY[row.type]
      if (!adapter) throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown monitor type: ${row.type}` })

      const config = JSON.parse(row.config)
      const result = await adapter.sync(config)

      await ctx.db.insert(monitorResults).values({
        id:               crypto.randomUUID(),
        monitorId:        input.id,
        status:           result.status,
        lastBackupAt:     result.lastBackupAt,
        lastBackupStatus: result.lastBackupStatus,
        sizeBytes:        result.sizeBytes,
        details:          JSON.stringify(result.details),
        checkedAt:        new Date(),
      })

      await ctx.db
        .update(backupMonitors)
        .set({ lastSyncedAt: new Date(), status: result.status })
        .where(eq(backupMonitors.id, input.id))

      return result
    }),

  syncAll: authedProcedure
    .mutation(async ({ ctx }) => {
      const monitors = await ctx.db.select().from(backupMonitors).all()
      const results = await Promise.allSettled(
        monitors.map(async m => {
          const adapter = MONITOR_REGISTRY[m.type]
          if (!adapter) return
          const config = JSON.parse(m.config)
          const result = await adapter.sync(config)
          await ctx.db.insert(monitorResults).values({
            id:               crypto.randomUUID(),
            monitorId:        m.id,
            status:           result.status,
            lastBackupAt:     result.lastBackupAt,
            lastBackupStatus: result.lastBackupStatus,
            sizeBytes:        result.sizeBytes,
            details:          JSON.stringify(result.details),
            checkedAt:        new Date(),
          })
          await ctx.db
            .update(backupMonitors)
            .set({ lastSyncedAt: new Date(), status: result.status })
            .where(eq(backupMonitors.id, m.id))
        }),
      )
      return { total: monitors.length, errors: results.filter(r => r.status === 'rejected').length }
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(backupMonitors).where(eq(backupMonitors.id, input.id))
      return { ok: true }
    }),
})
