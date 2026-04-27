import { repositories, getDb, eq } from '@backupos/db'
import { requestMountRepository } from './ws-state'

/**
 * If the repo has agent-mount config (nfs_server set), instructs the agent
 * to mount it before the job runs. No-op for host-mounted repos.
 */
export async function ensureRepoMountedOnAgent(agentId: string, repoId: string): Promise<void> {
  const db = getDb()
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, repoId)).limit(1)
  if (!repo) throw new Error(`repository ${repoId} not found`)

  if (!repo.nfsServer) return

  await requestMountRepository(
    agentId,
    repoId,
    repo.nfsServer,
    repo.nfsExport ?? '',
    repo.nfsOptions ?? 'vers=3,soft,timeo=50',
  )
}
