import type { WebSocket } from 'ws'
import type { DetectedResources, MountConfig, ComposeProjectListing } from '@backupos/agent-protocol'
export type { DetectedResources }

export interface RepoTestResult  { ok: boolean; error?: string; snapshotCount?: number }
export interface MountTestResult { ok: boolean; error?: string }
export interface InitRepoResult  { ok: boolean; error?: string }

declare global {
  // eslint-disable-next-line no-var
  var __bkp_connections: Map<string, WebSocket> | undefined
  // eslint-disable-next-line no-var
  var __bkp_pending_detects: Map<string, (r: DetectedResources) => void> | undefined
  // eslint-disable-next-line no-var
  var __bkp_pending_repo_tests: Map<string, (r: RepoTestResult) => void> | undefined
  // eslint-disable-next-line no-var
  var __bkp_pending_mount_tests: Map<string, (r: MountTestResult) => void> | undefined
  // eslint-disable-next-line no-var
  var __bkp_pending_init_repos: Map<string, (r: InitRepoResult) => void> | undefined
  // eslint-disable-next-line no-var
  var __bkp_pending_fs_restores: Map<string, (r: { ok: boolean; error?: string }) => void> | undefined
}

const connections: Map<string, WebSocket> =
  (globalThis.__bkp_connections ??= new Map())

const pendingDetects: Map<string, (r: DetectedResources) => void> =
  (globalThis.__bkp_pending_detects ??= new Map())

const pendingRepoTests: Map<string, (r: RepoTestResult) => void> =
  (globalThis.__bkp_pending_repo_tests ??= new Map())

const pendingMountTests: Map<string, (r: MountTestResult) => void> =
  (globalThis.__bkp_pending_mount_tests ??= new Map())

const pendingInitRepos: Map<string, (r: InitRepoResult) => void> =
  (globalThis.__bkp_pending_init_repos ??= new Map())

const pendingFsRestores: Map<string, (r: { ok: boolean; error?: string }) => void> =
  (globalThis.__bkp_pending_fs_restores ??= new Map())

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

export function requestInitRepository(
  agentId: string,
  repoUrl: string,
  repoPassword: string,
  envVars?: Record<string, string>,
): Promise<InitRepoResult> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID()
    const timer = setTimeout(() => {
      pendingInitRepos.delete(requestId)
      reject(new Error('Agent did not respond in time'))
    }, 60_000)
    pendingInitRepos.set(requestId, (result) => {
      clearTimeout(timer)
      pendingInitRepos.delete(requestId)
      resolve(result)
    })
    const sent = dispatch(agentId, { type: 'init_repository', requestId, repoUrl, repoPassword, envVars })
    if (!sent) {
      clearTimeout(timer)
      pendingInitRepos.delete(requestId)
      reject(new Error('Agent not connected'))
    }
  })
}

export function resolveInitRepository(requestId: string, result: InitRepoResult): void {
  pendingInitRepos.get(requestId)?.(result)
}

declare global {
  // eslint-disable-next-line no-var
  var __bkp_pending_mount_repos: Map<string, { resolve: () => void; reject: (err: Error) => void }> | undefined
}

const pendingMountRepos: Map<string, { resolve: () => void; reject: (err: Error) => void }> =
  (globalThis.__bkp_pending_mount_repos ??= new Map())

export function requestMountRepository(
  agentId: string,
  repoId: string,
  nfsServer: string,
  nfsExport: string,
  nfsOptions: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID()
    pendingMountRepos.set(requestId, { resolve, reject })
    const sent = dispatch(agentId, {
      type: 'mount_repository', requestId, repoId, nfsServer, nfsExport, nfsOptions,
    })
    if (!sent) {
      pendingMountRepos.delete(requestId)
      reject(new Error(`agent ${agentId} not connected`))
      return
    }
    // NFS mount can be slow — allow 60s
    setTimeout(() => {
      if (pendingMountRepos.has(requestId)) {
        pendingMountRepos.delete(requestId)
        reject(new Error('mount request timed out after 60s'))
      }
    }, 60_000)
  })
}

export function resolveMountRepository(requestId: string, error?: string): void {
  const pending = pendingMountRepos.get(requestId)
  if (!pending) return
  pendingMountRepos.delete(requestId)
  if (error) pending.reject(new Error(error))
  else pending.resolve()
}

declare global {
  // eslint-disable-next-line no-var
  var __bkp_pending_compose_lists: Map<string, (r: ComposeProjectListing) => void> | undefined
}

const pendingComposeLists: Map<string, (r: ComposeProjectListing) => void> =
  (globalThis.__bkp_pending_compose_lists ??= new Map())

export function requestListCompose(agentId: string, projectName: string): Promise<ComposeProjectListing> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID()
    const timer = setTimeout(() => {
      pendingComposeLists.delete(requestId)
      reject(new Error('Agent did not respond to list_compose_project in time'))
    }, 15_000)
    pendingComposeLists.set(requestId, result => {
      clearTimeout(timer)
      pendingComposeLists.delete(requestId)
      resolve(result)
    })
    const sent = dispatch(agentId, { type: 'list_compose_project', requestId, projectName })
    if (!sent) {
      clearTimeout(timer)
      pendingComposeLists.delete(requestId)
      reject(new Error('Agent not connected'))
    }
  })
}

export function resolveListCompose(requestId: string, project: ComposeProjectListing): void {
  pendingComposeLists.get(requestId)?.(project)
}

export function requestFilesystemRestore(
  agentId: string,
  payload: {
    restoreId:          string
    repoUrl:            string
    repoPassword:       string
    envVars?:           Record<string, string>
    snapshotId:         string
    targetPath:         string
    sourcePath:         string
    targetIsAgentLocal: boolean
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID()
    const timer = setTimeout(() => {
      pendingFsRestores.delete(requestId)
      resolve({ ok: false, error: 'Agent did not acknowledge dispatch within 30s' })
    }, 30_000)
    pendingFsRestores.set(requestId, (r) => {
      clearTimeout(timer)
      pendingFsRestores.delete(requestId)
      if (r.ok) resolve({ ok: true })
      else resolve({ ok: false, error: r.error ?? 'unknown dispatch error' })
    })
    const sent = dispatch(agentId, { type: 'run_filesystem_restore', requestId, ...payload })
    if (!sent) {
      clearTimeout(timer)
      pendingFsRestores.delete(requestId)
      resolve({ ok: false, error: 'Agent not connected' })
    }
  })
}

export function resolveFilesystemRestoreStarted(requestId: string): void {
  pendingFsRestores.get(requestId)?.({ ok: true })
}

type DbRestoreResult = { success: boolean; output?: string; error?: string; durationSec?: number }
const pendingDbRestoreStarted  = new Map<string, () => void>()
const pendingDbRestoreComplete = new Map<string, (r: DbRestoreResult) => void>()

export function requestDatabaseRestore(
  agentId: string,
  payload: {
    restoreId:       string
    app:             'postgres' | 'mysql' | 'mariadb'
    dumpFilePath:    string
    targetContainer?: string
    targetDatabase?:  string
    targetUsername?:  string
    targetHost?:      string
    targetPort?:      number
    passwordEnv?:     string
  },
): Promise<DbRestoreResult> {
  const requestId = crypto.randomUUID()
  const sent = dispatch(agentId, { type: 'run_database_restore', requestId, ...payload })
  if (!sent) return Promise.reject(new Error(`Agent ${agentId} not connected`))

  return new Promise((resolve, reject) => {
    const startedTimeout = setTimeout(() => {
      pendingDbRestoreStarted.delete(requestId)
      pendingDbRestoreComplete.delete(payload.restoreId)
      reject(new Error('Agent did not acknowledge database restore start within 30s'))
    }, 30_000)

    pendingDbRestoreStarted.set(requestId, () => {
      clearTimeout(startedTimeout)
    })

    pendingDbRestoreComplete.set(payload.restoreId, (result) => {
      pendingDbRestoreStarted.delete(requestId)
      pendingDbRestoreComplete.delete(payload.restoreId)
      resolve(result)
    })
  })
}

export function resolveDatabaseRestoreStarted(requestId: string): void {
  pendingDbRestoreStarted.get(requestId)?.()
}

export function resolveDatabaseRestoreComplete(restoreId: string, result: DbRestoreResult): void {
  pendingDbRestoreComplete.get(restoreId)?.(result)
}

const pendingSnapshotPaths = new Map<string, (result: { ok: boolean; paths?: string[]; error?: string }) => void>()

export function requestSnapshotPaths(
  agentId: string,
  args: { repoUrl: string; repoPassword: string; envVars?: Record<string, string>; snapshotId: string; pattern?: string },
): Promise<{ ok: boolean; paths?: string[]; error?: string }> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID()
    const timer = setTimeout(() => {
      pendingSnapshotPaths.delete(requestId)
      reject(new Error('Agent did not respond in time (60s) for list_snapshot_paths'))
    }, 60_000)
    pendingSnapshotPaths.set(requestId, (result) => {
      clearTimeout(timer)
      pendingSnapshotPaths.delete(requestId)
      resolve(result)
    })
    const sent = dispatch(agentId, {
      type:         'list_snapshot_paths',
      requestId,
      repoUrl:      args.repoUrl,
      repoPassword: args.repoPassword,
      envVars:      args.envVars,
      snapshotId:   args.snapshotId,
      pattern:      args.pattern,
    })
    if (!sent) {
      clearTimeout(timer)
      pendingSnapshotPaths.delete(requestId)
      reject(new Error('Agent not connected'))
    }
  })
}

export function resolveSnapshotPaths(
  requestId: string,
  result: { ok: boolean; paths?: string[]; error?: string },
): void {
  pendingSnapshotPaths.get(requestId)?.(result)
}

