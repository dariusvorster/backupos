'use server'

import { redirect } from 'next/navigation'
import { getDb, backupJobs, backupRuns, repositories, eq } from '@backupos/db'
import { decryptField } from '@/lib/repo-crypto'
import { dispatchToAgent } from '@/lib/internal-dispatch'
import { connectedAgentIds } from '@/lib/ws-state'
import { ensureRepoMountedOnAgent } from '@/lib/repo-mount'
import type { ComposeProjectConfig } from '@backupos/agent-protocol'
import { requireAdminAction } from '@/lib/user'

export async function triggerComposeRestore(formData: FormData): Promise<void> {
  await requireAdminAction()
  const jobId                 = (formData.get('jobId')                 as string | null)?.trim() ?? ''
  const sourceRunId           = (formData.get('sourceRunId')           as string | null)?.trim() ?? ''
  const rawMode = (formData.get('mode') as string | null)?.trim()
  const mode: 'in_place' | 'side_by_side' = rawMode === 'in_place' ? 'in_place' : 'side_by_side'
  const sideBySideProjectName = (formData.get('sideBySideProjectName') as string | null)?.trim() || undefined
  const restoreComposeFile     = formData.get('restoreComposeFile') === '1'
  const confirmedProjectName  = (formData.get('confirmedProjectName') as string | null)?.trim() ?? ''

  if (!jobId || !sourceRunId) redirect('/restore/compose/new')

  const db  = getDb()
  const now = new Date()

  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId)).limit(1)
  if (!job || !job.repositoryId) redirect(`/jobs/${jobId}`)

  if (!job.agentId) {
    const runId = crypto.randomUUID()
    await db.insert(backupRuns).values({
      id: runId, jobId, repositoryId: job.repositoryId,
      status: 'failed', trigger: 'manual', startedAt: now, completedAt: now,
      runType: 'restore',
      errorMessage: 'job has no agent assigned — set an agent on this job',
    })
    redirect(`/jobs/${jobId}`)
  }

  if (!connectedAgentIds().includes(job.agentId)) {
    const runId = crypto.randomUUID()
    await db.insert(backupRuns).values({
      id: runId, jobId, repositoryId: job.repositoryId, agentId: job.agentId,
      status: 'failed', trigger: 'manual', startedAt: now, completedAt: now,
      runType: 'restore',
      errorMessage: `agent ${job.agentId} is not connected`,
    })
    redirect(`/jobs/${jobId}`)
  }

  const [sourceRun] = await db.select().from(backupRuns).where(eq(backupRuns.id, sourceRunId)).limit(1)
  if (!sourceRun || sourceRun.jobId !== jobId) redirect(`/jobs/${jobId}`)

  const snapshotIds   = sourceRun.snapshotIds ? (JSON.parse(sourceRun.snapshotIds) as string[]) : []
  const composeConfig = JSON.parse(job.sourceConfig) as ComposeProjectConfig

  if (mode === 'in_place' && confirmedProjectName !== composeConfig.projectName) {
    redirect(`/restore/compose/new?confirmError=${encodeURIComponent('In-place restore requires typing the project name exactly to confirm.')}`)
  }

  const [repo] = await db.select().from(repositories).where(eq(repositories.id, job.repositoryId!)).limit(1)
  if (!repo) redirect(`/jobs/${jobId}`)

  const cfg      = JSON.parse(decryptField(repo.config)) as Record<string, string>
  const password = decryptField(repo.resticPassword)
  if (!password) throw new Error(`triggerComposeRestore: failed to decrypt repo password for ${repo.id}`)

  try {
    await ensureRepoMountedOnAgent(job.agentId!, job.repositoryId!)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await db.insert(backupRuns).values({
      id: crypto.randomUUID(), jobId, repositoryId: job.repositoryId!, agentId: job.agentId!,
      status: 'failed', trigger: 'manual', startedAt: now, completedAt: now,
      runType: 'restore', errorMessage: `NFS mount failed: ${errorMessage}`,
    })
    redirect(`/jobs/${jobId}`)
  }

  const runId = crypto.randomUUID()
  await db.insert(backupRuns).values({
    id: runId, jobId, repositoryId: job.repositoryId!, agentId: job.agentId!,
    status: 'running', trigger: 'manual', startedAt: now,
    runType: 'restore',
  })

  const result = await dispatchToAgent(job.agentId!, {
    type:         'run_compose_restore',
    jobId,
    runId,
    repoId:       job.repositoryId!,
    repoUrl:      cfg['repositoryUrl'] ?? '',
    repoPassword: password,
    envVars:      cfg,
    config: {
      mode,
      snapshotIds,
      composeConfig,
      restoreComposeFile,
      sideBySideProjectName,
    },
  })

  if (!result.ok) {
    await db.update(backupRuns).set({
      status: 'failed', completedAt: now,
      errorMessage: `dispatch failed: ${result.reason ?? 'unknown'}`,
    }).where(eq(backupRuns.id, runId))
  }

  redirect(`/jobs/${jobId}`)
}
