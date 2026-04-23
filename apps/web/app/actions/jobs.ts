'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb, backupJobs, backupRuns, eq, inArray } from '@backupos/db'

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

export async function triggerJob(_id: string): Promise<void> {
  // Stub — agent triggering not yet implemented
  revalidatePath('/jobs')
}
