import { getDb, backupJobs, backupRuns, hypervisorTargets, eq, and, desc } from '@backupos/db'
import { NewRestoreSpecWizard } from './new-restore-spec-wizard'

export const dynamic = 'force-dynamic'

export default async function NewRestoreSpecPage() {
  const db = getDb()

  const xcpJobs = await db
    .select({
      id:            backupJobs.id,
      name:          backupJobs.name,
      sourceConfig:  backupJobs.sourceConfig,
    })
    .from(backupJobs)
    .where(eq(backupJobs.sourceType, 'xcpng_vm'))
    .all()

  const xcpJobData = await Promise.all(xcpJobs.map(async job => {
    let target: { id: string; name: string; externalId: string; integrationId: string | null; tags: string | null } | null = null
    try {
      const cfg = JSON.parse(job.sourceConfig) as { targetId?: string }
      if (cfg.targetId) {
        const [t] = await db
          .select({
            id:            hypervisorTargets.id,
            name:          hypervisorTargets.name,
            externalId:    hypervisorTargets.externalId,
            integrationId: hypervisorTargets.integrationId,
            tags:          hypervisorTargets.tags,
          })
          .from(hypervisorTargets)
          .where(eq(hypervisorTargets.id, cfg.targetId))
          .limit(1)
        target = t ?? null
      }
    } catch { /* malformed sourceConfig */ }

    const runs = await db
      .select({ id: backupRuns.id, startedAt: backupRuns.startedAt, snapshotIds: backupRuns.snapshotIds })
      .from(backupRuns)
      .where(and(eq(backupRuns.jobId, job.id), eq(backupRuns.status, 'success')))
      .orderBy(desc(backupRuns.startedAt))
      .limit(10)
      .all()

    let disks: Array<{ uuid: string; user_device: string; virtual_size: number }> = []
    if (target?.tags) {
      try {
        const t = JSON.parse(target.tags) as { disks?: Array<{ uuid: string; user_device: string; virtual_size: number }> }
        disks = t.disks ?? []
      } catch { /* malformed tags */ }
    }

    return {
      id:            job.id,
      name:          job.name,
      vmName:        target?.name ?? job.name,
      vmUUID:        target?.externalId ?? '',
      integrationId: target?.integrationId ?? '',
      disks,
      runs: runs.map(r => ({
        id:          r.id,
        startedAt:   r.startedAt ? r.startedAt.toISOString() : new Date(0).toISOString(),
        snapshotIds: r.snapshotIds ? (JSON.parse(r.snapshotIds) as string[]) : [],
      })),
    }
  }))

  return (
    <div style={{ maxWidth: 800 }}>
      <a href="/restore" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 20 }}>← Restore</a>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}>New restore spec</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 24 }}>
        Define your restore as a sequence of steps. Use the form for guided VM restore, or YAML for advanced multi-step flows.
      </p>
      <NewRestoreSpecWizard xcpJobs={xcpJobData} />
    </div>
  )
}
