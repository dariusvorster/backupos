'use server'

import { revalidatePath } from 'next/cache'
import { getDb, backupMonitors, monitorResults, eq } from '@backupos/db'
import { MONITOR_REGISTRY, type MonitorConfig } from '@backupos/monitors'

export async function syncMonitor(monitorId: string): Promise<{ ok: boolean; error?: string }> {
  const db      = getDb()
  const [monitor] = await db.select().from(backupMonitors).where(eq(backupMonitors.id, monitorId)).limit(1)
  if (!monitor) return { ok: false, error: 'Monitor not found' }

  const adapter = MONITOR_REGISTRY[monitor.type]
  if (!adapter) return { ok: false, error: `Unknown monitor type: ${monitor.type}` }

  try {
    const config = JSON.parse(monitor.config) as MonitorConfig
    const result = await adapter.sync(config)

    await db.insert(monitorResults).values({
      id:               crypto.randomUUID(),
      monitorId,
      status:           result.status,
      lastBackupAt:     result.lastBackupAt,
      lastBackupStatus: result.lastBackupStatus,
      sizeBytes:        result.sizeBytes,
      details:          JSON.stringify(result.details ?? {}),
      checkedAt:        new Date(),
    })

    await db.update(backupMonitors)
      .set({ lastSyncedAt: new Date(), status: result.status })
      .where(eq(backupMonitors.id, monitorId))

    revalidatePath(`/monitors/${monitorId}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
