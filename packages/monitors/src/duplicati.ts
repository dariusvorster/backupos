import type { BackupMonitorAdapter, MonitorConfig, MonitorSyncResult } from './types'

// Stub — implemented in V2
export class DuplicatiMonitor implements BackupMonitorAdapter {
  readonly type = 'duplicati'
  readonly displayName = 'Duplicati'

  async test(_config: MonitorConfig): Promise<{ ok: boolean; message?: string }> {
    return { ok: false, message: 'Duplicati monitor not yet implemented (V2)' }
  }

  async sync(_config: MonitorConfig): Promise<MonitorSyncResult> {
    throw new Error('Duplicati monitor is not yet implemented (V2)')
  }
}
