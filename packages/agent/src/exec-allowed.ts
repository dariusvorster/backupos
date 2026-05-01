import { spawn } from 'child_process'

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
  'rsync',
  'ssh',
])

export function spawnAllowed(
  cmd: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; stderr: string }> {
  if (!ALLOWED_COMMANDS.has(cmd)) {
    return Promise.reject(new Error(`exec-allowed: "${cmd}" is not permitted`))
  }
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
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
  })
}
