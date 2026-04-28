'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb, backupJobs, backupRuns, repositories, backupDefaults, bandwidthProfiles, bandwidthRules, eq, inArray, and, lte, gte } from '@backupos/db'
import { decryptField } from '@/lib/repo-crypto'
import { dispatchToAgent } from '@/lib/internal-dispatch'
import { validateCron } from '@/lib/cron-validate'
import { ensureRepoMountedOnAgent } from '@/lib/repo-mount'
import { isWithinWindow } from '@/lib/schedule-window'

function parseSourceConfig(sourceType: string, fd: FormData): string {
  const str = (k: string) => (fd.get(k) as string | null)?.trim() || undefined
  const lines = (k: string) => {
    const all = fd.getAll(k) as string[]
    if (all.length > 1 || (all.length === 1 && !all[0]?.includes('\n'))) {
      return all.map(s => s.trim()).filter(Boolean)
    }
    return (all[0] ?? '').split('\n').map(s => s.trim()).filter(Boolean)
  }

  let cfg: Record<string, unknown> = {}

  if (sourceType === 'filesystem' || sourceType === 'windows_system') {
    cfg = { paths: lines('paths'), exclude: lines('exclude').length ? lines('exclude') : undefined }
  } else if (sourceType === 'docker_volume') {
    cfg = { volumes: lines('volumes') }
  } else if (sourceType === 'database') {
    cfg = {
      type:     str('dbType') ?? 'postgresql',
      database: str('database'),
      host:     str('dbHost') ?? 'localhost',
      port:     parseInt(fd.get('dbPort') as string) || 5432,
      user:     str('dbUser'),
      password: str('dbPassword'),
    }
  } else if (sourceType === 'proxmox_vm' || sourceType === 'proxmox_lxc') {
    cfg = {
      vmId:             str('vmId'),
      proxmoxUrl:       str('proxmoxUrl'),
      proxmoxUser:      str('proxmoxUser'),
      proxmoxPassword:  str('proxmoxPassword'),
    }
  } else if (sourceType === 'nas_share') {
    cfg = {
      shareUrl:  str('shareUrl'),
      username:  str('shareUsername'),
      password:  str('sharePassword'),
    }
  } else if (sourceType === 'compose_project') {
    const raw = str('composeConfig')
    cfg = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  }

  return JSON.stringify(cfg)
}

export async function createJob(formData: FormData): Promise<void> {
  const name           = (formData.get('name')           as string)?.trim()
  const sourceType     = (formData.get('sourceType')     as string)
  const agentId        = (formData.get('agentId')        as string) || null
  const repositoryId   = (formData.get('repositoryId')   as string) || null
  const schedule       = (formData.get('schedule')       as string)?.trim()
  const infraServiceId = (formData.get('infraServiceId') as string) || null

  if (!name || !sourceType || !schedule) return

  const cronCheck = validateCron(schedule)
  if (!cronCheck.valid) {
    redirect(`/jobs/new?cronError=${encodeURIComponent(cronCheck.error)}`)
  }

  if (sourceType === 'compose_project') {
    const raw = (formData.get('composeConfig') as string | null)?.trim() ?? ''
    let ok = false
    try { const p = JSON.parse(raw) as { services?: unknown }; ok = Array.isArray(p.services) && (p.services as unknown[]).length > 0 } catch { /* ok stays false */ }
    if (!ok) redirect(`/jobs/new?composeError=${encodeURIComponent('Discover and configure at least one service before saving.')}`)
  }

  const db = getDb()
  const id = crypto.randomUUID()
  await db.insert(backupJobs).values({
    id,
    name,
    sourceType,
    sourceConfig:  parseSourceConfig(sourceType, formData),
    agentId,
    repositoryId,
    infraServiceId,
    schedule,
    enabled:   true,
    createdAt: new Date(),
  })
  redirect(`/jobs/${id}`)
}

export async function pauseJobs(ids: string[]): Promise<void> {
  if (!ids.length) return
  const db = getDb()
  await db.update(backupJobs).set({ enabled: false }).where(inArray(backupJobs.id, ids))
  revalidatePath('/jobs')
}

export async function resumeJobs(ids: string[]): Promise<void> {
  if (!ids.length) return
  const db = getDb()
  await db.update(backupJobs).set({ enabled: true }).where(inArray(backupJobs.id, ids))
  revalidatePath('/jobs')
}

export async function deleteJobs(ids: string[]): Promise<void> {
  if (!ids.length) return
  const db = getDb()
  await db.delete(backupRuns).where(inArray(backupRuns.jobId, ids))
  await db.delete(backupJobs).where(inArray(backupJobs.id, ids))
  revalidatePath('/jobs')
}

async function resolveBandwidthLimitKbps(db: ReturnType<typeof getDb>, jobId: string): Promise<number | null> {
  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId)).limit(1)
  if (!job) return null

  let profileId = job.bandwidthProfileId
  if (!profileId) {
    const [global] = await db.select().from(bandwidthProfiles).where(eq(bandwidthProfiles.isGlobal, true)).limit(1)
    profileId = global?.id ?? null
  }
  if (!profileId) return null

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

  return rule?.limitKbps ?? null
}

export async function triggerJob(id: string): Promise<void> {
  const db = getDb()

  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, id)).limit(1)
  if (!job || !job.repositoryId) { redirect(`/jobs/${id}`) }

  // Set nextRunAt to now — the scheduler trigger tick (≤5s) picks it up and dispatches
  await db.update(backupJobs).set({ nextRunAt: new Date() }).where(eq(backupJobs.id, id))

  redirect(`/jobs/${id}`)
}

export async function updateJob(id: string, formData: FormData): Promise<void> {
  const name         = (formData.get('name')         as string)?.trim()
  const sourceType   = (formData.get('sourceType')   as string)
  const agentId      = (formData.get('agentId')      as string) || null
  const repositoryId = (formData.get('repositoryId') as string) || null
  const schedule     = (formData.get('schedule')     as string)?.trim()

  if (!name || !sourceType || !schedule) return

  const cronCheck = validateCron(schedule)
  if (!cronCheck.valid) {
    redirect(`/jobs/${id}/edit?cronError=${encodeURIComponent(cronCheck.error)}`)
  }

  if (sourceType === 'compose_project') {
    const raw = (formData.get('composeConfig') as string | null)?.trim() ?? ''
    let ok = false
    try { const p = JSON.parse(raw) as { services?: unknown }; ok = Array.isArray(p.services) && (p.services as unknown[]).length > 0 } catch { /* ok stays false */ }
    if (!ok) redirect(`/jobs/${id}/edit?composeError=${encodeURIComponent('Discover and configure at least one service before saving.')}`)
  }

  const db = getDb()
  await db.update(backupJobs).set({
    name,
    sourceType,
    sourceConfig: parseSourceConfig(sourceType, formData),
    agentId,
    repositoryId,
    schedule,
  }).where(eq(backupJobs.id, id))

  revalidatePath(`/jobs/${id}`)
  redirect(`/jobs/${id}`)
}

export async function retryRun(jobId: string): Promise<void> {
  const db  = getDb()
  const now = new Date()

  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId)).limit(1)
  if (!job || !job.repositoryId) { redirect(`/jobs/${jobId}`) }

  const bandwidthLimitKbps = await resolveBandwidthLimitKbps(db, jobId)

  // Resolve schedule window: per-job override → global default
  const windowStart = job.scheduleStart
  const windowEnd   = job.scheduleEnd
  let effectiveStart: number | null = windowStart ?? null
  let effectiveEnd:   number | null = windowEnd   ?? null
  if (effectiveStart === null || effectiveEnd === null) {
    const [defaults] = await db.select().from(backupDefaults).limit(1).all()
    effectiveStart = defaults?.scheduleStart ?? null
    effectiveEnd   = defaults?.scheduleEnd   ?? null
  }
  if (!isWithinWindow(now.getHours(), effectiveStart, effectiveEnd)) {
    const windowLabel = `${String(effectiveStart ?? '?').padStart(2, '0')}:00–${String(effectiveEnd ?? '?').padStart(2, '0')}:00`
    await db.insert(backupRuns).values({
      id:           crypto.randomUUID(),
      jobId,
      repositoryId: job.repositoryId,
      agentId:      job.agentId ?? null,
      status:       'failed',
      trigger:      'manual',
      startedAt:    now,
      completedAt:  now,
      errorMessage: `Outside backup window ${windowLabel} — retry when inside the window or adjust the window at /settings/schedule-windows`,
    })
    await db.update(backupJobs).set({ lastRunAt: now, lastRunStatus: 'failed' }).where(eq(backupJobs.id, jobId))
    redirect(`/jobs/${jobId}`)
  }

  const runId = crypto.randomUUID()

  await db.insert(backupRuns).values({
    id:           runId,
    jobId,
    repositoryId: job.repositoryId,
    agentId:      job.agentId ?? null,
    status:       'running',
    trigger:      'manual',
    startedAt:    now,
    bandwidthLimitKbps,
  })
  await db.update(backupJobs).set({ lastRunAt: now }).where(eq(backupJobs.id, jobId))

  if (!job.agentId) {
    await db.update(backupRuns).set({
      status:       'failed',
      completedAt:  now,
      errorMessage: 'job has no agent assigned — set an agent on this job',
    }).where(eq(backupRuns.id, runId))
    await db.update(backupJobs).set({ lastRunStatus: 'failed' }).where(eq(backupJobs.id, jobId))
    redirect(`/jobs/${jobId}`)
  }

  const { connectedAgentIds } = await import('@/lib/ws-state')
  if (!connectedAgentIds().includes(job.agentId)) {
    await db.update(backupRuns).set({
      status:       'failed',
      completedAt:  now,
      errorMessage: `agent ${job.agentId} is not connected — backup deferred until agent reconnects`,
    }).where(eq(backupRuns.id, runId))
    await db.update(backupJobs).set({ lastRunStatus: 'failed' }).where(eq(backupJobs.id, jobId))
    redirect(`/jobs/${jobId}`)
  }

  const [repo] = await db.select().from(repositories)
    .where(eq(repositories.id, job.repositoryId!)).limit(1)
  if (!repo) {
    await db.update(backupRuns).set({
      status:       'failed',
      completedAt:  now,
      errorMessage: `repository ${job.repositoryId} not found`,
    }).where(eq(backupRuns.id, runId))
    redirect(`/jobs/${jobId}`)
  }

  const cfg      = JSON.parse(decryptField(repo.config)) as Record<string, string>
  const password = decryptField(repo.resticPassword)
  if (!password) throw new Error(`dispatch: failed to decrypt repo password for repository ${repo.id}`)
  const tags = job.tags ? (JSON.parse(job.tags) as string[]) : [`job:${jobId}`]

  try {
    await ensureRepoMountedOnAgent(job.agentId, job.repositoryId!)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await db.update(backupRuns).set({
      status: 'failed', completedAt: now, errorMessage: `NFS mount failed: ${errorMessage}`,
    }).where(eq(backupRuns.id, runId))
    await db.update(backupJobs).set({ lastRunStatus: 'failed' }).where(eq(backupJobs.id, jobId))
    redirect(`/jobs/${jobId}`)
  }

  let result: { ok: boolean; reason?: string; knownIds?: string[] }
  if (job.sourceType === 'compose_project') {
    const composeConfig = JSON.parse(job.sourceConfig) as import('@backupos/agent-protocol').ComposeProjectConfig
    result = await dispatchToAgent(job.agentId, {
      type:               'run_compose_backup',
      jobId,
      runId,
      config:             composeConfig,
      repoId:             job.repositoryId!,
      repoUrl:            cfg['repositoryUrl'] ?? '',
      repoPassword:       password,
      envVars:            cfg,
      bandwidthLimitKbps,
    })
  } else {
    const srcConfig = JSON.parse(job.sourceConfig) as { paths?: string[]; volumes?: string[]; exclude?: string[] }
    const paths = job.sourceType === 'docker_volume'
      ? (srcConfig.volumes ?? []).map(v => `/var/lib/docker/volumes/${v}/_data`)
      : (srcConfig.paths ?? [])
    result = await dispatchToAgent(job.agentId, {
      type:               'run_backup',
      jobId,
      runId,
      config:             { repoId: job.repositoryId!, repoUrl: cfg['repositoryUrl'] ?? '', repoPassword: password, paths, exclude: srcConfig.exclude, tags, envVars: cfg },
      bandwidthLimitKbps,
    })
  }

  if (!result.ok) {
    await db.update(backupRuns).set({
      status:       'failed',
      completedAt:  now,
      errorMessage: `dispatch failed: ${result.reason ?? 'unknown'}`,
    }).where(eq(backupRuns.id, runId))
    await db.update(backupJobs).set({ lastRunStatus: 'failed' }).where(eq(backupJobs.id, jobId))
    console.error('[retryRun] dispatch failed reason=%s knownIds=%j', result.reason, result.knownIds)
  }

  redirect(`/jobs/${jobId}`)
}

export async function cancelJob(jobId: string): Promise<void> {
  const db = getDb()
  const [run] = await db
    .select()
    .from(backupRuns)
    .where(and(eq(backupRuns.jobId, jobId), eq(backupRuns.status, 'running')))
    .limit(1)

  if (!run) { revalidatePath(`/jobs/${jobId}`); return }

  if (!run.agentId) {
    // Local run (no agent) — cancel directly
    await db.update(backupRuns).set({ status: 'cancelled', completedAt: new Date() }).where(eq(backupRuns.id, run.id))
    await db.update(backupJobs).set({ lastRunStatus: 'cancelled' }).where(eq(backupJobs.id, jobId))
    revalidatePath(`/jobs/${jobId}`)
    return
  }

  // Agent run: dispatch cancel and let the agent's backup_cancelled response update the DB
  const result = await dispatchToAgent(run.agentId, { type: 'cancel_backup', jobId, runId: run.id })
  if (!result.ok) {
    // Agent unreachable — honour the cancel immediately
    await db.update(backupRuns).set({
      status: 'cancelled', completedAt: new Date(),
      errorMessage: `cancel: agent unreachable (${result.reason ?? 'unknown'})`,
    }).where(eq(backupRuns.id, run.id))
    await db.update(backupJobs).set({ lastRunStatus: 'cancelled' }).where(eq(backupJobs.id, jobId))
  }

  revalidatePath(`/jobs/${jobId}`)
}

export async function saveJobRetention(id: string, formData: FormData): Promise<void> {
  const parse = (key: string) => {
    const v = parseInt(formData.get(key) as string, 10)
    return isNaN(v) || v === 0 ? null : v
  }
  const db = getDb()
  await db.update(backupJobs).set({
    keepLast:    parse('keepLast'),
    keepDaily:   parse('keepDaily'),
    keepWeekly:  parse('keepWeekly'),
    keepMonthly: parse('keepMonthly'),
    keepYearly:  parse('keepYearly'),
  }).where(eq(backupJobs.id, id))
  revalidatePath(`/jobs/${id}`)
}
