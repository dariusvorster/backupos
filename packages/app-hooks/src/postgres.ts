import type { AppHook, AppHookConfig, PreHookResult } from './types'
import { runAndGzip, removeSilent } from './util'

export class PostgresHook implements AppHook {
  readonly appType = 'postgres' as const
  readonly displayName = 'PostgreSQL'

  async pre(config: AppHookConfig): Promise<PreHookResult> {
    const dumpPath = `/tmp/backupos-pg-${Date.now()}.sql.gz`

    const cmd = config.containerName
      ? [
          'docker', 'exec', config.containerName,
          'pg_dump',
          '-U', config.username ?? 'postgres',
          '-d', config.database ?? 'postgres',
          '--no-owner', '--no-acl',
          '-F', 'c',
        ]
      : [
          'pg_dump',
          '-h', config.host ?? 'localhost',
          '-p', String(config.port ?? 5432),
          '-U', config.username ?? 'postgres',
          '-d', config.database ?? 'postgres',
          '--no-owner', '--no-acl',
          '-F', 'c',
        ]

    await runAndGzip(cmd, dumpPath, {
      PGPASSWORD: config.password ?? '',
    })

    return {
      dumpPath,
      frozenAt: new Date(),
      metadata: { strategy: 'pg_dump', format: 'custom', compressed: true },
    }
  }

  async post(_config: AppHookConfig, preResult: PreHookResult): Promise<void> {
    if (preResult.dumpPath) await removeSilent(preResult.dumpPath)
  }
}
