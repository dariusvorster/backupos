import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@backupos/api'
import { getDb } from '@backupos/db'
import type { Context } from '@backupos/api'

function createContext(): Context {
  return {
    db:   getDb(),
    user: { id: 'local', email: 'admin@localhost', name: 'Admin' },
  }
}

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint:   '/api/trpc',
    req,
    router:     appRouter,
    createContext,
  })

export { handler as GET, handler as POST }
