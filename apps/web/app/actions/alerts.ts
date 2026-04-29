'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getDb, alerts, alertChannels, eq } from '@backupos/db'

const VALID_CHANNEL_TYPES = [
  'discord', 'slack', 'webhook',
  'zulip', 'telegram', 'pagerduty', 'ntfy', 'gotify', 'pushover',
] as const

function str(fd: FormData, key: string): string {
  const v = fd.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

function buildConfig(type: string, fd: FormData): Record<string, string> | null {
  if (type === 'discord' || type === 'slack' || type === 'webhook') {
    const url = str(fd, 'url')
    if (!url) return null
    return { url }
  }
  if (type === 'zulip') {
    const url = str(fd, 'url'); const email = str(fd, 'email')
    const apiKey = str(fd, 'apiKey'); const stream = str(fd, 'stream')
    if (!url || !email || !apiKey || !stream) return null
    const cfg: Record<string, string> = { url, email, apiKey, stream }
    const topic = str(fd, 'topic'); if (topic) cfg.topic = topic
    return cfg
  }
  if (type === 'telegram') {
    const botToken = str(fd, 'botToken'); const chatId = str(fd, 'chatId')
    if (!botToken || !chatId) return null
    return { botToken, chatId }
  }
  if (type === 'pagerduty') {
    const integrationKey = str(fd, 'integrationKey')
    if (!integrationKey) return null
    return { integrationKey }
  }
  if (type === 'ntfy') {
    const url = str(fd, 'url'); const topic = str(fd, 'topic')
    if (!url || !topic) return null
    const cfg: Record<string, string> = { url, topic }
    const auth = str(fd, 'auth'); if (auth) cfg.auth = auth
    return cfg
  }
  if (type === 'gotify') {
    const url = str(fd, 'url'); const appToken = str(fd, 'appToken')
    if (!url || !appToken) return null
    return { url, appToken }
  }
  if (type === 'pushover') {
    const apiToken = str(fd, 'apiToken'); const userKey = str(fd, 'userKey')
    if (!apiToken || !userKey) return null
    return { apiToken, userKey }
  }
  return null
}

export async function snoozeAlert(id: string, hours: number): Promise<void> {
  if (!id || hours <= 0) return
  const db = getDb()
  const until = new Date(Date.now() + hours * 60 * 60 * 1000)
  await db.update(alerts).set({ snoozedUntil: until }).where(eq(alerts.id, id))
  revalidatePath('/alerts')
}

export async function createAlertChannel(formData: FormData): Promise<void> {
  const name = str(formData, 'name')
  const type = str(formData, 'type')

  if (!name) return
  if (!(VALID_CHANNEL_TYPES as readonly string[]).includes(type)) return

  const config = buildConfig(type, formData)
  if (!config) return

  const db = getDb()
  await db.insert(alertChannels).values({
    id: crypto.randomUUID(),
    name,
    type,
    config: JSON.stringify(config),
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
