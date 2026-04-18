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
