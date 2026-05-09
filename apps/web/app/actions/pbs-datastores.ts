'use server'

import { revalidatePath } from 'next/cache'
import { redirect }       from 'next/navigation'
import { rm }             from 'node:fs/promises'
import { join }           from 'node:path'
import { randomBytes }    from 'node:crypto'
import { request as httpsRequest, Agent } from 'node:https'
import { getDb, pbsDatastores, eq } from '@backupos/db'
import { FsChunkStore }   from '@backupos/pbs-storage'
import { requireAdminAction }   from '@/lib/user'
import { appendAuditEntry } from '@/lib/audit'
import { getPbsServerInfo } from '@/lib/pbs-server'

/**
 * Root under which each datastore creates a named subdirectory.
 * Layout: /var/lib/backupos/pbs/<name>/
 *   ├── .chunks/0000..ffff/       (managed by FsChunkStore)
 *   └── backups/<type>/<id>/<ts>/ (created on backup completion in M4c+)
 *
 * Cert + key from M3a live as siblings at /var/lib/backupos/pbs/cert.pem
 * and key.pem; they are outside any datastore directory.
 */
const PBS_ROOT = '/var/lib/backupos/pbs'

// ── Internal HTTP helper ──────────────────────────────────────────────────────

interface PbsInternalRequestOpts {
  path:   string
  method: 'GET' | 'POST'
  body?:  string
}
interface PbsInternalResult {
  ok:      boolean
  status?: number
  body?:   string
  error?:  string
}

async function pbsInternalRequest(opts: PbsInternalRequestOpts): Promise<PbsInternalResult> {
  const internalSecret = process.env['BACKUPOS_INTERNAL_SECRET']
  if (!internalSecret) {
    return { ok: false, error: 'BACKUPOS_INTERNAL_SECRET not set' }
  }
  let server
  try {
    server = await getPbsServerInfo()
  } catch (e) {
    return { ok: false, error: `Could not read PBS server info: ${(e as Error).message}` }
  }
  return new Promise((resolve) => {
    const agent = new Agent({ rejectUnauthorized: false })
    const req = httpsRequest({
      host:   'localhost',
      port:   server.port,
      path:   opts.path,
      method: opts.method,
      agent,
      headers: {
        'Authorization': `Bearer ${internalSecret}`,
        ...(opts.body
          ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(opts.body)) }
          : {}),
      },
      timeout: 30_000,
    }, (res) => {
      const peerCert = (res.socket as NodeJS.Socket & {
        getPeerCertificate?: () => { fingerprint256?: string }
      }).getPeerCertificate?.()
      if (peerCert?.fingerprint256 && peerCert.fingerprint256 !== server.fingerprint) {
        resolve({ ok: false, error: 'PBS server certificate fingerprint mismatch' })
        req.destroy()
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        resolve({
          ok:     (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
          status: res.statusCode,
          body,
          error:  (res.statusCode ?? 0) >= 400 ? `HTTP ${res.statusCode}: ${body.slice(0, 200)}` : undefined,
        })
      })
    })
    req.on('error', (err) => resolve({ ok: false, error: err.message }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Request timed out' }) })
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

// ── Existing actions ──────────────────────────────────────────────────────────

export interface CreatePbsDatastoreResult {
  id?:    string
  error?: string
}

/**
 * Insert a pbs_datastores row then call FsChunkStore.initialize() to
 * pre-create the 65536 shard directories. If filesystem init fails the DB
 * row is rolled back. The reverse (orphaned directories) is left in place —
 * empty shard dirs are harmless until M6 GC.
 */
export async function createPbsDatastore(
  formData: FormData,
): Promise<CreatePbsDatastoreResult> {
  const adminUser = await requireAdminAction()
  const name = (formData.get('name') as string | null)?.trim()

  if (!name) return { error: 'Datastore name is required' }
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
    return { error: 'Datastore name must be 1-64 chars: letters, digits, dash, underscore' }
  }

  const db = getDb()

  const existing = await db
    .select()
    .from(pbsDatastores)
    .where(eq(pbsDatastores.name, name))
    .limit(1)
  if (existing.length > 0) {
    return { error: `A datastore named "${name}" already exists` }
  }

  const id   = randomBytes(8).toString('hex')
  const path = join(PBS_ROOT, name)

  await db.insert(pbsDatastores).values({
    id,
    name,
    path,
    createdAt:       new Date(),
    pruneSchedule:   null,
    gcSchedule:      null,
    lastGcAt:        null,
    totalSizeBytes:  null,
    uniqueSizeBytes: null,
    chunkCount:      null,
  })

  try {
    const store = new FsChunkStore({ root: path })
    await store.initialize()
  } catch (e) {
    await db.delete(pbsDatastores).where(eq(pbsDatastores.id, id))
    return { error: `Failed to initialize chunk store: ${(e as Error).message}` }
  }

  void appendAuditEntry({
    action:       'pbs_datastore.created',
    resourceType: 'pbs_datastore',
    resourceId:   id,
    resourceName: name,
    actor:        adminUser.id,
    detail:       { name, path },
  })

  revalidatePath('/pbs')
  redirect('/pbs')
}

export async function deletePbsDatastore(id: string): Promise<{ error?: string }> {
  const adminUser = await requireAdminAction()
  const db = getDb()

  const rows = await db
    .select()
    .from(pbsDatastores)
    .where(eq(pbsDatastores.id, id))
    .limit(1)
  if (rows.length === 0) return { error: 'Datastore not found' }
  const ds = rows[0]!

  // Delete row first. If rm fails, we have an orphan directory —
  // documented and acceptable. Reverse order would leave the row pointing
  // at a missing path, which is worse.
  await db.delete(pbsDatastores).where(eq(pbsDatastores.id, id))

  try {
    await rm(ds.path, { recursive: true, force: true })
  } catch (e) {
    console.error(`[pbs-datastore] failed to remove ${ds.path}:`, e)
  }

  void appendAuditEntry({
    action:       'pbs_datastore.deleted',
    resourceType: 'pbs_datastore',
    resourceId:   id,
    actor:        adminUser.id,
    detail:       { name: ds.name, path: ds.path },
  })

  revalidatePath('/pbs')
  return {}
}

// ── New actions ───────────────────────────────────────────────────────────────

export interface UpdatePbsDatastoreInput {
  id:            string
  pruneSchedule: string | null
  gcSchedule:    string | null
}

export async function updatePbsDatastore(input: UpdatePbsDatastoreInput): Promise<{ error?: string }> {
  const adminUser = await requireAdminAction()
  const db = getDb()

  if (input.pruneSchedule !== null && input.pruneSchedule.length > 64) {
    return { error: 'Prune schedule too long (max 64 chars)' }
  }
  if (input.gcSchedule !== null && input.gcSchedule.length > 64) {
    return { error: 'GC schedule too long (max 64 chars)' }
  }

  const [existing] = await db.select().from(pbsDatastores).where(eq(pbsDatastores.id, input.id)).limit(1)
  if (!existing) return { error: 'Datastore not found' }

  await db.update(pbsDatastores)
    .set({
      pruneSchedule: input.pruneSchedule,
      gcSchedule:    input.gcSchedule,
    })
    .where(eq(pbsDatastores.id, input.id))

  void appendAuditEntry({
    action:       'pbs_datastore.updated',
    resourceType: 'pbs_datastore',
    resourceId:   input.id,
    resourceName: existing.name,
    actor:        adminUser.id,
    detail:       { pruneSchedule: input.pruneSchedule, gcSchedule: input.gcSchedule },
  })

  revalidatePath(`/pbs/datastores/${input.id}`)
  revalidatePath('/pbs')
  return {}
}

export interface SyncStatsResult {
  ok:     boolean
  total?: number
  used?:  number
  avail?: number
  error?: string
}

export async function syncPbsDatastoreStats(id: string): Promise<SyncStatsResult> {
  await requireAdminAction()
  const db = getDb()

  const [ds] = await db.select().from(pbsDatastores).where(eq(pbsDatastores.id, id)).limit(1)
  if (!ds) return { ok: false, error: 'Datastore not found' }

  const result = await pbsInternalRequest({
    path:   `/api2/internal/datastore/${encodeURIComponent(ds.name)}/status`,
    method: 'GET',
  })
  if (!result.ok) return { ok: false, error: result.error ?? 'Unknown error' }

  let parsed: { total: number; used: number; avail: number }
  try {
    const json = JSON.parse(result.body ?? '{}') as { data?: typeof parsed } & typeof parsed
    parsed = json.data ?? json
  } catch {
    return { ok: false, error: 'Could not parse PBS response' }
  }

  await db.update(pbsDatastores)
    .set({
      totalSizeBytes:  parsed.total,
      uniqueSizeBytes: parsed.used,
    })
    .where(eq(pbsDatastores.id, id))

  revalidatePath(`/pbs/datastores/${id}`)
  return { ok: true, total: parsed.total, used: parsed.used, avail: parsed.avail }
}

export interface TriggerGcResult {
  ok:      boolean
  taskId?: string
  error?:  string
}

export async function triggerPbsGc(id: string): Promise<TriggerGcResult> {
  const adminUser = await requireAdminAction()
  const db = getDb()

  const [ds] = await db.select().from(pbsDatastores).where(eq(pbsDatastores.id, id)).limit(1)
  if (!ds) return { ok: false, error: 'Datastore not found' }

  const result = await pbsInternalRequest({
    path:   `/api2/internal/datastore/${encodeURIComponent(ds.name)}/gc`,
    method: 'POST',
  })

  if (result.status === 409) return { ok: false, error: 'Garbage collection is already running for this datastore' }
  if (!result.ok) return { ok: false, error: result.error ?? 'Unknown error' }

  let taskId: string | undefined
  try {
    const json = JSON.parse(result.body ?? '{}') as { data?: { task_id?: string } }
    taskId = json.data?.task_id
  } catch { /* ignore */ }

  void appendAuditEntry({
    action:       'pbs_datastore.gc_triggered',
    resourceType: 'pbs_datastore',
    resourceId:   id,
    resourceName: ds.name,
    actor:        adminUser.id,
    detail:       { taskId },
  })

  revalidatePath(`/pbs/datastores/${id}`)
  return { ok: true, taskId }
}
