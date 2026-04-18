export interface BackupJobConfig {
  repoUrl: string
  repoPassword: string
  paths: string[]
  exclude?: string[]
  tags?: string[]
  useVSS?: boolean
  envVars?: Record<string, string>
}

export interface BackupStats {
  filesNew: number
  filesChanged: number
  filesUnmodified: number
  dataAdded: number
  totalFilesProcessed: number
  totalBytesProcessed: number
  durationSeconds: number
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
  | { type: 'hello'; token: string; hostname: string; ip: string; osInfo: OsInfo; agentVersion: string; platform: 'linux' | 'windows' }
  | { type: 'ping' }
  | { type: 'metrics'; metrics: AgentMetrics }
  | { type: 'backup_start'; jobId: string; config: BackupJobConfig }
  | { type: 'backup_progress'; jobId: string; filesProcessed: number; bytesProcessed: number }
  | { type: 'backup_complete'; jobId: string; snapshotId: string; stats: BackupStats }
  | { type: 'backup_failed'; jobId: string; error: string; detail: string }
  | { type: 'restore_start'; restoreId: string; specId: string }
  | { type: 'restore_progress'; restoreId: string; step: string; status: string }
  | { type: 'restore_complete'; restoreId: string; success: boolean }

export type ServerMessage =
  | { type: 'welcome'; agentId: string; serverVersion: string }
  | { type: 'pong' }
  | { type: 'run_backup'; jobId: string; config: BackupJobConfig }
  | { type: 'run_restore'; restoreId: string; specYaml: string; snapshotId: string }
  | { type: 'cancel_backup'; jobId: string }
  | { type: 'verify_repo'; repoId: string; repoUrl: string; repoPassword: string; readData: boolean; envVars?: Record<string, string> }
