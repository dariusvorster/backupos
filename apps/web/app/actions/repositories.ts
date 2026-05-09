'use server'

import { revalidatePath }           from 'next/cache'
import { redirect }                 from 'next/navigation'
import { getDb, repositories, backupJobs, backupDefaults, eq, and, count } from '@backupos/db'
import { ResticEngine }             from '@backupos/engine'
import { encryptField, decryptField } from '@/lib/repo-crypto'
import { requireAdmin } from '@/lib/user'
import { enforceLimit, LicenseLimitError } from '@/lib/license'

function parseRepoConfig(raw: string): Record<string, string> {
  return JSON.parse(decryptField(raw)) as Record<string, string>
}

function parseSmbSharePath(raw: string): { host: string; remotePath: string } | { error: string } {
  const s = raw.replace(/\\/g, '/').replace(/^\/\//, '')
  if (s.includes(':')) return { error: 'SMB share should not contain a colon — use //host/share format (e.g. //192.168.10.9/Backups). For NFS use the NFS backend.' }
  const idx = s.indexOf('/')
  if (idx === -1 || !s.slice(0, idx) || !s.slice(idx + 1)) {
    return { error: 'SMB share must be in format //host/share (e.g. //192.168.10.9/Backups)' }
  }
  return { host: s.slice(0, idx), remotePath: s.slice(idx + 1) }
}

export async function createRepository(formData: FormData): Promise<{ error: string } | never> {
  await requireAdmin() // admin only
  const name     = (formData.get('name') as string)?.trim()
  const backend  = formData.get('backend') as string
  const password = formData.get('password') as string
  const group    = (formData.get('group') as string)?.trim() || null

  if (!name)     return { error: 'Name is required' }
  if (!backend)  return { error: 'Backend is required' }
  if (!password) return { error: 'Repository password is required' }

  const db = getDb()
  const repoRows = await db.select({ count: count() }).from(repositories).all()
  const repoCount = repoRows[0]?.count ?? 0
  try { await enforceLimit('repositories', repoCount) } catch (e) {
    if (e instanceof LicenseLimitError) return { error: e.message }
    throw e
  }
  const id = crypto.randomUUID()

  const config: Record<string, string> = {}
  let nfsServer: string | undefined
  let nfsExport: string | undefined

  if (backend === 'local') {
    const path = (formData.get('path') as string)?.trim()
    if (!path) return { error: 'Path is required' }
    config['repositoryUrl'] = path
    config['path'] = path
  } else if (backend === 's3') {
    const bucket   = (formData.get('bucket') as string)?.trim()
    const endpoint = (formData.get('endpoint') as string)?.trim()
    const region   = (formData.get('region') as string)?.trim() || 'us-east-1'
    const key      = (formData.get('accessKey') as string)?.trim()
    const secret   = (formData.get('secretKey') as string)?.trim()
    if (!bucket || !key || !secret) return { error: 'Bucket, access key, and secret key are required' }
    config['repositoryUrl']         = endpoint ? `s3:${endpoint}/${bucket}` : `s3:s3.amazonaws.com/${bucket}`
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
    config['repositoryUrl']         = `s3:https://${accountId}.r2.cloudflarestorage.com/${bucket}`
    config['AWS_ACCESS_KEY_ID']     = key
    config['AWS_SECRET_ACCESS_KEY'] = secret
  } else if (backend === 'b2') {
    const bucket = (formData.get('bucket') as string)?.trim()
    const keyId  = (formData.get('keyId') as string)?.trim()
    const appKey = (formData.get('appKey') as string)?.trim()
    if (!bucket || !keyId || !appKey) return { error: 'Bucket, key ID, and application key are required' }
    config['repositoryUrl']  = `b2:${bucket}`
    config['B2_ACCOUNT_ID']  = keyId
    config['B2_ACCOUNT_KEY'] = appKey
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
  } else if (backend === 'nfs') {
    const nfsPath  = (formData.get('nfsPath') as string)?.trim()
    const repoPath = (formData.get('repoPath') as string)?.trim().replace(/^\/+/, '')
    if (!nfsPath) return { error: 'NFS path is required' }
    const colonIdx = nfsPath.indexOf(':')
    if (colonIdx === -1) return { error: 'NFS path must be in format host:/export/path (e.g. 192.168.10.9:/volume1/Backups)' }
    const host       = nfsPath.slice(0, colonIdx)
    const remotePath = nfsPath.slice(colonIdx + 1)
    const mountPoint = `/mnt/backupos/${id}`
    config['repositoryUrl'] = repoPath ? `${mountPoint}/${repoPath}` : mountPoint
    config['mountConfig']   = JSON.stringify({ type: 'nfs', host, remotePath, mountPoint, repoPath: repoPath || '' })
    nfsServer = host
    nfsExport = remotePath
  } else if (backend === 'smb') {
    const smbShare = (formData.get('smbShare') as string)?.trim()
    const username = (formData.get('username') as string)?.trim()
    const password = (formData.get('smbPassword') as string)?.trim()
    const repoPath = (formData.get('repoPath') as string)?.trim().replace(/^\/+/, '')
    if (!smbShare) return { error: 'SMB share path is required' }
    const parsed = parseSmbSharePath(smbShare)
    if ('error' in parsed) return { error: parsed.error }
    if (!username || !password) return { error: 'Username and password are required' }
    const mountPoint = `/mnt/backupos/${id}`
    config['repositoryUrl'] = repoPath ? `${mountPoint}/${repoPath}` : mountPoint
    config['mountConfig']   = JSON.stringify({ type: 'smb', host: parsed.host, remotePath: parsed.remotePath, mountPoint, username, password, repoPath: repoPath || '' })
  }

  await db.insert(repositories).values({
    id,
    name,
    backend,
    config:         encryptField(JSON.stringify(config)),
    resticPassword: encryptField(password),
    group,
    createdAt:      new Date(),
    nfsServer:      nfsServer,
    nfsExport:      nfsExport,
    nfsOptions:     nfsServer ? 'vers=3,soft,timeo=50' : undefined,
  })
  redirect(`/repositories/${id}`)
}

export async function updateRepository(id: string, formData: FormData): Promise<{ error: string } | undefined> {
  await requireAdmin() // admin only
  const name     = (formData.get('name') as string)?.trim()
  const password = (formData.get('password') as string)?.trim()
  const group    = (formData.get('group') as string)?.trim() || null
  if (!name) return { error: 'Name is required' }

  const db     = getDb()
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1)
  if (!repo) return { error: 'Repository not found' }

  const config: Record<string, string> = parseRepoConfig(repo.config)
  let updatedNfsServer: string | null = null
  let updatedNfsExport: string | null = null
  let updatedNfsOptions: string | null = null

  if (repo.backend === 'local') {
    const path = (formData.get('path') as string)?.trim()
    if (!path) return { error: 'Path is required' }
    config['repositoryUrl'] = path
    config['path'] = path
  } else if (repo.backend === 's3') {
    const bucket    = (formData.get('bucket') as string)?.trim()
    const region    = (formData.get('region') as string)?.trim() || 'us-east-1'
    const endpoint  = (formData.get('endpoint') as string)?.trim()
    const accessKey = (formData.get('accessKey') as string)?.trim()
    const secretKey = (formData.get('secretKey') as string)?.trim()
    if (!bucket) return { error: 'Bucket is required' }
    if (accessKey) config['AWS_ACCESS_KEY_ID'] = accessKey
    if (secretKey) config['AWS_SECRET_ACCESS_KEY'] = secretKey
    config['AWS_DEFAULT_REGION'] = region
    config['repositoryUrl'] = endpoint ? `s3:${endpoint}/${bucket}` : `s3:s3.amazonaws.com/${bucket}`
    if (endpoint) config['endpoint'] = endpoint
  } else if (repo.backend === 'r2') {
    const accountId = (formData.get('accountId') as string)?.trim()
    const bucket    = (formData.get('bucket') as string)?.trim()
    const accessKey = (formData.get('accessKey') as string)?.trim()
    const secretKey = (formData.get('secretKey') as string)?.trim()
    if (!accountId || !bucket) return { error: 'Account ID and bucket are required' }
    if (accessKey) config['AWS_ACCESS_KEY_ID'] = accessKey
    if (secretKey) config['AWS_SECRET_ACCESS_KEY'] = secretKey
    config['repositoryUrl'] = `s3:https://${accountId}.r2.cloudflarestorage.com/${bucket}`
  } else if (repo.backend === 'b2') {
    const bucket = (formData.get('bucket') as string)?.trim()
    const keyId  = (formData.get('keyId') as string)?.trim()
    const appKey = (formData.get('appKey') as string)?.trim()
    if (!bucket) return { error: 'Bucket is required' }
    if (keyId)  config['B2_ACCOUNT_ID']  = keyId
    if (appKey) config['B2_ACCOUNT_KEY'] = appKey
    config['repositoryUrl'] = `b2:${bucket}`
  } else if (repo.backend === 'sftp') {
    const host = (formData.get('host') as string)?.trim()
    const port = (formData.get('port') as string)?.trim() || '22'
    const user = (formData.get('user') as string)?.trim()
    const path = (formData.get('path') as string)?.trim()
    if (!host || !user || !path) return { error: 'Host, user, and path are required' }
    config['repositoryUrl'] = `sftp:${user}@${host}:${path}`
    config['host'] = host; config['port'] = port; config['user'] = user
  } else if (repo.backend === 'rclone') {
    const remote = (formData.get('remote') as string)?.trim()
    const path   = (formData.get('path') as string)?.trim()
    if (!remote || !path) return { error: 'Remote and path are required' }
    config['repositoryUrl'] = `rclone:${remote}:${path}`
  } else if (repo.backend === 'nfs') {
    const nfsPath  = (formData.get('nfsPath') as string)?.trim()
    const repoPath = (formData.get('repoPath') as string)?.trim().replace(/^\/+/, '')
    if (!nfsPath) return { error: 'NFS path is required' }
    const colonIdx = nfsPath.indexOf(':')
    if (colonIdx === -1) return { error: 'NFS path must be in format host:/export/path' }
    const host       = nfsPath.slice(0, colonIdx)
    const remotePath = nfsPath.slice(colonIdx + 1)
    const existing   = config['mountConfig'] ? (JSON.parse(config['mountConfig']) as Record<string, string>) : {}
    const mountPoint = (existing['mountPoint'] as string) || `/mnt/backupos/${id}`
    config['repositoryUrl'] = repoPath ? `${mountPoint}/${repoPath}` : mountPoint
    config['mountConfig']   = JSON.stringify({ ...existing, type: 'nfs', host, remotePath, mountPoint, repoPath: repoPath || '' })
    updatedNfsServer  = host
    updatedNfsExport  = remotePath
    updatedNfsOptions = 'vers=3,soft,timeo=50'
  } else if (repo.backend === 'smb') {
    const smbShare  = (formData.get('smbShare') as string)?.trim()
    const username  = (formData.get('username') as string)?.trim()
    const newPass   = (formData.get('smbPassword') as string)?.trim()
    const repoPath  = (formData.get('repoPath') as string)?.trim().replace(/^\/+/, '')
    if (!smbShare) return { error: 'SMB share path is required' }
    const parsed = parseSmbSharePath(smbShare)
    if ('error' in parsed) return { error: parsed.error }
    const existing   = config['mountConfig'] ? (JSON.parse(config['mountConfig']) as Record<string, string>) : {}
    const mountPoint = (existing['mountPoint'] as string) || `/mnt/backupos/${id}`
    const password   = newPass || (existing['password'] as string) || ''
    const user       = username || (existing['username'] as string) || ''
    if (!user || !password) return { error: 'Username and password are required' }
    config['repositoryUrl'] = repoPath ? `${mountPoint}/${repoPath}` : mountPoint
    config['mountConfig']   = JSON.stringify({ ...existing, type: 'smb', host: parsed.host, remotePath: parsed.remotePath, mountPoint, username: user, password, repoPath: repoPath || '' })
  }

  const updates: Record<string, unknown> = {
    name, group, config: encryptField(JSON.stringify(config)),
    nfsServer:  updatedNfsServer,
    nfsExport:  updatedNfsExport,
    nfsOptions: updatedNfsOptions,
  }
  if (password) updates['resticPassword'] = encryptField(password)
  await db.update(repositories).set(updates).where(eq(repositories.id, id))
  revalidatePath(`/repositories/${id}`)
  redirect(`/repositories/${id}`)
}

export async function deleteRepository(id: string): Promise<{ error: string } | undefined> {
  await requireAdmin() // admin only
  const db = getDb()
  await db.delete(backupJobs).where(eq(backupJobs.repositoryId, id))
  await db.delete(repositories).where(eq(repositories.id, id))
  try {
    const { broadcastRemoveMount } = await import('@/lib/ws-state')
    broadcastRemoveMount(id)
  } catch (_) {}
  revalidatePath('/repositories')
  redirect('/repositories')
}

export async function testCloudConnection(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const backend  = formData.get('backend') as string
  const password = (formData.get('password') as string)?.trim() || 'placeholder'
  const config: Record<string, string> = {}

  if (backend === 's3') {
    const bucket = (formData.get('bucket') as string)?.trim()
    const ep     = (formData.get('endpoint') as string)?.trim()
    const region = (formData.get('region') as string)?.trim() || 'us-east-1'
    const key    = (formData.get('accessKey') as string)?.trim()
    const secret = (formData.get('secretKey') as string)?.trim()
    if (!bucket || !key || !secret) return { ok: false, message: 'Fill in bucket, access key, and secret key first' }
    config['repositoryUrl']         = ep ? `s3:${ep}/${bucket}` : `s3:s3.amazonaws.com/${bucket}`
    config['AWS_ACCESS_KEY_ID']     = key
    config['AWS_SECRET_ACCESS_KEY'] = secret
    config['AWS_DEFAULT_REGION']    = region
  } else if (backend === 'r2') {
    const accountId = (formData.get('accountId') as string)?.trim()
    const bucket    = (formData.get('bucket') as string)?.trim()
    const key       = (formData.get('accessKey') as string)?.trim()
    const secret    = (formData.get('secretKey') as string)?.trim()
    if (!accountId || !bucket || !key || !secret) return { ok: false, message: 'Fill in all fields first' }
    config['repositoryUrl']         = `s3:https://${accountId}.r2.cloudflarestorage.com/${bucket}`
    config['AWS_ACCESS_KEY_ID']     = key
    config['AWS_SECRET_ACCESS_KEY'] = secret
  } else if (backend === 'b2') {
    const bucket = (formData.get('bucket') as string)?.trim()
    const keyId  = (formData.get('keyId') as string)?.trim()
    const appKey = (formData.get('appKey') as string)?.trim()
    if (!bucket || !keyId || !appKey) return { ok: false, message: 'Fill in all fields first' }
    config['repositoryUrl']  = `b2:${bucket}`
    config['B2_ACCOUNT_ID']  = keyId
    config['B2_ACCOUNT_KEY'] = appKey
  } else if (backend === 'sftp') {
    const host = (formData.get('host') as string)?.trim()
    const user = (formData.get('user') as string)?.trim()
    const path = (formData.get('path') as string)?.trim()
    if (!host || !user || !path) return { ok: false, message: 'Fill in host, user, and path first' }
    config['repositoryUrl'] = `sftp:${user}@${host}:${path}`
  } else {
    return { ok: false, message: 'Connection test not available for this backend' }
  }

  try {
    const engine = new ResticEngine({
      repositoryUrl: config['repositoryUrl']!,
      password,
      envVars:    config,
      binaryPath: process.env['RESTIC_BINARY_PATH'],
    })
    await engine.snapshots()
    return { ok: true, message: 'Connected — repository is accessible' }
  } catch (err) {
    const msg = String(err).toLowerCase()
    if (
      msg.includes('unable to open config') ||
      msg.includes('is not a restic repository') ||
      msg.includes('wrong password') ||
      msg.includes('no key found')
    ) {
      return { ok: true, message: 'Credentials valid — repository will be initialized on first backup' }
    }
    const lines  = String(err).split('\n').map(l => l.trim()).filter(Boolean)
    const useful = lines.find(l => /error|denied|failed|refused|invalid/i.test(l)) ?? lines[0] ?? 'Connection failed'
    return { ok: false, message: useful }
  }
}

export interface ReplicaEntry {
  label:   string
  backend: string
}

export async function setReplicas(repoId: string, replicas: ReplicaEntry[]): Promise<void> {
  await requireAdmin()
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
  await requireAdmin()
  const db      = getDb()
  const [repo]  = await db.select({ replicas: repositories.replicas }).from(repositories).where(eq(repositories.id, repoId)).limit(1)
  if (!repo) return
  const current = parseReplicas(repo.replicas)
  await setReplicas(repoId, [...current, entry])
}

export async function removeReplicaAt(repoId: string, index: number): Promise<void> {
  await requireAdmin()
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
    const cfg    = parseRepoConfig(repo.config)
    const engine = new ResticEngine({
      repositoryUrl: cfg['repositoryUrl'] ?? repoId,
      password:      decryptField(repo.resticPassword),
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
  await requireAdmin() // admin only
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

    const cfg    = parseRepoConfig(repo.config)
    const engine = new ResticEngine({
      repositoryUrl: cfg['repositoryUrl'] ?? repoId,
      password:      decryptField(repo.resticPassword),
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
