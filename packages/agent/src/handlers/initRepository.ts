import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'
import { ResticEngine, ResticError } from '@backupos/engine'

type InitRepoMsg = Extract<ServerMessage, { type: 'init_repository' }>

export async function runInitRepository(
  msg: InitRepoMsg,
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
    await engine.init()
    send({ type: 'init_repository_result', requestId, ok: true })
  } catch (err) {
    const error = err instanceof ResticError
      ? err.message
      : err instanceof Error ? err.message : String(err)
    send({ type: 'init_repository_result', requestId, ok: false, error })
  }
}
