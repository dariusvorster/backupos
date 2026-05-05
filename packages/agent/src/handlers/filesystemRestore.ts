import { ResticEngine } from '@backupos/engine'
import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'
import { resolveHostPrefix, applyHostPrefix } from '../lib/host-prefix'

type SendFn = (msg: AgentMessage) => void
type RunFilesystemRestoreMsg = Extract<ServerMessage, { type: 'run_filesystem_restore' }>

export interface ActiveRestore {
  ctrl:      AbortController
  cancelled: boolean
}

export async function handleFilesystemRestore(
  msg: RunFilesystemRestoreMsg,
  send: SendFn,
  activeRestores: Map<string, ActiveRestore>,
  binaryPath?: string,
): Promise<void> {
  const { requestId, restoreId, repoUrl, repoPassword, envVars, snapshotId, targetPath, sourcePath } = msg

  const hostPrefix = resolveHostPrefix()
  const prefixedSourcePath = applyHostPrefix(sourcePath, hostPrefix)
  const prefixedTargetPath = msg.targetIsAgentLocal ? targetPath : applyHostPrefix(targetPath, hostPrefix)

  console.log(`[agent] run_filesystem_restore received: restoreId=${restoreId} snapshotId=${snapshotId.slice(0, 8)} sourcePath=${sourcePath}→${prefixedSourcePath} targetPath=${targetPath}→${prefixedTargetPath} targetIsAgentLocal=${msg.targetIsAgentLocal} repoUrl=${repoUrl}`)

  send({ type: 'filesystem_restore_started', requestId, restoreId })

  const ctrl = new AbortController()
  activeRestores.set(restoreId, { ctrl, cancelled: false })

  const startedAt = Date.now()
  try {
    const engine = new ResticEngine({
      repositoryUrl: repoUrl,
      password:      repoPassword,
      envVars:       envVars ?? {},
      binaryPath,
    })
    const shortId = snapshotId.slice(0, 8)
    const result = await engine.restore(shortId, prefixedTargetPath, [prefixedSourcePath], ctrl.signal)
    console.log(`[agent] engine.restore returned: filesRestored=${result.filesRestored} durationMs=${result.durationMs} totalSize=${result.totalSize}`)
    send({
      type:          'filesystem_restore_complete',
      restoreId,
      success:       true,
      filesRestored: result.filesRestored,
      durationSec:   Math.round(result.durationMs / 1000),
      targetPath,
      sourcePath,
    })
  } catch (err) {
    const wasCancelled = activeRestores.get(restoreId)?.cancelled === true
    const error = wasCancelled ? 'cancelled by user' : (err instanceof Error ? err.message : String(err))
    console.error(`[agent] filesystem_restore ${wasCancelled ? 'cancelled' : 'failed'}: restoreId=${restoreId} error=${error}`)
    send({
      type:        'filesystem_restore_complete',
      restoreId,
      success:     false,
      durationSec: (Date.now() - startedAt) / 1000,
      error,
      targetPath,
      sourcePath,
    })
  } finally {
    activeRestores.delete(restoreId)
  }
}
