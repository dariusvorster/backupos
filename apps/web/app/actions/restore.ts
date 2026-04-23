'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb, restoreSpecs, restoreRuns, snapshots, repositories, eq, desc } from '@backupos/db'
import { parseRestoreSpec, executeRestoreSpec, type RestoreRunResult } from '@backupos/restore'

export async function validateSpec(yaml: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    parseRestoreSpec(yaml)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function createSpec(name: string, yaml: string): Promise<{ error: string } | never> {
  if (!name.trim()) return { error: 'Name is required' }

  const validation = await validateSpec(yaml)
  if (!validation.ok) return { error: validation.error }

  const db = getDb()
  const id = crypto.randomUUID()
  await db.insert(restoreSpecs).values({
    id,
    name:             name.trim(),
    description:      null,
    yamlContent:      yaml,
    createdAt:        new Date(),
    validationStatus: 'valid',
  })
  redirect(`/restore/${id}`)
}

export async function updateSpec(id: string, name: string, yaml: string): Promise<{ error: string } | never> {
  if (!name.trim()) return { error: 'Name is required' }

  const validation = await validateSpec(yaml)
  if (!validation.ok) return { error: validation.error }

  const db = getDb()
  await db.update(restoreSpecs).set({
    name:             name.trim(),
    yamlContent:      yaml,
    validationStatus: 'valid',
  }).where(eq(restoreSpecs.id, id))
  revalidatePath(`/restore/${id}`)
  redirect(`/restore/${id}`)
}

export async function forkSpec(name: string, yamlContent: string): Promise<void> {
  const db = getDb()
  const id = crypto.randomUUID()
  await db.insert(restoreSpecs).values({
    id,
    name:             `${name} (copy)`,
    description:      'Forked from template library.',
    yamlContent,
    createdAt:        new Date(),
    validationStatus: null,
  })
  revalidatePath('/restore')
  redirect(`/restore/${id}`)
}

export async function runSpec(specId: string, snapshotId = 'latest'): Promise<void> {
  const db     = getDb()
  const [spec] = await db.select().from(restoreSpecs).where(eq(restoreSpecs.id, specId)).limit(1)
  if (!spec) throw new Error('Restore spec not found')

  const parsed = parseRestoreSpec(spec.yamlContent)
  const runId  = crypto.randomUUID()

  await db.insert(restoreRuns).values({
    id:        runId,
    specId,
    snapshotId,
    status:    'running',
    trigger:   'manual',
    startedAt: new Date(),
  })

  executeRestoreSpec(parsed, snapshotId, 'local').then(async (result: RestoreRunResult) => {
    await db
      .update(restoreRuns)
      .set({
        status:      result.success ? 'success' : 'failed',
        log:         JSON.stringify(result.steps),
        completedAt: result.completedAt ?? result.abortedAt ?? new Date(),
      })
      .where(eq(restoreRuns.id, runId))
  }).catch(() => { /* logged by executor */ })

  redirect(`/restore/${specId}/runs`)
}

export async function getSnapshots(
  repositoryId: string,
): Promise<{ id: string; createdAt: Date | null; sizeBytes: number | null }[]> {
  const db = getDb()
  return db
    .select({ id: snapshots.id, createdAt: snapshots.createdAt, sizeBytes: snapshots.sizeBytes })
    .from(snapshots)
    .where(eq(snapshots.repositoryId, repositoryId))
    .orderBy(desc(snapshots.createdAt))
    .all()
}

export async function getRepositories(): Promise<{ id: string; name: string }[]> {
  const db = getDb()
  return db
    .select({ id: repositories.id, name: repositories.name })
    .from(repositories)
    .orderBy(repositories.name)
    .all()
}

export async function runSpecWithSnapshot(
  specId: string,
  snapshotId: string,
): Promise<{ error: string } | void> {
  try {
    await runSpec(specId, snapshotId)
  } catch (err: unknown) {
    // re-throw Next.js redirect — it's not a real error
    if (
      err != null &&
      typeof err === 'object' &&
      'digest' in err &&
      typeof (err as { digest: unknown }).digest === 'string' &&
      (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw err
    }
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
