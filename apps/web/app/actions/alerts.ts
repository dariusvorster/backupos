'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getDb, alerts, alertChannels, eq } from '@backupos/db'

const VALID_CHANNEL_TYPES = ['discord', 'slack', 'webhook'] as const

export async function snoozeAlert(id: string, hours: number): Promise<void> {
  if (!id || hours <= 0) return
  const db = getDb()
  const until = new Date(Date.now() + hours * 60 * 60 * 1000)
  await db.update(alerts).set({ snoozedUntil: until }).where(eq(alerts.id, id))
  revalidatePath('/alerts')
}

export async function createAlertChannel(formData: FormData): Promise<void> {
  const name = formData.get('name')
  const type = formData.get('type')
  const url = formData.get('url')

  if (typeof name !== 'string' || !name.trim()) return
  if (typeof type !== 'string' || !(VALID_CHANNEL_TYPES as readonly string[]).includes(type)) return
  if (typeof url !== 'string' || !url.trim()) return

  const db = getDb()
  await db.insert(alertChannels).values({
    id: crypto.randomUUID(),
    name: name.trim(),
    type,
    config: JSON.stringify({ url: url.trim() }),
    enabled: true,
    createdAt: new Date(),
  })
  redirect('/settings/alerts?saved=1')
}

export async function deleteAlertChannel(id: string): Promise<void> {
  if (!id) return
  const db = getDb()
  await db.delete(alertChannels).where(eq(alertChannels.id, id))
  redirect('/settings/alerts?saved=1')
}
