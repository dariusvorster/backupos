import { spawnAllowed } from '../exec-allowed'
import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'
import { resolveHostPrefix, applyHostPrefix } from '../lib/host-prefix'

type SendFn = (msg: AgentMessage) => void
type RunDatabaseRestoreMsg = Extract<ServerMessage, { type: 'run_database_restore' }>

export async function handleDatabaseRestore(
  msg: RunDatabaseRestoreMsg,
  send: SendFn,
): Promise<void> {
  const { requestId, restoreId, app, dumpFilePath, targetDatabase, targetUsername, targetHost, targetPort, passwordEnv } = msg

  console.log(`[agent] run_database_restore received: restoreId=${restoreId} app=${app} dumpFile=${dumpFilePath}`)

  send({ type: 'database_restore_started', requestId, restoreId })

  const startedAt = Date.now()
  const hostPrefix = resolveHostPrefix()
  const resolvedDumpPath = applyHostPrefix(dumpFilePath, hostPrefix)

  try {
    const password = passwordEnv ? process.env[passwordEnv] : undefined

    if (app === 'postgres') {
      await runPostgresRestore({ dumpPath: resolvedDumpPath, host: targetHost, port: targetPort, database: targetDatabase, username: targetUsername, password })
    } else if (app === 'mysql' || app === 'mariadb') {
      await runMysqlRestore({ dumpPath: resolvedDumpPath, host: targetHost, port: targetPort, database: targetDatabase, username: targetUsername, password })
    } else {
      throw new Error(`Unsupported database app: ${app}`)
    }

    const duration = (Date.now() - startedAt) / 1000
    send({
      type:        'database_restore_complete',
      restoreId,
      success:     true,
      durationSec: duration,
      output:      `Restored ${app} from ${dumpFilePath}`,
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[agent] database_restore failed: restoreId=${restoreId} error=${error}`)
    send({
      type:        'database_restore_complete',
      restoreId,
      success:     false,
      error,
      durationSec: (Date.now() - startedAt) / 1000,
    })
  }
}

interface PgArgs {
  dumpPath: string
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
}

async function runPostgresRestore(opts: PgArgs): Promise<void> {
  const { dumpPath, host, port, database, username, password } = opts
  if (!database) throw new Error('postgres restore: target.database is required')

  const isCustomFormat = /\.(dump|custom|pgdump)$/i.test(dumpPath)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(password ? { PGPASSWORD: password } : {}),
  }

  if (isCustomFormat) {
    const args: string[] = [
      ...(host     ? ['-h', host]         : []),
      ...(port     ? ['-p', String(port)] : []),
      ...(username ? ['-U', username]     : []),
      '-d', database,
      '--clean', '--if-exists',
      dumpPath,
    ]
    await spawnAllowed('pg_restore', args, { env })
  } else {
    const args: string[] = [
      ...(host     ? ['-h', host]         : []),
      ...(port     ? ['-p', String(port)] : []),
      ...(username ? ['-U', username]     : []),
      '-d', database,
      '-f', dumpPath,
    ]
    await spawnAllowed('psql', args, { env })
  }
}

interface MysqlArgs {
  dumpPath: string
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
}

async function runMysqlRestore(opts: MysqlArgs): Promise<void> {
  const { dumpPath, host, port, database, username, password } = opts
  if (!database) throw new Error('mysql restore: target.database is required')

  const args: string[] = [
    ...(host     ? ['-h', host]         : []),
    ...(port     ? ['-P', String(port)] : []),
    ...(username ? ['-u', username]     : []),
    database,
    '-e', `source ${dumpPath}`,
  ]
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(password ? { MYSQL_PWD: password } : {}),
  }
  await spawnAllowed('mysql', args, { env })
}
