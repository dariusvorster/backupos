// This module is the live agent-side implementation of compose service apphook
// quiescence (postgres, mysql, redis, sqlite). It is invoked by composeBackup
// when ComposeServiceConfig.quiescence === 'apphook'.
//
// Note: an earlier @backupos/app-hooks package exists/existed in the workspace
// but was never wired in; this module is the canonical implementation.

import { spawnAllowed } from '../exec-allowed'
import type { ComposeApphookConfig, ComposeServiceConfig } from '@backupos/agent-protocol'
import type { DockerContainer } from '../docker-client'

// ── Postgres ──────────────────────────────────────────────────────────────────

async function dumpPostgres(cfg: ComposeApphookConfig, dest: string): Promise<void> {
  const password = cfg.passwordEnv ? process.env[cfg.passwordEnv] : undefined
  if (!password && cfg.passwordEnv) {
    throw new Error(`apphook postgres: env var "${cfg.passwordEnv}" is not set in agent environment`)
  }
  const args = [
    '-h', cfg.host ?? 'localhost',
    '-p', String(cfg.port ?? 5432),
    '-U', cfg.username ?? 'postgres',
    '-d', cfg.database ?? cfg.username ?? 'postgres',
    '--format=custom',
    '--file', dest,
  ]
  const env = { ...process.env, PGPASSWORD: password ?? '' }
  await spawnAllowed('pg_dump', args, { env })
}

// ── MySQL ─────────────────────────────────────────────────────────────────────

async function dumpMysql(cfg: ComposeApphookConfig, dest: string): Promise<void> {
  const password = cfg.passwordEnv ? process.env[cfg.passwordEnv] : undefined
  if (!password && cfg.passwordEnv) {
    throw new Error(`apphook mysql: env var "${cfg.passwordEnv}" is not set in agent environment`)
  }
  const args: string[] = [
    `-h${cfg.host ?? 'localhost'}`,
    `-P${String(cfg.port ?? 3306)}`,
    `-u${cfg.username ?? 'root'}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    '--result-file', dest,
    cfg.database ?? '',
  ].filter(Boolean) as string[]
  // MYSQL_PWD keeps the password out of the process arg list (visible via ps)
  const env = { ...process.env, ...(password ? { MYSQL_PWD: password } : {}) }
  await spawnAllowed('mysqldump', args, { env })
}

// ── Redis ─────────────────────────────────────────────────────────────────────

function redisEnv(cfg: ComposeApphookConfig): NodeJS.ProcessEnv {
  const password = cfg.passwordEnv ? process.env[cfg.passwordEnv] : undefined
  // REDISCLI_AUTH keeps the password out of the process arg list (visible via ps)
  return { ...process.env, ...(password ? { REDISCLI_AUTH: password } : {}) }
}

async function getRedisLastSave(cfg: ComposeApphookConfig): Promise<number> {
  const args = [
    '-h', cfg.host ?? 'localhost',
    '-p', String(cfg.port ?? 6379),
    'LASTSAVE',
  ]
  const { stdout } = await spawnAllowed('redis-cli', args, { env: redisEnv(cfg) })
  return parseInt(stdout.trim(), 10) || 0
}

async function dumpRedis(cfg: ComposeApphookConfig, container: DockerContainer, dest: string): Promise<void> {
  const env = redisEnv(cfg)
  const connArgs = [
    '-h', cfg.host ?? 'localhost',
    '-p', String(cfg.port ?? 6379),
  ]

  const initialLastSave = await getRedisLastSave(cfg)

  await spawnAllowed('redis-cli', [...connArgs, 'BGSAVE'], { env })

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1_000))
    const current = await getRedisLastSave(cfg)
    if (current > initialLastSave) {
      await spawnAllowed('docker', ['cp', `${container.Id}:/data/dump.rdb`, dest])
      return
    }
  }
  throw new Error('apphook redis: BGSAVE did not complete within 60s')
}

// ── SQLite ────────────────────────────────────────────────────────────────────

async function dumpSqlite(cfg: ComposeApphookConfig, container: DockerContainer, dest: string): Promise<void> {
  if (!cfg.dbPath) throw new Error('apphook sqlite: dbPath is required')
  const insidePath = `/tmp/backupos-sqlite-${Date.now()}.db`
  // sqlite3 dot-command: .backup DEST — performs online backup without locks
  await spawnAllowed('docker', ['exec', container.Id, 'sqlite3', cfg.dbPath, `.backup ${insidePath}`])
  await spawnAllowed('docker', ['cp', `${container.Id}:${insidePath}`, dest])
  // best-effort cleanup inside the container
  await spawnAllowed('docker', ['exec', container.Id, 'rm', '-f', insidePath]).catch(() => { /* ignore */ })
}

// ── MongoDB ───────────────────────────────────────────────────────────────────

async function dumpMongodb(cfg: ComposeApphookConfig, container: DockerContainer, dest: string): Promise<void> {
  const insidePath = `/tmp/backupos-mongodb-${Date.now()}.archive.gz`

  const dumpArgs: string[] = ['exec', container.Id, 'mongodump', `--archive=${insidePath}`, '--gzip']
  if (cfg.username) {
    dumpArgs.push('--username', cfg.username)
  }
  if (cfg.passwordEnv) {
    const password = process.env[cfg.passwordEnv]
    if (password) dumpArgs.push('--password', password)
  }
  if (cfg.username || cfg.passwordEnv) {
    dumpArgs.push('--authenticationDatabase', cfg.authDatabase ?? 'admin')
  }
  if (cfg.database) {
    dumpArgs.push('--db', cfg.database)
  }

  await spawnAllowed('docker', dumpArgs)
  await spawnAllowed('docker', ['cp', `${container.Id}:${insidePath}`, dest])
  await spawnAllowed('docker', ['exec', container.Id, 'rm', '-f', insidePath]).catch(() => { /* ignore */ })
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runApphook(
  service: ComposeServiceConfig,
  container: DockerContainer,
  dest: string,
): Promise<void> {
  const cfg = service.apphookConfig
  if (!cfg) throw new Error(`apphook: no config for service "${service.serviceName}"`)

  switch (service.apphookType) {
    case 'postgres': return dumpPostgres(cfg, dest)
    case 'mysql':    return dumpMysql(cfg, dest)
    case 'redis':    return dumpRedis(cfg, container, dest)
    case 'sqlite':   return dumpSqlite(cfg, container, dest)
    case 'mongodb':  return dumpMongodb(cfg, container, dest)
    default:
      throw new Error(`apphook: unknown type "${String(service.apphookType)}"`)
  }
}
