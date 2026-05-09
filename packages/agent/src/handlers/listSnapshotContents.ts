import { ResticEngine } from '@backupos/engine'
import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'

type SendFn = (msg: AgentMessage) => void
type RequestMsg = Extract<ServerMessage, { type: 'list_snapshot_contents' }>

export async function handleListSnapshotContents(
  msg: RequestMsg,
  send: SendFn,
): Promise<void> {
  const { requestId, repoUrl, repoPassword, envVars, snapshotId } = msg

  console.log(`[agent] list_snapshot_contents received: snapshotId=${snapshotId} repoUrl=${repoUrl} envVarsKeys=${Object.keys(envVars ?? {}).join(',') || '(none)'}`)

  try {
    console.log(`[agent] list_snapshot_contents: constructing ResticEngine`)
    const engine = new ResticEngine({
      repositoryUrl: repoUrl,
      password:      repoPassword,
      envVars:       envVars ?? {},
    })
    console.log(`[agent] list_snapshot_contents: ResticEngine constructed, calling ls(${snapshotId})`)

    const tStart = Date.now()
    const files = await engine.ls(snapshotId)
    const tEnd = Date.now()
    console.log(`[agent] list_snapshot_contents: ls() returned ${files.length} files in ${tEnd - tStart}ms`)

    const entries = files.map(f => ({
      path:  f.path,
      type:  f.type,
      size:  f.size,
      mtime: f.mtime,
    }))
    console.log(`[agent] list_snapshot_contents: mapped ${entries.length} entries, sending result`)

    send({ type: 'list_snapshot_contents_result', requestId, ok: true, entries })
    console.log(`[agent] list_snapshot_contents: result sent successfully`)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack ?? '(no stack)' : '(no stack)'
    console.error(`[agent] list_snapshot_contents failed: ${error}`)
    console.error(`[agent] stack: ${stack}`)
    send({ type: 'list_snapshot_contents_result', requestId, ok: false, error })
  }
}
