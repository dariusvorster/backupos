'use server'

import { revalidatePath }                          from 'next/cache'
import { randomBytes }                             from 'crypto'
import { getDb, pbsTokens, eq, and }               from '@backupos/db'
import { requireAdminAction }                            from '@/lib/user'
import { generatePbsSecret, hashPbsSecret }        from '@/lib/pbs-tokens'
import { appendAuditEntry }                        from '@/lib/audit'
import { headers }                                 from 'next/headers'
import { auth }                                    from '@/lib/auth'

const VALID_PERMISSIONS = new Set(['read', 'write', 'full'])

export async function createPbsToken(formData: FormData): Promise<{
  authId?:  string
  secret?:  string
  id?:      string
  error?:   string
}> {
  await requireAdminAction()
  const { api } = auth
  const session = await api.getSession({ headers: await headers() })
  if (!session) return { error: 'Not authenticated' }

  const user      = String(formData.get('user')      ?? '').trim()
  const realm     = String(formData.get('realm')     ?? 'pbs').trim()
  const tokenName = String(formData.get('tokenName') ?? '').trim()
  const perms     = String(formData.get('permissions') ?? 'read').trim()
  const expiresStr = formData.get('expires') as string | null

  if (!user)      return { error: 'User is required' }
  if (!realm)     return { error: 'Realm is required' }
  if (!tokenName) return { error: 'Token name is required' }
  if (!VALID_PERMISSIONS.has(perms)) return { error: 'Permissions must be read, write, or full' }

  const db = getDb()

  const existing = await db
    .select({ id: pbsTokens.id })
    .from(pbsTokens)
    .where(and(
      eq(pbsTokens.user,      user),
      eq(pbsTokens.realm,     realm),
      eq(pbsTokens.tokenName, tokenName),
    ))
    .limit(1)
  if (existing.length > 0) {
    return { error: `Token ${user}@${realm}!${tokenName} already exists` }
  }

  const secret = generatePbsSecret()
  const hash   = hashPbsSecret(secret)
  const id     = randomBytes(8).toString('hex')
  const authId = `${user}@${realm}!${tokenName}`

  await db.insert(pbsTokens).values({
    id,
    user,
    realm,
    tokenName,
    secretHash:  hash,
    permissions: perms,
    expiresAt:   expiresStr ? new Date(expiresStr) : undefined,
    createdAt:   new Date(),
  })

  await appendAuditEntry({
    action:       'pbs_token.created',
    resourceType: 'pbs_token',
    resourceId:   id,
    resourceName: authId,
    actor:        session.user.id,
  })

  revalidatePath('/pbs/tokens')
  return { authId, secret, id }
}

export async function revokePbsToken(id: string): Promise<void> {
  await requireAdminAction()
  const db = getDb()
  await db.delete(pbsTokens).where(eq(pbsTokens.id, id))
  await appendAuditEntry({
    action:       'pbs_token.revoked',
    resourceType: 'pbs_token',
    resourceId:   id,
  })
  revalidatePath('/pbs/tokens')
}
