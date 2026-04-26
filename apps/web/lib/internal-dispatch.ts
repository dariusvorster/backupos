import type { ServerMessage } from '@backupos/agent-protocol'
import { loadOrCreateInternalToken } from './internal-token'

const DISPATCH_URL = `http://127.0.0.1:${process.env['PORT'] ?? '3000'}/internal/dispatch`

export async function dispatchToAgent(agentId: string, message: ServerMessage): Promise<{ ok: boolean; reason?: string; knownIds?: string[] }> {
  const token = loadOrCreateInternalToken()
  const res = await fetch(DISPATCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-token': token,
    },
    body: JSON.stringify({ agentId, message }),
  })
  return res.json() as Promise<{ ok: boolean; reason?: string; knownIds?: string[] }>
}
