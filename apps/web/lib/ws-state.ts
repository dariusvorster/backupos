import type { WebSocket } from 'ws'
import type { DetectedResources, MountConfig } from '@backupos/agent-protocol'
export type { DetectedResources }

export interface RepoTestResult  { ok: boolean; error?: string; snapshotCount?: number }
export interface MountTestResult { ok: boolean; error?: string }

declare global {
  // eslint-disable-next-line no-var
  var __bkp_connections: Map<string, WebSocket> | undefined
  // eslint-disable-next-line no-var
  var __bkp_pending_detects: Map<string, (r: DetectedResources) => void> | undefined
  // eslint-disable-next-line no-var
  var __bkp_pending_repo_tests: Map<string, (r: RepoTestResult) => void> | undefined
  // eslint-disable-next-line no-var
  var __bkp_pending_mount_tests: Map<string, (r: MountTestResult) => void> | undefined
}

const connections: Map<string, WebSocket> =
  (globalThis.__bkp_connections ??= new Map())

const pendingDetects: Map<string, (r: DetectedResources) => void> =
  (globalThis.__bkp_pending_detects ??= new Map())

const pendingRepoTests: Map<string, (r: RepoTestResult) => void> =
  (globalThis.__bkp_pending_repo_tests ??= new Map())

const pendingMountTests: Map<string, (r: MountTestResult) => void> =
  (globalThis.__bkp_pending_mount_tests ??= new Map())

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

export function broadcastRemoveMount(repoId: string): void {
  const msg = { type: 'remove_mount', repoId, mountPoint: `/mnt/backupos/${repoId}` }
  for (const agentId of connectedAgentIds()) dispatch(agentId, msg)
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

export function requestTestRepo(
  agentId: string,
  repoUrl: string,
  repoPassword: string,
  envVars?: Record<string, string>,
): Promise<RepoTestResult> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID()
    const timer = setTimeout(() => {
      pendingRepoTests.delete(requestId)
      reject(new Error('Agent did not respond in time'))
    }, 30_000)
    pendingRepoTests.set(requestId, (result) => {
      clearTimeout(timer)
      pendingRepoTests.delete(requestId)
      resolve(result)
    })
    const sent = dispatch(agentId, { type: 'test_repo', requestId, repoUrl, repoPassword, envVars })
    if (!sent) {
      clearTimeout(timer)
      pendingRepoTests.delete(requestId)
      reject(new Error('Agent not connected'))
    }
  })
}

export function resolveTestRepo(requestId: string, result: RepoTestResult): void {
  pendingRepoTests.get(requestId)?.(result)
}

export function requestTestMount(agentId: string, mountConfig: MountConfig): Promise<MountTestResult> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID()
    const timer = setTimeout(() => {
      pendingMountTests.delete(requestId)
      reject(new Error('Agent did not respond in time'))
    }, 60_000)
    pendingMountTests.set(requestId, (result) => {
      clearTimeout(timer)
      pendingMountTests.delete(requestId)
      resolve(result)
    })
    const sent = dispatch(agentId, { type: 'test_mount', requestId, mountConfig })
    if (!sent) {
      clearTimeout(timer)
      pendingMountTests.delete(requestId)
      reject(new Error('Agent not connected'))
    }
  })
}

export function resolveTestMount(requestId: string, result: MountTestResult): void {
  pendingMountTests.get(requestId)?.(result)
}
