import { headers }                   from 'next/headers'
import { redirect }                  from 'next/navigation'
import { auth }                      from './auth'
import { getDb, user as userTable }  from '@backupos/db'
import { eq }                        from '@backupos/db'

export type AuthUser = typeof auth.$Infer.Session.user & { role: string }

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const db    = getDb()
  const [row] = await db.select({ role: userTable.role }).from(userTable).where(eq(userTable.id, session.user.id)).limit(1).all()
  return { ...session.user, role: row?.role ?? 'admin' }
}

export async function requireAdmin(): Promise<AuthUser> {
  const u = await getCurrentUser()
  if (!u) redirect('/login')
  if (u.role !== 'admin') redirect('/access-denied')
  return u
}

export function isAdmin(u: AuthUser | null): boolean {
  return u?.role === 'admin'
}
