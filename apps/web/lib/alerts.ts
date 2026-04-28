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
        const cfg = JSON.parse(channel.config) as { url?: string }
        const url = cfg.url ?? ''
        if (!url) return
        if (channel.type === 'discord') await fireDiscord(url, type, message, severity)
        else if (channel.type === 'slack') await fireSlack(url, type, message)
        else await fireWebhook(url, type, severity, message, payload)
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
