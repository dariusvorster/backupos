'use server'

import { revalidatePath } from 'next/cache'
import { getDb, agents, eq } from '@backupos/db'

export async function setAgentUpdateChannel(
  agentId: string,
  channel: 'stable' | 'beta' | 'pinned',
): Promise<void> {
  const db = getDb()
  await db.update(agents).set({ updateChannel: channel }).where(eq(agents.id, agentId))
  revalidatePath(`/agents/${agentId}`)
}
