'use server'

import { redirect } from 'next/navigation'
import { getDb, instanceSettings, smtpConfig, backupDefaults } from '@backupos/db'
import { encryptField } from '@/lib/repo-crypto'

export async function saveInstanceSettings(formData: FormData) {
  const db = getDb()
  const rawUrl = String(formData.get('serverPublicUrl') ?? '').trim()
  // Validate URL if provided: must be http:// or https://
  if (rawUrl && !/^https?:\/\/.+/.test(rawUrl)) {
    redirect('/settings/general?error=invalid_url')
  }
  const values = {
    instanceName:    String(formData.get('instanceName') ?? 'BackupOS'),
    timezone:        String(formData.get('timezone') ?? 'UTC'),
    language:        String(formData.get('language') ?? 'en'),
    dateFormat:      String(formData.get('dateFormat') ?? 'YYYY-MM-DD'),
    serverPublicUrl: rawUrl || null,
    updatedAt:       new Date(),
  }
  await db.insert(instanceSettings).values({ id: 'singleton', ...values })
    .onConflictDoUpdate({ target: instanceSettings.id, set: values })
  redirect('/settings/general?saved=1')
}

export async function saveSmtpConfig(formData: FormData) {
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

  const values = {
    host:      formData.get('host') as string | null,
    port:      Number(formData.get('port') ?? 587),
    username:  formData.get('username') as string | null,
    password,
    fromName:  String(formData.get('fromName') ?? 'BackupOS'),
    fromEmail: formData.get('fromEmail') as string | null,
    tls:       formData.get('tls') === 'on',
    enabled:   formData.get('enabled') === 'on',
    updatedAt: new Date(),
  }
  await db.insert(smtpConfig).values({ id: 'singleton', ...values })
    .onConflictDoUpdate({ target: smtpConfig.id, set: values })
  redirect('/settings/smtp?saved=1')
}

export async function saveBackupDefaults(formData: FormData) {
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
