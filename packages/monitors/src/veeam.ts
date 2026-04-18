import type { BackupMonitorAdapter, MonitorConfig, MonitorSyncResult } from './types'

// Stub — implemented in V2
export class VeeamMonitor implements BackupMonitorAdapter {
  readonly type = 'veeam'
  readonly displayName = 'Veeam'

  async test(_config: MonitorConfig): Promise<{ ok: boolean; message?: string }> {
    return { ok: false, message: 'Veeam monitor not yet implemented (V2)' }
  }

  async sync(_config: MonitorConfig): Promise<MonitorSyncResult> {
    throw new Error('Veeam monitor is not yet implemented (V2)')
  }
}
