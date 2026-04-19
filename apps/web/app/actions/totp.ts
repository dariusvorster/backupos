'use server'

import { revalidatePath }                   from 'next/cache'
import { getDb, user, twoFactorSecrets }    from '@backupos/db'
import { eq }                               from 'drizzle-orm'
import { randomUUID, createHash }           from 'crypto'
import { getCurrentUser }                   from '@/lib/user'
import { encryptPassword, decryptPassword } from '@/lib/escrow'
import {
  generateTotpSecret,
  createTotpUri,
  verifyTotpCode,
  generateBackupCodes,
} from '@/lib/totp'

function encryptionKey(): string {
  const k = process.env.ENCRYPTION_KEY
  if (!k) throw new Error('ENCRYPTION_KEY env var is not set')
  return k
}

function hashBackupCode(code: string): string {
  return createHash('sha256').update(code.replace(/[\s-]/g, '').toUpperCase()).digest('hex')
}

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

  const backupCodes    = generateBackupCodes()
  const hashedCodes    = backupCodes.map(hashBackupCode)
  const encryptedSecret = encryptPassword(secret, encryptionKey())
  const db = getDb()

  await db.delete(twoFactorSecrets).where(eq(twoFactorSecrets.userId, me.id)).run()
  await db.insert(twoFactorSecrets).values({
    id:          randomUUID(),
    secret:      encryptedSecret,
    backupCodes: JSON.stringify(hashedCodes),
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

  let plainSecret: string
  try {
    plainSecret = decryptPassword(tfRecord.secret, encryptionKey())
  } catch {
    return { error: 'Failed to read TOTP secret.' }
  }

  if (!verifyTotpCode(plainSecret, code)) return { error: 'Invalid TOTP code.' }

  await db.delete(twoFactorSecrets).where(eq(twoFactorSecrets.userId, me.id)).run()
  await db.update(user).set({ twoFactorEnabled: false, updatedAt: new Date() }).where(eq(user.id, me.id)).run()

  revalidatePath('/settings/security')
  return {}
}

export async function redeemBackupCode(formData: FormData): Promise<{ error?: string }> {
  const me = await getCurrentUser()
  if (!me) return { error: 'Not authenticated.' }

  const code = ((formData.get('code') ?? '') as string).trim()
  if (!code) return { error: 'Backup code is required.' }

  const db       = getDb()
  const tfRecord = await db.select().from(twoFactorSecrets).where(eq(twoFactorSecrets.userId, me.id)).get()
  if (!tfRecord) return { error: 'No TOTP record found.' }

  const storedHashes: string[] = JSON.parse(tfRecord.backupCodes ?? '[]')
  const incoming = hashBackupCode(code)
  const idx = storedHashes.indexOf(incoming)
  if (idx === -1) return { error: 'Invalid backup code.' }

  storedHashes.splice(idx, 1)
  await db.update(twoFactorSecrets)
    .set({ backupCodes: JSON.stringify(storedHashes) })
    .where(eq(twoFactorSecrets.userId, me.id))
    .run()

  revalidatePath('/settings/security')
  return {}
}
