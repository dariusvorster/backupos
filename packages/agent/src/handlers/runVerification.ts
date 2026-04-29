import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { spawn } from 'child_process'
import { ResticEngine } from '@backupos/engine'
import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'

type SendFn = (msg: AgentMessage) => void
type RunMsg = Extract<ServerMessage, { type: 'run_verification' }>

function runHook(cmd: string, cwd: string, restoreTarget: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('sh', ['-c', cmd], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, RESTORE_TARGET: restoreTarget },
    })
    let out = ''
    proc.stdout?.on('data', (d: Buffer) => { out += d.toString() })
    proc.stderr?.on('data', (d: Buffer) => { out += d.toString() })
    proc.on('error', err => reject(err))
    proc.on('close', code => {
      if (code === 0) resolve(out)
      else reject(new Error(`validation hook exited with code ${code}${out ? ': ' + out.trim() : ''}`))
    })
  })
}

export async function runVerificationHandler(msg: RunMsg, send: SendFn, binaryPath: string | undefined): Promise<void> {
  const { verificationRunId, snapshotId, repoUrl, repoPassword, envVars, validationHook } = msg
  const tmpDir = path.join(os.tmpdir(), 'backupos-verify', verificationRunId)
  const logLines: string[] = []

  const progress = (step: string): void => {
    logLines.push(step)
    send({ type: 'verification_progress', verificationRunId, step })
  }

  try {
    progress('Creating temp directory')
    await fs.mkdir(tmpDir, { recursive: true })

    progress(`Restoring snapshot ${snapshotId}`)
    const engine = new ResticEngine({
      repositoryUrl: repoUrl,
      password:      repoPassword,
      envVars:       envVars ?? {},
      binaryPath,
    })
    await engine.restore(snapshotId, tmpDir)
    progress('Restore complete')

    if (validationHook) {
      progress(`Running validation hook: ${validationHook}`)
      const hookOut = await runHook(validationHook, tmpDir, tmpDir)
      if (hookOut.trim()) logLines.push(hookOut.trim())
      progress('Validation hook passed')
    }

    send({ type: 'verification_complete', verificationRunId, success: true, log: logLines.join('\n') })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logLines.push(`ERROR: ${errorMessage}`)
    send({ type: 'verification_complete', verificationRunId, success: false, log: logLines.join('\n'), errorMessage })
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
