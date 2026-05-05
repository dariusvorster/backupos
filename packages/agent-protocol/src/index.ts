export interface MountConfig {
  type: 'nfs' | 'smb'
  host: string
  remotePath: string
  mountPoint: string
  username?: string
  password?: string
  domain?: string
  options?: string
  mountCommand?: string  // full custom command; use {mountPoint} as placeholder
}

export interface BackupJobConfig {
  repoId: string
  repoUrl: string
  repoPassword: string
  paths: string[]
  exclude?: string[]
  tags?: string[]
  useVSS?: boolean
  envVars?: Record<string, string>
  mountConfig?: MountConfig
}

export interface BackupStats {
  filesNew: number
  filesChanged: number
  filesUnmodified: number
  dataAdded: number
  totalFilesProcessed: number
  totalBytesProcessed: number
  durationMs: number
}

export interface AgentMetrics {
  cpuPercent: number
  memUsedBytes: number
  memTotalBytes: number
  diskUsedBytes: Record<string, number>
  diskTotalBytes: Record<string, number>
  uptimeSeconds: number
}

export interface OsInfo {
  os: string
  arch: string
  kernel: string
}

// ── Phase B: capability detection ─────────────────────────────────────────

export type Capability =
  | 'filesystem'           // can read host filesystem paths
  | 'docker'               // can reach Docker API
  | 'podman'               // can reach Podman API
  | 'vss'                  // Windows VSS available
  | 'apphook:postgres'     // pg_dump available
  | 'apphook:mysql'        // mysqldump available
  | 'apphook:redis'        // redis-cli available
  | 'apphook:sqlite'       // sqlite3 available
  | 'hypervisor:proxmox'   // can reach Proxmox API

// ── Phase B: compose project types ────────────────────────────────────────

export interface ComposeServiceVolume {
  type: 'volume' | 'bind'
  name?: string
  source?: string
  target: string
}

export interface ComposeServiceListing {
  name: string
  image: string
  containerStatus: string
  volumes: ComposeServiceVolume[]
  binds: string[]
  envFiles: string[]
  networks: string[]
  labels: Record<string, string>
}

export interface ComposeProjectListing {
  name: string
  composeFilePath?: string
  services: ComposeServiceListing[]
}

export interface ComposeApphookConfig {
  host?: string
  port?: number
  username?: string      // matches AppHookConfig.username
  passwordEnv?: string   // name of env var on the agent container holding the password
  database?: string
  dbPath?: string        // sqlite only — path inside the volume
}

export interface ComposeServiceConfig {
  serviceName: string
  included: boolean
  quiescence: 'none' | 'pause' | 'stop' | 'apphook'
  apphookType?: 'postgres' | 'mysql' | 'redis' | 'sqlite'
  apphookConfig?: ComposeApphookConfig
  includedVolumes: string[]
  includedBindMounts: string[]
  envFiles: string[]
}

export interface ComposeProjectConfig {
  projectName: string
  composeFilePath?: string
  services: ComposeServiceConfig[]
  includeComposeFile: boolean
  includeEnvFiles: boolean
  redactSecretsInEnvFiles: boolean
  includeContainerLabels: boolean
  includeNetworkMetadata: boolean
}

export interface ComposeRestoreConfig {
  mode: 'in_place' | 'side_by_side'
  snapshotIds: string[]              // one per included service, same order as composeConfig.services
  composeConfig: ComposeProjectConfig
  restoreComposeFile: boolean
  sideBySideProjectName?: string     // required when mode === 'side_by_side'
}

// ── SSH verification target config ────────────────────────────────────────

export interface SshVerificationTargetConfig {
  host: string
  user: string
  port?: number
  remoteDir: string
  sshKey: string          // plaintext private key — decrypted by server before dispatch
  cleanupRemote?: boolean
}

// ── Messages ──────────────────────────────────────────────────────────────

export type AgentMessage =
  | { type: 'hello'; token: string; hostname: string; ip: string; osInfo: OsInfo; agentVersion: string; platform: 'linux' | 'windows'; protocolVersion: string; resticVersion?: string; capabilities?: string[]; bundleHash?: string }
  | { type: 'ping' }
  | { type: 'metrics'; metrics: AgentMetrics }
  | { type: 'backup_start'; jobId: string; config: BackupJobConfig }
  | { type: 'backup_heartbeat'; jobId: string; runId: string; phase: 'starting' | 'scanning' | 'uploading' | 'finalizing' | 'quiescing' | 'resuming' | 'restoring'; lastResticEventAt: number }
  | { type: 'backup_progress'; jobId: string; pct: number; filesProcessed: number; bytesProcessed: number; filesTotal: number; bytesTotal: number; secondsRemaining?: number }
  | { type: 'backup_complete'; jobId: string; snapshotId: string; snapshotIds?: string[]; stats: BackupStats; log?: string }
  | { type: 'backup_failed'; jobId: string; error: string; detail: string; log?: string }
  | { type: 'backup_cancelled'; jobId: string; runId: string; reason: 'user_requested' | 'not_running' | 'agent_disconnect' }
  | { type: 'restore_start'; restoreId: string; specId: string }
  | { type: 'restore_progress'; restoreId: string; step: string; status: string }
  | { type: 'restore_complete'; restoreId: string; success: boolean }
  | { type: 'verification_progress'; verificationRunId: string; step: string }
  | { type: 'verification_complete'; verificationRunId: string; success: boolean; log: string; errorMessage?: string }
  | { type: 'resources_result'; requestId: string; resources: DetectedResources }
  | { type: 'test_repo_result'; requestId: string; ok: boolean; error?: string; snapshotCount?: number }
  | { type: 'init_repository_result'; requestId: string; ok: boolean; error?: string }
  | { type: 'test_mount_result'; requestId: string; ok: boolean; error?: string }
  | { type: 'compose_project_listing'; requestId: string; project: ComposeProjectListing }
  | { type: 'mount_complete'; requestId: string; repoId: string }
  | { type: 'mount_failed'; requestId: string; repoId: string; error: string }
  | { type: 'filesystem_restore_started'; requestId: string; restoreId: string }
  | { type: 'filesystem_restore_complete'; restoreId: string; success: boolean; filesRestored?: number; durationSec?: number; error?: string; targetPath?: string; sourcePath?: string }
  | { type: 'filesystem_restore_cancelled'; restoreId: string; reason: 'user_requested' | 'not_running' }
  | { type: 'database_restore_started'; requestId: string; restoreId: string }
  | { type: 'database_restore_complete'; restoreId: string; success: boolean; output?: string; error?: string; durationSec?: number }

export interface DetectedResources {
  dockerVolumes?: string[]
  mountPoints?:   string[]
  databases?:     Array<{ type: string; host: string; port: number }>
}

export type ServerMessage =
  | { type: 'welcome'; agentId: string; serverVersion: string; bundleHash?: string }
  | { type: 'pong' }
  | { type: 'run_backup'; jobId: string; runId: string; config: BackupJobConfig; bandwidthLimitKbps?: number | null }
  | { type: 'run_restore'; restoreId: string; specYaml: string; snapshotId: string; bandwidthLimitKbps?: number | null }
  | { type: 'cancel_backup'; jobId: string; runId: string }
  | { type: 'verify_repo'; repoId: string; repoUrl: string; repoPassword: string; readData: boolean; envVars?: Record<string, string> }
  | { type: 'list_resources'; requestId: string }
  | { type: 'test_repo'; requestId: string; repoUrl: string; repoPassword: string; envVars?: Record<string, string> }
  | { type: 'init_repository'; requestId: string; repoUrl: string; repoPassword: string; envVars?: Record<string, string> }
  | { type: 'test_mount'; requestId: string; mountConfig: MountConfig }
  | { type: 'force_update' }
  | { type: 'list_compose_project'; requestId: string; projectName: string }
  | { type: 'run_compose_backup'; jobId: string; runId: string; config: ComposeProjectConfig; repoId: string; repoUrl: string; repoPassword: string; envVars?: Record<string, string>; bandwidthLimitKbps?: number | null }
  | { type: 'run_compose_restore'; jobId: string; runId: string; repoId: string; config: ComposeRestoreConfig; repoUrl: string; repoPassword: string; envVars?: Record<string, string> }
  | { type: 'mount_repository'; requestId: string; repoId: string; nfsServer: string; nfsExport: string; nfsOptions: string }
  | { type: 'run_verification'; verificationRunId: string; repoId: string; snapshotId: string; repoUrl: string; repoPassword: string; envVars?: Record<string, string>; targetType: 'temp_directory' | 'docker_volume' | 'ssh_target' | 'proxmox_vm_clone'; targetConfig?: SshVerificationTargetConfig; validationHook?: string | null }
  | { type: 'run_filesystem_restore'; requestId: string; restoreId: string; repoUrl: string; repoPassword: string; envVars?: Record<string, string>; snapshotId: string; targetPath: string; sourcePath: string; targetIsAgentLocal: boolean }
  | { type: 'cancel_filesystem_restore'; restoreId: string }
  | { type: 'run_database_restore'; requestId: string; restoreId: string; app: 'postgres' | 'mysql' | 'mariadb' | 'sqlite'; dumpFilePath: string; targetContainer?: string; targetDatabase?: string; targetUsername?: string; targetHost?: string; targetPort?: number; passwordEnv?: string; targetDbPath?: string }
