import { getDb, pbsTokens } from '@backupos/db'
import { requireAdmin }     from '@/lib/user'
import { PbsTokensClient }  from './client'

export const dynamic = 'force-dynamic'

export default async function PbsTokensPage() {
  await requireAdmin()
  const db   = getDb()
  const rows = await db.select().from(pbsTokens).orderBy(pbsTokens.createdAt)

  const tokens = rows.map((r) => ({
    id:          r.id,
    user:        r.user,
    realm:       r.realm,
    tokenName:   r.tokenName,
    permissions: r.permissions,
    expiresAt:   r.expiresAt ?? null,
    lastUsedAt:  r.lastUsedAt ?? null,
    createdAt:   r.createdAt,
  }))

  return <PbsTokensClient initial={tokens} />
}
