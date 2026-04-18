import { eq } from 'drizzle-orm'
import { agents } from '@backupos/db'
import { z } from 'zod'
import { router, authedProcedure } from '../trpc'

export const agentsRouter = router({
  list: authedProcedure.query(({ ctx }) =>
    ctx.db.select().from(agents).all(),
  ),

  enroll: authedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const id         = crypto.randomUUID()
      const enrollToken = crypto.randomUUID()

      await ctx.db.insert(agents).values({
        id,
        name:       input.name,
        publicKey:  enrollToken,
        status:     'pending',
        enrolledAt: new Date(),
      })

      const installCmd =
        `curl -fsSL ${process.env['APP_URL'] ?? 'http://localhost:3000'}/install.sh | ` +
        `BACKUPOS_URL=${process.env['APP_URL'] ?? 'http://localhost:3000'} ` +
        `BACKUPOS_TOKEN=${enrollToken} bash`

      return { id, enrollToken, installCmd }
    }),

  remove: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(agents).where(eq(agents.id, input.id))
      return { ok: true }
    }),
})
