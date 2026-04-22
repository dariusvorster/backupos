'use server'

import { revalidatePath } from 'next/cache'
import { randomBytes, createHash } from 'crypto'
import { getDb, apiTokens, eq } from '@backupos/db'
import { headers } from 'next/headers'

export async function createApiToken(formData: FormData): Promise<{ token?: string; error?: string }> {
  const { auth } = await import('@/lib/auth')
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { error: 'Not authenticated' }

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Name is required' }

  const raw = 'bkp_' + randomBytes(32).toString('hex')
  const hash = createHash('sha256').update(raw).digest('hex')
  const prefix = raw.slice(0, 12)

  const db = getDb()
  const expiresStr = formData.get('expires') as string | null
  const expiresAt = expiresStr ? new Date(expiresStr) : null

  await db.insert(apiTokens).values({
    id:          randomBytes(8).toString('hex'),
    userId:      session.user.id,
    name,
    tokenHash:   hash,
    tokenPrefix: prefix,
    expiresAt:   expiresAt ?? undefined,
    createdAt:   new Date(),
  })

  revalidatePath('/settings/api-tokens')
  return { token: raw }
}

export async function revokeApiToken(id: string) {
  const db = getDb()
  await db.delete(apiTokens).where(eq(apiTokens.id, id))
  revalidatePath('/settings/api-tokens')
}
