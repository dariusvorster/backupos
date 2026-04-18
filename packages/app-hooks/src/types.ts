export type AppType =
  | 'postgres'
  | 'mysql'
  | 'mariadb'
  | 'mongodb'
  | 'redis'
  | 'sqlite'
  | 'influxdb'
  | 'custom_shell'

export interface AppHookConfig {
  appType: AppType
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string           // encrypted at rest, decrypted before passing here
  containerName?: string      // if running in Docker/Podman
  customPreScript?: string    // for custom_shell — path to script
  customPostScript?: string
}

export interface PreHookResult {
  dumpPath?: string           // if a dump was created, path to include in backup
  frozenAt?: Date             // when the consistent state was achieved
  metadata: Record<string, unknown>
}

export interface AppHook {
  readonly appType: AppType
  readonly displayName: string

  // Called before restic backup runs
  // Must leave the app in a safe-to-copy state
  pre(config: AppHookConfig): Promise<PreHookResult>

  // Called after restic backup completes (success or failure)
  // Must restore normal operation
  post(config: AppHookConfig, preResult: PreHookResult): Promise<void>
}
