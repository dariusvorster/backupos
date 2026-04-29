import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { getDb, apiTokens, integrationTokens, eq } from '@backupos/db'
import { ApiTokensClient } from './client'
import { IntegrationTokenSection } from './IntegrationTokenSection'

export default async function ApiTokensPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const db = getDb()
  const [tokens, intTokens] = await Promise.all([
    db.select().from(apiTokens).where(eq(apiTokens.userId, user.id)).all(),
    db.select().from(integrationTokens).all(),
  ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      <ApiTokensClient initial={tokens.map(t => ({
        id: t.id,
        name: t.name,
        tokenPrefix: t.tokenPrefix,
        lastUsedAt: t.lastUsedAt,
        expiresAt: t.expiresAt,
        createdAt: t.createdAt,
      }))} />

      <IntegrationTokenSection initial={intTokens.map(t => ({
        id: t.id,
        name: t.name,
        tokenPrefix: t.tokenPrefix,
        scopes: t.scopes,
        expiresAt: t.expiresAt ?? null,
        createdAt: t.createdAt,
        lastUsedAt: t.lastUsedAt ?? null,
        revokedAt: t.revokedAt ?? null,
        rateLimitRpm: t.rateLimitRpm,
      }))} />
    </div>
  )
}
