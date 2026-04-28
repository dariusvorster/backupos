import { redirect }       from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { getDb, user }    from '@backupos/db'
import { eq }             from '@backupos/db'
import { SecurityClient } from './client'

export default async function SecurityPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login')

  const db      = getDb()
  const profile = await db.select({ twoFactorEnabled: user.twoFactorEnabled }).from(user).where(eq(user.id, me.id)).get()

  return (
    <SecurityClient twoFactorEnabled={profile?.twoFactorEnabled ?? false} />
  )
}
