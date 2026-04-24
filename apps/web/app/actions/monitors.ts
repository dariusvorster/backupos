'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb, backupMonitors, monitorResults, eq } from '@backupos/db'
import { MONITOR_REGISTRY, type MonitorConfig } from '@backupos/monitors'

export async function createMonitor(formData: FormData): Promise<void> {
  const name   = (formData.get('name')   as string)?.trim()
  const type   = (formData.get('type')   as string)
  const url    = (formData.get('url')    as string)?.trim()
  const apiKey = (formData.get('apiKey') as string)?.trim() || null
  const group  = (formData.get('group')  as string)?.trim() || null

  if (!name || !type || !url) return

  const db = getDb()
  const id = crypto.randomUUID()
  await db.insert(backupMonitors).values({
    id,
    name,
    type,
    group,
    config:    JSON.stringify({ url, apiKey }),
    status:    'unknown',
    createdAt: new Date(),
  })
  redirect(`/monitors/${id}`)
}

export async function testMonitorConnection(url: string): Promise<{ ok: boolean; message: string }> {
  if (!url) return { ok: false, message: 'No URL provided' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)

  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal })
    clearTimeout(timer)
    return { ok: res.ok, message: `HTTP ${res.status} ${res.statusText}` }
  } catch (err: unknown) {
    clearTimeout(timer)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.toLowerCase().includes('abort')) {
      return { ok: false, message: 'Connection timed out after 5s' }
    }
    return { ok: false, message: msg }
  }
}

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
