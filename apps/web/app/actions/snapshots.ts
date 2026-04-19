'use server'

import { revalidatePath } from 'next/cache'
import { getDb, snapshots } from '@backupos/db'
import { eq } from 'drizzle-orm'

export async function pinSnapshot(id: string, pinned: boolean): Promise<void> {
  const db = getDb()
  await db.update(snapshots).set({ pinned }).where(eq(snapshots.id, id)).run()
  revalidatePath('/snapshots')
}

export async function addCustomTag(id: string, tag: string): Promise<void> {
  const trimmed = tag.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '')
  if (!trimmed) return

  const db = getDb()
  await db.transaction(async tx => {
    const snapshot = await tx.select({ customTags: snapshots.customTags })
      .from(snapshots).where(eq(snapshots.id, id)).limit(1).then(r => r[0] ?? null)
    if (!snapshot) return

    const existing: string[] = snapshot.customTags ? JSON.parse(snapshot.customTags) : []
    if (existing.includes(trimmed)) return

    await tx.update(snapshots)
      .set({ customTags: JSON.stringify([...existing, trimmed]) })
      .where(eq(snapshots.id, id)).run()
  })
  revalidatePath('/snapshots')
}

export async function removeCustomTag(id: string, tag: string): Promise<void> {
  const db = getDb()
  await db.transaction(async tx => {
    const snapshot = await tx.select({ customTags: snapshots.customTags })
      .from(snapshots).where(eq(snapshots.id, id)).limit(1).then(r => r[0] ?? null)
    if (!snapshot) return

    const existing: string[] = snapshot.customTags ? JSON.parse(snapshot.customTags) : []
    await tx.update(snapshots)
      .set({ customTags: JSON.stringify(existing.filter(t => t !== tag)) })
      .where(eq(snapshots.id, id)).run()
  })
  revalidatePath('/snapshots')
}

export async function setRetentionHold(id: string, reason: string, expiresAt: Date | null): Promise<void> {
  const db = getDb()
  await db.update(snapshots)
    .set({ retentionHold: true, holdReason: reason.trim() || null, holdExpiresAt: expiresAt })
    .where(eq(snapshots.id, id)).run()
  revalidatePath('/snapshots')
}

export async function clearRetentionHold(id: string): Promise<void> {
  const db = getDb()
  await db.update(snapshots)
    .set({ retentionHold: false, holdReason: null, holdExpiresAt: null })
    .where(eq(snapshots.id, id)).run()
  revalidatePath('/snapshots')
}
