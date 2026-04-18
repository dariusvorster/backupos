import type { AppHook, AppHookConfig, PreHookResult } from './types'
import { runAndGzip, removeSilent } from './util'

export class MySQLHook implements AppHook {
  readonly appType = 'mysql' as const
  readonly displayName = 'MySQL / MariaDB'

  async pre(config: AppHookConfig): Promise<PreHookResult> {
    const dumpPath = `/tmp/backupos-mysql-${Date.now()}.sql.gz`

    // --single-transaction ensures InnoDB consistency without a table lock
    const cmd = config.containerName
      ? [
          'docker', 'exec', config.containerName,
          'mysqldump',
          '--single-transaction', '--routines', '--triggers',
          '-u', config.username ?? 'root',
          config.database ?? '--all-databases',
        ]
      : [
          'mysqldump',
          '-h', config.host ?? 'localhost',
          '-P', String(config.port ?? 3306),
          '--single-transaction', '--routines', '--triggers',
          '-u', config.username ?? 'root',
          config.database ?? '--all-databases',
        ]

    await runAndGzip(cmd, dumpPath, {
      MYSQL_PWD: config.password ?? '',
    })

    return {
      dumpPath,
      frozenAt: new Date(),
      metadata: { strategy: 'mysqldump', singleTransaction: true },
    }
  }

  async post(_config: AppHookConfig, preResult: PreHookResult): Promise<void> {
    if (preResult.dumpPath) await removeSilent(preResult.dumpPath)
  }
}
