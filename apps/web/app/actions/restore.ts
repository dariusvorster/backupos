'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb, restoreSpecs, restoreRuns, snapshots, repositories, backupJobs, backupRuns, alertChannels, hypervisorTargets, hypervisorIntegrations, eq, desc, and } from '@backupos/db'
import type { ComposeProjectConfig } from '@backupos/agent-protocol'
import { parseRestoreSpec, executeRestoreSpec, type RestoreRunResult, type NotifyDelivery, type DatabaseRestoreDelivery, type XcpngVmRestoreDelivery } from '@backupos/restore'
import { requireAdmin } from '@/lib/user'
import { dispatchToChannel, fireRestoreSucceeded, fireRestoreFailed } from '@/lib/alerts'
import type { AlertType, AlertPayload } from '@/lib/alerts'
import { decryptField } from '@/lib/repo-crypto'
import { connectedAgentIds, requestFilesystemRestore, requestDatabaseRestore, requestSnapshotPaths, dispatch } from '@/lib/ws-state'
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

const deliverDatabaseRestore: DatabaseRestoreDelivery = async (step, _snapshotId, agentId) => {
  if (step.app !== 'postgres' && step.app !== 'mysql' && step.app !== 'mariadb') {
    return { success: false, error: `Unsupported database app: ${step.app}` }
  }

  return requestDatabaseRestore(agentId, {
    restoreId:       crypto.randomUUID(),
    app:             step.app,
    dumpFilePath:    step.snapshotPath,
    targetContainer: step.target.container,
    targetDatabase:  step.target.database,
    targetUsername:  step.target.username,
  })
}

const xcpngVmRestoreDelivery: XcpngVmRestoreDelivery = async (step, _snapshotId) => {
  const db = getDb()

  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, step.backupJobId)).limit(1)
  if (!job) return { success: false, error: `Backup job ${step.backupJobId} not found` }

  const srcConfig = JSON.parse(job.sourceConfig ?? '{}') as { targetId?: string }
  const [target] = await db.select().from(hypervisorTargets)
    .where(eq(hypervisorTargets.id, srcConfig.targetId ?? '')).limit(1)
  if (!target) return { success: false, error: `Hypervisor target not found for job ${step.backupJobId}` }

  const [integration] = await db.select().from(hypervisorIntegrations)
    .where(eq(hypervisorIntegrations.id, target.integrationId ?? '')).limit(1)
  if (!integration) return { success: false, error: `Hypervisor integration not found` }

  const xcpServiceUrl  = process.env['BACKUPOS_XCP_URL']
  const internalSecret = process.env['BACKUPOS_INTERNAL_SECRET']
  if (!xcpServiceUrl || !internalSecret) {
    return { success: false, error: 'BACKUPOS_XCP_URL or BACKUPOS_INTERNAL_SECRET not set on server' }
  }

  const [repo] = await db.select().from(repositories)
    .where(eq(repositories.id, job.repositoryId ?? '')).limit(1)
  if (!repo) return { success: false, error: 'Repository not found for job' }

  let repoConfig: { repositoryUrl?: string; envVars?: Record<string, string> }
  try { repoConfig = JSON.parse(decryptField(repo.config)) as typeof repoConfig } catch {
    return { success: false, error: 'Failed to decrypt repository config' }
  }
  const repoPassword = decryptField(repo.resticPassword)

  const integrationConfig = JSON.parse(integration.config) as Record<string, string>
  const poolMasterUrl = (integrationConfig['host'] ?? '').startsWith('http')
    ? (integrationConfig['host'] ?? '')
    : `https://${integrationConfig['host'] ?? ''}${integrationConfig['port'] ? `:${integrationConfig['port']}` : ''}`

  const tagsData = JSON.parse(target.tags ?? '{}') as {
    disks?: Array<{ uuid: string; virtual_size: number; user_device: string; bootable: boolean }>
  }

  const builtInAgentId = connectedAgentIds().find(id => id.startsWith('00000000-0000-0000-0000-'))
  if (!builtInAgentId) return { success: false, error: 'XCP-ng built-in agent is not connected' }

  const sent = dispatch(builtInAgentId, {
    type:         'run_xcpng_vm_restore',
    jobId:        crypto.randomUUID(),
    runId:        crypto.randomUUID(),
    pool: {
      masterUrl:             poolMasterUrl,
      username:              integrationConfig['username'] ?? '',
      password:              integrationConfig['password'] ?? '',
      certFingerprintSha256: integrationConfig['cert_fingerprint_sha256'] ?? '',
    },
    xcp: { serviceUrl: xcpServiceUrl, bearerToken: internalSecret },
    vmUUID:                  step.vmUUID,
    vmName:                  step.vmName,
    targetSrUUID:            step.targetSrUUID,
    targetTemplateNameLabel: step.targetTemplateNameLabel,
    repoId:                  job.repositoryId ?? '',
    repoUrl:      repoConfig.repositoryUrl ?? '',
    repoPassword,
    envVars:      repoConfig.envVars,
    memoryBytes:  step.memoryBytes,
    vcpus:        step.vcpus,
    disks: (tagsData.disks ?? []).map(d => ({
      originalVdiUUID: d.uuid,
      virtualSize:     d.virtual_size,
      userDevice:      d.user_device,
      bootable:        d.bootable,
    })),
  })

  if (!sent) return { success: false, error: 'Built-in agent disconnected before dispatch' }
  return { success: true }
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

  try {
    appendLog({
      level: 'info',
      component: 'web',
      message: `Restore dispatched for spec "${spec.name}"`,
      entityType: 'restore_run',
      entityId: runId,
      payload: { specId, snapshotId },
    })
  } catch (err) { console.error('[logger]', err) }

  executeRestoreSpec(parsed, snapshotId, 'local', deliverRestoreNotification, deliverDatabaseRestore, xcpngVmRestoreDelivery).then(async (result: RestoreRunResult) => {
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
        await fireRestoreSucceeded(runId)
      } else {
        await fireRestoreFailed(runId, result.failedStep
          ? `failed at step "${result.failedStep}"`
          : 'restore failed')
      }
    } catch (err) {
      console.error('[alerts] restore alert failed:', err)
    }
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
    try {
      await fireRestoreFailed(runId, err instanceof Error ? err.message : String(err))
    } catch (alertErr) {
      console.error('[alerts] restore alert failed:', alertErr)
    }
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

export async function getLatestSnapshotForJob(
  jobId: string,
): Promise<{ ok: true; snapshotId: string; createdAt: Date | null } | { ok: false; error: string }> {
  await requireAdmin()
  const db = getDb()

  const [latest] = await db
    .select({ id: snapshots.id, createdAt: snapshots.createdAt })
    .from(snapshots)
    .where(eq(snapshots.jobId, jobId))
    .orderBy(desc(snapshots.createdAt))
    .limit(1)
    .all()

  if (!latest) {
    return { ok: false, error: 'No snapshots found for this job. Run a successful backup first.' }
  }

  return { ok: true, snapshotId: latest.id, createdAt: latest.createdAt }
}

export interface ApphookService {
  serviceName: string
  apphookType: 'postgres' | 'mysql' | 'redis' | 'sqlite'
  apphookConfig: NonNullable<import('@backupos/agent-protocol').ComposeServiceConfig['apphookConfig']>
}

export async function getApphookServicesForJob(
  jobId: string,
): Promise<{ ok: true; services: ApphookService[] } | { ok: false; error: string }> {
  await requireAdmin()
  const db = getDb()
  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId)).limit(1)
  if (!job) return { ok: false, error: 'Job not found' }

  let config: ComposeProjectConfig
  try {
    config = JSON.parse(job.sourceConfig) as ComposeProjectConfig
  } catch {
    return { ok: false, error: 'Job source config is not valid JSON' }
  }

  if (!config.services) return { ok: false, error: 'Job has no compose services' }

  const apphookServices: ApphookService[] = config.services
    .filter(s => s.quiescence === 'apphook' && s.apphookType && s.apphookConfig)
    .map(s => ({
      serviceName:  s.serviceName,
      apphookType:  s.apphookType!,
      apphookConfig: s.apphookConfig!,
    }))

  return { ok: true, services: apphookServices }
}

export async function findDumpInSnapshot(
  agentId: string,
  snapshotId: string,
  repositoryId: string,
  serviceName: string,
): Promise<{ ok: true; dumpPath: string } | { ok: false; error: string }> {
  await requireAdmin()
  const db = getDb()

  const [repo] = await db.select().from(repositories).where(eq(repositories.id, repositoryId)).limit(1)
  if (!repo) return { ok: false, error: 'Repository not found' }

  let repoConfig: RepoConfigShape
  try {
    repoConfig = JSON.parse(decryptField(repo.config)) as RepoConfigShape
  } catch (err) {
    return { ok: false, error: `Failed to decrypt repository config: ${err instanceof Error ? err.message : String(err)}` }
  }
  const password = decryptField(repo.resticPassword)

  const result = await requestSnapshotPaths(agentId, {
    repoUrl:      repoConfig.repositoryUrl,
    repoPassword: password,
    envVars:      repoConfig.envVars,
    snapshotId,
    pattern:      `${serviceName}.dump`,
  })

  if (!result.ok) return { ok: false, error: result.error ?? 'list_snapshot_paths failed' }
  if (!result.paths || result.paths.length === 0) {
    return { ok: false, error: `No dump file found for service "${serviceName}" in snapshot` }
  }

  return { ok: true, dumpPath: result.paths[0]! }
}

async function waitForRestoreRun(
  runId: string,
  timeoutMs = 60_000,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb()
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1_500))
    const [run] = await db.select({ status: restoreRuns.status }).from(restoreRuns).where(eq(restoreRuns.id, runId)).limit(1)
    if (!run) return { ok: false, error: 'Restore run disappeared from DB' }
    if (run.status === 'success') return { ok: true }
    if (run.status === 'failed') return { ok: false, error: 'Filesystem restore failed' }
  }
  return { ok: false, error: 'Timed out waiting for filesystem restore to complete' }
}

export async function triggerDatabaseRestore(
  jobId: string,
  serviceName: string,
  targetDatabase: string,
): Promise<{ ok: true; restoreId: string } | { ok: false; error: string }> {
  await requireAdmin()
  const db = getDb()

  // 1. Look up the job to get the agent and apphook config
  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId)).limit(1)
  if (!job) return { ok: false, error: 'Job not found' }
  if (!job.agentId) return { ok: false, error: 'Job has no agent assigned' }
  if (!connectedAgentIds().includes(job.agentId)) {
    return { ok: false, error: `Agent ${job.agentId} is not currently connected` }
  }

  const agentId = job.agentId

  let composeConfig: ComposeProjectConfig
  try {
    composeConfig = JSON.parse(job.sourceConfig) as ComposeProjectConfig
  } catch {
    return { ok: false, error: 'Job source config is not valid JSON' }
  }

  const serviceConfig = composeConfig.services.find(s => s.serviceName === serviceName)
  if (!serviceConfig) return { ok: false, error: `Service "${serviceName}" not found in job config` }
  if (!serviceConfig.apphookType || !serviceConfig.apphookConfig) {
    return { ok: false, error: `Service "${serviceName}" has no apphook configuration` }
  }

  // 2. Find the latest snapshot for this job
  const snapshotResult = await getLatestSnapshotForJob(jobId)
  if (!snapshotResult.ok) return { ok: false, error: snapshotResult.error }

  const [snap] = await db.select().from(snapshots).where(eq(snapshots.id, snapshotResult.snapshotId)).limit(1)
  if (!snap || !snap.repositoryId) return { ok: false, error: 'Snapshot has no associated repository' }

  // 3. Locate the dump file in the snapshot
  const dumpResult = await findDumpInSnapshot(agentId, snapshotResult.snapshotId, snap.repositoryId, serviceName)
  if (!dumpResult.ok) return { ok: false, error: dumpResult.error }

  // 4. Restore the dump file from snapshot to agent-local temp dir
  const tempRoot = `/tmp/backupos-dbr-${crypto.randomUUID().slice(0, 8)}`
  const fsRestoreResult = await restoreFromSnapshot({
    snapshotId: snapshotResult.snapshotId,
    sourcePath: dumpResult.dumpPath,
    targetType: 'custom',
    customPath: tempRoot,
  })
  if (!fsRestoreResult.ok) return { ok: false, error: fsRestoreResult.error }

  // 5. Wait for the filesystem restore to complete
  const waitResult = await waitForRestoreRun(fsRestoreResult.runId)
  if (!waitResult.ok) return { ok: false, error: waitResult.error ?? 'Filesystem restore did not complete' }

  // 6. Dispatch run_database_restore
  const dumpFilePath = `${tempRoot}${dumpResult.dumpPath}`
  const apphook = serviceConfig.apphookConfig
  const app = serviceConfig.apphookType

  const dbRestoreId = crypto.randomUUID()

  await db.insert(restoreRuns).values({
    id:        dbRestoreId,
    specId:    null,
    snapshotId: snapshotResult.snapshotId,
    status:    'running',
    trigger:   'manual',
    startedAt: new Date(),
  })

  const requestId = crypto.randomUUID()
  const sent = dispatch(agentId, {
    type:            'run_database_restore',
    requestId,
    restoreId:       dbRestoreId,
    app,
    dumpFilePath,
    targetContainer: serviceName,
    targetDatabase:  targetDatabase || apphook.database,
    targetUsername:  apphook.username,
    targetHost:      apphook.host,
    targetPort:      apphook.port,
    passwordEnv:     apphook.passwordEnv,
    targetDbPath:    apphook.dbPath,
  })

  if (!sent) {
    await db.update(restoreRuns).set({ status: 'failed', completedAt: new Date() }).where(eq(restoreRuns.id, dbRestoreId))
    return { ok: false, error: 'Agent disconnected before database restore could be dispatched' }
  }

  return { ok: true, restoreId: dbRestoreId }
}

export async function getLatestRunForJob(
  jobId: string,
): Promise<{ ok: true; runId: string; createdAt: Date | null } | { ok: false; error: string }> {
  await requireAdmin()
  const db = getDb()

  const [latest] = await db
    .select({ id: backupRuns.id, createdAt: backupRuns.startedAt })
    .from(backupRuns)
    .where(and(
      eq(backupRuns.jobId, jobId),
      eq(backupRuns.status, 'success'),
    ))
    .orderBy(desc(backupRuns.startedAt))
    .limit(1)
    .all()

  if (!latest) {
    return { ok: false, error: 'No successful backup runs found for this job. Run a successful backup first.' }
  }

  return { ok: true, runId: latest.id, createdAt: latest.createdAt }
}

export async function getJobComposeProjectName(
  jobId: string,
): Promise<{ ok: true; projectName: string } | { ok: false; error: string }> {
  await requireAdmin()
  const db = getDb()
  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId)).limit(1)
  if (!job?.sourceConfig) return { ok: false, error: 'Job has no source config' }
  try {
    const cfg = JSON.parse(job.sourceConfig) as ComposeProjectConfig
    if (!cfg.projectName) return { ok: false, error: 'Compose config has no project name' }
    return { ok: true, projectName: cfg.projectName }
  } catch {
    return { ok: false, error: 'Compose config is malformed' }
  }
}

export async function cancelRestore(restoreId: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin()
  if (!restoreId) return { ok: false, error: 'restoreId required' }

  const db = getDb()
  const [run] = await db.select().from(restoreRuns).where(eq(restoreRuns.id, restoreId)).limit(1)
  if (!run) return { ok: false, error: 'Restore run not found' }
  if (run.status !== 'running') return { ok: false, error: `Restore is ${run.status}, not running` }

  for (const agentId of connectedAgentIds()) {
    dispatch(agentId, { type: 'cancel_filesystem_restore', restoreId })
  }

  return { ok: true }
}
