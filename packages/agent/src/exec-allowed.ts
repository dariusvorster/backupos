import { spawn } from 'child_process'
import type { Readable } from 'stream'

export const ALLOWED_COMMANDS = new Set([
  'restic',
  'pg_dump',
  'pg_restore',
  'psql',
  'mysqldump',
  'mysql',
  'redis-cli',
  'sqlite3',
  'docker',
  'cp',
])

export interface SpawnAllowedOpts {
  env?: NodeJS.ProcessEnv
  stdin?: Readable
}

export function spawnAllowed(
  cmd: string,
  args: string[],
  opts: SpawnAllowedOpts = {},
): Promise<{ stdout: string; stderr: string }> {
  if (!ALLOWED_COMMANDS.has(cmd)) {
    return Promise.reject(new Error(`exec-allowed: "${cmd}" is not permitted`))
  }
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: [opts.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      env: opts.env ?? process.env,
    })
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('error', err => reject(err))
    proc.on('close', code => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${cmd} exited with code ${code}${stderr ? ': ' + stderr.trim() : ''}`))
    })

    if (opts.stdin && proc.stdin) {
      opts.stdin.on('error', err => {
        proc.stdin?.destroy(err)
        reject(err)
      })
      opts.stdin.pipe(proc.stdin)
    }
  })
}
