'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb, backupJobs, backupRuns, bandwidthProfiles, bandwidthRules, eq, inArray, and, lte, gte } from '@backupos/db'

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
    sourceConfig:  '{}',
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
  const db               = getDb()
  const now              = new Date()
  const bandwidthLimitKbps = await resolveBandwidthLimitKbps(db, id)

  await db.insert(backupRuns).values({
    id:        crypto.randomUUID(),
    jobId:     id,
    status:    'running',
    trigger:   'manual',
    startedAt: now,
    bandwidthLimitKbps,
  })
  await db.update(backupJobs).set({ lastRunAt: now }).where(eq(backupJobs.id, id))
  redirect(`/jobs/${id}`)
}
