import { eq, desc } from 'drizzle-orm'
import { alertRules, auditLog } from '@backupos/db'
import { z } from 'zod'
import { router, authedProcedure } from '../trpc'
import { AlertRuleSchema } from '../schemas'

export const alertsRouter = router({
  rules: router({
    list: authedProcedure.query(({ ctx }) =>
      ctx.db.select().from(alertRules).all(),
    ),

    upsert: authedProcedure
      .input(AlertRuleSchema)
      .mutation(async ({ ctx, input }) => {
        if (input.id) {
          await ctx.db
            .update(alertRules)
            .set({
              name:       input.name,
              type:       input.type,
              targetType: input.targetType,
              targetId:   input.targetId,
              config:     JSON.stringify(input.config),
              enabled:    input.enabled,
            })
            .where(eq(alertRules.id, input.id))
          return { id: input.id }
        }

        const id = crypto.randomUUID()
        await ctx.db.insert(alertRules).values({
          id,
          name:       input.name,
          type:       input.type,
          targetType: input.targetType,
          targetId:   input.targetId,
          config:     JSON.stringify(input.config),
          enabled:    input.enabled,
        })
        return { id }
      }),

    delete: authedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await ctx.db.delete(alertRules).where(eq(alertRules.id, input.id))
        return { ok: true }
      }),
  }),

  history: authedProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'alert.fired'))
      .orderBy(desc(auditLog.createdAt))
      .limit(100)
      .all(),
  ),
})
