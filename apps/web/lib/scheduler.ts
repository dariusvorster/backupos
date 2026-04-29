import * as cron from 'node-cron'
import { parseExpression } from 'cron-parser'
import { getDb, backupJobs, backupRuns, repositories, agents, backupDefaults, bandwidthProfiles, bandwidthRules, eq, and, or, lt, lte, gte, isNotNull, isNull } from '@backupos/db'
import { decryptField } from './repo-crypto'
import { sendAlert } from './alerts'
import { dispatch, connectedAgentIds } from './ws-state'
import { ensureRepoMountedOnAgent } from './repo-mount'
import { isWithinWindow } from './schedule-window'
import type { ServerMessage, MountConfig, ComposeProjectConfig } from '@backupos/agent-protocol'
import { pruneRetainedLogs } from './retention'
import { appendLog } from './logger'

interface SourceConfig {
  paths?:    string[]
  volumes?:  string[]
  exclude?:  string[]
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
    void stampNextRunIfMissing(db, job.id, job.schedule)
    console.log(`[scheduler] Scheduled "${job.name}" (${job.schedule})`)
  }

  // Trigger-driven tick: fire any job with nextRunAt <= now; also sweep for stuck runs
  setInterval(() => { void triggerTick(db); void checkRunHealth(db) }, 5_000)
  console.log('[scheduler] Trigger tick active (5s interval)')

  // Check for disconnected agents every 5 minutes
  cron.schedule('*/5 * * * *', () => { void checkAgents(db) }, { timezone: 'UTC' })
  console.log('[scheduler] Agent health monitor active')

  // Check for missed backups every 10 minutes
  cron.schedule('*/10 * * * *', () => { void checkMissedBackups(db) }, { timezone: 'UTC' })
  console.log('[scheduler] Missed-backup monitor active')

  // Daily retention sweep at 03:00 UTC
  cron.schedule('0 3 * * *', () => { void runRetentionSweep(db) }, { timezone: 'UTC' })
  console.log('[scheduler] Retention sweep active (daily 03:00 UTC)')
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

async function stampNextRunIfMissing(db: Db, jobId: string, schedule: string): Promise<void> {
  const [row] = await db.select({ nextRunAt: backupJobs.nextRunAt })
    .from(backupJobs).where(eq(backupJobs.id, jobId)).limit(1)
  if (row && row.nextRunAt !== null) return
  const next = nextRunDate(schedule)
  if (next) {
    await db.update(backupJobs).set({ nextRunAt: next }).where(eq(backupJobs.id, jobId))
  }
}

async function resolveJobWindow(db: Db, job: Job): Promise<{ start: number | null; end: number | null }> {
  if (job.scheduleStart !== null && job.scheduleEnd !== null) {
    return { start: job.scheduleStart, end: job.scheduleEnd }
  }
  const [defaults] = await db.select().from(backupDefaults).limit(1).all()
  return { start: defaults?.scheduleStart ?? null, end: defaults?.scheduleEnd ?? null }
}

async function dispatchToAgent(db: Db, job: Job, trigger: 'cron' | 'manual'): Promise<boolean> {
  if (!job.agentId || !job.repositoryId) return false

  const [repo] = await db.select().from(repositories)
    .where(eq(repositories.id, job.repositoryId)).limit(1)
  if (!repo) return false

  const cfg      = JSON.parse(decryptField(repo.config)) as Record<string, string>
  const password = decryptField(repo.resticPassword)
  if (!password) throw new Error(`dispatch: failed to decrypt repo password for repository ${repo.id}`)

  const runId = crypto.randomUUID()
  const now   = new Date()

  // Resolve bandwidth limit: per-job profile first, then global fallback
  let bandwidthLimitKbps: number | null = null
  {
    let profileId = job.bandwidthProfileId ?? null
    if (!profileId) {
      const [globalProfile] = await db.select().from(bandwidthProfiles).where(eq(bandwidthProfiles.isGlobal, true)).limit(1)
      profileId = globalProfile?.id ?? null
    }
    if (profileId) {
      const currentHour = new Date().getHours()
      const [rule] = await db
        .select()
        .from(bandwidthRules)
        .where(and(
          eq(bandwidthRules.profileId, profileId),
          lte(bandwidthRules.startHour, currentHour),
          gte(bandwidthRules.endHour,   currentHour),
        ))
        .limit(1)
      bandwidthLimitKbps = rule?.limitKbps ?? null
    }
  }

  await db.insert(backupRuns).values({
    id: runId, jobId: job.id, repositoryId: job.repositoryId,
    agentId: job.agentId, status: 'running', trigger, startedAt: now,
    bandwidthLimitKbps,
  })
  await db.update(backupJobs).set({ lastRunAt: now }).where(eq(backupJobs.id, job.id))

  let msg: ServerMessage
  if (job.sourceType === 'compose_project') {
    const composeConfig = JSON.parse(job.sourceConfig) as ComposeProjectConfig
    msg = {
      type:               'run_compose_backup',
      jobId:              job.id,
      runId,
      config:             composeConfig,
      repoId:             job.repositoryId ?? '',
      repoUrl:            cfg['repositoryUrl'] ?? '',
      repoPassword:       password,
      envVars:            cfg,
      bandwidthLimitKbps,
    }
  } else {
    const srcConfig   = JSON.parse(job.sourceConfig) as SourceConfig
    const paths       = job.sourceType === 'docker_volume'
      ? (srcConfig.volumes ?? []).map(v => `/var/lib/docker/volumes/${v}/_data`)
      : (srcConfig.paths ?? [])
    if (paths.length === 0) {
      await db.update(backupRuns).set({ status: 'failed', completedAt: now, errorMessage: 'No backup paths resolved' }).where(eq(backupRuns.id, runId))
      return false
    }
    const tags        = job.tags ? (JSON.parse(job.tags) as string[]) : [`job:${job.id}`]
    const mountConfig = cfg['mountConfig'] ? (JSON.parse(cfg['mountConfig']) as MountConfig) : undefined
    msg = {
      type:               'run_backup',
      jobId:              job.id,
      runId,
      config: {
        repoId:       job.repositoryId ?? '',
        repoUrl:      cfg['repositoryUrl'] ?? '',
        repoPassword: password,
        paths,
        exclude:      srcConfig.exclude,
        tags,
        envVars:      cfg,
        mountConfig,
      },
      bandwidthLimitKbps,
    }
  }

  try {
    await ensureRepoMountedOnAgent(job.agentId, job.repositoryId)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await db.update(backupRuns).set({
      status: 'failed', completedAt: now, errorMessage: `NFS mount failed: ${errorMessage}`,
    }).where(eq(backupRuns.id, runId))
    return false
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
  console.log(`[scheduler] Dispatched job "${job.name}" (${job.sourceType}) to agent ${job.agentId}`)
  try { appendLog({ level: 'info', component: 'web', message: `Backup dispatched for job "${job.name}"`, entityType: 'job', entityId: job.id, payload: { trigger, runId } }) } catch (err) { console.error('[logger]', err) }
  return true
}

/**
 * Dispatches a job to its assigned agent.
 *
 * INVARIANT: This function NEVER executes backups locally on the BackupOS server.
 * All backup execution happens on agents. If the agent is unreachable, the run is
 * marked failed with a clear error message.
 *
 * Adding any local-execution fallback here is a regression. Phase A Item 3 and this
 * fix (2026-04-26) explicitly removed all such fallbacks because they:
 *   1. Don't work for most source types (compose, proxmox, docker_volume, etc.)
 *   2. Produce misleading errors when they fail (e.g., "No backup paths configured")
 *   3. Hide the real problem (agent connectivity) behind opaque restic errors
 */
async function runJob(db: Db, job: Job, trigger: 'cron' | 'manual'): Promise<void> {
  if (!job.repositoryId) return

  // Cron-triggered jobs are silently deferred when outside the window.
  // Tick-triggered (manual) jobs have their window check in triggerTick so nextRunAt is
  // not reset, allowing the tick to retry until the window opens.
  if (trigger === 'cron') {
    const { start, end } = await resolveJobWindow(db, job)
    if (!isWithinWindow(new Date().getHours(), start, end)) {
      console.log(`[scheduler] deferring "${job.name}" (cron) — outside window ${start ?? '?'}–${end ?? '?'}`)
      return
    }
  }

  const now = new Date()

  if (!job.agentId) {
    await db.insert(backupRuns).values({
      id:           crypto.randomUUID(),
      jobId:        job.id,
      repositoryId: job.repositoryId,
      status:       'failed',
      trigger,
      startedAt:    now,
      completedAt:  now,
      errorMessage: 'job has no agent assigned — set an agent on this job',
    })
    await db.update(backupJobs).set({ lastRunAt: now, lastRunStatus: 'failed' }).where(eq(backupJobs.id, job.id))
    return
  }

  if (!connectedAgentIds().includes(job.agentId)) {
    await db.insert(backupRuns).values({
      id:           crypto.randomUUID(),
      jobId:        job.id,
      repositoryId: job.repositoryId,
      agentId:      job.agentId,
      status:       'failed',
      trigger,
      startedAt:    now,
      completedAt:  now,
      errorMessage: `agent ${job.agentId} is not connected — backup deferred until agent reconnects`,
    })
    await db.update(backupJobs).set({ lastRunAt: now, lastRunStatus: 'failed' }).where(eq(backupJobs.id, job.id))
    return
  }

  await dispatchToAgent(db, job, trigger)
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

    // Check schedule window before resetting nextRunAt — if outside the window, leave
    // nextRunAt as-is so the next tick (5s) retries until the window opens.
    const { start, end } = await resolveJobWindow(db, job)
    if (!isWithinWindow(new Date().getHours(), start, end)) {
      console.log(`[scheduler] deferring "${job.name}" — outside window ${start ?? '?'}–${end ?? '?'}`)
      continue
    }

    // Reset nextRunAt before dispatching so the next tick doesn't re-fire
    const next = nextRunDate(job.schedule)
    await db.update(backupJobs).set({ nextRunAt: next ?? null }).where(eq(backupJobs.id, job.id))

    await runJob(db, job, 'manual')
  }
}

async function markRunFailed(db: Db, runId: string, errorMessage: string): Promise<void> {
  await db.update(backupRuns).set({
    status: 'failed', completedAt: new Date(), errorMessage,
  }).where(eq(backupRuns.id, runId))
}

async function checkRunHealth(db: Db): Promise<void> {
  const heartbeatCutoff = new Date(Date.now() - 60_000)       // 60s
  const fatalCutoff     = new Date(Date.now() - 5 * 60_000)   // 5min

  const stale = await db.select().from(backupRuns).where(
    and(
      eq(backupRuns.status, 'running'),
      or(
        and(isNull(backupRuns.lastHeartbeatAt), lt(backupRuns.startedAt, fatalCutoff)),
        lt(backupRuns.lastHeartbeatAt, heartbeatCutoff),
      ),
    ),
  ).all()

  for (const run of stale) {
    const heartbeatAge = run.lastHeartbeatAt ? Date.now() - run.lastHeartbeatAt.getTime() : null
    const startAge     = Date.now() - run.startedAt.getTime()

    if (heartbeatAge !== null && heartbeatAge < 5 * 60_000) {
      // Stale 60s–5min: only kill if the agent is also disconnected
      const alive = run.agentId ? connectedAgentIds().includes(run.agentId) : false
      if (alive) continue
      await markRunFailed(db, run.id, `agent disconnected, no heartbeat for ${Math.round(heartbeatAge / 1000)}s`)
      continue
    }

    // Fatal: > 5min or never heartbeat
    await markRunFailed(
      db,
      run.id,
      heartbeatAge !== null
        ? `no heartbeat for ${Math.round(heartbeatAge / 1000)}s — run abandoned`
        : `no heartbeat received and run started ${Math.round(startAge / 1000)}s ago — agent likely never started restic`,
    )
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
        try { appendLog({ level: 'warn', component: 'monitor', message: `Missed backup detected for job "${job.name}"`, entityType: 'job', entityId: job.id, payload: { expectedAt: prevExpected.toISOString(), lastRunAt: lastRun?.toISOString() ?? null } }) } catch (err) { console.error('[logger]', err) }
      } else if (!missed) {
        // Clear flag once the job has run successfully again
        missedAlertSent.delete(job.id)
      }
    } catch {
      // invalid cron expression — skip
    }
  }
}

async function runRetentionSweep(db: Db): Promise<void> {
  try {
    const result = await pruneRetainedLogs(db)
    console.log(`[scheduler] Retention sweep complete: ${result.alerts} alerts, ${result.audit} audit, ${result.ops} ops deleted`)
  } catch (err) {
    console.error('[scheduler] Retention sweep failed:', err instanceof Error ? err.message : String(err))
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
    try { appendLog({ level: 'warn', component: 'monitor', message: `Agent ${agent.hostname ?? agent.id} marked stale (no heartbeat)`, entityType: 'agent', entityId: agent.id }) } catch (err) { console.error('[logger]', err) }
  }

}
