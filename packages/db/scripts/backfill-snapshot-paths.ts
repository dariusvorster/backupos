import { getDb, snapshots, backupJobs, eq } from '../src/index'

interface SourceConfigShape {
  paths?: string[]
  volumes?: string[]
  services?: { includedVolumes?: string[] }[]
}

async function main(): Promise<void> {
  const db = getDb()

  const rows = await db.select().from(snapshots).all()
  const broken = rows.filter(s => !s.paths || s.paths === '' || s.paths === '[]')
  console.log(`[backfill] found ${rows.length} snapshots, ${broken.length} need backfill`)

  let fixed = 0
  let skipped = 0

  for (const snap of broken) {
    if (!snap.jobId) {
      console.warn(`[backfill] snapshot ${snap.id} has no jobId — skipping`)
      skipped++
      continue
    }

    const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, snap.jobId)).limit(1)
    if (!job) {
      console.warn(`[backfill] snapshot ${snap.id} has jobId ${snap.jobId} but job not found — skipping`)
      skipped++
      continue
    }

    if (!job.sourceConfig) {
      console.warn(`[backfill] job ${job.id} has no sourceConfig — skipping snapshot ${snap.id}`)
      skipped++
      continue
    }

    let paths: string[] = []
    try {
      const cfg = JSON.parse(job.sourceConfig) as SourceConfigShape
      if (job.sourceType === 'docker_volume') {
        paths = (cfg.volumes ?? []).map(v => `/var/lib/docker/volumes/${v}/_data`)
      } else if (job.sourceType === 'compose_project') {
        const allVolumes: string[] = []
        for (const svc of cfg.services ?? []) {
          for (const v of svc.includedVolumes ?? []) allVolumes.push(`/var/lib/docker/volumes/${v}/_data`)
        }
        paths = allVolumes
      } else {
        paths = cfg.paths ?? []
      }
    } catch {
      console.warn(`[backfill] job ${job.id} sourceConfig parse failed — skipping snapshot ${snap.id}`)
      skipped++
      continue
    }

    if (paths.length === 0) {
      console.warn(`[backfill] derived paths empty for snapshot ${snap.id} (job ${job.name}) — skipping`)
      skipped++
      continue
    }

    await db.update(snapshots)
      .set({ paths: JSON.stringify(paths) })
      .where(eq(snapshots.id, snap.id))

    console.log(`[backfill] snapshot ${snap.id.slice(0, 12)} (job ${job.name}) → ${JSON.stringify(paths)}`)
    fixed++
  }

  console.log(`[backfill] done. fixed=${fixed} skipped=${skipped}`)
}

main().then(() => process.exit(0)).catch(err => {
  console.error('[backfill] failed:', err)
  process.exit(1)
})
