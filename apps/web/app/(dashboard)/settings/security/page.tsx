import { redirect }       from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { getDb, user, twoFactorSecrets } from '@backupos/db'
import { eq }             from '@backupos/db'
import { SecurityClient } from './client'

export default async function SecurityPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login')

  const db       = getDb()
  const profile  = await db.select({ twoFactorEnabled: user.twoFactorEnabled }).from(user).where(eq(user.id, me.id)).get()
  const tfRecord = await db.select({ id: twoFactorSecrets.id }).from(twoFactorSecrets).where(eq(twoFactorSecrets.userId, me.id)).get()

  return (
    <SecurityClient
      twoFactorEnabled={profile?.twoFactorEnabled ?? false}
      hasTotpRecord={!!tfRecord}
    />
  )
}
