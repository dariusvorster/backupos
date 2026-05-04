import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'
import { ResticEngine, ResticError } from '@backupos/engine'

type TestRepoMsg = Extract<ServerMessage, { type: 'test_repo' }>

export async function runTestRepo(
  msg: TestRepoMsg,
  send: (out: AgentMessage) => void,
  binaryPath: string | undefined,
): Promise<void> {
  const { requestId, repoUrl, repoPassword, envVars } = msg

  try {
    const engine = new ResticEngine({
      repositoryUrl: repoUrl,
      password:      repoPassword,
      envVars:       envVars ?? {},
      binaryPath,
    })
    const snapshots = await engine.snapshots()
    send({ type: 'test_repo_result', requestId, ok: true, snapshotCount: snapshots.length })
  } catch (err) {
    const error = err instanceof ResticError
      ? err.message
      : err instanceof Error ? err.message : String(err)
    send({ type: 'test_repo_result', requestId, ok: false, error })
  }
}
