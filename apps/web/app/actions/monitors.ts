'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb, backupMonitors, repositories, eq } from '@backupos/db'
import { type PBSConfig } from '@backupos/monitors'
import { performMonitorSync } from '@/lib/monitors'
import { requireAdmin } from '@/lib/user'
import { assertSafeUrl, SSRFViolation } from '@/lib/ssrf-guard'

export async function promoteMonitorToRepo(monitorId: string, formData: FormData): Promise<void> {
  await requireAdmin() // admin only
  const password = (formData.get('password') as string)?.trim()
  if (!password) return

  const db = getDb()
  const [monitor] = await db.select().from(backupMonitors).where(eq(backupMonitors.id, monitorId)).limit(1)
  if (!monitor || monitor.type !== 'proxmox_pbs') return

  const pbsCfg = JSON.parse(monitor.config) as PBSConfig
  // Build the Restic REST URL pointing at the PBS REST API
  const repoUrl = `rest:${pbsCfg.url}/${pbsCfg.datastore}/`

  const config = {
    repositoryUrl:        repoUrl,
    RESTIC_REST_USERNAME: pbsCfg.tokenId,
    RESTIC_REST_PASSWORD: pbsCfg.tokenSecret,
  }

  const id = crypto.randomUUID()
  await db.insert(repositories).values({
    id,
    name:           `${monitor.name} (PBS)`,
    backend:        'rest',
    config:         JSON.stringify(config),
    resticPassword: password,
    createdAt:      new Date(),
  })

  redirect(`/repositories/${id}`)
}

export async function createMonitor(formData: FormData): Promise<void> {
  await requireAdmin() // admin only
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

  let parsed: URL
  try { parsed = new URL(url) } catch { return { ok: false, message: 'Invalid URL' } }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, message: 'Only http:// and https:// URLs are allowed' }
  }

  try {
    await assertSafeUrl(url)
  } catch (err) {
    if (err instanceof SSRFViolation) {
      return { ok: false, message: 'URL points to a private/loopback address — not allowed' }
    }
    throw err
  }

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

export async function updateMonitor(id: string, formData: FormData): Promise<{ error: string } | void> {
  await requireAdmin() // admin only
  const name   = (formData.get('name')   as string)?.trim()
  const url    = (formData.get('url')    as string)?.trim()
  const apiKey = (formData.get('apiKey') as string)?.trim() || null
  const group  = (formData.get('group')  as string)?.trim() || null

  if (!name || !url) return { error: 'Name and URL are required' }

  const db = getDb()
  const [monitor] = await db.select().from(backupMonitors).where(eq(backupMonitors.id, id)).limit(1)
  if (!monitor) return { error: 'Monitor not found' }

  const existingConfig = JSON.parse(monitor.config) as Record<string, string | null>
  const newConfig = {
    ...existingConfig,
    url,
    apiKey: apiKey ?? existingConfig['apiKey'] ?? null,
  }

  await db.update(backupMonitors)
    .set({ name, group, config: JSON.stringify(newConfig) })
    .where(eq(backupMonitors.id, id))

  revalidatePath(`/monitors/${id}`)
  redirect(`/monitors/${id}`)
}

export async function deleteMonitor(id: string): Promise<void> {
  await requireAdmin() // admin only
  const db = getDb()
  await db.delete(backupMonitors).where(eq(backupMonitors.id, id))
  redirect('/monitors')
}

export async function syncMonitor(monitorId: string): Promise<{ ok: boolean; error?: string }> {
  const db     = getDb()
  const result = await performMonitorSync(monitorId, db)
  if (result.ok) revalidatePath(`/monitors/${monitorId}`)
  return result
}
