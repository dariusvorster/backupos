import { getDb, backupMonitors, monitorResults, eq } from '@backupos/db'
import { MONITOR_REGISTRY, type MonitorConfig } from '@backupos/monitors'

type Db = ReturnType<typeof getDb>

export async function performMonitorSync(
  monitorId: string,
  db: Db,
): Promise<{ ok: boolean; error?: string; status?: string }> {
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

    return { ok: true, status: result.status }
  } catch (err) {
    let msg: string
    if (err instanceof AggregateError && err.errors.length > 0) {
      msg = err.errors.map((e: unknown) => (e instanceof Error ? e.message : String(e))).join('; ')
    } else if (err instanceof Error) {
      msg = err.message
    } else {
      msg = String(err)
    }

    try {
      await db.insert(monitorResults).values({
        id:               crypto.randomUUID(),
        monitorId,
        status:           'failed',
        lastBackupAt:     null,
        lastBackupStatus: null,
        sizeBytes:        null,
        details:          JSON.stringify({ error: msg || 'Sync failed' }),
        checkedAt:        new Date(),
      })
      await db.update(backupMonitors)
        .set({ lastSyncedAt: new Date(), status: 'failed' })
        .where(eq(backupMonitors.id, monitorId))
    } catch (insertErr) {
      console.error('[monitors] failed to record sync failure:', insertErr)
    }

    return { ok: false, error: msg || 'Sync failed' }
  }
}
