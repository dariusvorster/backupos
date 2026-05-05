import { execFile } from 'child_process'
import { promisify } from 'util'
import { readdirSync } from 'fs'
import * as http from 'http'
import type { Capability } from '@backupos/agent-protocol'

const execFileAsync = promisify(execFile)

async function binaryExists(name: string): Promise<boolean> {
  try {
    await execFileAsync(name, ['--version'], { timeout: 2_000 })
    return true
  } catch {
    return false
  }
}

function dockerRequest(dockerHost: string, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout')), 5_000)
    const done = () => clearTimeout(timeout)

    const handler = (res: http.IncomingMessage) => {
      res.resume()
      res.on('end', () => { done(); resolve() })
    }

    if (dockerHost.startsWith('unix://')) {
      const req = http.request(
        { socketPath: dockerHost.slice('unix://'.length), path, method: 'GET' },
        handler,
      )
      req.on('error', e => { done(); reject(e) })
      req.end()
    } else if (dockerHost.startsWith('tcp://')) {
      const u = new URL(dockerHost)
      const req = http.request(
        { host: u.hostname, port: parseInt(u.port || '2375'), path, method: 'GET' },
        handler,
      )
      req.on('error', e => { done(); reject(e) })
      req.end()
    } else {
      done()
      reject(new Error(`Unsupported DOCKER_HOST: ${dockerHost}`))
    }
  })
}

async function canReachDocker(): Promise<boolean> {
  const dockerHost = process.env['DOCKER_HOST'] ?? 'unix:///var/run/docker.sock'
  try {
    await dockerRequest(dockerHost, '/v1.41/_ping')
    return true
  } catch {
    return false
  }
}

function canReadFilesystem(): boolean {
  try { readdirSync('/'); return true } catch { return false }
}

export async function detectCapabilities(): Promise<Capability[]> {
  const caps: Capability[] = []

  if (canReadFilesystem()) caps.push('filesystem')

  const dockerOk = await canReachDocker()
  if (dockerOk) caps.push('docker')

  if (process.platform === 'win32') caps.push('vss')

  // Postgres / MySQL: runApphook calls pg_dump/mysqldump host-side over TCP.
  // Host binary is required.
  if (await binaryExists('pg_dump'))   caps.push('apphook:postgres')
  if (await binaryExists('mysqldump')) caps.push('apphook:mysql')

  // Redis hook calls redis-cli BGSAVE then docker cp's the dump.rdb out.
  // Requires both redis-cli (host binary) AND docker.
  if ((await binaryExists('redis-cli')) && dockerOk) caps.push('apphook:redis')

  // SQLite hook runs sqlite3 inside the container via docker exec, then docker cp's
  // the result out. Requires docker only.
  if (dockerOk) caps.push('apphook:sqlite')

  return caps
}
