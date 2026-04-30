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

  send({ type: 'filesystem_restore_started', requestId, restoreId })

  const startedAt = Date.now()
  try {
    const engine = new ResticEngine({
      repositoryUrl: repoUrl,
      password:      repoPassword,
      envVars:       envVars ?? {},
      binaryPath,
    })
    const result = await engine.restore(snapshotId, targetPath, [sourcePath])
    send({
      type:          'filesystem_restore_complete',
      restoreId,
      success:       true,
      filesRestored: result.filesRestored,
      durationSec:   result.duration,
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[agent] filesystem restore failed restoreId=${restoreId}:`, error)
    send({
      type:        'filesystem_restore_complete',
      restoreId,
      success:     false,
      durationSec: (Date.now() - startedAt) / 1000,
      error,
    })
  }
}
