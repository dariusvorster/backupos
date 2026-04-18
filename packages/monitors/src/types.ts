export interface MonitorSyncResult {
  status: 'healthy' | 'warning' | 'error'
  lastBackupAt?: Date
  lastBackupStatus?: string
  sizeBytes?: number
  jobCount?: number
  details: Record<string, unknown>
}

export interface BackupMonitorAdapter {
  readonly type: string
  readonly displayName: string

  test(config: MonitorConfig): Promise<{ ok: boolean; message?: string }>
  sync(config: MonitorConfig): Promise<MonitorSyncResult>
}

// Each monitor type stores a JSON blob in the DB.
// These are the typed shapes for that blob.

export interface PBSConfig {
  url: string          // https://pbs.local:8007
  tokenId: string      // user@pbs!token
  tokenSecret: string
  datastore: string    // datastore name to monitor
  node?: string        // PBS node name (default: first node)
  verifySsl?: boolean
}

export interface BorgConfig {
  repoPath: string     // /path/to/repo or user@host:repo
  passphrase?: string
  sshKey?: string      // path to SSH private key
  sshUser?: string
  sshHost?: string
}

export interface DuplicatiConfig {
  url: string          // http://localhost:8200
  password?: string
}

export interface VeeamConfig {
  url: string          // https://veeam-server:9419
  username: string
  password: string
  verifySsl?: boolean
}

export interface ResticRepoConfig {
  repositoryUrl: string
  password: string
  envVars?: Record<string, string>
  binaryPath?: string
}

// Union — the actual stored config is one of these
export type MonitorConfig =
  | PBSConfig
  | BorgConfig
  | DuplicatiConfig
  | VeeamConfig
  | ResticRepoConfig

// PBS raw API shapes

export interface PBSDatastore {
  store: string
  total: number
  used: number
  avail: number
}

export interface PBSSnapshot {
  'backup-id': string
  'backup-time': number
  'backup-type': string
  size?: number
}

export interface PBSTask {
  upid: string
  starttime: number
  status?: string
  type: string
}

// Borg raw JSON shapes

export interface BorgArchive {
  name: string
  start: string
  end: string
  id: string
}

export interface BorgListJson {
  archives: BorgArchive[]
}

export interface BorgInfoStats {
  original_size: number
  compressed_size: number
  deduplicated_size: number
  nfiles: number
}

export interface BorgInfoJson {
  cache: {
    stats: BorgInfoStats
  }
}
