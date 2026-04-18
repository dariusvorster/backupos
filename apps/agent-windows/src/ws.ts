import { hostname, networkInterfaces } from 'node:os'
import type { AgentMessage, ServerMessage, BackupJobConfig } from '@backupos/agent-protocol'
import { collectMetrics, release } from './metrics'
import { execAllowed } from './executor'
import type { AgentConfig } from './config'

const METRICS_INTERVAL_MS = 30_000
const RECONNECT_BASE_MS   = 2_000
const RECONNECT_MAX_MS    = 60_000
const AGENT_VERSION       = '0.1.0'

export function startAgent(config: AgentConfig): void {
  let reconnectDelay = RECONNECT_BASE_MS
  let metricsTimer: ReturnType<typeof setInterval> | null = null
  let pingTimer:    ReturnType<typeof setInterval> | null = null

  function connect(): void {
    const base  = config.serverUrl.replace(/\/$/, '')
    const wsUrl = base.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://') + '/ws/agent'
    const ws    = new WebSocket(wsUrl)

    function send(msg: AgentMessage): void {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg))
      }
    }

    ws.onopen = () => {
      reconnectDelay = RECONNECT_BASE_MS
      const nets = networkInterfaces()
      let   ip   = '0.0.0.0'
      for (const ifaces of Object.values(nets)) {
        const found = ifaces?.find(i => !i.internal && i.family === 'IPv4')
        if (found) { ip = found.address; break }
      }
      send({
        type:         'hello',
        token:        config.token,
        hostname:     hostname(),
        ip,
        osInfo:       { os: 'windows', arch: process.arch, kernel: release() },
        agentVersion: AGENT_VERSION,
        platform:     'windows',
      })
      pingTimer = setInterval(() => send({ type: 'ping' }), 30_000)
    }

    ws.onmessage = async (event: MessageEvent) => {
      let msg: ServerMessage
      try { msg = JSON.parse(event.data as string) as ServerMessage } catch { return }

      if (msg.type === 'welcome') {
        console.log(`[agent] Connected as ${msg.agentId}`)
        if (metricsTimer) clearInterval(metricsTimer)
        const sendMetrics = async (): Promise<void> => {
          const metrics = await collectMetrics()
          send({ type: 'metrics', metrics })
        }
        await sendMetrics()
        metricsTimer = setInterval(() => { void sendMetrics() }, METRICS_INTERVAL_MS)
      } else if (msg.type === 'run_backup') {
        await handleBackup(msg.jobId, msg.config, send)
      } else if (msg.type === 'cancel_backup') {
        console.warn(`[agent] cancel_backup not implemented for jobId=${msg.jobId}`)
      } else if (msg.type === 'verify_repo') {
        await handleVerify(msg.repoId, msg.repoUrl, msg.repoPassword, msg.readData, msg.envVars)
      } else if (msg.type === 'run_restore') {
        console.warn(`[agent] run_restore not implemented for restoreId=${msg.restoreId}`)
        send({ type: 'restore_complete', restoreId: msg.restoreId, success: false })
      }
    }

    ws.onclose = () => {
      if (pingTimer)    { clearInterval(pingTimer);    pingTimer    = null }
      if (metricsTimer) { clearInterval(metricsTimer); metricsTimer = null }
      console.log(`[agent] Disconnected. Reconnecting in ${reconnectDelay / 1000}s...`)
      setTimeout(connect, reconnectDelay)
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
    }

    ws.onerror = (err: Event) => {
      console.error('[agent] WebSocket error:', err)
    }
  }

  connect()
}

async function handleBackup(
  jobId:  string,
  config: BackupJobConfig,
  send:   (msg: AgentMessage) => void,
): Promise<void> {
  const env: Record<string, string> = {
    RESTIC_REPOSITORY: config.repoUrl,
    RESTIC_PASSWORD:   config.repoPassword,
    ...(config.envVars ?? {}),
  }
  const args = ['backup', '--json', '--use-fs-snapshot', ...config.paths]
  if (config.exclude) {
    for (const ex of config.exclude) args.push('--exclude', ex)
  }
  if (config.tags) {
    for (const tag of config.tags) args.push('--tag', tag)
  }

  send({ type: 'backup_start', jobId, config })

  try {
    const result = await execAllowed('restic', args, env)
    if (result.exitCode !== 0) {
      send({ type: 'backup_failed', jobId, error: 'restic exited non-zero', detail: result.stderr })
      return
    }
    const summaryLine = result.stdout
      .trim()
      .split('\n')
      .reverse()
      .find(l => l.includes('"message_type":"summary"'))
    const summary: Record<string, unknown> = summaryLine ? JSON.parse(summaryLine) as Record<string, unknown> : {}
    send({
      type:       'backup_complete',
      jobId,
      snapshotId: (summary['snapshot_id'] as string | undefined) ?? '',
      stats: {
        filesNew:            (summary['files_new'] as number | undefined)             ?? 0,
        filesChanged:        (summary['files_changed'] as number | undefined)         ?? 0,
        filesUnmodified:     (summary['files_unmodified'] as number | undefined)      ?? 0,
        dataAdded:           (summary['data_added'] as number | undefined)            ?? 0,
        totalFilesProcessed: (summary['total_files_processed'] as number | undefined) ?? 0,
        totalBytesProcessed: (summary['total_bytes_processed'] as number | undefined) ?? 0,
        durationSeconds:     (summary['total_duration'] as number | undefined)        ?? 0,
      },
    })
  } catch (err) {
    send({ type: 'backup_failed', jobId, error: String(err), detail: '' })
  }
}

async function handleVerify(
  repoId:       string,
  repoUrl:      string,
  repoPassword: string,
  readData:     boolean,
  envVars:      Record<string, string> | undefined,
): Promise<void> {
  const env: Record<string, string> = {
    RESTIC_REPOSITORY: repoUrl,
    RESTIC_PASSWORD:   repoPassword,
    ...(envVars ?? {}),
  }
  const result = await execAllowed('restic', ['check', ...(readData ? ['--read-data'] : [])], env)
  console.log(`[agent] verify_repo ${repoId}: exit=${result.exitCode}`)
  if (result.exitCode !== 0) {
    console.error('[agent] verify_repo stderr:', result.stderr)
  }
}
