import { ResticEngine } from '@backupos/engine'
import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'

type SendFn = (msg: AgentMessage) => void
type RunFilesystemRestoreMsg = Extract<ServerMessage, { type: 'run_filesystem_restore' }>

export async function handleFilesystemRestore(
  msg: RunFilesystemRestoreMsg,
  send: SendFn,
  binaryPath?: string,
): Promise<void> {
  const { requestId, restoreId, repoUrl, repoPassword, envVars, snapshotId, targetPath, sourcePath } = msg

  console.log(`[agent] run_filesystem_restore received: restoreId=${restoreId} snapshotId=${snapshotId.slice(0, 8)} sourcePath=${sourcePath} targetPath=${targetPath} repoUrl=${repoUrl}`)

  send({ type: 'filesystem_restore_started', requestId, restoreId })

  const startedAt = Date.now()
  try {
    const engine = new ResticEngine({
      repositoryUrl: repoUrl,
      password:      repoPassword,
      envVars:       envVars ?? {},
      binaryPath,
    })
    const shortId = snapshotId.slice(0, 8)
    const result = await engine.restore(shortId, targetPath, [sourcePath])
    console.log(`[agent] engine.restore returned: filesRestored=${result.filesRestored} duration=${result.duration} totalSize=${result.totalSize}`)
    send({
      type:          'filesystem_restore_complete',
      restoreId,
      success:       true,
      filesRestored: result.filesRestored,
      durationSec:   result.duration,
      targetPath,
      sourcePath,
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[agent] filesystem_restore failed: restoreId=${restoreId} error=${error}`)
    send({
      type:        'filesystem_restore_complete',
      restoreId,
      success:     false,
      durationSec: (Date.now() - startedAt) / 1000,
      error,
      targetPath,
      sourcePath,
    })
  }
}
