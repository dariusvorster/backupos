import Database from 'better-sqlite3'
import type { AppHook, AppHookConfig, PreHookResult } from './types'
import { removeSilent } from './util'

export class SQLiteHook implements AppHook {
  readonly appType = 'sqlite' as const
  readonly displayName = 'SQLite'

  async pre(config: AppHookConfig): Promise<PreHookResult> {
    const dumpPath = `/tmp/backupos-sqlite-${Date.now()}.db`
    const db = new Database(config.database!)

    // SQLite Online Backup API — consistent copy, safe for concurrent writes
    await db.backup(dumpPath)
    db.close()

    return {
      dumpPath,
      frozenAt: new Date(),
      metadata: { strategy: 'online_backup', originalPath: config.database },
    }
  }

  async post(_config: AppHookConfig, preResult: PreHookResult): Promise<void> {
    if (preResult.dumpPath) await removeSilent(preResult.dumpPath)
  }
}
