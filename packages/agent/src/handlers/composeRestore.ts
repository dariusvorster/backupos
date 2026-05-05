import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { ResticEngine } from '@backupos/engine'
import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'
import { listComposeContainers, stopContainer, startContainer, waitForRunning } from '../docker-client'
import { spawnAllowed } from '../exec-allowed'

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
  const { jobId, runId, repoUrl, repoPassword, envVars, config } = msg
  const { mode, snapshotIds, composeConfig, restoreComposeFile, sideBySideProjectName } = config

  if (activeJobs.has(jobId)) {
    console.warn(`[agent] run_compose_restore: job ${jobId} already active — ignoring`)
    return
  }

  const ctrl = new AbortController()
  activeJobs.set(jobId, { ctrl, runId, phase: 'starting', lastResticEventAt: Date.now(), cancelled: false })

  const logLines: string[] = []
  const tmpDir = path.join(os.tmpdir(), 'backupos-restore', jobId)

  const setPhase = (phase: string): void => {
    const j = activeJobs.get(jobId)
    if (j) { j.phase = phase; j.lastResticEventAt = Date.now() }
  }

  const makeEngine = () => new ResticEngine({
    repositoryUrl: repoUrl,
    password:      repoPassword,
    envVars:       envVars ?? {},
    binaryPath,
  })

  const services = composeConfig.services?.filter(s => s.included) ?? []

  // The compose file snapshot, if present, is appended after all service snapshots
  const serviceSnapshotIds = snapshotIds.slice(0, services.length)
  const composeFileSnapshotId = restoreComposeFile && snapshotIds.length > services.length
    ? snapshotIds[services.length]
    : undefined

  if (serviceSnapshotIds.length !== services.length) {
    send({
      type:   'backup_failed',
      jobId,
      error:  `service/snapshot count mismatch: ${services.length} services vs ${serviceSnapshotIds.length} snapshots`,
      detail: '',
    })
    activeJobs.delete(jobId)
    return
  }

  // For in-place: track stopped container IDs for best-effort restart on failure
  const stoppedContainerIds: string[] = []

  try {
    await fs.mkdir(tmpDir, { recursive: true })

    if (mode === 'in_place') {
      setPhase('quiescing')
      for (const service of services) {
        const containers = await listComposeContainers(composeConfig.projectName)
        const target = containers.find(c => (c.Labels['com.docker.compose.service'] ?? '') === service.serviceName)
        if (target) {
          await stopContainer(target.Id)
          stoppedContainerIds.push(target.Id)
          logLines.push(`[restore] stopped "${service.serviceName}"`)
        } else {
          logLines.push(`[restore] WARN: "${service.serviceName}" not found — skipping stop`)
        }
      }
    }

    setPhase('restoring')

    for (let i = 0; i < services.length; i++) {
      const service = services[i]!
      const snapshotId = serviceSnapshotIds[i]!

      for (const origVolName of service.includedVolumes) {
        if (!/^[a-zA-Z0-9_.-]+$/.test(origVolName)) {
          throw new Error(`unsafe volume name: "${origVolName}"`)
        }
        const sourcePath = `/var/lib/docker/volumes/${origVolName}/_data`

        if (mode === 'in_place') {
          await makeEngine().restore(snapshotId, '/', [sourcePath], ctrl.signal)
          logLines.push(`[restore] restored "${service.serviceName}" vol ${origVolName} (in-place)`)
        } else {
          // side_by_side: restore to tmpDir, create new volume, copy contents
          if (!/^[a-zA-Z0-9_.-]+$/.test(sideBySideProjectName!)) {
            throw new Error(`unsafe sideBySideProjectName: "${sideBySideProjectName}"`)
          }
          if (!/^[a-zA-Z0-9_.-]+$/.test(composeConfig.projectName)) {
            throw new Error(`unsafe projectName: "${composeConfig.projectName}"`)
          }
          const newVolName = origVolName.startsWith(`${composeConfig.projectName}_`)
            ? `${sideBySideProjectName!}${origVolName.slice(composeConfig.projectName.length)}`
            : `${sideBySideProjectName!}_${origVolName}`

          await spawnAllowed('docker', ['volume', 'create', newVolName])

          await makeEngine().restore(snapshotId, tmpDir, [sourcePath], ctrl.signal)

          // tmpDir/<sourcePath> contains the restored files
          const restoreDest = path.join(tmpDir, 'var', 'lib', 'docker', 'volumes', origVolName, '_data')
          const newVolPath  = `/var/lib/docker/volumes/${newVolName}/_data`
          await spawnAllowed('cp', ['-a', `${restoreDest}/.`, `${newVolPath}/`])

          logLines.push(`[restore] restored "${service.serviceName}" ${origVolName} → ${newVolName} (side-by-side)`)
        }
      }
    }

    // Optional compose file restore
    if (composeFileSnapshotId && composeConfig.composeFilePath) {
      if (mode === 'in_place') {
        await makeEngine().restore(composeFileSnapshotId, '/', [composeConfig.composeFilePath], ctrl.signal)
        logLines.push(`[restore] restored compose file to ${composeConfig.composeFilePath}`)
      } else {
        logLines.push(`[restore] NOTE: compose file restore skipped for side-by-side mode — original file unchanged`)
      }
    }

    if (mode === 'in_place') {
      setPhase('resuming')
      for (const containerId of stoppedContainerIds) {
        try {
          await startContainer(containerId)
          await waitForRunning(containerId, 30_000)
        } catch (err) {
          logLines.push(`[restore] WARN: failed to restart container ${containerId}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      logLines.push('[restore] in-place restore complete — all services restarted')
    } else {
      logLines.push(`[restore] side-by-side complete. Original "${composeConfig.projectName}" stack untouched. New volumes prefixed with "${sideBySideProjectName}".`)
    }

    setPhase('finalizing')
    send({
      type:       'backup_complete',
      jobId,
      snapshotId: serviceSnapshotIds[0] ?? 'restored',
      snapshotIds: serviceSnapshotIds,
      stats: {
        filesNew:            0,
        filesChanged:        0,
        filesUnmodified:     0,
        dataAdded:           0,
        totalFilesProcessed: 0,
        totalBytesProcessed: 0,
        durationMs:          0,
      },
      log: logLines.join('\n').slice(0, 1_000_000) || undefined,
    })

  } catch (err) {
    if (mode === 'in_place' && stoppedContainerIds.length > 0) {
      logLines.push('[restore] FATAL: restore failed mid-flight — attempting best-effort restart of stopped services')
      for (const containerId of stoppedContainerIds) {
        await startContainer(containerId)
          .then(() => waitForRunning(containerId, 30_000))
          .catch(re => {
            logLines.push(`[restore] WARN: restart failed for container ${containerId}: ${re instanceof Error ? re.message : String(re)}`)
          })
      }
    }
    send({
      type:   'backup_failed',
      jobId,
      error:  err instanceof Error ? err.message : String(err),
      detail: err instanceof Error && err.stack ? err.stack : '',
      log:    logLines.join('\n').slice(0, 1_000_000) || undefined,
    })
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    activeJobs.delete(jobId)
  }
}
