import { ResticEngine } from '@backupos/engine'
import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'

type SendFn = (msg: AgentMessage) => void
type RunMsg = Extract<ServerMessage, { type: 'run_forget_prune' }>

export async function handleForgetPrune(
  msg: RunMsg,
  send: SendFn,
  binaryPath: string | undefined,
): Promise<void> {
  const start = Date.now()

  const engine = new ResticEngine({
    repositoryUrl: msg.repoUrl,
    password:      msg.repoPassword,
    envVars:       msg.envVars ?? {},
    binaryPath,
  })

  try {
    const result = await engine.forget({
      keepLast:    msg.keepLast,
      keepDaily:   msg.keepDaily,
      keepWeekly:  msg.keepWeekly,
      keepMonthly: msg.keepMonthly,
      keepYearly:  msg.keepYearly,
      keepTags:    msg.keepTags,
    })

    send({
      type:       'forget_prune_complete',
      requestId:  msg.requestId,
      jobId:      msg.jobId,
      runId:      msg.runId,
      success:    true,
      removed:    result.removed,
      kept:       result.kept,
      durationMs: Date.now() - start,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    send({
      type:       'forget_prune_complete',
      requestId:  msg.requestId,
      jobId:      msg.jobId,
      runId:      msg.runId,
      success:    false,
      error:      message,
      removed:    0,
      kept:       0,
      durationMs: Date.now() - start,
    })
  }
}
