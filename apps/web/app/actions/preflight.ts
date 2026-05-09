'use server'

import { revalidatePath } from 'next/cache'
import { getDb, backupJobs, backupRuns, agents, repositories } from '@backupos/db'
import { eq, desc } from '@backupos/db'
import { runPreflightChecks, overallStatus, CheckResult } from '@/lib/preflight'
import { requireAdminAction } from '@/lib/user'

export async function runPreflight(jobId: string): Promise<CheckResult[]> {
  const db  = getDb()
  const job = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId)).limit(1).then(r => r[0] ?? null)
  if (!job) return []

  const [agent, repository, recentRuns] = await Promise.all([
    job.agentId
      ? db.select().from(agents).where(eq(agents.id, job.agentId)).limit(1).then(r => r[0] ?? null)
      : Promise.resolve(null),
    job.repositoryId
      ? db.select().from(repositories).where(eq(repositories.id, job.repositoryId)).limit(1).then(r => r[0] ?? null)
      : Promise.resolve(null),
    db.select({ status: backupRuns.status, startedAt: backupRuns.startedAt, dataAdded: backupRuns.dataAdded })
      .from(backupRuns)
      .where(eq(backupRuns.jobId, jobId))
      .orderBy(desc(backupRuns.startedAt))
      .limit(5),
  ])

  const results = runPreflightChecks({
    job: {
      id:           job.id,
      sourceType:   job.sourceType,
      sourceConfig: job.sourceConfig,
      preHook:      job.preHook ?? null,
      enabled:      job.enabled ?? null,
    },
    agent: agent
      ? { id: agent.id, name: agent.name, lastSeenAt: agent.lastSeenAt ?? null }
      : null,
    repository: repository
      ? { id: repository.id, name: repository.name, sizeBytes: repository.sizeBytes ?? null }
      : null,
    recentRuns,
  })

  const status = overallStatus(results)

  await db.update(backupJobs)
    .set({ lastPreflightAt: new Date(), lastPreflightStatus: status })
    .where(eq(backupJobs.id, jobId))
    .run()

  revalidatePath(`/jobs/${jobId}`)
  return results
}

export async function togglePreflight(jobId: string, formData: FormData): Promise<void> {
  await requireAdminAction()
  const enabled = formData.get('preflightEnabled') === 'on'
  const db = getDb()
  await db.update(backupJobs)
    .set({ preflightEnabled: enabled })
    .where(eq(backupJobs.id, jobId))
    .run()
  revalidatePath(`/jobs/${jobId}`)
}
