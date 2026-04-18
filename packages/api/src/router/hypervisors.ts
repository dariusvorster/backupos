import { eq } from 'drizzle-orm'
import { hypervisorIntegrations, hypervisorTargets } from '@backupos/db'
import { HYPERVISOR_DRIVERS } from '@backupos/hypervisors'
import type { HypervisorType } from '@backupos/hypervisors'
import { z } from 'zod'
import { router, authedProcedure } from '../trpc'
import { HypervisorSchema } from '../schemas'

// Minimal interface shared by all driver instances
interface AnyDriver {
  test(): Promise<{ ok: boolean; message?: string }>
  listTargets(): Promise<Array<{ vmid?: number; name: string; type: string; node?: string; status?: string; tags?: string[] }>>
}

type AnyDriverCtor = new (cfg: Record<string, unknown>) => AnyDriver

function makeDriver(type: string, config: Record<string, unknown>): AnyDriver {
  const DriverClass = HYPERVISOR_DRIVERS[type as HypervisorType] as unknown as AnyDriverCtor | undefined
  if (!DriverClass) throw new Error(`No driver for type: ${type}`)
  return new DriverClass(config)
}

export const hypervisorsRouter = router({
  list: authedProcedure.query(({ ctx }) =>
    ctx.db.select().from(hypervisorIntegrations).all(),
  ),

  create: authedProcedure
    .input(HypervisorSchema)
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID()
      await ctx.db.insert(hypervisorIntegrations).values({
        id,
        name:      input.name,
        type:      input.type,
        config:    JSON.stringify(input.config),
        status:    'unknown',
        createdAt: new Date(),
      })
      return { id }
    }),

  test: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(hypervisorIntegrations)
        .where(eq(hypervisorIntegrations.id, input.id))
        .limit(1)
      if (!row) throw new Error('Hypervisor not found')

      const driver = makeDriver(row.type, JSON.parse(row.config) as Record<string, unknown>)
      return driver.test()
    }),

  sync: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(hypervisorIntegrations)
        .where(eq(hypervisorIntegrations.id, input.id))
        .limit(1)
      if (!row) throw new Error('Hypervisor not found')

      const driver  = makeDriver(row.type, JSON.parse(row.config) as Record<string, unknown>)
      const targets = await driver.listTargets()

      await ctx.db
        .delete(hypervisorTargets)
        .where(eq(hypervisorTargets.integrationId, input.id))

      if (targets.length > 0) {
        await ctx.db.insert(hypervisorTargets).values(
          targets.map(t => ({
            id:            crypto.randomUUID(),
            integrationId: input.id,
            externalId:    String(t.vmid ?? t.name),
            name:          t.name,
            type:          t.type,
            node:          t.node,
            status:        t.status,
            tags:          JSON.stringify(t.tags ?? []),
            lastSeenAt:    new Date(),
          })),
        )
      }

      await ctx.db
        .update(hypervisorIntegrations)
        .set({ lastSyncedAt: new Date(), status: 'ok' })
        .where(eq(hypervisorIntegrations.id, input.id))

      return { synced: targets.length }
    }),

  targets: authedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db
        .select()
        .from(hypervisorTargets)
        .where(eq(hypervisorTargets.integrationId, input.id))
        .all(),
    ),

  delete: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(hypervisorIntegrations)
        .where(eq(hypervisorIntegrations.id, input.id))
      return { ok: true }
    }),
})
