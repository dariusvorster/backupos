'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb, backupJobs, backupRuns, repositories, bandwidthProfiles, bandwidthRules, eq, inArray, and, lte, gte } from '@backupos/db'
import { decryptField } from '@/lib/repo-crypto'
import { dispatchToAgent } from '@/lib/internal-dispatch'

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
  const db  = getDb()
  const now = new Date()

  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, id)).limit(1)
  if (!job || !job.repositoryId) { redirect(`/jobs/${id}`) }

  const bandwidthLimitKbps = await resolveBandwidthLimitKbps(db, id)
  const runId = crypto.randomUUID()

  await db.insert(backupRuns).values({
    id:           runId,
    jobId:        id,
    repositoryId: job.repositoryId,
    agentId:      job.agentId ?? null,
    status:       'running',
    trigger:      'manual',
    startedAt:    now,
    bandwidthLimitKbps,
  })
  await db.update(backupJobs).set({ lastRunAt: now }).where(eq(backupJobs.id, id))

  if (job.agentId) {
    const [repo] = await db.select().from(repositories)
      .where(eq(repositories.id, job.repositoryId!)).limit(1)

    if (repo) {
      const repoConfig = JSON.parse(decryptField(repo.config)) as { repositoryUrl: string; password: string; envVars?: Record<string, string> }
      const srcConfig  = JSON.parse(job.sourceConfig) as { paths?: string[]; volumes?: string[]; exclude?: string[] }
      const tags       = job.tags ? (JSON.parse(job.tags) as string[]) : [`job:${id}`]

      const paths = job.sourceType === 'docker_volume'
        ? (srcConfig.volumes ?? []).map(v => `/var/lib/docker/volumes/${v}/_data`)
        : (srcConfig.paths ?? [])

      const result = await dispatchToAgent(job.agentId, {
        type:   'run_backup',
        jobId:  id,
        config: {
          repoId:       job.repositoryId!,
          repoUrl:      repoConfig.repositoryUrl,
          repoPassword: repoConfig.password,
          paths,
          exclude:      srcConfig.exclude,
          tags,
          envVars:      repoConfig.envVars,
        },
      })
      if (!result.ok) {
        console.error('[triggerJob] dispatch failed reason=%s knownIds=%j', result.reason, result.knownIds)
      }
    }
  } else {
    // No agent assigned — run locally in a detached promise
    void import('@/lib/scheduler').then(({ executeRun }) => executeRun(id, runId))
  }

  redirect(`/jobs/${id}`)
}

export async function updateJob(id: string, formData: FormData): Promise<void> {
  const name         = (formData.get('name')         as string)?.trim()
  const sourceType   = (formData.get('sourceType')   as string)
  const agentId      = (formData.get('agentId')      as string) || null
  const repositoryId = (formData.get('repositoryId') as string) || null
  const schedule     = (formData.get('schedule')     as string)?.trim()

  if (!name || !sourceType || !schedule) return

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

  if (job.agentId) {
    const [repo] = await db.select().from(repositories)
      .where(eq(repositories.id, job.repositoryId!)).limit(1)
    if (repo) {
      const repoConfig = JSON.parse(decryptField(repo.config)) as { repositoryUrl: string; password: string; envVars?: Record<string, string> }
      const srcConfig  = JSON.parse(job.sourceConfig) as { paths?: string[]; volumes?: string[]; exclude?: string[] }
      const tags       = job.tags ? (JSON.parse(job.tags) as string[]) : [`job:${jobId}`]
      const paths = job.sourceType === 'docker_volume'
        ? (srcConfig.volumes ?? []).map(v => `/var/lib/docker/volumes/${v}/_data`)
        : (srcConfig.paths ?? [])
      const result = await dispatchToAgent(job.agentId, {
        type:   'run_backup',
        jobId,
        config: { repoId: job.repositoryId!, repoUrl: repoConfig.repositoryUrl, repoPassword: repoConfig.password, paths, exclude: srcConfig.exclude, tags, envVars: repoConfig.envVars },
      })
      if (!result.ok) {
        console.error('[retryRun] dispatch failed reason=%s knownIds=%j', result.reason, result.knownIds)
      }
    }
  } else {
    void import('@/lib/scheduler').then(({ executeRun }) => executeRun(jobId, runId))
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

  await db.update(backupRuns).set({ status: 'cancelled', completedAt: new Date() }).where(eq(backupRuns.id, run.id))
  await db.update(backupJobs).set({ lastRunStatus: 'cancelled' }).where(eq(backupJobs.id, jobId))

  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId)).limit(1)
  if (job?.agentId) {
    void dispatchToAgent(job.agentId, { type: 'cancel_backup', jobId })
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
