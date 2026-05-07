export type RestoreStepType =
  | 'filesystem_restore'
  | 'database_restore'
  | 'shell'
  | 'http_check'
  | 'container_restart'
  | 'notify'
  | 'xcpng_vm_restore'

export type OnFailure = 'abort' | 'continue' | 'notify_only'

// ── Step definitions ──────────────────────────────────────────────────────────

export interface FilesystemRestoreStep {
  name: string
  type: 'filesystem_restore'
  snapshotPath: string
  targetPath: string
  onFailure: OnFailure
}

export interface DatabaseRestoreStep {
  name: string
  type: 'database_restore'
  app: 'postgres' | 'mysql' | 'mariadb' | 'sqlite' | 'redis' | 'mongodb'
  snapshotPath: string
  target: {
    container?: string
    database?: string
    username?: string
    path?: string
  }
  onFailure: OnFailure
}

export interface ShellStep {
  name: string
  type: 'shell'
  command: string
  workingDir?: string
  onFailure: OnFailure
}

export interface HttpCheckStep {
  name: string
  type: 'http_check'
  url: string
  expectedStatus: number
  timeoutSeconds: number
  retryCount: number
  onFailure: OnFailure
}

export interface ContainerRestartStep {
  name: string
  type: 'container_restart'
  container: string
  onFailure: OnFailure
}

export interface NotifyStep {
  name: string
  type: 'notify'
  channel: string
  message?: string
  onFailure: OnFailure
}

export interface XcpngVmRestoreStep {
  name: string
  type: 'xcpng_vm_restore'
  vmUUID: string
  vmName: string
  targetSrUUID: string
  backupJobId: string
  memoryBytes?: number
  vcpus?: number
  onFailure: OnFailure
}

export type RestoreStep =
  | FilesystemRestoreStep
  | DatabaseRestoreStep
  | ShellStep
  | HttpCheckStep
  | ContainerRestartStep
  | NotifyStep
  | XcpngVmRestoreStep

// ── Parsed spec ───────────────────────────────────────────────────────────────

export interface NotificationConfig {
  channel: 'email' | 'webhook' | 'slack'
  to?: string
  url?: string
}

export interface ParsedRestoreSpec {
  name: string
  description?: string
  version: string
  repository: string
  snapshot?: string
  steps: RestoreStep[]
  notifications?: {
    onSuccess?: NotificationConfig[]
    onFailure?: NotificationConfig[]
  }
}

// ── Execution results ─────────────────────────────────────────────────────────

export interface StepResult {
  step: RestoreStep
  success: boolean
  output?: string
  error?: string
  durationMs: number
}

export interface RestoreRunResult {
  success: boolean
  steps: StepResult[]
  failedStep?: string
  abortedAt?: Date
  completedAt?: Date
}
