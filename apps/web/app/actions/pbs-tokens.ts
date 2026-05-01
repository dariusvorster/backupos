'use server'

import { revalidatePath }                          from 'next/cache'
import { randomBytes }                             from 'crypto'
import { getDb, pbsTokens, eq }                    from '@backupos/db'
import { requireAdmin }                            from '@/lib/user'
import { generatePbsSecret, hashPbsSecret, formatPbsToken } from '@/lib/pbs-tokens'
import { appendAuditEntry }                        from '@/lib/audit'
import { headers }                                 from 'next/headers'
import { auth }                                    from '@/lib/auth'

export async function createPbsToken(formData: FormData): Promise<{
  token?: string
  id?: string
  error?: string
}> {
  await requireAdmin()
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

  const secret = generatePbsSecret()
  const hash   = hashPbsSecret(secret)
  const id     = randomBytes(8).toString('hex')

  const db = getDb()
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
    resourceName: `${user}@${realm}!${tokenName}`,
    actor:        session.user.id,
  })

  revalidatePath('/pbs/tokens')
  return { token: formatPbsToken({ user, realm, tokenName, secret }), id }
}

export async function revokePbsToken(id: string): Promise<void> {
  await requireAdmin()
  const db = getDb()
  await db.delete(pbsTokens).where(eq(pbsTokens.id, id))
  await appendAuditEntry({
    action:       'pbs_token.revoked',
    resourceType: 'pbs_token',
    resourceId:   id,
  })
  revalidatePath('/pbs/tokens')
}
