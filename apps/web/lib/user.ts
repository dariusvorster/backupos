import { headers }                   from 'next/headers'
import { redirect }                  from 'next/navigation'
import { auth }                      from './auth'
import { getDb, user as userTable }  from '@backupos/db'
import { eq }                        from '@backupos/db'

export type AuthUser = typeof auth.$Infer.Session.user & { role: string }

/**
 * Authentication errors thrown by requireAdminAction() / requireUserAction().
 * Caught by Next.js's server-action error boundary and returned to the
 * client as a structured error object instead of an HTML redirect.
 *
 * IMPORTANT: never use this from page components — pages should use
 * requireAdmin() / requireUser() which redirect for the correct UX.
 */
export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const db    = getDb()
  const [row] = await db.select({ role: userTable.role }).from(userTable).where(eq(userTable.id, session.user.id)).limit(1).all()
  return { ...session.user, role: row?.role ?? 'admin' }
}

/**
 * For PAGE components and layouts: redirect on auth failure.
 * Calling this from a server action will return an HTML redirect to the
 * client which expects JSON — use requireAdminAction() instead.
 */
export async function requireAdmin(): Promise<AuthUser> {
  const u = await getCurrentUser()
  if (!u) redirect('/login')
  if (u.role !== 'admin') redirect('/access-denied')
  return u
}

/**
 * For SERVER ACTIONS: throw AuthError on auth failure.
 * Next.js's server-action error boundary will catch this and propagate it
 * as a structured error to the client form, instead of an HTML redirect.
 *
 * Status semantics:
 *   401 — not authenticated (no session)
 *   403 — authenticated but not authorized (non-admin role)
 */
export async function requireAdminAction(): Promise<AuthUser> {
  const u = await getCurrentUser()
  if (!u)                  throw new AuthError(401, 'Authentication required')
  if (u.role !== 'admin')  throw new AuthError(403, 'Admin role required')
  return u
}

export async function requireUserAction(): Promise<AuthUser> {
  const u = await getCurrentUser()
  if (!u) throw new AuthError(401, 'Authentication required')
  return u
}

export function isAdmin(u: AuthUser | null): boolean {
  return u?.role === 'admin'
}
