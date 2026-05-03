import nodemailer from 'nodemailer'
import { getDb, alerts, alertChannels, smtpConfig, eq } from '@backupos/db'
import { decryptField } from './repo-crypto'

export type AlertType =
  | 'backup_failed'
  | 'backup_missed'
  | 'backup_succeeded'
  | 'restore_succeeded'
  | 'restore_failed'
  | 'restore_missed'
  | 'agent_disconnected'

// All AlertTypes for UI rendering. Order matters — UI shows them in this order.
export const ALL_ALERT_TYPES: AlertType[] = [
  'backup_succeeded',
  'backup_failed',
  'backup_missed',
  'restore_succeeded',
  'restore_failed',
  'restore_missed',
  'agent_disconnected',
]

// Human-friendly labels for the settings UI.
export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  backup_succeeded:   'Backup succeeded',
  backup_failed:      'Backup failed',
  backup_missed:      'Backup missed schedule',
  restore_succeeded:  'Restore succeeded',
  restore_failed:     'Restore failed',
  restore_missed:     'Restore missed schedule',
  agent_disconnected: 'Agent disconnected',
}

export interface AlertBackupFailed    { jobId: string; jobName: string; error: string }
export interface AlertBackupMissed    { jobId: string; jobName: string }
export interface AlertBackupSucceeded { jobId: string; jobName: string; durationSec: number | null; totalSizeBytes: number | null }
export interface AlertRestoreSucceeded { runId: string; jobName: string; durationSec: number | null }
export interface AlertRestoreFailed   { runId: string; jobName: string; error: string }
export interface AlertRestoreMissed   { jobId: string; jobName: string }
export interface AlertAgentDisc       { agentId: string; agentName: string }

export type AlertPayload =
  | AlertBackupFailed
  | AlertBackupMissed
  | AlertBackupSucceeded
  | AlertRestoreSucceeded
  | AlertRestoreFailed
  | AlertRestoreMissed
  | AlertAgentDisc

const SEVERITY: Record<AlertType, string> = {
  backup_failed:       'error',
  backup_missed:       'warning',
  backup_succeeded:    'info',
  restore_failed:      'error',
  restore_missed:      'warning',
  restore_succeeded:   'info',
  agent_disconnected:  'warning',
}

const DISCORD_COLOR: Record<string, number> = {
  error:   0xED4245,
  warning: 0xFEE75C,
  info:    0x5865F2,
}

const SEVERITY_EMOJI: Record<string, string> = {
  error:   '❌',
  warning: '⚠️',
  info:    'ℹ️',
}

const NTFY_PRIORITY:     Record<string, number> = { error: 5, warning: 4, info: 3 }
const GOTIFY_PRIORITY:   Record<string, number> = { error: 8, warning: 5, info: 3 }
const PUSHOVER_PRIORITY: Record<string, number> = { error: 1, warning: 0, info: -1 }
const PAGERDUTY_SEV:     Record<string, string> = { error: 'error', warning: 'warning', info: 'info' }

/**
 * Sends an alert delivery request and throws if the response isn't 2xx.
 * Wraps fetch so all fire* functions reliably surface delivery failures
 * (otherwise the Test button and production logs report false success
 * when destination servers return 4xx/5xx).
 */
async function deliverOrThrow(
  channelType: string,
  url: string,
  init: RequestInit,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`${channelType} delivery failed: ${msg}`)
  }
  if (!response.ok) {
    let bodySnippet = ''
    try {
      const text = await response.text()
      bodySnippet = text.slice(0, 200).replace(/\s+/g, ' ').trim()
    } catch { /* ignore body read errors */ }
    throw new Error(
      `${channelType} delivery failed: HTTP ${response.status} ${response.statusText}${bodySnippet ? ` — ${bodySnippet}` : ''}`,
    )
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function buildMessage(type: AlertType, payload: AlertPayload): string {
  if (type === 'backup_failed') {
    const p = payload as AlertBackupFailed
    return `Backup job "${p.jobName}" failed: ${p.error}`
  }
  if (type === 'backup_missed') {
    const p = payload as AlertBackupMissed
    return `Scheduled backup job "${p.jobName}" did not run on time`
  }
  if (type === 'backup_succeeded') {
    const p = payload as AlertBackupSucceeded
    const parts = [`Backup job "${p.jobName}" completed successfully`]
    if (p.durationSec != null) parts.push(`in ${formatDuration(p.durationSec)}`)
    if (p.totalSizeBytes != null) parts.push(`(${formatBytes(p.totalSizeBytes)})`)
    return parts.join(' ')
  }
  if (type === 'restore_succeeded') {
    const p = payload as AlertRestoreSucceeded
    const parts = [`Restore for "${p.jobName}" completed successfully`]
    if (p.durationSec != null) parts.push(`in ${formatDuration(p.durationSec)}`)
    return parts.join(' ')
  }
  if (type === 'restore_failed') {
    const p = payload as AlertRestoreFailed
    return `Restore for "${p.jobName}" failed: ${p.error}`
  }
  if (type === 'restore_missed') {
    const p = payload as AlertRestoreMissed
    return `Scheduled restore for "${p.jobName}" did not run on time`
  }
  const p = payload as AlertAgentDisc
  return `Agent "${p.agentName}" (${p.agentId}) has been unreachable for over 10 minutes`
}

/**
 * Returns true if a channel with the given subscribedEvents value should
 * receive an event of the given type.
 *
 * - null / missing → back-compat: receive all events
 * - JSON array     → receive only listed types
 * - malformed JSON → fail-safe: receive all events
 */
export function channelReceivesEvent(subscribedEvents: string | null | undefined, type: AlertType): boolean {
  if (!subscribedEvents) return true
  try {
    const events = JSON.parse(subscribedEvents) as string[]
    return events.includes(type)
  } catch {
    console.warn(`[alerts] malformed subscribed_events; treating as subscribe-to-all`)
    return true
  }
}

async function fireDiscord(url: string, type: AlertType, message: string, severity: string): Promise<void> {
  const color = DISCORD_COLOR[severity] ?? DISCORD_COLOR['info']
  const body = {
    embeds: [{
      title: `[BackupOS] ${type.replace(/_/g, ' ')}`,
      description: message,
      color,
      timestamp: new Date().toISOString(),
    }],
  }
  await deliverOrThrow('Discord', url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

async function fireSlack(url: string, type: AlertType, message: string): Promise<void> {
  const body = {
    text: `*[BackupOS]* ${message}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*[BackupOS] ${type.replace(/_/g, ' ')}*\n${message}` } },
    ],
  }
  await deliverOrThrow('Slack', url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

async function fireWebhook(url: string, type: AlertType, severity: string, message: string, payload: AlertPayload): Promise<void> {
  const body = { type, severity, message, timestamp: new Date().toISOString(), payload }
  await deliverOrThrow('Webhook', url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

async function fireEmail(type: AlertType, message: string): Promise<void> {
  const db = getDb()
  const [cfg] = await db.select().from(smtpConfig).where(eq(smtpConfig.id, 'singleton')).limit(1)
  if (!cfg?.enabled || !cfg.host || !cfg.fromEmail) return

  const recipients = cfg.toAddresses
    ? cfg.toAddresses.split(',').map(s => s.trim()).filter(Boolean)
    : []
  if (recipients.length === 0) {
    console.warn('[alerts] SMTP is enabled but no recipients configured — skipping email delivery')
    return
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port ?? 587,
    secure: cfg.tls ?? true,
    auth: cfg.username ? { user: cfg.username, pass: cfg.password ? decryptField(cfg.password) : '' } : undefined,
  })

  await transporter.sendMail({
    from: `${cfg.fromName} <${cfg.fromEmail}>`,
    to:   recipients,
    subject: `[BackupOS] ${type.replace(/_/g, ' ')}`,
    text: message,
  })
}

export interface ZulipConfig     { url: string; email: string; apiKey: string; stream: string; topic?: string }
export interface TelegramConfig  { botToken: string; chatId: string }
export interface PagerDutyConfig { integrationKey: string }
export interface NtfyConfig      { url: string; topic: string; auth?: string }
export interface GotifyConfig    { url: string; appToken: string }
export interface PushoverConfig  { apiToken: string; userKey: string }

async function fireZulip(cfg: ZulipConfig, type: AlertType, message: string, severity: string): Promise<void> {
  const emoji = SEVERITY_EMOJI[severity] ?? ''
  const params = new URLSearchParams({
    type:    'stream',
    to:      cfg.stream,
    topic:   cfg.topic ?? '[BackupOS] alerts',
    content: `${emoji} ${message}`,
  })
  await deliverOrThrow('Zulip', `${cfg.url}/api/v1/messages`, {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${cfg.email}:${cfg.apiKey}`).toString('base64')}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
}

async function fireTelegram(cfg: TelegramConfig, type: AlertType, message: string, severity: string): Promise<void> {
  const emoji = SEVERITY_EMOJI[severity] ?? ''
  await deliverOrThrow('Telegram', `https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: cfg.chatId, text: `${emoji} ${message}`, parse_mode: 'Markdown' }),
  })
}

async function firePagerDuty(cfg: PagerDutyConfig, type: AlertType, message: string, severity: string, payload: AlertPayload): Promise<void> {
  await deliverOrThrow('PagerDuty', 'https://events.pagerduty.com/v2/enqueue', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      routing_key:  cfg.integrationKey,
      event_action: 'trigger',
      payload: {
        summary:        message,
        source:         'backupos',
        severity:       PAGERDUTY_SEV[severity] ?? 'info',
        custom_details: payload,
      },
    }),
  })
}

async function fireNtfy(cfg: NtfyConfig, type: AlertType, message: string, severity: string): Promise<void> {
  const headers: Record<string, string> = {
    'Title':    `BackupOS — ${type.replace(/_/g, ' ')}`,
    'Priority': String(NTFY_PRIORITY[severity] ?? 3),
    'Tags':     type,
  }
  if (cfg.auth) headers['Authorization'] = cfg.auth
  await deliverOrThrow('ntfy', `${cfg.url}/${cfg.topic}`, { method: 'POST', headers, body: message })
}

async function fireGotify(cfg: GotifyConfig, type: AlertType, message: string, severity: string): Promise<void> {
  await deliverOrThrow('Gotify', `${cfg.url}/message?token=${cfg.appToken}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      title:    `[BackupOS] ${type.replace(/_/g, ' ')}`,
      message,
      priority: GOTIFY_PRIORITY[severity] ?? 3,
    }),
  })
}

async function firePushover(cfg: PushoverConfig, type: AlertType, message: string, severity: string): Promise<void> {
  const params = new URLSearchParams({
    token:    cfg.apiToken,
    user:     cfg.userKey,
    title:    `[BackupOS] ${type.replace(/_/g, ' ')}`,
    message,
    priority: String(PUSHOVER_PRIORITY[severity] ?? -1),
  })
  await deliverOrThrow('Pushover', 'https://api.pushover.net/1/messages.json', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  })
}

export async function dispatchToChannel(
  channel: { id: string; type: string; config: string },
  type: AlertType,
  message: string,
  severity: string,
  payload: AlertPayload,
): Promise<void> {
  const cfg = JSON.parse(channel.config) as Record<string, unknown>
  const url = (cfg.url as string | undefined) ?? ''

  if      (channel.type === 'discord')   await fireDiscord(url, type, message, severity)
  else if (channel.type === 'slack')     await fireSlack(url, type, message)
  else if (channel.type === 'zulip')     await fireZulip(cfg as unknown as ZulipConfig, type, message, severity)
  else if (channel.type === 'telegram')  await fireTelegram(cfg as unknown as TelegramConfig, type, message, severity)
  else if (channel.type === 'pagerduty') await firePagerDuty(cfg as unknown as PagerDutyConfig, type, message, severity, payload)
  else if (channel.type === 'ntfy')      await fireNtfy(cfg as unknown as NtfyConfig, type, message, severity)
  else if (channel.type === 'gotify')    await fireGotify(cfg as unknown as GotifyConfig, type, message, severity)
  else if (channel.type === 'pushover')  await firePushover(cfg as unknown as PushoverConfig, type, message, severity)
  else if (url)                          await fireWebhook(url, type, severity, message, payload)
}

export async function sendAlert(type: AlertType, payload: AlertPayload): Promise<void> {
  const db       = getDb()
  const severity = SEVERITY[type]
  const message  = buildMessage(type, payload)

  await db.insert(alerts).values({
    id:       crypto.randomUUID(),
    type,
    severity,
    message,
    status:   'open',
    firedAt:  new Date(),
  })

  const channels = await db.select().from(alertChannels).all()
  const enabled  = channels.filter(c => c.enabled)

  const subscribed = enabled.filter(channel => channelReceivesEvent(channel.subscribedEvents, type))

  await Promise.allSettled(
    subscribed.map(async channel => {
      try {
        await dispatchToChannel(channel, type, message, severity, payload)
      } catch (err) {
        console.error(`[alerts] channel ${channel.id} delivery failed:`, err)
      }
    })
  )

  // Email always receives every alert — no per-recipient filtering in V1.
  try {
    await fireEmail(type, message)
  } catch (err) {
    console.error('[alerts] email delivery failed:', err)
  }
}
