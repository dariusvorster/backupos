import { execFile } from 'child_process'
import { mkdirSync, rmdirSync } from 'fs'
import { promisify } from 'util'
import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'

const execFileAsync = promisify(execFile)
type TestMountMsg = Extract<ServerMessage, { type: 'test_mount' }>

async function isMountpoint(path: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('cat', ['/proc/self/mountinfo'])
    return stdout.split('\n').some(line => {
      const parts = line.split(' ')
      return parts[4] === path
    })
  } catch {
    return false
  }
}

async function safeUnmount(path: string): Promise<void> {
  if (!(await isMountpoint(path))) return
  try {
    await execFileAsync('umount', [path], { timeout: 10_000 })
  } catch {
    // Last resort — lazy unmount. Orphan mount is acceptable if this also fails.
    try { await execFileAsync('umount', ['-l', path], { timeout: 5_000 }) } catch {}
  }
}

function safeRmdir(path: string): void {
  try { rmdirSync(path) } catch { /* ignore */ }
}

export async function runTestMount(
  msg: TestMountMsg,
  send: (out: AgentMessage) => void,
): Promise<void> {
  const { requestId, mountConfig } = msg
  const scratchPath = `/mnt/backupos/.test-${requestId}`

  try {
    mkdirSync(scratchPath, { recursive: true })

    if (mountConfig.type === 'nfs') {
      const source = `${mountConfig.host}:${mountConfig.remotePath}`
      const opts   = mountConfig.options || 'vers=3,soft,timeo=50'
      await execFileAsync(
        'mount',
        ['-t', 'nfs', '-o', opts, source, scratchPath],
        { timeout: 30_000 },
      )
    } else if (mountConfig.type === 'smb') {
      const source = `//${mountConfig.host}${mountConfig.remotePath}`
      const credParts: string[] = []
      if (mountConfig.username) credParts.push(`username=${mountConfig.username}`)
      if (mountConfig.password) credParts.push(`password=${mountConfig.password}`)
      if (mountConfig.domain)   credParts.push(`domain=${mountConfig.domain}`)
      const baseOpts = mountConfig.options || 'vers=3.0'
      const opts = credParts.length > 0 ? `${baseOpts},${credParts.join(',')}` : baseOpts
      await execFileAsync(
        'mount',
        ['-t', 'cifs', '-o', opts, source, scratchPath],
        { timeout: 30_000 },
      )
    } else {
      throw new Error(`Unsupported mount type: ${(mountConfig as { type: string }).type}`)
    }

    if (!(await isMountpoint(scratchPath))) {
      throw new Error('mount command succeeded but target is not a mountpoint')
    }

    send({ type: 'test_mount_result', requestId, ok: true })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    send({ type: 'test_mount_result', requestId, ok: false, error })
  } finally {
    await safeUnmount(scratchPath)
    safeRmdir(scratchPath)
  }
}
