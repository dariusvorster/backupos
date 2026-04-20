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
