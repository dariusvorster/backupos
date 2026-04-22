import { redirect }       from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { getDb, user, invite } from '@backupos/db'
import { UsersClient }    from './client'

export default async function UsersPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const db = getDb()

  const [users, invites] = await Promise.all([
    db.select({
      id:        user.id,
      name:      user.name,
      email:     user.email,
      createdAt: user.createdAt,
    }).from(user).all(),

    db.select({
      id:        invite.id,
      email:     invite.email,
      name:      invite.name,
      token:     invite.token,
      expiresAt: invite.expiresAt,
      usedAt:    invite.usedAt,
      createdAt: invite.createdAt,
    }).from(invite).all(),
  ])

  const baseUrl       = process.env['NEXT_PUBLIC_BASE_URL'] ?? 'http://localhost:3000'
  const smtpConfigured = !!process.env['SMTP_HOST']

  return (
    <UsersClient
      users={users.map(u => ({ ...u, createdAt: u.createdAt?.getTime() ?? 0 }))}
      invites={invites}
      baseUrl={baseUrl}
      smtpConfigured={smtpConfigured}
      currentUserId={currentUser.id}
    />
  )
}
