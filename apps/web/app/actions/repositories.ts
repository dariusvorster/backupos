'use server'

import { revalidatePath }           from 'next/cache'
import { getDb, repositories, eq }  from '@backupos/db'

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

export async function setRepoGroup(repoId: string, group: string | null): Promise<void> {
  const db = getDb()
  await db
    .update(repositories)
    .set({ group: group || null })
    .where(eq(repositories.id, repoId))
  revalidatePath(`/repositories/${repoId}`)
  revalidatePath('/repositories')
}
