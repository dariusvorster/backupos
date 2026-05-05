'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getDb, user, eq } from '@backupos/db'
import { appendAuditEntry } from '@/lib/audit'

export async function resetTwoFactorFlag(): Promise<{ ok?: true; error?: string }> {
  const { auth } = await import('@/lib/auth')
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { error: 'Not authenticated' }

  const db = getDb()
  await db.update(user)
    .set({ twoFactorEnabled: false })
    .where(eq(user.id, session.user.id))

  await appendAuditEntry({
    action:       'totp.disabled',
    resourceType: 'user',
    resourceId:   session.user.id,
    actor:        session.user.id,
  })

  revalidatePath('/settings/security')
  return { ok: true }
}
