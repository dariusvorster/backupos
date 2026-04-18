import { spawn } from 'node:child_process'

const ALLOWED_COMMANDS = ['restic', 'powershell', 'sc'] as const
type AllowedCommand = (typeof ALLOWED_COMMANDS)[number]

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

function isAllowed(cmd: string): cmd is AllowedCommand {
  return (ALLOWED_COMMANDS as readonly string[]).includes(cmd)
}

export function execAllowed(
  cmd: string,
  args: string[],
  env?: Record<string, string>,
): Promise<ExecResult> {
  if (!isAllowed(cmd)) {
    return Promise.reject(new Error(`Command not in allowlist: ${cmd}`))
  }
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: 'pipe',
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('close', code => resolve({ exitCode: code ?? 1, stdout, stderr }))
    child.on('error', reject)
  })
}
