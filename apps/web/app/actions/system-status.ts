'use server'

import { getDb, backupRuns, storageAlerts } from '@backupos/db'
import { eq, count, isNull }                 from 'drizzle-orm'

export interface SystemStatus {
  activeRunCount: number
  alertCount:     number
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const db = getDb()

  const [runRow] = db
    .select({ n: count() })
    .from(backupRuns)
    .where(eq(backupRuns.status, 'running'))
    .all()

  const [alertRow] = db
    .select({ n: count() })
    .from(storageAlerts)
    .where(isNull(storageAlerts.resolvedAt))
    .all()

  return {
    activeRunCount: runRow?.n ?? 0,
    alertCount:     alertRow?.n ?? 0,
  }
}
