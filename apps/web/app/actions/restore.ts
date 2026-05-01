'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb, restoreSpecs, restoreRuns, snapshots, repositories, backupJobs, alertChannels, eq, desc } from '@backupos/db'
import { parseRestoreSpec, executeRestoreSpec, type RestoreRunResult, type NotifyDelivery } from '@backupos/restore'
import { requireAdmin } from '@/lib/user'
import { dispatchToChannel } from '@/lib/alerts'
import type { AlertType, AlertPayload } from '@/lib/alerts'
import { decryptField } from '@/lib/repo-crypto'
import { connectedAgentIds, requestFilesystemRestore } from '@/lib/ws-state'
import { ensureRepoMountedOnAgent } from '@/lib/repo-mount'
import { appendLog } from '@/lib/logger'

export async function validateSpec(yaml: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    parseRestoreSpec(yaml)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function createSpec(name: string, yaml: string): Promise<{ error: string } | never> {
  await requireAdmin() // admin only
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
  await requireAdmin() // admin only
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
  await requireAdmin() // admin only
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

async function deliverRestoreNotification(channel: string, message: string): Promise<void> {
  const db       = getDb()
  const channels = await db.select().from(alertChannels).all()
  const target   = channels.find(c => c.enabled && c.name === channel)
  if (!target) throw new Error(`No enabled alert channel named '${channel}'`)
  const type: AlertType    = 'backup_failed'
  const payload: AlertPayload = { jobId: '', jobName: 'restore', error: message }
  await dispatchToChannel(target, type, message, 'info', payload)
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

  executeRestoreSpec(parsed, snapshotId, 'local', deliverRestoreNotification).then(async (result: RestoreRunResult) => {
    await db
      .update(restoreRuns)
      .set({
        status:      result.success ? 'success' : 'failed',
        log:         JSON.stringify(result.steps),
        completedAt: result.completedAt ?? result.abortedAt ?? new Date(),
      })
      .where(eq(restoreRuns.id, runId))
    try {
      if (result.success) {
        appendLog({
          level: 'info',
          component: 'web',
          message: `Restore succeeded for spec "${spec.name}"`,
          entityType: 'restore_run',
          entityId: runId,
          payload: { specId, snapshotId, stepCount: result.steps.length },
        })
      } else {
        appendLog({
          level: 'error',
          component: 'web',
          message: `Restore failed for spec "${spec.name}"${result.failedStep ? ` at step "${result.failedStep}"` : ''}`,
          entityType: 'restore_run',
          entityId: runId,
          payload: { specId, snapshotId, failedStep: result.failedStep, stepCount: result.steps.length },
        })
      }
    } catch (err) { console.error('[logger]', err) }
  }).catch(async (err: unknown) => {
    await db.update(restoreRuns).set({
      status: 'failed', completedAt: new Date(),
    }).where(eq(restoreRuns.id, runId))
    console.error('[restore] executeRestoreSpec failed:', err)
    try {
      appendLog({
        level: 'error',
        component: 'web',
        message: `Restore engine threw for spec "${spec.name}": ${err instanceof Error ? err.message : String(err)}`,
        entityType: 'restore_run',
        entityId: runId,
        payload: { specId, errorMessage: err instanceof Error ? err.message : String(err) },
      })
    } catch (logErr) { console.error('[logger]', logErr) }
  })

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

interface RestoreFromSnapshotInput {
  snapshotId:  string
  sourcePath:  string
  targetType:  'temp' | 'inplace' | 'custom'
  customPath?: string
}

interface RepoConfigShape {
  repositoryUrl: string
  password?: string
  envVars?: Record<string, string>
}

export async function restoreFromSnapshot(
  input: RestoreFromSnapshotInput,
): Promise<{ ok: true; runId: string } | { ok: false; error: string }> {
  await requireAdmin()

  const { snapshotId, sourcePath, targetType, customPath } = input
  const db = getDb()

  // 1. Look up the snapshot
  const [snap] = await db.select().from(snapshots).where(eq(snapshots.id, snapshotId)).limit(1)
  if (!snap) return { ok: false, error: 'Snapshot not found' }
  if (!snap.repositoryId) return { ok: false, error: 'Snapshot has no associated repository' }

  // 2. Look up the repository
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, snap.repositoryId)).limit(1)
  if (!repo) return { ok: false, error: 'Repository not found for this snapshot' }

  // 3. Decrypt the repo config and password
  let repoConfig: RepoConfigShape
  try {
    repoConfig = JSON.parse(decryptField(repo.config)) as RepoConfigShape
  } catch (err) {
    return { ok: false, error: `Failed to decrypt repository config: ${err instanceof Error ? err.message : String(err)}` }
  }
  const password = decryptField(repo.resticPassword)

  // 4. Resolve target path
  let targetPath: string
  switch (targetType) {
    case 'temp':
      targetPath = `/tmp/backupos-restore-${snapshotId.slice(0, 8)}-${Date.now()}`
      break
    case 'inplace':
      targetPath = sourcePath
      break
    case 'custom':
      if (!customPath || !customPath.startsWith('/')) {
        return { ok: false, error: 'Custom path must be an absolute path starting with /' }
      }
      targetPath = customPath
      break
  }

  // 5. Snapshot → job → agent
  if (!snap.jobId) {
    return { ok: false, error: 'Snapshot has no associated job' }
  }
  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, snap.jobId)).limit(1)
  if (!job) {
    return { ok: false, error: 'Job not found for this snapshot' }
  }
  if (!job.agentId) {
    return { ok: false, error: 'Job has no agent assigned. Set an agent on the job before restoring.' }
  }
  const agentId = job.agentId
  if (!connectedAgentIds().includes(agentId)) {
    return { ok: false, error: `Agent ${agentId} is not currently connected` }
  }

  // 6. Mount NFS repo if needed (no-op for non-NFS)
  try {
    await ensureRepoMountedOnAgent(agentId, snap.repositoryId)
  } catch (err) {
    return { ok: false, error: `Repo mount failed: ${err instanceof Error ? err.message : String(err)}` }
  }

  // 7. Insert the restore_runs row in 'running' state
  const runId = crypto.randomUUID()
  await db.insert(restoreRuns).values({
    id: runId,
    specId: null,
    snapshotId,
    status: 'running',
    trigger: 'manual',
    startedAt: new Date(),
  })

  const targetIsAgentLocal = targetType === 'temp' || targetType === 'custom'

  // 8. Dispatch to agent and await started ack
  const dispatchResult = await requestFilesystemRestore(agentId, {
    restoreId:    runId,
    repoUrl:      repoConfig.repositoryUrl,
    repoPassword: password,
    envVars:      repoConfig.envVars,
    snapshotId,
    targetPath,
    sourcePath,
    targetIsAgentLocal,
  })

  if (!dispatchResult.ok) {
    await db.update(restoreRuns).set({
      status:      'failed',
      log:         JSON.stringify({ error: dispatchResult.error }),
      completedAt: new Date(),
    }).where(eq(restoreRuns.id, runId))
    return { ok: false, error: dispatchResult.error }
  }

  return { ok: true, runId }
}
