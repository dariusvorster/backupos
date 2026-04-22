import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { getDb, apiTokens, eq } from '@backupos/db'
import { ApiTokensClient } from './client'

export default async function ApiTokensPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const db = getDb()
  const tokens = await db.select().from(apiTokens).where(eq(apiTokens.userId, user.id)).all()

  return (
    <ApiTokensClient initial={tokens.map(t => ({
      id: t.id,
      name: t.name,
      tokenPrefix: t.tokenPrefix,
      lastUsedAt: t.lastUsedAt,
      expiresAt: t.expiresAt,
      createdAt: t.createdAt,
    }))} />
  )
}
