'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb, agents, eq } from '@backupos/db'
import { requireAdmin } from '@/lib/user'

export async function enrollAgent(formData: FormData): Promise<void> {
  await requireAdmin() // admin only
  const name = (formData.get('name') as string)?.trim()
  if (!name) return

  const id    = crypto.randomUUID()
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')

  const db = getDb()
  await db.insert(agents).values({
    id,
    name,
    status:     'disconnected',
    publicKey:  token,
    enrolledAt: new Date(),
  })

  redirect(`/agents/${id}`)
}

export async function setAgentUpdateChannel(
  agentId: string,
  channel: 'stable' | 'beta' | 'pinned',
): Promise<void> {
  await requireAdmin()
  const db = getDb()
  await db.update(agents).set({ updateChannel: channel }).where(eq(agents.id, agentId))
  revalidatePath(`/agents/${agentId}`)
}

const VALID_CHANNELS = new Set(['stable', 'beta', 'pinned'])

export async function setAgentChannelFromForm(agentId: string, formData: FormData): Promise<void> {
  const raw = formData.get('channel') as string
  if (!VALID_CHANNELS.has(raw)) return
  await setAgentUpdateChannel(agentId, raw as 'stable' | 'beta' | 'pinned')
}

export async function forceUpdateAgent(agentId: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin() // admin only
  try {
    const port = process.env['PORT'] ?? '3000'
    const res  = await fetch(`http://127.0.0.1:${port}/api/agents/${agentId}/force-update`, { method: 'POST' })
    const body = await res.json() as { ok: boolean; error?: string }
    return body
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
