import nodemailer from 'nodemailer'
import { getDb, alerts, alertChannels, smtpConfig, eq } from '@backupos/db'
import { decryptField } from './repo-crypto'

type AlertType = 'backup_failed' | 'backup_missed' | 'agent_disconnected'

export interface AlertBackupFailed  { jobId: string; jobName: string; error: string }
export interface AlertBackupMissed  { jobId: string; jobName: string }
export interface AlertAgentDisc     { agentId: string; agentName: string }

type AlertPayload = AlertBackupFailed | AlertBackupMissed | AlertAgentDisc

const SEVERITY: Record<AlertType, string> = {
  backup_failed:       'error',
  backup_missed:       'warning',
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

function buildMessage(type: AlertType, payload: AlertPayload): string {
  if (type === 'backup_failed') {
    const p = payload as AlertBackupFailed
    return `Backup job "${p.jobName}" failed: ${p.error}`
  }
  if (type === 'backup_missed') {
    const p = payload as AlertBackupMissed
    return `Scheduled backup job "${p.jobName}" did not run on time`
  }
  const p = payload as AlertAgentDisc
  return `Agent "${p.agentName}" (${p.agentId}) has been unreachable for over 10 minutes`
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
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

async function fireSlack(url: string, type: AlertType, message: string): Promise<void> {
  const body = {
    text: `*[BackupOS]* ${message}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*[BackupOS] ${type.replace(/_/g, ' ')}*\n${message}` } },
    ],
  }
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

async function fireWebhook(url: string, type: AlertType, severity: string, message: string, payload: AlertPayload): Promise<void> {
  const body = { type, severity, message, timestamp: new Date().toISOString(), payload }
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
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

interface ZulipConfig    { url: string; email: string; apiKey: string; stream: string; topic?: string }
interface TelegramConfig { botToken: string; chatId: string }
interface PagerDutyConfig { integrationKey: string }
interface NtfyConfig     { url: string; topic: string; auth?: string }
interface GotifyConfig   { url: string; appToken: string }
interface PushoverConfig { apiToken: string; userKey: string }

async function fireZulip(cfg: ZulipConfig, type: AlertType, message: string, severity: string): Promise<void> {
  const emoji = SEVERITY_EMOJI[severity] ?? ''
  const params = new URLSearchParams({
    type:    'stream',
    to:      cfg.stream,
    topic:   cfg.topic ?? '[BackupOS] alerts',
    content: `${emoji} ${message}`,
  })
  await fetch(`${cfg.url}/api/v1/messages`, {
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
  await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: cfg.chatId, text: `${emoji} ${message}`, parse_mode: 'Markdown' }),
  })
}

async function firePagerDuty(cfg: PagerDutyConfig, type: AlertType, message: string, severity: string, payload: AlertPayload): Promise<void> {
  await fetch('https://events.pagerduty.com/v2/enqueue', {
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
  await fetch(`${cfg.url}/${cfg.topic}`, { method: 'POST', headers, body: message })
}

async function fireGotify(cfg: GotifyConfig, type: AlertType, message: string, severity: string): Promise<void> {
  await fetch(`${cfg.url}/message?token=${cfg.appToken}`, {
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
  await fetch('https://api.pushover.net/1/messages.json', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  })
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

  await Promise.allSettled(
    enabled.map(async channel => {
      try {
        const cfg = JSON.parse(channel.config) as Record<string, unknown>
        const url = (cfg.url as string | undefined) ?? ''

        if      (channel.type === 'discord')    await fireDiscord(url, type, message, severity)
        else if (channel.type === 'slack')       await fireSlack(url, type, message)
        else if (channel.type === 'zulip')       await fireZulip(cfg as unknown as ZulipConfig, type, message, severity)
        else if (channel.type === 'telegram')    await fireTelegram(cfg as unknown as TelegramConfig, type, message, severity)
        else if (channel.type === 'pagerduty')   await firePagerDuty(cfg as unknown as PagerDutyConfig, type, message, severity, payload)
        else if (channel.type === 'ntfy')        await fireNtfy(cfg as unknown as NtfyConfig, type, message, severity)
        else if (channel.type === 'gotify')      await fireGotify(cfg as unknown as GotifyConfig, type, message, severity)
        else if (channel.type === 'pushover')    await firePushover(cfg as unknown as PushoverConfig, type, message, severity)
        else if (url)                            await fireWebhook(url, type, severity, message, payload)
      } catch (err) {
        console.error(`[alerts] channel ${channel.id} delivery failed:`, err)
      }
    })
  )

  try {
    await fireEmail(type, message)
  } catch (err) {
    console.error('[alerts] email delivery failed:', err)
  }
}
