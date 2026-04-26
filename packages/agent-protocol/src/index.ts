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

export type AgentMessage =
  | { type: 'hello'; token: string; hostname: string; ip: string; osInfo: OsInfo; agentVersion: string; platform: 'linux' | 'windows'; protocolVersion: string; resticVersion?: string; capabilities?: string[] }
  | { type: 'ping' }
  | { type: 'metrics'; metrics: AgentMetrics }
  | { type: 'backup_start'; jobId: string; config: BackupJobConfig }
  | { type: 'backup_heartbeat'; jobId: string; runId: string; phase: 'starting' | 'scanning' | 'uploading' | 'finalizing'; lastResticEventAt: number }
  | { type: 'backup_progress'; jobId: string; pct: number; filesProcessed: number; bytesProcessed: number; filesTotal: number; bytesTotal: number; secondsRemaining?: number }
  | { type: 'backup_complete'; jobId: string; snapshotId: string; stats: BackupStats; log?: string }
  | { type: 'backup_failed'; jobId: string; error: string; detail: string; log?: string }
  | { type: 'restore_start'; restoreId: string; specId: string }
  | { type: 'restore_progress'; restoreId: string; step: string; status: string }
  | { type: 'restore_complete'; restoreId: string; success: boolean }
  | { type: 'resources_result'; requestId: string; resources: DetectedResources }
  | { type: 'test_repo_result'; requestId: string; ok: boolean; error?: string; snapshotCount?: number }
  | { type: 'test_mount_result'; requestId: string; ok: boolean; error?: string }

export interface DetectedResources {
  dockerVolumes?: string[]
  mountPoints?:   string[]
  databases?:     Array<{ type: string; host: string; port: number }>
}

export type ServerMessage =
  | { type: 'welcome'; agentId: string; serverVersion: string; bundleHash?: string }
  | { type: 'pong' }
  | { type: 'run_backup'; jobId: string; runId: string; config: BackupJobConfig }
  | { type: 'run_restore'; restoreId: string; specYaml: string; snapshotId: string }
  | { type: 'cancel_backup'; jobId: string }
  | { type: 'verify_repo'; repoId: string; repoUrl: string; repoPassword: string; readData: boolean; envVars?: Record<string, string> }
  | { type: 'list_resources'; requestId: string }
  | { type: 'test_repo'; requestId: string; repoUrl: string; repoPassword: string; envVars?: Record<string, string> }
  | { type: 'test_mount'; requestId: string; mountConfig: MountConfig }
  | { type: 'force_update' }
