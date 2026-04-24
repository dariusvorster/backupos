import type { WebSocket } from 'ws'

const connections = new Map<string, WebSocket>()

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

export interface DetectedResources {
  dockerVolumes?: string[]
  mountPoints?:   string[]
  databases?:     Array<{ type: string; host: string; port: number }>
}

const pendingDetects = new Map<string, (r: DetectedResources) => void>()

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
