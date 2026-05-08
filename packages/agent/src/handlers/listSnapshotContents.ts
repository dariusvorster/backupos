import { ResticEngine } from '@backupos/engine'
import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'

type SendFn = (msg: AgentMessage) => void
type RequestMsg = Extract<ServerMessage, { type: 'list_snapshot_contents' }>

export async function handleListSnapshotContents(
  msg: RequestMsg,
  send: SendFn,
): Promise<void> {
  const { requestId, repoUrl, repoPassword, envVars, snapshotId } = msg

  console.log(`[agent] list_snapshot_contents received: snapshotId=${snapshotId}`)

  try {
    const engine = new ResticEngine({
      repositoryUrl: repoUrl,
      password:      repoPassword,
      envVars:       envVars ?? {},
    })

    const files = await engine.ls(snapshotId)

    const entries = files.map(f => ({
      path:  f.path,
      type:  f.type,
      size:  f.size,
      mtime: f.mtime,
    }))

    send({ type: 'list_snapshot_contents_result', requestId, ok: true, entries })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[agent] list_snapshot_contents failed: ${error}`)
    send({ type: 'list_snapshot_contents_result', requestId, ok: false, error })
  }
}
