import * as cron from 'node-cron'
import { parseExpression } from 'cron-parser'
import { getDb, backupJobs, backupRuns, repositories, agents, backupDefaults, eq, and, lt, lte, isNotNull } from '@backupos/db'
import { decryptField } from './repo-crypto'
import { ResticEngine } from '@backupos/engine'
import { sendAlert } from './alerts'
import { dispatch, connectedAgentIds } from './ws-state'
import type { ServerMessage, MountConfig } from '@backupos/agent-protocol'

interface RepoConfig {
  repositoryUrl: string
  password: string
  envVars?: Record<string, string>
}

interface SourceConfig {
  paths?:    string[]
  volumes?:  string[]
  exclude?:  string[]
}

function resolveBackupPaths(sourceType: string, srcConfig: SourceConfig): string[] {
  if (sourceType === 'filesystem' || sourceType === 'windows_system') {
    return srcConfig.paths ?? []
  }
  if (sourceType === 'docker_volume') {
    return (srcConfig.volumes ?? []).map(v => `/var/lib/docker/volumes/${v}/_data`)
  }
  return []
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

    cron.schedule(job.schedule, () => { void runJob(db, job, 'cron') }, { timezone: 'UTC' })
    void stampNextRun(db, job.id, job.schedule)
    console.log(`[scheduler] Scheduled "${job.name}" (${job.schedule})`)
  }

  // Trigger-driven tick: fire any job with nextRunAt <= now (Run Now, SQL trigger, etc.)
  setInterval(() => { void triggerTick(db) }, 5_000)
  console.log('[scheduler] Trigger tick active (5s interval)')

  // Check for disconnected agents every 5 minutes
  cron.schedule('*/5 * * * *', () => { void checkAgents(db) }, { timezone: 'UTC' })
  console.log('[scheduler] Agent health monitor active')

  // Check for missed backups every 10 minutes
  cron.schedule('*/10 * * * *', () => { void checkMissedBackups(db) }, { timezone: 'UTC' })
  console.log('[scheduler] Missed-backup monitor active')
}

type Db = ReturnType<typeof getDb>
type Job = typeof backupJobs.$inferSelect

function nextRunDate(schedule: string): Date | null {
  try {
    return parseExpression(schedule, { tz: 'UTC' }).next().toDate()
  } catch {
    return null
  }
}

async function stampNextRun(db: Db, jobId: string, schedule: string): Promise<void> {
  const next = nextRunDate(schedule)
  if (next) {
    await db.update(backupJobs).set({ nextRunAt: next }).where(eq(backupJobs.id, jobId))
  }
}

// executeRun performs local restic execution for an already-inserted backupRun row.
// Called by both the scheduler (runJob) and manual triggers (triggerJob server action).
export async function executeRun(jobId: string, runId: string): Promise<void> {
  const db = getDb()
  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId)).limit(1)
  if (!job || !job.repositoryId) return
  await runJobCore(db, job, runId)
}

async function dispatchToAgent(db: Db, job: Job, trigger: 'cron' | 'manual'): Promise<boolean> {
  if (!job.agentId || !job.repositoryId) return false

  const [repo] = await db.select().from(repositories)
    .where(eq(repositories.id, job.repositoryId)).limit(1)
  if (!repo) return false

  const cfg       = JSON.parse(decryptField(repo.config)) as Record<string, string>
  const password  = decryptField(repo.resticPassword)
  if (!password) throw new Error(`dispatch: failed to decrypt repo password for repository ${repo.id}`)
  const srcConfig = JSON.parse(job.sourceConfig) as SourceConfig
  const paths     = resolveBackupPaths(job.sourceType, srcConfig)
  if (paths.length === 0) return false

  const runId = crypto.randomUUID()
  const now   = new Date()

  await db.insert(backupRuns).values({
    id: runId, jobId: job.id, repositoryId: job.repositoryId,
    agentId: job.agentId, status: 'running', trigger, startedAt: now,
  })

  await db.update(backupJobs).set({ lastRunAt: now }).where(eq(backupJobs.id, job.id))

  const tags = job.tags ? (JSON.parse(job.tags) as string[]) : [`job:${job.id}`]
  const mountConfig = cfg['mountConfig'] ? (JSON.parse(cfg['mountConfig']) as MountConfig) : undefined

  const msg: ServerMessage = {
    type:   'run_backup',
    jobId:  job.id,
    config: {
      repoId:       job.repositoryId ?? '',
      repoUrl:      cfg['repositoryUrl'] ?? '',
      repoPassword: password,
      paths,
      exclude:  srcConfig.exclude,
      tags,
      envVars:  cfg,
      mountConfig,
    },
  }

  const sent = dispatch(job.agentId, msg)
  if (!sent) {
    await db.update(backupRuns).set({
      status: 'failed', completedAt: now,
      errorMessage: 'Agent disconnected before dispatch',
    }).where(eq(backupRuns.id, runId))
    return false
  }

  // Reset nextRunAt so the trigger tick doesn't re-fire this job
  await stampNextRun(db, job.id, job.schedule)
  console.log(`[scheduler] Dispatched job "${job.name}" to agent ${job.agentId}`)
  return true
}

async function runJob(db: Db, job: Job, trigger: 'cron' | 'manual'): Promise<void> {
  if (!job.repositoryId) return

  // Prefer agent execution when one is assigned and currently connected
  if (job.agentId && connectedAgentIds().includes(job.agentId)) {
    const dispatched = await dispatchToAgent(db, job, trigger)
    if (dispatched) return
  }

  const runId = crypto.randomUUID()
  await db.insert(backupRuns).values({
    id:           runId,
    jobId:        job.id,
    repositoryId: job.repositoryId,
    agentId:      job.agentId ?? null,
    status:       'running',
    trigger,
    startedAt:    new Date(),
  })
  await runJobCore(db, job, runId)
}

async function triggerTick(db: Db): Promise<void> {
  // nextRunAt is ms since epoch; comparing against Date.now() in ms
  const now = new Date()
  const jobs = await db.select().from(backupJobs).where(
    and(
      eq(backupJobs.enabled, true),
      isNotNull(backupJobs.nextRunAt),
      lte(backupJobs.nextRunAt, now),
    )
  ).all()

  for (const job of jobs) {
    const [active] = await db.select({ id: backupRuns.id }).from(backupRuns).where(
      and(eq(backupRuns.jobId, job.id), eq(backupRuns.status, 'running'))
    ).limit(1).all()
    if (active) continue

    // Reset nextRunAt before dispatching so the next tick doesn't re-fire
    const next = nextRunDate(job.schedule)
    await db.update(backupJobs).set({ nextRunAt: next ?? null }).where(eq(backupJobs.id, job.id))

    await runJob(db, job, 'manual')
  }
}

function fmtBytes(b: number): string {
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

// Core local backup execution — updates an existing backupRun row identified by runId.
async function runJobCore(db: Db, job: Job, runId: string): Promise<void> {
  if (!job.repositoryId) {
    await db.update(backupRuns).set({ status: 'failed', completedAt: new Date(), errorMessage: 'Job has no repository configured' }).where(eq(backupRuns.id, runId))
    return
  }

  const [repo] = await db.select().from(repositories).where(eq(repositories.id, job.repositoryId)).limit(1)
  if (!repo) {
    await db.update(backupRuns).set({ status: 'failed', completedAt: new Date(), errorMessage: 'Repository not found' }).where(eq(backupRuns.id, runId))
    return
  }

  const cfg       = JSON.parse(decryptField(repo.config)) as Record<string, string>
  const srcConfig = JSON.parse(job.sourceConfig) as SourceConfig
  const paths     = resolveBackupPaths(job.sourceType, srcConfig)
  if (paths.length === 0) {
    await db.update(backupRuns).set({ status: 'failed', completedAt: new Date(), errorMessage: 'No backup paths configured' }).where(eq(backupRuns.id, runId))
    return
  }

  // Accumulate log lines + latest progress for periodic DB flush
  const logLines: string[] = []
  let lastProgress: { pct: number; bytesDone: number; bytesTotal: number; filesDone: number; filesTotal: number } | null = null

  const flushToDB = async () => {
    const update: Record<string, unknown> = { log: logLines.join('\n') }
    if (lastProgress) {
      update['progressPct']  = lastProgress.pct
      update['bytesDone']    = lastProgress.bytesDone
      update['bytesTotal']   = lastProgress.bytesTotal
      update['filesDone']    = lastProgress.filesDone
      update['filesTotal']   = lastProgress.filesTotal
    }
    await db.update(backupRuns).set(update).where(eq(backupRuns.id, runId))
  }

  const flushInterval = setInterval(() => { void flushToDB() }, 2000)

  try {
    const engine = new ResticEngine({
      repositoryUrl: cfg['repositoryUrl'] ?? '',
      password:      decryptField(repo.resticPassword),
      envVars:       cfg,
      binaryPath:    process.env['RESTIC_BINARY_PATH'],
    })

    const tags   = job.tags ? (JSON.parse(job.tags) as string[]) : [`job:${job.id}`]
    const result = await engine.backup({
      paths,
      exclude: srcConfig.exclude,
      tags,
      onProgress: (s) => {
        lastProgress = s
        const pctStr  = (s.pct * 100).toFixed(1)
        const eta     = s.secondsRemaining != null ? ` ETA ${s.secondsRemaining}s` : ''
        logLines.push(`[${new Date().toISOString().slice(11, 19)}] ${pctStr}% — ${fmtBytes(s.bytesDone)} / ${fmtBytes(s.bytesTotal)} · ${s.filesDone}/${s.filesTotal} files${eta}`)
      },
    })

    clearInterval(flushInterval)

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
      log:             logLines.join('\n'),
      progressPct:     1,
      bytesDone:       result.totalSize,
      bytesTotal:      result.totalSize,
    }).where(eq(backupRuns.id, runId))

    const jobHasRetention = job.keepLast || job.keepDaily || job.keepWeekly || job.keepMonthly || job.keepYearly
    const retentionPolicy = jobHasRetention
      ? {
          keepLast:    job.keepLast    ?? undefined,
          keepDaily:   job.keepDaily   ?? undefined,
          keepWeekly:  job.keepWeekly  ?? undefined,
          keepMonthly: job.keepMonthly ?? undefined,
          keepYearly:  job.keepYearly  ?? undefined,
        }
      : await (async () => {
          const [defaults] = await db.select().from(backupDefaults).limit(1).all()
          if (!defaults) return null
          const hasAny = defaults.keepLast || defaults.keepDaily || defaults.keepWeekly || defaults.keepMonthly || defaults.keepYearly
          if (!hasAny) return null
          return {
            keepLast:    defaults.keepLast    ?? undefined,
            keepDaily:   defaults.keepDaily   ?? undefined,
            keepWeekly:  defaults.keepWeekly  ?? undefined,
            keepMonthly: defaults.keepMonthly ?? undefined,
            keepYearly:  defaults.keepYearly  ?? undefined,
          }
        })()

    if (retentionPolicy) {
      const tags2  = job.tags ? (JSON.parse(job.tags) as string[]) : [`job:${job.id}`]
      const forget = await engine.forget({ ...retentionPolicy, keepTags: tags2 })
      await db.update(backupRuns).set({
        snapshotsRemoved: forget.removed,
        snapshotsKept:    forget.kept,
      }).where(eq(backupRuns.id, runId))
    }

    const nextRun = nextRunDate(job.schedule)
    await db.update(backupJobs).set({ lastRunAt: new Date(), lastRunStatus: 'success', ...(nextRun ? { nextRunAt: nextRun } : {}) })
      .where(eq(backupJobs.id, job.id))

  } catch (err) {
    clearInterval(flushInterval)
    const errorMessage = String(err)
    await db.update(backupRuns).set({ status: 'failed', completedAt: new Date(), errorMessage, log: logLines.join('\n') || null })
      .where(eq(backupRuns.id, runId))
    const nextRun = nextRunDate(job.schedule)
    await db.update(backupJobs).set({ lastRunAt: new Date(), lastRunStatus: 'failed', ...(nextRun ? { nextRunAt: nextRun } : {}) })
      .where(eq(backupJobs.id, job.id))
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

  // Mark runs stuck in 'running' for more than 2 hours as failed
  const staleRunCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000)
  const staleRuns = await db
    .select()
    .from(backupRuns)
    .where(and(eq(backupRuns.status, 'running'), lt(backupRuns.startedAt, staleRunCutoff)))
    .all()

  for (const run of staleRuns) {
    await db.update(backupRuns).set({
      status: 'failed', completedAt: new Date(),
      errorMessage: 'Run timed out — no completion message received from agent',
    }).where(eq(backupRuns.id, run.id))
    if (run.jobId) {
      await db.update(backupJobs).set({ lastRunStatus: 'failed' }).where(eq(backupJobs.id, run.jobId))
    }
  }
}
