import type { AppHook, AppHookConfig, PreHookResult } from './types'

// Stub — implemented in V2
export class InfluxDBHook implements AppHook {
  readonly appType = 'influxdb' as const
  readonly displayName = 'InfluxDB'

  async pre(_config: AppHookConfig): Promise<PreHookResult> {
    throw new Error('InfluxDB hook is not yet implemented (V2)')
  }

  async post(_config: AppHookConfig, _preResult: PreHookResult): Promise<void> {}
}
