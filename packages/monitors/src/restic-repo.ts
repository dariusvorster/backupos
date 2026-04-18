import type { BackupMonitorAdapter, MonitorConfig, MonitorSyncResult, ResticRepoConfig } from './types'

// Monitors an existing Restic repository not managed by BackupOS
export class ResticRepoMonitor implements BackupMonitorAdapter {
  readonly type = 'restic_repo'
  readonly displayName = 'Restic Repository'

  async test(_config: MonitorConfig): Promise<{ ok: boolean; message?: string }> {
    return { ok: false, message: 'Restic repo monitor not yet implemented (V2)' }
  }

  async sync(_config: MonitorConfig): Promise<MonitorSyncResult> {
    const _cfg = _config as ResticRepoConfig
    throw new Error('Restic repo monitor is not yet implemented (V2)')
  }
}
