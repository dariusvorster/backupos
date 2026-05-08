import { spawn } from 'child_process'
import type {
  ContainerRestartStep,
  DatabaseRestoreStep,
  FilesystemRestoreStep,
  HttpCheckStep,
  NotifyStep,
  ParsedRestoreSpec,
  RestoreRunResult,
  RestoreStep,
  ShellStep,
  StepResult,
  XcpngVmRestoreStep,
} from './types'

/**
 * Optional callback to actually deliver notify steps. Receives the channel
 * identifier (free-form string from the spec — typically a channel NAME)
 * plus the message. Should throw on delivery failure.
 *
 * If undefined, notify steps return failure with a clear error.
 */
export type NotifyDelivery = (channel: string, message: string) => Promise<void>

export type DatabaseRestoreDelivery = (
  step: DatabaseRestoreStep,
  snapshotId: string,
  agentId: string,
) => Promise<{ success: boolean; output?: string; error?: string; durationSec?: number }>

export type XcpngVmRestoreDelivery = (
  step: XcpngVmRestoreStep,
  snapshotId: string,
  agentId: string,
) => Promise<{ success: boolean; newVmUUID?: string; error?: string }>

// ── Step executors ────────────────────────────────────────────────────────────

async function execFilesystemRestore(
  step: FilesystemRestoreStep,
  snapshotId: string,
  _agentId: string,
): Promise<Omit<StepResult, 'step' | 'durationMs'>> {
  // Delegate to restic restore on the agent; for now spawn locally
  return new Promise(resolve => {
    const args = ['restore', snapshotId, '--target', step.targetPath, '--path', step.snapshotPath]
    const proc = spawn('restic', args)
    const out: Buffer[] = []
    const err: Buffer[] = []

    proc.stdout.on('data', (c: Buffer) => out.push(c))
    proc.stderr.on('data', (c: Buffer) => err.push(c))

    proc.on('close', code => {
      const output = Buffer.concat(out).toString('utf8').trim()
      const errStr = Buffer.concat(err).toString('utf8').trim()
      if (code === 0) {
        resolve({ success: true, output })
      } else {
        resolve({ success: false, error: errStr || `restic exited ${code}` })
      }
    })

    proc.on('error', err => {
      resolve({ success: false, error: err.message })
    })
  })
}

async function execDatabaseRestore(
  step: DatabaseRestoreStep,
  snapshotId: string,
  agentId: string,
  databaseRestoreDelivery?: DatabaseRestoreDelivery,
): Promise<Omit<StepResult, 'step' | 'durationMs'>> {
  if (step.app === 'sqlite' || step.app === 'redis' || step.app === 'mongodb') {
    return {
      success: false,
      error:   `database_restore for ${step.app} is not yet implemented (only postgres + mysql/mariadb supported in V1)`,
    }
  }

  if (!databaseRestoreDelivery) {
    return {
      success: false,
      error:   `database_restore step requires server-side delivery wiring; no callback provided`,
    }
  }

  try {
    const result = await databaseRestoreDelivery(step, snapshotId, agentId)
    if (!result.success) {
      return { success: false, error: result.error ?? `database_restore for ${step.app} failed` }
    }
    return { success: true, output: result.output ?? `Restored ${step.app}` }
  } catch (err) {
    return {
      success: false,
      error:   err instanceof Error ? err.message : String(err),
    }
  }
}

async function execShell(step: ShellStep): Promise<Omit<StepResult, 'step' | 'durationMs'>> {
  return new Promise(resolve => {
    const [bin, ...args] = step.command.split(' ')
    if (!bin) return resolve({ success: false, error: 'Empty command' })

    const proc = spawn(bin, args, {
      cwd:   step.workingDir,
      stdio: 'pipe',
    })

    const out: Buffer[] = []
    const err: Buffer[] = []

    proc.stdout.on('data', (c: Buffer) => out.push(c))
    proc.stderr.on('data', (c: Buffer) => err.push(c))

    proc.on('close', code => {
      const output = Buffer.concat(out).toString('utf8').trim()
      const errStr = Buffer.concat(err).toString('utf8').trim()
      if (code === 0) {
        resolve({ success: true, output })
      } else {
        resolve({ success: false, output, error: errStr || `process exited ${code}` })
      }
    })

    proc.on('error', err => {
      resolve({ success: false, error: err.message })
    })
  })
}

async function execHttpCheck(step: HttpCheckStep): Promise<Omit<StepResult, 'step' | 'durationMs'>> {
  const { default: https } = await import('https')
  const { default: http }  = await import('http')

  const makeRequest = (attempt: number): Promise<Omit<StepResult, 'step' | 'durationMs'>> =>
    new Promise(resolve => {
      const url   = new URL(step.url)
      const lib   = url.protocol === 'https:' ? https : http
      const timer = setTimeout(() => {
        req.destroy()
        if (attempt < step.retryCount) {
          makeRequest(attempt + 1).then(resolve)
        } else {
          resolve({ success: false, error: `Timed out after ${step.timeoutSeconds}s` })
        }
      }, step.timeoutSeconds * 1000)

      const req = lib.request(step.url, { method: 'GET' }, res => {
        clearTimeout(timer)
        res.resume()
        if (res.statusCode === step.expectedStatus) {
          resolve({ success: true, output: `HTTP ${res.statusCode}` })
        } else if (attempt < step.retryCount) {
          makeRequest(attempt + 1).then(resolve)
        } else {
          resolve({
            success: false,
            error:   `Expected ${step.expectedStatus}, got ${res.statusCode}`,
          })
        }
      })

      req.on('error', err => {
        clearTimeout(timer)
        if (attempt < step.retryCount) {
          makeRequest(attempt + 1).then(resolve)
        } else {
          resolve({ success: false, error: err.message })
        }
      })

      req.end()
    })

  return makeRequest(0)
}

async function execContainerRestart(step: ContainerRestartStep): Promise<Omit<StepResult, 'step' | 'durationMs'>> {
  return new Promise(resolve => {
    const proc = spawn('docker', ['restart', step.container])
    const err: Buffer[] = []

    proc.stderr.on('data', (c: Buffer) => err.push(c))

    proc.on('close', code => {
      if (code === 0) {
        resolve({ success: true, output: `Restarted ${step.container}` })
      } else {
        resolve({ success: false, error: Buffer.concat(err).toString('utf8').trim() || `docker restart exited ${code}` })
      }
    })

    proc.on('error', err => {
      resolve({ success: false, error: err.message })
    })
  })
}

async function execNotify(
  step: NotifyStep,
  notifyDelivery?: NotifyDelivery,
): Promise<Omit<StepResult, 'step' | 'durationMs'>> {
  const message = step.message ?? `Restore step '${step.name}' completed`
  if (!notifyDelivery) {
    return { success: false, output: `Notify step skipped: no delivery callback configured (channel=${step.channel})` }
  }
  try {
    await notifyDelivery(step.channel, message)
    return { success: true, output: `Notification delivered to channel '${step.channel}'` }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return { success: false, output: `Notification delivery failed for channel '${step.channel}': ${errMsg}` }
  }
}

async function execXcpngVmRestore(
  step: XcpngVmRestoreStep,
  snapshotId: string,
  agentId: string,
  xcpngVmRestoreDelivery?: XcpngVmRestoreDelivery,
): Promise<Omit<StepResult, 'step' | 'durationMs'>> {
  if (!xcpngVmRestoreDelivery) {
    return { success: false, error: 'xcpng_vm_restore step requires server-side delivery wiring; no callback provided' }
  }
  try {
    const result = await xcpngVmRestoreDelivery(step, snapshotId, agentId)
    if (!result.success) {
      return { success: false, error: result.error ?? 'xcpng_vm_restore failed' }
    }
    return { success: true, output: result.newVmUUID ? `Restore dispatched — new VM UUID: ${result.newVmUUID}` : 'VM restore dispatched' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Step dispatcher ───────────────────────────────────────────────────────────

async function executeStep(
  step: RestoreStep,
  snapshotId: string,
  agentId: string,
  notifyDelivery?: NotifyDelivery,
  databaseRestoreDelivery?: DatabaseRestoreDelivery,
  xcpngVmRestoreDelivery?: XcpngVmRestoreDelivery,
): Promise<StepResult> {
  const start = Date.now()
  let result: Omit<StepResult, 'step' | 'durationMs'>

  switch (step.type) {
    case 'filesystem_restore':
      result = await execFilesystemRestore(step, snapshotId, agentId)
      break
    case 'database_restore':
      result = await execDatabaseRestore(step, snapshotId, agentId, databaseRestoreDelivery)
      break
    case 'shell':
      result = await execShell(step)
      break
    case 'http_check':
      result = await execHttpCheck(step)
      break
    case 'container_restart':
      result = await execContainerRestart(step)
      break
    case 'notify':
      result = await execNotify(step, notifyDelivery)
      break
    case 'xcpng_vm_restore':
      result = await execXcpngVmRestore(step, snapshotId, agentId, xcpngVmRestoreDelivery)
      break
  }

  return { step, durationMs: Date.now() - start, ...result }
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeRestoreSpec(
  spec: ParsedRestoreSpec,
  snapshotId: string,
  agentId: string,
  notifyDelivery?: NotifyDelivery,
  databaseRestoreDelivery?: DatabaseRestoreDelivery,
  xcpngVmRestoreDelivery?: XcpngVmRestoreDelivery,
): Promise<RestoreRunResult> {
  const results: StepResult[] = []

  for (const step of spec.steps) {
    const stepResult = await executeStep(step, snapshotId, agentId, notifyDelivery, databaseRestoreDelivery, xcpngVmRestoreDelivery)
    results.push(stepResult)

    if (!stepResult.success && step.onFailure === 'abort') {
      return {
        success:    false,
        failedStep: step.name,
        steps:      results,
        abortedAt:  new Date(),
      }
    }
  }

  return {
    success:     results.every(r => r.success || r.step.onFailure !== 'abort'),
    steps:       results,
    completedAt: new Date(),
  }
}
