import { createHash } from 'crypto'
import { getDb, apiTokens, user, eq } from '@backupos/db'
import type { AuthUser } from '@backupos/api'

export async function validateApiToken(raw: string): Promise<AuthUser | null> {
  const hash = createHash('sha256').update(raw).digest('hex')
  const db = getDb()
  const now = new Date()

  const rows = await db
    .select({ token: apiTokens, usr: user })
    .from(apiTokens)
    .innerJoin(user, eq(apiTokens.userId, user.id))
    .where(eq(apiTokens.tokenHash, hash))
    .limit(1)
    .all()

  if (rows.length === 0) return null

  const row = rows[0]!

  if (row.token.expiresAt !== null && row.token.expiresAt <= now) return null

  try {
    await db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.token.id))
  } catch {
    // best-effort — don't fail validation if the update fails
  }

  return {
    id:    row.usr.id,
    email: row.usr.email,
    name:  row.usr.name ?? undefined,
  }
}
