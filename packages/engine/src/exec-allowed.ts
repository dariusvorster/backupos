import { spawn as nodeSpawn, type SpawnOptions, type ChildProcess } from 'node:child_process'

const ALLOWED_COMMANDS = new Set(['restic', 'systemctl', 'df', 'hostname', 'uname'])

function isAbsolutePathOfAllowed(command: string): boolean {
  for (const allowed of ALLOWED_COMMANDS) {
    if (command.endsWith(`/${allowed}`)) return true
  }
  return false
}

export function spawnAllowed(
  command: string,
  args: readonly string[],
  options?: SpawnOptions,
): ChildProcess {
  if (!ALLOWED_COMMANDS.has(command) && !isAbsolutePathOfAllowed(command)) {
    throw new Error(`[exec-allowed] command "${command}" is not in the allowlist`)
  }
  return nodeSpawn(command, args as string[], options ?? {})
}
