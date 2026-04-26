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
    ...(password ? [`-p${password}`] : []),
    '--single-transaction',
    '--routines',
    '--triggers',
    '--result-file', dest,
    cfg.database ?? '',
  ].filter(Boolean) as string[]
  await spawnAllowed('mysqldump', args)
}

// ── Redis ─────────────────────────────────────────────────────────────────────

async function getRedisLastSave(cfg: ComposeApphookConfig): Promise<number> {
  const password = cfg.passwordEnv ? process.env[cfg.passwordEnv] : undefined
  const args = [
    '-h', cfg.host ?? 'localhost',
    '-p', String(cfg.port ?? 6379),
    ...(password ? ['-a', password, '--no-auth-warning'] : []),
    'LASTSAVE',
  ]
  const { stdout } = await spawnAllowed('redis-cli', args)
  return parseInt(stdout.trim(), 10) || 0
}

async function dumpRedis(cfg: ComposeApphookConfig, container: DockerContainer, dest: string): Promise<void> {
  const password = cfg.passwordEnv ? process.env[cfg.passwordEnv] : undefined
  const connArgs = [
    '-h', cfg.host ?? 'localhost',
    '-p', String(cfg.port ?? 6379),
    ...(password ? ['-a', password, '--no-auth-warning'] : []),
  ]

  const initialLastSave = await getRedisLastSave(cfg)

  await spawnAllowed('redis-cli', [...connArgs, 'BGSAVE'])

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

// ── Env-file redaction ────────────────────────────────────────────────────────

const SECRET_PATTERN = /(?:^|_)(?:PASSWORD|PASSWD|PWD|SECRET|TOKEN|KEY|APIKEY|CREDENTIAL|CREDS|CERT)(?:$|_)/

function isSecretKey(key: string): boolean {
  const k = key.toUpperCase()
  return SECRET_PATTERN.test(k) || /API_?KEY/.test(k) || /ACCESS_KEY/.test(k) || /PRIVATE_KEY/.test(k)
}

export function redactEnvFile(content: string): string {
  return content
    .split('\n')
    .map(line => {
      const eq = line.indexOf('=')
      if (eq === -1) return line
      const key = line.slice(0, eq).trim()
      return isSecretKey(key) ? `${key}=[REDACTED]` : line
    })
    .join('\n')
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
    default:
      throw new Error(`apphook: unknown type "${String(service.apphookType)}"`)
  }
}
