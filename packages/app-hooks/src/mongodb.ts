import type { AppHook, AppHookConfig, PreHookResult } from './types'

// Stub — implemented in V2
export class MongoDBHook implements AppHook {
  readonly appType = 'mongodb' as const
  readonly displayName = 'MongoDB'

  async pre(_config: AppHookConfig): Promise<PreHookResult> {
    throw new Error('MongoDB hook is not yet implemented (V2)')
  }

  async post(_config: AppHookConfig, _preResult: PreHookResult): Promise<void> {}
}
