import { desc } from 'drizzle-orm'
import { auditLog } from '@backupos/db'
import { z } from 'zod'
import { router, authedProcedure } from '../trpc'

export const auditRouter = router({
  list: authedProcedure
    .input(z.object({ limit: z.number().int().default(50) }))
    .query(({ ctx, input }) =>
      ctx.db
        .select()
        .from(auditLog)
        .orderBy(desc(auditLog.createdAt))
        .limit(input.limit)
        .all(),
    ),
})
