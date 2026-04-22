'use server'

import { revalidatePath }           from 'next/cache'
import { redirect }                 from 'next/navigation'
import { getDb, repositories, backupJobs, backupDefaults, eq, and } from '@backupos/db'
import { ResticEngine }             from '@backupos/engine'

export async function createRepository(formData: FormData): Promise<{ error: string } | never> {
  const name     = (formData.get('name') as string)?.trim()
  const backend  = formData.get('backend') as string
  const password = formData.get('password') as string
  const group    = (formData.get('group') as string)?.trim() || null

  if (!name)     return { error: 'Name is required' }
  if (!backend)  return { error: 'Backend is required' }
  if (!password) return { error: 'Repository password is required' }

  const config: Record<string, string> = {}

  if (backend === 'local') {
    const path = (formData.get('path') as string)?.trim()
    if (!path) return { error: 'Path is required' }
    config['repositoryUrl'] = `${path}`
    config['path'] = path
  } else if (backend === 's3') {
    const bucket   = (formData.get('bucket') as string)?.trim()
    const endpoint = (formData.get('endpoint') as string)?.trim()
    const region   = (formData.get('region') as string)?.trim() || 'us-east-1'
    const key      = (formData.get('accessKey') as string)?.trim()
    const secret   = (formData.get('secretKey') as string)?.trim()
    if (!bucket || !key || !secret) return { error: 'Bucket, access key, and secret key are required' }
    config['repositoryUrl'] = endpoint ? `s3:${endpoint}/${bucket}` : `s3:s3.amazonaws.com/${bucket}`
    config['AWS_ACCESS_KEY_ID']     = key
    config['AWS_SECRET_ACCESS_KEY'] = secret
    config['AWS_DEFAULT_REGION']    = region
    if (endpoint) config['endpoint'] = endpoint
  } else if (backend === 'r2') {
    const accountId = (formData.get('accountId') as string)?.trim()
    const bucket    = (formData.get('bucket') as string)?.trim()
    const key       = (formData.get('accessKey') as string)?.trim()
    const secret    = (formData.get('secretKey') as string)?.trim()
    if (!accountId || !bucket || !key || !secret) return { error: 'Account ID, bucket, access key, and secret key are required' }
    config['repositoryUrl'] = `s3:https://${accountId}.r2.cloudflarestorage.com/${bucket}`
    config['AWS_ACCESS_KEY_ID']     = key
    config['AWS_SECRET_ACCESS_KEY'] = secret
  } else if (backend === 'b2') {
    const bucket = (formData.get('bucket') as string)?.trim()
    const keyId  = (formData.get('keyId') as string)?.trim()
    const appKey = (formData.get('appKey') as string)?.trim()
    if (!bucket || !keyId || !appKey) return { error: 'Bucket, key ID, and application key are required' }
    config['repositoryUrl']   = `b2:${bucket}`
    config['B2_ACCOUNT_ID']   = keyId
    config['B2_ACCOUNT_KEY']  = appKey
  } else if (backend === 'sftp') {
    const host = (formData.get('host') as string)?.trim()
    const port = (formData.get('port') as string)?.trim() || '22'
    const user = (formData.get('user') as string)?.trim()
    const path = (formData.get('path') as string)?.trim()
    if (!host || !user || !path) return { error: 'Host, user, and path are required' }
    config['repositoryUrl'] = `sftp:${user}@${host}:${path}`
    config['host'] = host
    config['port'] = port
    config['user'] = user
  } else if (backend === 'rclone') {
    const remote = (formData.get('remote') as string)?.trim()
    const path   = (formData.get('path') as string)?.trim()
    if (!remote || !path) return { error: 'Remote and path are required' }
    config['repositoryUrl'] = `rclone:${remote}:${path}`
  }

  const db = getDb()
  const id = crypto.randomUUID()
  await db.insert(repositories).values({
    id,
    name,
    backend,
    config:         JSON.stringify(config),
    resticPassword: password,
    group,
    createdAt:      new Date(),
  })
  redirect(`/repositories/${id}`)
}

export interface ReplicaEntry {
  label:   string
  backend: string
}

export async function setReplicas(repoId: string, replicas: ReplicaEntry[]): Promise<void> {
  const db = getDb()
  await db
    .update(repositories)
    .set({ replicas: JSON.stringify(replicas) })
    .where(eq(repositories.id, repoId))
  revalidatePath(`/repositories/${repoId}`)
}

function parseReplicas(raw: string | null): ReplicaEntry[] {
  try { return raw ? (JSON.parse(raw) as ReplicaEntry[]) : [] }
  catch { return [] }
}

export async function addReplica(repoId: string, entry: ReplicaEntry): Promise<void> {
  const db      = getDb()
  const [repo]  = await db.select({ replicas: repositories.replicas }).from(repositories).where(eq(repositories.id, repoId)).limit(1)
  if (!repo) return
  const current = parseReplicas(repo.replicas)
  await setReplicas(repoId, [...current, entry])
}

export async function removeReplicaAt(repoId: string, index: number): Promise<void> {
  const db      = getDb()
  const [repo]  = await db.select({ replicas: repositories.replicas }).from(repositories).where(eq(repositories.id, repoId)).limit(1)
  if (!repo) return
  const current = parseReplicas(repo.replicas)
  await setReplicas(repoId, current.filter((_, i) => i !== index))
}

export async function setRepoGroup(repoId: string, group: string | null): Promise<void> {
  const db = getDb()
  await db
    .update(repositories)
    .set({ group: group || null })
    .where(eq(repositories.id, repoId))
  revalidatePath(`/repositories/${repoId}`)
  revalidatePath('/repositories')
}

export async function runCheck(repoId: string): Promise<{ ok: boolean; error?: string }> {
  const db     = getDb()
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, repoId)).limit(1)
  if (!repo) return { ok: false, error: 'Repository not found' }

  try {
    const cfg    = JSON.parse(repo.config) as Record<string, string>
    const engine = new ResticEngine({
      repositoryUrl: cfg['repositoryUrl'] ?? repoId,
      password:      repo.resticPassword,
      envVars:       cfg,
      binaryPath:    process.env['RESTIC_BINARY_PATH'],
    })
    const result = await engine.check()
    const status = result.errors.length === 0 ? 'ok' : 'errors'

    await db.update(repositories)
      .set({ lastCheckedAt: new Date(), lastCheckStatus: status })
      .where(eq(repositories.id, repoId))

    revalidatePath(`/repositories/${repoId}`)
    return { ok: status === 'ok' }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function pruneRepository(repoId: string): Promise<{
  ok: boolean
  removed?: number
  kept?: number
  jobsProcessed?: number
  error?: string
}> {
  const db     = getDb()
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, repoId)).limit(1)
  if (!repo) return { ok: false, error: 'Repository not found' }

  try {
    const jobs = await db
      .select()
      .from(backupJobs)
      .where(and(eq(backupJobs.repositoryId, repoId), eq(backupJobs.enabled, true)))
      .all()

    const [defaults] = await db.select().from(backupDefaults).limit(1).all()

    type Policy = {
      keepLast?: number; keepDaily?: number; keepWeekly?: number
      keepMonthly?: number; keepYearly?: number
    }
    const jobPolicies: Array<{ policy: Policy; tags: string[] }> = []

    for (const job of jobs) {
      const jobHasRetention = job.keepLast || job.keepDaily || job.keepWeekly || job.keepMonthly || job.keepYearly
      let policy: Policy | null = null

      if (jobHasRetention) {
        policy = {
          keepLast:    job.keepLast    ?? undefined,
          keepDaily:   job.keepDaily   ?? undefined,
          keepWeekly:  job.keepWeekly  ?? undefined,
          keepMonthly: job.keepMonthly ?? undefined,
          keepYearly:  job.keepYearly  ?? undefined,
        }
      } else if (defaults) {
        const defHasAny = defaults.keepLast || defaults.keepDaily || defaults.keepWeekly || defaults.keepMonthly || defaults.keepYearly
        if (defHasAny) {
          policy = {
            keepLast:    defaults.keepLast    ?? undefined,
            keepDaily:   defaults.keepDaily   ?? undefined,
            keepWeekly:  defaults.keepWeekly  ?? undefined,
            keepMonthly: defaults.keepMonthly ?? undefined,
            keepYearly:  defaults.keepYearly  ?? undefined,
          }
        }
      }

      if (policy) {
        const tags = job.tags ? (JSON.parse(job.tags) as string[]) : [`job:${job.id}`]
        jobPolicies.push({ policy, tags })
      }
    }

    const cfg = JSON.parse(repo.config) as Record<string, string>
    const engine = new ResticEngine({
      repositoryUrl: cfg['repositoryUrl'] ?? repoId,
      password:      repo.resticPassword,
      envVars:       cfg,
      binaryPath:    process.env['RESTIC_BINARY_PATH'],
    })

    if (jobPolicies.length === 0) {
      await engine.prune()
      return { ok: true, removed: 0, kept: 0, jobsProcessed: 0 }
    }

    let totalRemoved = 0
    let totalKept    = 0
    for (const { policy, tags } of jobPolicies) {
      const result = await engine.forget({ ...policy, keepTags: tags })
      totalRemoved += result.removed
      totalKept    += result.kept
    }
    return { ok: true, removed: totalRemoved, kept: totalKept, jobsProcessed: jobPolicies.length }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
