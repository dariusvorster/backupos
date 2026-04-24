import type { WebSocket } from 'ws'
import type { DetectedResources } from '@backupos/agent-protocol'
export type { DetectedResources }

// Use globalThis so these Maps are shared between server.ts and Next.js API routes
// (Next.js compiles API routes in a separate module context in the same process)
declare global {
  // eslint-disable-next-line no-var
  var __bkp_connections: Map<string, WebSocket> | undefined
  // eslint-disable-next-line no-var
  var __bkp_pending_detects: Map<string, (r: DetectedResources) => void> | undefined
}

const connections: Map<string, WebSocket> =
  (globalThis.__bkp_connections ??= new Map())

const pendingDetects: Map<string, (r: DetectedResources) => void> =
  (globalThis.__bkp_pending_detects ??= new Map())

export function registerAgent(agentId: string, ws: WebSocket): void {
  connections.set(agentId, ws)
}

export function unregisterAgent(agentId: string): void {
  connections.delete(agentId)
}

// Returns true if the message was sent, false if agent not connected
export function dispatch(agentId: string, msg: object): boolean {
  const ws = connections.get(agentId)
  if (!ws || ws.readyState !== 1 /* OPEN */) return false
  ws.send(JSON.stringify(msg))
  return true
}

export function connectedAgentIds(): string[] {
  return [...connections.keys()]
}

export function requestDetect(agentId: string): Promise<DetectedResources> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID()
    const timer = setTimeout(() => {
      pendingDetects.delete(requestId)
      reject(new Error('Agent did not respond in time'))
    }, 15_000)
    pendingDetects.set(requestId, (result) => {
      clearTimeout(timer)
      pendingDetects.delete(requestId)
      resolve(result)
    })
    const sent = dispatch(agentId, { type: 'list_resources', requestId })
    if (!sent) {
      clearTimeout(timer)
      pendingDetects.delete(requestId)
      reject(new Error('Agent not connected'))
    }
  })
}

export function resolveDetect(requestId: string, result: DetectedResources): void {
  pendingDetects.get(requestId)?.(result)
}
