import { ResticEngine } from '@backupos/engine'
import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'
import { listComposeContainers, startContainer, waitForRunning } from '../docker-client'

type SendFn = (msg: AgentMessage) => void
type RunMsg = Extract<ServerMessage, { type: 'run_compose_restore' }>

interface ActiveJobRef {
  ctrl: AbortController
  runId: string
  phase: string
  lastResticEventAt: number
  cancelled: boolean
}

export async function runComposeRestore(
  msg: RunMsg,
  send: SendFn,
  activeJobs: Map<string, ActiveJobRef>,
  binaryPath: string | undefined,
): Promise<void> {
  const { jobId, config, repoUrl, repoPassword, envVars } = msg

  activeJobs.set(jobId, { ctrl: new AbortController(), runId: msg.runId, phase: 'starting', lastResticEventAt: Date.now(), cancelled: false })

  const logLines: string[] = []

  function setPhase(phase: string): void {
    const j = activeJobs.get(jobId)
    if (j) { j.phase = phase; j.lastResticEventAt = Date.now() }
  }

  const makeEngine = () => new ResticEngine({
    repositoryUrl: repoUrl,
    password:      repoPassword,
    envVars:       envVars ?? {},
    binaryPath,
  })

  try {
    const services = config.composeConfig.services?.filter(s => s.included) ?? []

    if (config.snapshotIds.length !== services.length) {
      throw new Error(
        `snapshot count mismatch: got ${config.snapshotIds.length} snapshots for ${services.length} services`,
      )
    }

    // Restore each service's volumes from its snapshot
    for (let i = 0; i < services.length; i++) {
      const service = services[i]!
      const snapshotId = config.snapshotIds[i]!

      if (service.includedVolumes.length === 0) {
        logLines.push(`[compose] SKIP: "${service.serviceName}" — no included volumes`)
        continue
      }

      setPhase('uploading')

      // Determine target volume path based on mode
      let targetBase: string
      if (config.mode === 'in_place') {
        targetBase = '/var/lib/docker/volumes'
      } else {
        // side_by_side mode: restore to a differently-named project
        const newProjectName = config.sideBySideProjectName ?? `${config.composeConfig.projectName}-restored`
        targetBase = `/var/lib/docker/volumes/${newProjectName}`
      }

      try {
        logLines.push(`[compose] Restoring "${service.serviceName}" from snapshot ${snapshotId.slice(0, 8)}…`)

        // Restore via restic to target base (restic restores relative paths)
        await makeEngine().restore(snapshotId, targetBase, service.includedVolumes)

        logLines.push(`[compose] Restored "${service.serviceName}" (${service.includedVolumes.length} volume(s))`)
      } catch (err) {
        const e = err instanceof Error ? err.message : String(err)
        logLines.push(`[compose] FAIL: restore "${service.serviceName}" from ${snapshotId.slice(0, 8)} → ${e}`)
        throw new Error(`restore failed for "${service.serviceName}": ${e}`)
      }
    }

    // Restore compose file if requested
    if (config.restoreComposeFile && config.composeConfig.composeFilePath) {
      if (config.snapshotIds.length > 0) {
        setPhase('uploading')
        try {
          logLines.push(`[compose] Restoring compose file from snapshot…`)
          await makeEngine().restore(config.snapshotIds[0]!, '/tmp', ['compose.yml'])
          logLines.push(`[compose] Restored compose file`)
        } catch (err) {
          logLines.push(`[compose] WARN: restore of compose file failed → ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    // If in side-by-side mode, start the containers with the new project name
    if (config.mode === 'side_by_side' && config.sideBySideProjectName) {
      setPhase('resuming')
      const containers = await listComposeContainers(config.sideBySideProjectName)

      for (const container of containers) {
        try {
          await startContainer(container.Id)
          await waitForRunning(container.Id, 30_000)
          logLines.push(`[compose] Started container ${container.Names[0] ?? container.Id.slice(0, 12)}`)
        } catch (err) {
          logLines.push(`[compose] WARN: failed to start ${container.Names[0] ?? container.Id.slice(0, 12)} → ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    setPhase('finalizing')
    send({
      type: 'restore_complete',
      restoreId: jobId,
      success: true,
    })

  } catch (err) {
    send({
      type: 'restore_complete',
      restoreId: jobId,
      success: false,
    })
  } finally {
    activeJobs.delete(jobId)
  }
}
