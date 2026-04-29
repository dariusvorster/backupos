'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb, verificationTests, verificationRuns, backupRuns, backupJobs, repositories, eq, and, desc } from '@backupos/db'
import { decryptField } from '@/lib/repo-crypto'
import { dispatchToAgent } from '@/lib/internal-dispatch'
import { connectedAgentIds } from '@/lib/ws-state'
import { ensureRepoMountedOnAgent } from '@/lib/repo-mount'

export async function createVerificationTest(data: {
  name: string
  jobId: string
  targetType: string
  validationHook: string
  schedule: string
}): Promise<void> {
  const { name, jobId, targetType, validationHook, schedule } = data
  if (!name || !jobId || !targetType || !schedule) return

  const db = getDb()
  const id = crypto.randomUUID()
  await db.insert(verificationTests).values({
    id,
    name,
    jobId,
    targetType,
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
