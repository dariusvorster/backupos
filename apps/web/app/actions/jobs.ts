'use server'

import { revalidatePath } from 'next/cache'
import { getDb, backupJobs, backupRuns, eq, inArray } from '@backupos/db'

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
