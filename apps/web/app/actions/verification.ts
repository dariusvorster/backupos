'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb, verificationTests, verificationRuns, backupRuns, backupJobs, repositories, eq, and, desc } from '@backupos/db'
import { encryptField, decryptField } from '@/lib/repo-crypto'
import { dispatchToAgent } from '@/lib/internal-dispatch'
import { connectedAgentIds } from '@/lib/ws-state'
import { ensureRepoMountedOnAgent } from '@/lib/repo-mount'
import { requireAdmin } from '@/lib/user'
import { appendAuditEntry } from '@/lib/audit'
import { parseExpression } from 'cron-parser'

export async function createVerificationTest(data: {
  name: string
  jobId: string
  targetType: string
  validationHook: string
  schedule: string
  targetConfig?: {
    host: string
    user: string
    port?: number
    sshKey: string
    remoteDir: string
    cleanupRemote?: boolean
  } | null
}): Promise<void> {
  await requireAdmin() // admin only
  const { name, jobId, targetType, validationHook, schedule, targetConfig } = data
  if (!name || !jobId || !targetType || !schedule) return

  let storedTargetConfig: string | null = null
  if (targetType === 'ssh_target' && targetConfig) {
    const { sshKey, ...rest } = targetConfig
    storedTargetConfig = JSON.stringify({ ...rest, sshKey: encryptField(sshKey) })
  }

  const db = getDb()
  const id = crypto.randomUUID()
  await db.insert(verificationTests).values({
    id,
    name,
    jobId,
    targetType,
    targetConfig:   storedTargetConfig,
    validationHook: validationHook || null,
    schedule,
    enabled:   true,
    createdAt: new Date(),
  })
  redirect(`/verification/${id}`)
}

export async function runVerification(testId: string): Promise<void> {
  const db = getDb()
  const [test] = await db.select().from(verificationTests).where(eq(verificationTests.id, testId)).limit(1)
  if (!test) throw new Error('Verification test not found')
  if (!test.jobId) throw new Error('Verification test has no backup job configured')

  // Find latest successful snapshot for this job
  const [latestRun] = await db.select({ snapshotId: backupRuns.snapshotId, agentId: backupRuns.agentId })
    .from(backupRuns)
    .where(and(eq(backupRuns.jobId, test.jobId), eq(backupRuns.status, 'success')))
    .orderBy(desc(backupRuns.startedAt))
    .limit(1)
  if (!latestRun?.snapshotId) throw new Error('No successful backup run found for this job — run a backup first')

  // Find job + repo for credentials
  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, test.jobId)).limit(1)
  if (!job?.repositoryId) throw new Error('Job has no repository configured')
  if (!job.agentId) throw new Error('Job has no agent assigned')

  const [repo] = await db.select().from(repositories).where(eq(repositories.id, job.repositoryId)).limit(1)
  if (!repo) throw new Error('Repository not found')

  // Require agent to be connected
  const connected = connectedAgentIds()
  const agentId = connected.includes(job.agentId) ? job.agentId : null
  if (!agentId) throw new Error('Agent is not connected. Connect the agent before running verification.')

  const repoCfg = JSON.parse(decryptField(repo.config)) as Record<string, string>
  const repoUrl      = repoCfg['repositoryUrl'] ?? ''
  const repoPassword = decryptField(repo.resticPassword)

  const runId = crypto.randomUUID()
  const now   = new Date()

  await db.insert(verificationRuns).values({
    id:        runId,
    testId,
    status:    'running',
    startedAt: now,
  })

  await db.update(verificationTests)
    .set({ lastRunAt: now })
    .where(eq(verificationTests.id, testId))

  try {
    await ensureRepoMountedOnAgent(agentId, job.repositoryId)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await db.update(verificationRuns).set({
      status:       'failed',
      completedAt:  new Date(),
      errorMessage: `NFS mount failed: ${errorMessage}`,
    }).where(eq(verificationRuns.id, runId))
    await db.update(verificationTests)
      .set({ lastResult: 'failed' })
      .where(eq(verificationTests.id, testId))
    revalidatePath(`/verification/${testId}`)
    return
  }

  const result = await dispatchToAgent(agentId, {
    type:              'run_verification',
    verificationRunId: runId,
    repoId:            job.repositoryId,
    snapshotId:        latestRun.snapshotId,
    repoUrl,
    repoPassword,
    envVars:           repoCfg,
    targetType:        'temp_directory',
    validationHook:    test.validationHook ?? null,
  })

  if (!result.ok) {
    await db.update(verificationRuns).set({
      status:       'failed',
      completedAt:  now,
      errorMessage: `dispatch failed: ${result.reason ?? 'unknown'}`,
    }).where(eq(verificationRuns.id, runId))
    await db.update(verificationTests)
      .set({ lastResult: 'failed' })
      .where(eq(verificationTests.id, testId))
  }

  revalidatePath(`/verification/${testId}`)
}

// ── Edit / Delete ─────────────────────────────────────────────────────────────

export interface UpdateVerificationTestInput {
  id:             string
  name:           string
  schedule:       string
  validationHook: string
  sshHost?:       string
  sshPort?:       number
  sshUser?:       string
  sshKey?:        string  // empty = keep existing
  remoteDir?:     string
  cleanupRemote?: boolean
}

export async function updateVerificationTest(input: UpdateVerificationTestInput): Promise<{ error?: string }> {
  const adminUser = await requireAdmin()
  const db = getDb()

  if (!input.name?.trim()) return { error: 'Name is required' }
  if (!input.schedule?.trim()) return { error: 'Schedule is required' }
  if (input.name.length > 200) return { error: 'Name too long (max 200 chars)' }

  try {
    parseExpression(input.schedule)
  } catch (err) {
    return { error: `Invalid cron expression: ${(err as Error).message}` }
  }

  const [existing] = await db.select().from(verificationTests).where(eq(verificationTests.id, input.id)).limit(1)
  if (!existing) return { error: 'Verification test not found' }

  let nextTargetConfig: string | null = existing.targetConfig
  if (existing.targetType === 'ssh_target') {
    if (!input.sshHost || !input.sshUser || !input.remoteDir) {
      return { error: 'SSH host, user, and remote directory are required for SSH targets' }
    }
    const oldCfg = existing.targetConfig
      ? JSON.parse(existing.targetConfig) as Record<string, string | number | boolean>
      : {}
    const oldSshKeyEncrypted = typeof oldCfg['sshKey'] === 'string' ? oldCfg['sshKey'] as string : null
    const newSshKeyEncrypted = input.sshKey?.trim()
      ? encryptField(input.sshKey)
      : oldSshKeyEncrypted

    nextTargetConfig = JSON.stringify({
      host:          input.sshHost,
      port:          input.sshPort ?? 22,
      user:          input.sshUser,
      sshKey:        newSshKeyEncrypted,
      remoteDir:     input.remoteDir,
      cleanupRemote: input.cleanupRemote ?? true,
    })
  }

  await db.update(verificationTests)
    .set({
      name:           input.name.trim(),
      schedule:       input.schedule.trim(),
      validationHook: input.validationHook?.trim() || null,
      targetConfig:   nextTargetConfig,
    })
    .where(eq(verificationTests.id, input.id))

  void appendAuditEntry({
    action:       'verification.updated',
    resourceType: 'verification_test',
    resourceId:   input.id,
    resourceName: input.name.trim(),
    actor:        adminUser.id,
    detail:       { schedule: input.schedule, hookChanged: input.validationHook !== existing.validationHook },
  })

  revalidatePath(`/verification/${input.id}`)
  revalidatePath('/verification')
  return {}
}

export async function deleteVerificationTest(id: string): Promise<{ error?: string }> {
  const adminUser = await requireAdmin()
  const db = getDb()

  const [existing] = await db.select().from(verificationTests).where(eq(verificationTests.id, id)).limit(1)
  if (!existing) return { error: 'Verification test not found' }

  await db.delete(verificationRuns).where(eq(verificationRuns.testId, id))
  await db.delete(verificationTests).where(eq(verificationTests.id, id))

  void appendAuditEntry({
    action:       'verification.deleted',
    resourceType: 'verification_test',
    resourceId:   id,
    resourceName: existing.name,
    actor:        adminUser.id,
  })

  revalidatePath('/verification')
  return {}
}
