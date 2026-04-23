'use server'

import { revalidatePath } from 'next/cache'
import { getDb, infraOsServices, backupJobs } from '@backupos/db'
import { eq } from '@backupos/db'
import { randomUUID } from 'crypto'

export async function addInfraService(formData: FormData): Promise<{ error?: string }> {
  const name        = ((formData.get('name')        ?? '') as string).trim()
  const serviceType = ((formData.get('serviceType') ?? '') as string).trim()
  const host        = ((formData.get('host')        ?? '') as string).trim()
  const description = ((formData.get('description') ?? '') as string).trim()

  if (!name)        return { error: 'Service name is required.' }
  if (!serviceType) return { error: 'Service type is required.' }

  const db = getDb()
  await db.insert(infraOsServices).values({
    id:          randomUUID(),
    name,
    serviceType,
    host:        host || null,
    description: description || null,
    createdAt:   new Date(),
  }).run()

  revalidatePath('/settings/infra-os')
  revalidatePath('/dashboard')
  return {}
}

export async function addInfraServiceAction(formData: FormData): Promise<void> {
  const result = await addInfraService(formData)
  if (result.error) throw new Error(result.error)
}

export async function removeInfraService(id: string): Promise<void> {
  const db = getDb()
  await db.update(backupJobs).set({ infraServiceId: null }).where(eq(backupJobs.infraServiceId, id)).run()
  await db.delete(infraOsServices).where(eq(infraOsServices.id, id)).run()
  revalidatePath('/settings/infra-os')
  revalidatePath('/dashboard')
}
