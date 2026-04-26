import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { ResticEngine } from '@backupos/engine'
import type { AgentMessage, ServerMessage, ComposeServiceConfig } from '@backupos/agent-protocol'
import {
  listComposeContainers,
  pauseContainer, unpauseContainer,
  stopContainer, startContainer, waitForRunning,
} from '../docker-client'
import { runApphook } from './apphooks'

type SendFn = (msg: AgentMessage) => void
type RunMsg = Extract<ServerMessage, { type: 'run_compose_backup' }>
type EnsureRepoFn = (engine: ResticEngine, repoId: string) => Promise<void>

interface ActiveJobRef {
  ctrl: AbortController
  runId: string
  phase: string
  lastResticEventAt: number
  cancelled: boolean
}

async function quiesce(containerId: string, strategy: ComposeServiceConfig['quiescence']): Promise<void> {
  switch (strategy) {
    case 'none':    return
    case 'pause':   await pauseContainer(containerId); return
    case 'stop':    await stopContainer(containerId); return
    case 'apphook': throw new Error('apphook must be handled before quiesce is called')
  }
}

async function resumeService(containerId: string, strategy: ComposeServiceConfig['quiescence']): Promise<void> {
  switch (strategy) {
    case 'none':   return
    case 'pause':  await unpauseContainer(containerId); return
    case 'stop':
      await startContainer(containerId)
      await waitForRunning(containerId, 30_000)
      return
    case 'apphook': return
  }
}

export async function runComposeBackup(
  msg: RunMsg,
  send: SendFn,
  activeJobs: Map<string, ActiveJobRef>,
  binaryPath: string | undefined,
  ensureRepo: EnsureRepoFn,
): Promise<void> {
  const { jobId, runId, config, repoId, repoUrl, repoPassword, envVars } = msg
  const ctrl = new AbortController()

  activeJobs.set(jobId, { ctrl, runId, phase: 'starting', lastResticEventAt: Date.now(), cancelled: false })

  const logLines: string[] = []
  const snapshotIds: string[] = []
  const agg = { filesNew: 0, filesChanged: 0, filesUnmodified: 0, dataAdded: 0, totalSize: 0, durationMs: 0 }

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

  const tmpDir = path.join(os.tmpdir(), 'backupos-apphooks', jobId)

  try {
    await ensureRepo(makeEngine(), repoId)

    const services = config.services?.filter(s => s.included) ?? []

    for (const service of services) {
      // Apphook services proceed even with no included volumes (the dump is the backup artifact)
      if (service.includedVolumes.length === 0 && service.quiescence !== 'apphook') {
        logLines.push(`[compose] SKIP: "${service.serviceName}" — no included volumes`)
        continue
      }

      const containers = await listComposeContainers(config.projectName)
      const target = containers.find(
        c => (c.Labels['com.docker.compose.service'] ?? '') === service.serviceName,
      )
      if (!target) {
        logLines.push(`[compose] WARN: "${service.serviceName}" not found in Docker — skipping`)
        continue
      }

      let extraPaths: string[] = []
      let cleanupDump: () => Promise<void> = async () => { /* no-op */ }

      if (service.quiescence === 'apphook') {
        // Apphook: dump DB to tmp file; container stays running throughout
        setPhase('uploading')
        if (!service.apphookConfig) {
          logLines.push(`[compose] FAIL: apphook config missing for "${service.serviceName}"`)
          throw new Error(`apphook config missing for "${service.serviceName}"`)
        }
        await fs.mkdir(tmpDir, { recursive: true })
        const dumpFile = path.join(tmpDir, `${service.serviceName}.dump`)
        try {
          await runApphook(service, target, dumpFile)
          extraPaths = [dumpFile]
          cleanupDump = async () => { try { await fs.unlink(dumpFile) } catch { /* ignore */ } }
          logLines.push(`[compose] apphook "${service.serviceName}" (${service.apphookType ?? 'unknown'}) — dump ready`)
        } catch (err) {
          const e = err instanceof Error ? err.message : String(err)
          logLines.push(`[compose] FAIL: apphook "${service.serviceName}" → ${e}`)
          throw new Error(`apphook failed for "${service.serviceName}": ${e}`)
        }
      } else {
        // Quiesce
        setPhase('quiescing')
        try {
          await quiesce(target.Id, service.quiescence)
          if (service.quiescence !== 'none') {
            logLines.push(`[compose] quiesced "${service.serviceName}" (${service.quiescence})`)
          }
        } catch (err) {
          const e = err instanceof Error ? err.message : String(err)
          logLines.push(`[compose] FAIL: quiesce "${service.serviceName}" → ${e}`)
          throw new Error(`quiesce failed for "${service.serviceName}": ${e}`)
        }
      }

      // Back up volumes + dump file (apphook) via restic
      setPhase('uploading')
      let volumeBackupOk = false
      try {
        const paths = [
          ...service.includedVolumes.map(v => `/var/lib/docker/volumes/${v}/_data`),
          ...extraPaths,
        ]
        const result = await makeEngine().backup({
          paths,
          tags: [
            `job:${jobId}`,
            `compose:${config.projectName}`,
            `service:${service.serviceName}`,
          ],
          signal: ctrl.signal,
        })
        snapshotIds.push(result.snapshotId)
        agg.filesNew        += result.filesNew
        agg.filesChanged    += result.filesChanged
        agg.filesUnmodified += result.filesUnmodified
        agg.dataAdded       += result.dataAdded
        agg.totalSize       += result.totalSize
        agg.durationMs      += result.duration
        logLines.push(result.log)
        volumeBackupOk = true
      } catch (err) {
        const e = err instanceof Error ? err.message : String(err)
        logLines.push(`[compose] FAIL: restic backup "${service.serviceName}" → ${e}`)
        if (service.quiescence !== 'apphook') {
          setPhase('resuming')
          await resumeService(target.Id, service.quiescence).catch(re => {
            logLines.push(`[compose] WARN: resume "${service.serviceName}" after backup failure → ${re instanceof Error ? re.message : String(re)}`)
          })
        }
        throw new Error(`backup failed for "${service.serviceName}": ${e}`)
      } finally {
        await cleanupDump()
      }

      // Resume container (non-apphook only — apphook services never stopped)
      if (volumeBackupOk && service.quiescence !== 'apphook') {
        setPhase('resuming')
        try {
          await resumeService(target.Id, service.quiescence)
          if (service.quiescence !== 'none') {
            logLines.push(`[compose] resumed "${service.serviceName}"`)
          }
        } catch (err) {
          logLines.push(`[compose] WARN: resume "${service.serviceName}" failed → ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    // Optionally back up the compose file itself
    if (config.includeComposeFile && config.composeFilePath) {
      setPhase('uploading')
      try {
        const result = await makeEngine().backup({
          paths: [config.composeFilePath],
          tags:  [`job:${jobId}`, `compose:${config.projectName}`, 'meta:compose-file'],
          signal: ctrl.signal,
        })
        snapshotIds.push(result.snapshotId)
        logLines.push(result.log)
      } catch (err) {
        logLines.push(`[compose] WARN: backup of compose file failed → ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // TODO(env-files): when ComposeServiceConfig.envFiles is populated by handleListCompose,
    // read each path, redact secret keys, write to tmpDir, append to restic paths.
    // See follow-on task: env-file backup + redaction (GitHub issue).

    setPhase('finalizing')
    send({
      type:       'backup_complete',
      jobId,
      snapshotId: snapshotIds[0] ?? 'multi',
      snapshotIds,
      stats: {
        filesNew:            agg.filesNew,
        filesChanged:        agg.filesChanged,
        filesUnmodified:     agg.filesUnmodified,
        dataAdded:           agg.dataAdded,
        totalFilesProcessed: agg.filesNew + agg.filesChanged + agg.filesUnmodified,
        totalBytesProcessed: agg.totalSize,
        durationMs:          agg.durationMs,
      },
      log: logLines.join('\n').slice(0, 1_000_000) || undefined,
    })

  } catch (err) {
    send({
      type:   'backup_failed',
      jobId,
      error:  err instanceof Error ? err.message : String(err),
      detail: err instanceof Error && err.stack ? err.stack : '',
      log:    logLines.join('\n').slice(0, 1_000_000) || undefined,
    })
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => { /* ignore if never created */ })
    activeJobs.delete(jobId)
  }
}
