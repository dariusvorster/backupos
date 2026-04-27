import { execFile } from 'child_process'
import { mkdirSync } from 'fs'
import { promisify } from 'util'
import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'

const execFileAsync = promisify(execFile)
type MountMsg = Extract<ServerMessage, { type: 'mount_repository' }>

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

export async function runMountRepository(
  msg: MountMsg,
  send: (out: AgentMessage) => void,
): Promise<void> {
  const { requestId, repoId, nfsServer, nfsExport, nfsOptions } = msg
  const target = `/mnt/backupos/${repoId}`

  try {
    if (await isMountpoint(target)) {
      send({ type: 'mount_complete', requestId, repoId })
      return
    }

    mkdirSync(target, { recursive: true })

    const source = `${nfsServer}:${nfsExport}`
    const args = ['-t', 'nfs', '-o', nfsOptions, source, target]
    await execFileAsync('mount', args, { timeout: 30_000 })

    if (!(await isMountpoint(target))) {
      throw new Error('mount command succeeded but target is not a mountpoint')
    }

    send({ type: 'mount_complete', requestId, repoId })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    send({ type: 'mount_failed', requestId, repoId, error })
  }
}
