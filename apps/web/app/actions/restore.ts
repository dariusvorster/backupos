'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb, restoreSpecs } from '@backupos/db'

export async function forkSpec(name: string, yamlContent: string): Promise<void> {
  const db = getDb()
  const id = crypto.randomUUID()
  await db.insert(restoreSpecs).values({
    id,
    name:             `${name} (copy)`,
    description:      'Forked from template library.',
    yamlContent,
    createdAt:        new Date(),
    validationStatus: null,
  })
  revalidatePath('/restore')
  redirect(`/restore/${id}`)
}
