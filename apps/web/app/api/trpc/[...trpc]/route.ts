export const dynamic = 'force-dynamic'

import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@backupos/api'
import { getDb } from '@backupos/db'
import type { Context } from '@backupos/api'
import { dispatch } from '../../../../lib/ws-state'
import { auth } from '@/lib/auth'
import { validateApiToken } from '@/lib/api-token-auth'

async function createContext({ req }: { req: Request }): Promise<Context> {
  const session = await auth.api.getSession({ headers: req.headers })
  if (session) {
    return { db: getDb(), user: session.user, dispatch }
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const tokenUser = await validateApiToken(authHeader.slice(7))
    if (tokenUser) {
      return { db: getDb(), user: tokenUser, dispatch }
    }
  }

  return { db: getDb(), user: null, dispatch }
}

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint:   '/api/trpc',
    req,
    router:     appRouter,
    createContext,
  })

export { handler as GET, handler as POST }
