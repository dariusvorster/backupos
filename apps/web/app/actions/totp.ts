'use server'

import { revalidatePath }                from 'next/cache'
import { getDb, user, twoFactorSecrets } from '@backupos/db'
import { eq }                            from 'drizzle-orm'
import { randomUUID }                    from 'crypto'
import { getCurrentUser }                from '@/lib/user'
import {
  generateTotpSecret,
  createTotpUri,
  verifyTotpCode,
  generateBackupCodes,
} from '@/lib/totp'

export async function initTotp(): Promise<{ uri?: string; secret?: string; error?: string }> {
  const me = await getCurrentUser()
  if (!me) return { error: 'Not authenticated.' }

  const secret = generateTotpSecret()
  const uri    = createTotpUri(secret, me.email)
  return { uri, secret }
}

export async function enableTotp(formData: FormData): Promise<{ backupCodes?: string[]; error?: string }> {
  const me = await getCurrentUser()
  if (!me) return { error: 'Not authenticated.' }

  const secret = ((formData.get('secret') ?? '') as string).trim()
  const code   = ((formData.get('code')   ?? '') as string).trim()

  if (!secret) return { error: 'TOTP secret is missing.' }
  if (!code)   return { error: 'Verification code is required.' }
  if (!verifyTotpCode(secret, code)) return { error: 'Invalid TOTP code. Try again.' }

  const backupCodes = generateBackupCodes()
  const db = getDb()

  await db.delete(twoFactorSecrets).where(eq(twoFactorSecrets.userId, me.id)).run()
  await db.insert(twoFactorSecrets).values({
    id:          randomUUID(),
    secret,
    backupCodes: JSON.stringify(backupCodes),
    userId:      me.id,
    createdAt:   new Date(),
  }).run()
  await db.update(user).set({ twoFactorEnabled: true, updatedAt: new Date() }).where(eq(user.id, me.id)).run()

  revalidatePath('/settings/security')
  return { backupCodes }
}

export async function disableTotp(formData: FormData): Promise<{ error?: string }> {
  const me = await getCurrentUser()
  if (!me) return { error: 'Not authenticated.' }

  const code = ((formData.get('code') ?? '') as string).trim()
  if (!code) return { error: 'Verification code is required to disable 2FA.' }

  const db       = getDb()
  const tfRecord = await db.select().from(twoFactorSecrets).where(eq(twoFactorSecrets.userId, me.id)).get()
  if (!tfRecord) return { error: 'No TOTP secret found.' }

  if (!verifyTotpCode(tfRecord.secret, code)) return { error: 'Invalid TOTP code.' }

  await db.delete(twoFactorSecrets).where(eq(twoFactorSecrets.userId, me.id)).run()
  await db.update(user).set({ twoFactorEnabled: false, updatedAt: new Date() }).where(eq(user.id, me.id)).run()

  revalidatePath('/settings/security')
  return {}
}
