import { ResticEngine } from '@backupos/engine'
import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'

type SendFn = (msg: AgentMessage) => void
type RequestMsg = Extract<ServerMessage, { type: 'list_snapshot_paths' }>

export async function handleListSnapshotPaths(
  msg: RequestMsg,
  send: SendFn,
): Promise<void> {
  const { requestId, repoUrl, repoPassword, envVars, snapshotId, pattern } = msg

  console.log(`[agent] list_snapshot_paths received: snapshotId=${snapshotId} pattern=${pattern ?? '(none)'}`)

  try {
    const engine = new ResticEngine({
      repositoryUrl: repoUrl,
      password:      repoPassword,
      envVars:       envVars ?? {},
    })

    const files = await engine.ls(snapshotId)

    let paths: string[] = files
      .filter(f => f.type === 'file')
      .map(f => f.path)

    if (pattern && pattern.length > 0) {
      paths = paths.filter(p => p.includes(pattern))
    }

    send({ type: 'list_snapshot_paths_result', requestId, ok: true, paths })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[agent] list_snapshot_paths failed: ${error}`)
    send({ type: 'list_snapshot_paths_result', requestId, ok: false, error })
  }
}
