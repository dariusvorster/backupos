import * as cron from 'node-cron'
import { parseExpression } from 'cron-parser'
import { getDb, backupJobs, backupRuns, repositories, agents, eq, and, lt } from '@backupos/db'
import { ResticEngine } from '@backupos/engine'
import { sendAlert } from './alerts'

interface RepoConfig {
  repositoryUrl: string
  password: string
  envVars?: Record<string, string>
}

interface SourceConfig {
  paths?: string[]
  exclude?: string[]
}

export async function initScheduler(): Promise<void> {
  const db = getDb()

  const jobs = await db
    .select()
    .from(backupJobs)
    .where(eq(backupJobs.enabled, true))
    .all()

  for (const job of jobs) {
    if (!cron.validate(job.schedule)) {
      console.warn(`[scheduler] Invalid cron "${job.schedule}" for job "${job.name}"`)
      continue
    }

    cron.schedule(job.schedule, () => { void runJob(db, job) }, { timezone: 'UTC' })
    console.log(`[scheduler] Scheduled "${job.name}" (${job.schedule})`)
  }

  // Check for disconnected agents every 5 minutes
  cron.schedule('*/5 * * * *', () => { void checkAgents(db) }, { timezone: 'UTC' })
  console.log('[scheduler] Agent health monitor active')

  // Check for missed backups every 10 minutes
  cron.schedule('*/10 * * * *', () => { void checkMissedBackups(db) }, { timezone: 'UTC' })
  console.log('[scheduler] Missed-backup monitor active')
}

type Db = ReturnType<typeof getDb>
type Job = typeof backupJobs.$inferSelect

async function runJob(db: Db, job: Job): Promise<void> {
  if (!job.repositoryId) return

  const [repo] = await db.select().from(repositories).where(eq(repositories.id, job.repositoryId)).limit(1)
  if (!repo) return

  const repoConfig  = JSON.parse(repo.config)    as RepoConfig
  const srcConfig   = JSON.parse(job.sourceConfig) as SourceConfig
  const paths       = srcConfig.paths ?? []
  if (paths.length === 0) return

  const runId     = crypto.randomUUID()
  const startedAt = new Date()

  await db.insert(backupRuns).values({
    id:           runId,
    jobId:        job.id,
    repositoryId: job.repositoryId,
    agentId:      job.agentId ?? null,
    status:       'running',
    trigger:      'scheduled',
    startedAt,
  })

  try {
    const engine = new ResticEngine({
      repositoryUrl: repoConfig.repositoryUrl,
      password:      repoConfig.password,
      envVars:       repoConfig.envVars ?? {},
      binaryPath:    process.env['RESTIC_BINARY_PATH'],
    })

    const tags   = job.tags ? (JSON.parse(job.tags) as string[]) : [`job:${job.id}`]
    const result = await engine.backup({ paths, exclude: srcConfig.exclude, tags })

    await db.update(backupRuns).set({
      status:          'success',
      completedAt:     new Date(),
      snapshotId:      result.snapshotId,
      filesNew:        result.filesNew,
      filesChanged:    result.filesChanged,
      filesUnmodified: result.filesUnmodified,
      dataAdded:       result.dataAdded,
      totalSize:       result.totalSize,
      duration:        result.duration,
    }).where(eq(backupRuns.id, runId))

    await db.update(backupJobs).set({
      lastRunAt:     new Date(),
      lastRunStatus: 'success',
    }).where(eq(backupJobs.id, job.id))

  } catch (err) {
    const errorMessage = String(err)

    await db.update(backupRuns).set({
      status:       'failed',
      completedAt:  new Date(),
      errorMessage,
    }).where(eq(backupRuns.id, runId))

    await db.update(backupJobs).set({
      lastRunAt:     new Date(),
      lastRunStatus: 'failed',
    }).where(eq(backupJobs.id, job.id))

    await sendAlert('backup_failed', { jobId: job.id, jobName: job.name, error: errorMessage })
  }
}

// In-memory set prevents duplicate missed-backup alerts within a server session
const missedAlertSent = new Set<string>()

async function checkMissedBackups(db: Db): Promise<void> {
  const jobs = await db
    .select()
    .from(backupJobs)
    .where(eq(backupJobs.enabled, true))
    .all()

  for (const job of jobs) {
    try {
      const interval = parseExpression(job.schedule, { tz: 'UTC' })
      const prevExpected = interval.prev().toDate()
      // Give the job a 5-minute grace window
      const grace = 5 * 60 * 1000
      const lastRun = job.lastRunAt

      const missed = !lastRun || lastRun.getTime() < prevExpected.getTime() - grace

      if (missed && !missedAlertSent.has(job.id)) {
        missedAlertSent.add(job.id)
        await sendAlert('backup_missed', { jobId: job.id, jobName: job.name })
      } else if (!missed) {
        // Clear flag once the job has run successfully again
        missedAlertSent.delete(job.id)
      }
    } catch {
      // invalid cron expression — skip
    }
  }
}

async function checkAgents(db: Db): Promise<void> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000)
  const stale  = await db
    .select()
    .from(agents)
    .where(and(eq(agents.status, 'connected'), lt(agents.lastSeenAt, cutoff)))
    .all()

  for (const agent of stale) {
    await db.update(agents).set({ status: 'disconnected' }).where(eq(agents.id, agent.id))
    await sendAlert('agent_disconnected', { agentId: agent.id, agentName: agent.name })
  }
}
