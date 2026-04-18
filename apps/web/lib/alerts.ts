import { Resend } from 'resend'

type AlertType = 'backup_failed' | 'backup_missed' | 'agent_disconnected'

export interface AlertBackupFailed  { jobId: string; jobName: string; error: string }
export interface AlertBackupMissed  { jobId: string; jobName: string }
export interface AlertAgentDisc     { agentId: string; agentName: string }

type AlertPayload = AlertBackupFailed | AlertBackupMissed | AlertAgentDisc

function client(): Resend | null {
  const key = process.env['RESEND_API_KEY']
  return key ? new Resend(key) : null
}

const FROM = 'BackupOS <alerts@backupos.io>'

function to(): string {
  return process.env['ALERT_TO_EMAIL'] ?? ''
}

export async function sendAlert(type: AlertType, payload: AlertPayload): Promise<void> {
  const resend = client()
  const recipient = to()
  if (!resend || !recipient) return

  try {
    if (type === 'backup_failed') {
      const p = payload as AlertBackupFailed
      await resend.emails.send({
        from: FROM, to: recipient,
        subject: `[BackupOS] Backup failed: ${p.jobName}`,
        html: `<p>Backup job <strong>${p.jobName}</strong> failed.</p><pre>${p.error}</pre>`,
      })
    } else if (type === 'backup_missed') {
      const p = payload as AlertBackupMissed
      await resend.emails.send({
        from: FROM, to: recipient,
        subject: `[BackupOS] Backup missed: ${p.jobName}`,
        html: `<p>Scheduled backup job <strong>${p.jobName}</strong> did not run on time.</p>`,
      })
    } else if (type === 'agent_disconnected') {
      const p = payload as AlertAgentDisc
      await resend.emails.send({
        from: FROM, to: recipient,
        subject: `[BackupOS] Agent disconnected: ${p.agentName}`,
        html: `<p>Agent <strong>${p.agentName}</strong> (${p.agentId}) has been unreachable for over 10 minutes.</p>`,
      })
    }
  } catch (err) {
    console.error('[alerts] Failed to send alert:', err)
  }
}
