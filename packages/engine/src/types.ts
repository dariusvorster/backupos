export interface ResticConfig {
  repositoryUrl: string
  password: string
  envVars: Record<string, string>  // backend credentials (AWS_*, etc.)
  binaryPath?: string              // defaults to 'restic' in PATH
}

export interface BackupOptions {
  paths: string[]
  tags?: string[]
  exclude?: string[]
  excludeFile?: string
  oneFileSystem?: boolean
  useVSS?: boolean         // Windows: maps to --use-fs-snapshot
  preHook?: () => Promise<void>
  postHook?: () => Promise<void>
}

export interface BackupResult {
  snapshotId: string
  filesNew: number
  filesChanged: number
  filesUnmodified: number
  dataAdded: number   // bytes
  totalSize: number   // bytes
  duration: number    // seconds
}

export interface Snapshot {
  id: string
  time: string
  hostname: string
  paths: string[]
  tags?: string[]
  username?: string
}

export interface CheckResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export interface RetentionPolicy {
  keepLast?: number
  keepDaily?: number
  keepWeekly?: number
  keepMonthly?: number
  keepYearly?: number
  keepTags?: string[]
}

export interface ForgetResult {
  removed: number
  kept: number
}

export interface RestoreResult {
  filesRestored: number
  totalSize: number   // bytes
  duration: number    // seconds
}

export interface RepoStats {
  totalSize: number         // bytes
  totalUncompressedSize: number
  compressionRatio: number
  totalBlobCount: number
  snapshotsCount: number
}

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

// Raw JSON shapes returned by restic --json

export interface ResticBackupJson {
  message_type: 'summary'
  snapshot_id: string
  files_new: number
  files_changed: number
  files_unmodified: number
  data_added: number
  total_bytes_processed: number
  total_duration: number
}

export interface ResticSnapshotJson {
  id: string
  time: string
  hostname: string
  paths: string[]
  tags?: string[]
  username?: string
}

export interface ResticStatsJson {
  total_size: number
  total_uncompressed_size: number
  compression_ratio: number
  total_blob_count: number
  snapshots_count: number
}

export interface ResticForgetJson {
  remove?: Array<{ id: string }>
  keep?: Array<{ id: string }>
}
