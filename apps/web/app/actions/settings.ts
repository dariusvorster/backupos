'use server'

import { redirect } from 'next/navigation'
import nodemailer from 'nodemailer'
import { getDb, instanceSettings, smtpConfig, backupDefaults } from '@backupos/db'
import { encryptField, decryptField } from '@/lib/repo-crypto'
import { requireAdmin } from '@/lib/user'

export async function saveInstanceSettings(formData: FormData) {
  await requireAdmin() // admin only
  const db = getDb()
  const rawUrl = String(formData.get('serverPublicUrl') ?? '').trim()
  // Validate URL if provided: must be http:// or https://
  if (rawUrl && !/^https?:\/\/.+/.test(rawUrl)) {
    redirect('/settings/general?error=invalid_url')
  }
  const values = {
    serverPublicUrl: rawUrl || null,
    updatedAt:       new Date(),
  }
  await db.insert(instanceSettings).values({ id: 'singleton', ...values })
    .onConflictDoUpdate({ target: instanceSettings.id, set: values })
  redirect('/settings/general?saved=1')
}

export async function saveSmtpConfig(formData: FormData) {
  await requireAdmin() // admin only
  const db = getDb()
  const rawPassword = (formData.get('password') as string | null) ?? ''

  // If the form submits an empty password, keep the existing encrypted value
  let password: string | null
  if (rawPassword === '') {
    const [existing] = await db.select({ password: smtpConfig.password }).from(smtpConfig).limit(1).all()
    password = existing?.password ?? null
  } else {
    password = encryptField(rawPassword)
  }

  const rawTo = (formData.get('toAddresses') as string | null) ?? ''
  const toAddresses = rawTo
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(',') || null

  const values = {
    host:        formData.get('host') as string | null,
    port:        Number(formData.get('port') ?? 587),
    username:    formData.get('username') as string | null,
    password,
    fromName:    String(formData.get('fromName') ?? 'BackupOS'),
    fromEmail:   formData.get('fromEmail') as string | null,
    toAddresses,
    tls:         formData.get('tls') === 'on',
    enabled:     formData.get('enabled') === 'on',
    updatedAt:   new Date(),
  }
  await db.insert(smtpConfig).values({ id: 'singleton', ...values })
    .onConflictDoUpdate({ target: smtpConfig.id, set: values })
  redirect('/settings/smtp?saved=1')
}

export async function saveBackupDefaults(formData: FormData) {
  await requireAdmin() // admin only
  const db = getDb()
  const values = {
    keepLast:      Number(formData.get('keepLast') ?? 10),
    keepDaily:     Number(formData.get('keepDaily') ?? 7),
    keepWeekly:    Number(formData.get('keepWeekly') ?? 4),
    keepMonthly:   Number(formData.get('keepMonthly') ?? 12),
    keepYearly:    Number(formData.get('keepYearly') ?? 0),
    scheduleStart: Number(formData.get('scheduleStart') ?? 0),
    scheduleEnd:   Number(formData.get('scheduleEnd') ?? 23),
    updatedAt:     new Date(),
  }
  await db.insert(backupDefaults).values({ id: 'singleton', ...values })
    .onConflictDoUpdate({ target: backupDefaults.id, set: values })
  const page = formData.get('_page') as string | null
  redirect(page === 'schedule' ? '/settings/schedule-windows?saved=1' : '/settings/retention?saved=1')
}

export async function testSmtpConnection(): Promise<{ ok: boolean; error?: string; deliveredTo?: string[] }> {
  const db = getDb()
  const [cfg] = await db.select().from(smtpConfig).limit(1).all()

  if (!cfg?.enabled || !cfg.host || !cfg.fromEmail) {
    return { ok: false, error: 'SMTP not configured' }
  }

  const recipients = cfg.toAddresses
    ? cfg.toAddresses.split(',').map(s => s.trim()).filter(Boolean)
    : []
  if (recipients.length === 0) {
    return { ok: false, error: 'No recipients configured — add recipients before testing' }
  }

  try {
    const transporter = nodemailer.createTransport({
      host:   cfg.host,
      port:   cfg.port ?? 587,
      secure: cfg.tls ?? true,
      auth:   cfg.username ? { user: cfg.username, pass: cfg.password ? decryptField(cfg.password) : '' } : undefined,
    })

    await transporter.sendMail({
      from:    `${cfg.fromName} <${cfg.fromEmail}>`,
      to:      recipients,
      subject: '[BackupOS] Test email — SMTP configuration verified',
      text:    `This is a test email from BackupOS confirming your SMTP configuration is working correctly.\n\nSent at ${new Date().toISOString()}.`,
    })

    return { ok: true, deliveredTo: recipients }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}
