'use server'

import { redirect }             from 'next/navigation'
import { getDb, loggingConfig } from '@backupos/db'

const ACTIVITY_OPTIONS = ['30d', '90d', '180d', '365d', 'forever'] as const
const AUDIT_OPTIONS    = ['90d', '365d', '3y', '7y', 'forever']    as const
const OPS_OPTIONS      = ['7d', '14d', '30d', '90d']               as const

export interface LoggingConfigValues {
  activityRetention: string
  auditRetention:    string
  opsRetention:      string
  lastSweepAt:            Date | null
  lastSweepDeletedAlerts: number
  lastSweepDeletedAudit:  number
  lastSweepDeletedOps:    number
}

export async function getLoggingConfig(): Promise<LoggingConfigValues> {
  const db  = getDb()
  const row = db.select().from(loggingConfig).get()
  return {
    activityRetention:      row?.activityRetention      ?? '90d',
    auditRetention:         row?.auditRetention         ?? '365d',
    opsRetention:           row?.opsRetention           ?? '14d',
    lastSweepAt:            row?.lastSweepAt            ?? null,
    lastSweepDeletedAlerts: row?.lastSweepDeletedAlerts ?? 0,
    lastSweepDeletedAudit:  row?.lastSweepDeletedAudit  ?? 0,
    lastSweepDeletedOps:    row?.lastSweepDeletedOps    ?? 0,
  }
}

export async function saveLoggingConfig(formData: FormData): Promise<void> {
  const activityRetention = (formData.get('activityRetention') ?? '') as string
  const auditRetention    = (formData.get('auditRetention')    ?? '') as string
  const opsRetention      = (formData.get('opsRetention')      ?? '') as string

  if (!(ACTIVITY_OPTIONS as readonly string[]).includes(activityRetention)) return
  if (!(AUDIT_OPTIONS as readonly string[]).includes(auditRetention)) return
  if (!(OPS_OPTIONS as readonly string[]).includes(opsRetention)) return

  const db       = getDb()
  const existing = db.select({ id: loggingConfig.id }).from(loggingConfig).get()
  if (existing) {
    await db.update(loggingConfig)
      .set({ activityRetention, auditRetention, opsRetention, updatedAt: new Date() }).run()
  } else {
    await db.insert(loggingConfig)
      .values({ id: 'singleton', activityRetention, auditRetention, opsRetention, updatedAt: new Date() }).run()
  }

  redirect('/settings/logging?saved=1')
}
