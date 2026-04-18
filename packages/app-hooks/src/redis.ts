import { join } from 'path'
import Redis from 'ioredis'
import type { AppHook, AppHookConfig, PreHookResult } from './types'
import { sleep } from './util'

export class RedisHook implements AppHook {
  readonly appType = 'redis' as const
  readonly displayName = 'Redis'

  async pre(config: AppHookConfig): Promise<PreHookResult> {
    const redis = new Redis({
      host:     config.host ?? '127.0.0.1',
      port:     config.port ?? 6379,
      password: config.password,
    })

    await redis.bgsave()

    // Poll until the background save finishes
    let saving = true
    while (saving) {
      const info = await redis.info('persistence')
      saving = info.includes('rdb_bgsave_in_progress:1')
      if (saving) await sleep(500)
    }

    const filenameResult = (await redis.config('GET', 'dbfilename')) as string[]
    const dirResult      = (await redis.config('GET', 'dir'))        as string[]
    const dbFilename     = filenameResult[1]
    const dir            = dirResult[1]
    const rdbPath        = join(dir ?? '/var/lib/redis', dbFilename ?? 'dump.rdb')

    await redis.quit()

    return {
      dumpPath: rdbPath,   // include this path in the restic backup
      frozenAt: new Date(),
      metadata: { strategy: 'bgsave', rdbPath },
    }
  }

  // RDB file is Redis's own file — do not delete it
  async post(_config: AppHookConfig, _preResult: PreHookResult): Promise<void> {}
}
