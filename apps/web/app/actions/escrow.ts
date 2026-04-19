'use server'

import { revalidatePath } from 'next/cache'
import { getDb, repositories } from '@backupos/db'
import { eq } from 'drizzle-orm'
import { encryptPassword, decryptPassword } from '@/lib/escrow'

export async function setEscrow(repoId: string, formData: FormData): Promise<{ error?: string }> {
  const password   = ((formData.get('password')   ?? '') as string).trim()
  const passphrase = (formData.get('passphrase')  ?? '') as string             // no trim — spaces are valid
  const confirm    = (formData.get('confirm')     ?? '') as string             // no trim — match raw input

  if (!password)              return { error: 'Repository password is required.' }
  if (passphrase.length < 8)  return { error: 'Recovery passphrase must be at least 8 characters.' }
  if (passphrase !== confirm)  return { error: 'Passphrases do not match.' }

  const escrowedKey = encryptPassword(password, passphrase)
  const db = getDb()
  await db.update(repositories).set({ escrowedKey }).where(eq(repositories.id, repoId)).run()
  revalidatePath(`/repositories/${repoId}`)
  return {}
}

export async function setEscrowAction(repoId: string, formData: FormData): Promise<void> {
  const result = await setEscrow(repoId, formData)
  if (result.error) throw new Error(result.error)
}

export async function clearEscrow(repoId: string): Promise<void> {
  const db = getDb()
  await db.update(repositories).set({ escrowedKey: null }).where(eq(repositories.id, repoId)).run()
  revalidatePath(`/repositories/${repoId}`)
}

export async function recoverPassword(repoId: string, formData: FormData): Promise<{ password?: string; error?: string }> {
  const passphrase = (formData.get('passphrase') ?? '') as string  // no trim
  if (!passphrase) return { error: 'Recovery passphrase is required.' }

  const db   = getDb()
  const repo = await db.select({ escrowedKey: repositories.escrowedKey }).from(repositories).where(eq(repositories.id, repoId)).get()

  if (!repo?.escrowedKey) return { error: 'No escrow configured for this repository.' }

  try {
    const password = decryptPassword(repo.escrowedKey, passphrase)
    return { password }
  } catch {
    return { error: 'Incorrect passphrase — decryption failed.' }
  }
}
