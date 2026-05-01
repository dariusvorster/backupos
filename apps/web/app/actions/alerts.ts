'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getDb, alerts, alertChannels, eq } from '@backupos/db'
import { requireAdmin } from '@/lib/user'
import { dispatchToChannel } from '@/lib/alerts'

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
  await requireAdmin() // admin only
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
  await requireAdmin() // admin only
  if (!id) return
  const db = getDb()
  await db.delete(alertChannels).where(eq(alertChannels.id, id))
  redirect('/settings/alerts?saved=1')
}

export async function createAlertChannelForType(integType: string, formData: FormData): Promise<void> {
  await requireAdmin()
  const name = str(formData, 'name')
  if (!name) return
  if (!(VALID_CHANNEL_TYPES as readonly string[]).includes(integType)) return
  const config = buildConfig(integType, formData)
  if (!config) return
  const db = getDb()
  await db.insert(alertChannels).values({
    id: crypto.randomUUID(),
    name,
    type: integType,
    config: JSON.stringify(config),
    enabled: true,
    createdAt: new Date(),
  })
  redirect(`/settings/integrations/${integType}?saved=1`)
}

export async function deleteAlertChannelForType(channelId: string, integType: string): Promise<void> {
  await requireAdmin()
  if (!channelId) return
  const db = getDb()
  await db.delete(alertChannels).where(eq(alertChannels.id, channelId))
  redirect(`/settings/integrations/${integType}?saved=1`)
}

export type TestAlertChannelInput =
  | { kind: 'saved'; channelId: string }
  | { kind: 'unsaved'; type: string; config: Record<string, string> }

export type TestAlertChannelResult =
  | { ok: true }
  | { ok: false; error: string }

export async function testAlertChannel(input: TestAlertChannelInput): Promise<TestAlertChannelResult> {
  await requireAdmin()

  let testChannel: { id: string; type: string; config: string }

  if (input.kind === 'saved') {
    if (!input.channelId) return { ok: false, error: 'Channel id required' }
    const db = getDb()
    const [row] = await db.select().from(alertChannels).where(eq(alertChannels.id, input.channelId)).limit(1)
    if (!row) return { ok: false, error: 'Channel not found' }
    testChannel = { id: row.id, type: row.type, config: row.config }
  } else {
    if (!(VALID_CHANNEL_TYPES as readonly string[]).includes(input.type)) {
      return { ok: false, error: 'Invalid channel type' }
    }
    if (!input.config || Object.keys(input.config).length === 0) {
      return { ok: false, error: 'Missing configuration fields' }
    }
    testChannel = { id: 'test', type: input.type, config: JSON.stringify(input.config) }
  }

  const message = 'BackupOS test message — if you can read this, your channel is configured correctly.'
  const testPayload = { jobId: 'test', jobName: 'Test alert', error: message }

  try {
    await dispatchToChannel(testChannel, 'backup_failed', message, 'info', testPayload)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function sendTestAlert(channelId: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin()
  const db = getDb()
  const [channel] = await db.select().from(alertChannels).where(eq(alertChannels.id, channelId)).limit(1)
  if (!channel) return { ok: false, error: 'Channel not found' }
  if (!channel.enabled) return { ok: false, error: 'Channel is disabled' }

  const testPayload = { jobId: 'test', jobName: 'Test alert', error: 'This is a test message from BackupOS — your channel is wired correctly.' }
  try {
    await dispatchToChannel(channel, 'backup_failed', `Test alert: ${testPayload.error}`, 'info', testPayload)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
