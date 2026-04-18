import { router, publicProcedure } from '../trpc'
import { hypervisorsRouter } from './hypervisors'
import { agentsRouter }      from './agents'
import { repositoriesRouter } from './repositories'
import { jobsRouter }        from './jobs'
import { restoreRouter }     from './restore'
import { monitorsRouter }    from './monitors'
import { alertsRouter }      from './alerts'
import { dashboardRouter }   from './dashboard'
import { auditRouter }       from './audit'

const PKG_VERSION = '0.1.0'

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, version: PKG_VERSION })),

  hypervisors:  hypervisorsRouter,
  agents:       agentsRouter,
  repositories: repositoriesRouter,
  jobs:         jobsRouter,
  restore:      restoreRouter,
  monitors:     monitorsRouter,
  alerts:       alertsRouter,
  dashboard:    dashboardRouter,
  audit:        auditRouter,
})

export type AppRouter = typeof appRouter
