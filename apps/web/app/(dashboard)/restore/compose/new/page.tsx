import { getDb, backupJobs, backupRuns, eq, and, desc } from '@backupos/db'
import { ComposeRestoreWizard } from './compose-restore-wizard'
import type { ComposeProjectConfig } from '@backupos/agent-protocol'

export const dynamic = 'force-dynamic'

export default async function ComposeRestoreNewPage() {
  const db = getDb()

  const jobs = await db
    .select({ id: backupJobs.id, name: backupJobs.name, sourceConfig: backupJobs.sourceConfig, agentId: backupJobs.agentId })
    .from(backupJobs)
    .where(eq(backupJobs.sourceType, 'compose_project'))
    .all()

  const jobData = await Promise.all(jobs.map(async job => {
    const runs = await db
      .select({ id: backupRuns.id, startedAt: backupRuns.startedAt, snapshotIds: backupRuns.snapshotIds })
      .from(backupRuns)
      .where(and(eq(backupRuns.jobId, job.id), eq(backupRuns.status, 'success')))
      .orderBy(desc(backupRuns.startedAt))
      .limit(10)
      .all()

    let projectName = job.name
    try {
      const cfg = JSON.parse(job.sourceConfig) as ComposeProjectConfig
      projectName = cfg.projectName ?? job.name
    } catch { /* sourceConfig not yet set */ }

    return {
      id:          job.id,
      name:        job.name,
      projectName,
      agentId:     job.agentId,
      runs: runs.map(r => ({
        id:          r.id,
        startedAt:   r.startedAt.toISOString(),
        snapshotIds: r.snapshotIds ? (JSON.parse(r.snapshotIds) as string[]) : [],
      })),
    }
  }))

  return (
    <div style={{ maxWidth: 640, margin: '32px auto', padding: '0 16px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Restore compose project</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 24 }}>
        Restore a previously backed-up compose project from a snapshot.
        Default mode is side-by-side (safe). In-place requires explicit confirmation.
      </p>
      <ComposeRestoreWizard jobs={jobData} />
    </div>
  )
}
