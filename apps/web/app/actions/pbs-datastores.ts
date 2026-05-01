'use server'

import { revalidatePath } from 'next/cache'
import { redirect }       from 'next/navigation'
import { rm }             from 'node:fs/promises'
import { join }           from 'node:path'
import { randomBytes }    from 'node:crypto'
import { getDb, pbsDatastores, eq } from '@backupos/db'
import { FsChunkStore }   from '@backupos/pbs-storage'
import { requireAdmin }   from '@/lib/user'
import { appendAuditEntry } from '@/lib/audit'

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
  const adminUser = await requireAdmin()
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
  const adminUser = await requireAdmin()
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
