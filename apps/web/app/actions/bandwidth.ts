'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb, bandwidthProfiles, bandwidthRules, backupJobs } from '@backupos/db'
import { eq } from '@backupos/db'
import { requireAdmin } from '@/lib/user'

export async function createProfile(formData: FormData): Promise<void> {
  await requireAdmin()
  const name        = (formData.get('name') as string).trim()
  const description = (formData.get('description') as string | null)?.trim() || null
  const isGlobal    = formData.get('isGlobal') === 'on'
  if (!name) return

  const db = getDb()

  if (isGlobal) {
    await db.update(bandwidthProfiles)
      .set({ isGlobal: false })
      .where(eq(bandwidthProfiles.isGlobal, true))
      .run()
  }

  await db.insert(bandwidthProfiles).values({
    id:        crypto.randomUUID(),
    name,
    description,
    isGlobal,
    createdAt: new Date(),
  }).run()

  redirect('/settings/bandwidth?saved=1')
}

export async function deleteProfile(id: string): Promise<void> {
  await requireAdmin()
  const db = getDb()
  await db.update(backupJobs)
    .set({ bandwidthProfileId: null })
    .where(eq(backupJobs.bandwidthProfileId, id))
    .run()
  await db.delete(bandwidthRules).where(eq(bandwidthRules.profileId, id)).run()
  await db.delete(bandwidthProfiles).where(eq(bandwidthProfiles.id, id)).run()
  revalidatePath('/settings/bandwidth')
  revalidatePath('/dashboard')
}

export async function addRule(profileId: string, formData: FormData): Promise<void> {
  await requireAdmin()
  const startHour = parseInt(formData.get('startHour') as string, 10)
  const endHour   = parseInt(formData.get('endHour')   as string, 10)
  const limitRaw  = (formData.get('limitKbps') as string).trim()
  const limitKbps = limitRaw === '' ? null : parseInt(limitRaw, 10)

  if (isNaN(startHour) || isNaN(endHour)) return
  if (startHour < 0 || endHour > 24 || startHour >= endHour) return

  const db = getDb()
  await db.insert(bandwidthRules).values({
    id: crypto.randomUUID(),
    profileId,
    startHour,
    endHour,
    limitKbps,
  }).run()

  revalidatePath('/settings/bandwidth')
  revalidatePath('/dashboard')
}

export async function deleteRule(id: string): Promise<void> {
  await requireAdmin()
  const db = getDb()
  await db.delete(bandwidthRules).where(eq(bandwidthRules.id, id)).run()
  revalidatePath('/settings/bandwidth')
  revalidatePath('/dashboard')
}

export async function setJobProfile(jobId: string, formData: FormData): Promise<void> {
  await requireAdmin()
  const profileId = (formData.get('profileId') as string) || null
  const db = getDb()
  await db.update(backupJobs)
    .set({ bandwidthProfileId: profileId })
    .where(eq(backupJobs.id, jobId))
    .run()
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath('/dashboard')
}
