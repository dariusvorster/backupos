import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { spawn } from 'child_process'
import { ResticEngine } from '@backupos/engine'
import { spawnAllowed } from '../exec-allowed'
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
  if (msg.targetType === 'docker_volume') {
    return runVerificationDockerVolume(msg, send, binaryPath)
  }
  if (msg.targetType === 'ssh_target') {
    return runVerificationSshTarget(msg, send, binaryPath)
  }
  return runVerificationTempDirectory(msg, send, binaryPath)
}

async function runVerificationTempDirectory(msg: RunMsg, send: SendFn, binaryPath: string | undefined): Promise<void> {
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

async function runVerificationSshTarget(msg: RunMsg, send: SendFn, binaryPath: string | undefined): Promise<void> {
  const { verificationRunId, snapshotId, repoUrl, repoPassword, envVars, validationHook, targetConfig } = msg
  if (!targetConfig) throw new Error('ssh_target requires targetConfig')
  const { host, user, port = 22, remoteDir, sshKey, cleanupRemote = true } = targetConfig

  const tmpDir  = path.join(os.tmpdir(), 'backupos-verify', verificationRunId)
  const keyFile = path.join(os.tmpdir(), `backupos-ssh-key-${verificationRunId}`)
  const logLines: string[] = []
  let keyWritten = false

  const progress = (step: string): void => {
    logLines.push(step)
    send({ type: 'verification_progress', verificationRunId, step })
  }

  const sshArgs = ['-i', keyFile, '-o', 'StrictHostKeyChecking=no', '-p', String(port)]

  try {
    progress('Writing SSH key')
    await fs.writeFile(keyFile, sshKey, { mode: 0o600 })
    keyWritten = true

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

    progress(`Syncing to ${user}@${host}:${remoteDir}`)
    await spawnAllowed('rsync', [
      '-a',
      '-e', `ssh -i ${keyFile} -o StrictHostKeyChecking=no -p ${port}`,
      `${tmpDir}/`,
      `${user}@${host}:${remoteDir}/`,
    ])
    progress('Sync complete')

    if (validationHook) {
      progress(`Running validation hook on ${host}: ${validationHook}`)
      const result = await spawnAllowed('ssh', [
        ...sshArgs,
        `${user}@${host}`,
        `RESTORE_TARGET=${remoteDir} ${validationHook}`,
      ])
      const out = (result.stdout + result.stderr).trim()
      if (out) logLines.push(out)
      progress('Validation hook passed')
    }

    send({ type: 'verification_complete', verificationRunId, success: true, log: logLines.join('\n') })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logLines.push(`ERROR: ${errorMessage}`)
    send({ type: 'verification_complete', verificationRunId, success: false, log: logLines.join('\n'), errorMessage })
  } finally {
    if (cleanupRemote && keyWritten) {
      try {
        await spawnAllowed('ssh', [...sshArgs, `${user}@${host}`, `rm -rf ${remoteDir}`])
      } catch {
        // best-effort remote cleanup
      }
    }
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    if (keyWritten) {
      await fs.rm(keyFile, { force: true }).catch(() => {})
    }
  }
}

async function runVerificationDockerVolume(msg: RunMsg, send: SendFn, binaryPath: string | undefined): Promise<void> {
  const { verificationRunId, snapshotId, repoUrl, repoPassword, envVars, validationHook } = msg
  const volumeName = `backupos-verify-${verificationRunId}`
  const logLines: string[] = []
  let volumeCreated = false

  const progress = (step: string): void => {
    logLines.push(step)
    send({ type: 'verification_progress', verificationRunId, step })
  }

  try {
    progress(`Creating scratch Docker volume ${volumeName}`)
    await spawnAllowed('docker', ['volume', 'create', volumeName])
    volumeCreated = true

    progress('Resolving volume mount point')
    const mountResult = await spawnAllowed('docker', ['volume', 'inspect', '--format', '{{.Mountpoint}}', volumeName])
    const mountPoint = mountResult.stdout.trim()
    if (!mountPoint) throw new Error(`Could not resolve mount point for volume ${volumeName}`)

    progress(`Restoring snapshot ${snapshotId} into ${mountPoint}`)
    const engine = new ResticEngine({
      repositoryUrl: repoUrl,
      password:      repoPassword,
      envVars:       envVars ?? {},
      binaryPath,
    })
    await engine.restore(snapshotId, mountPoint)
    progress('Restore complete')

    if (validationHook) {
      progress(`Running validation hook: ${validationHook}`)
      const hookOut = await runHook(validationHook, mountPoint, mountPoint)
      if (hookOut.trim()) logLines.push(hookOut.trim())
      progress('Validation hook passed')
    }

    send({ type: 'verification_complete', verificationRunId, success: true, log: logLines.join('\n') })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logLines.push(`ERROR: ${errorMessage}`)
    send({ type: 'verification_complete', verificationRunId, success: false, log: logLines.join('\n'), errorMessage })
  } finally {
    if (volumeCreated) {
      try {
        await spawnAllowed('docker', ['volume', 'rm', '-f', volumeName])
      } catch (err) {
        console.warn(`[agent] failed to remove scratch volume ${volumeName}:`, err instanceof Error ? err.message : err)
      }
    }
  }
}
