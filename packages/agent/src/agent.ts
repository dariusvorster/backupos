import WebSocket from 'ws'
import * as os from 'os'
import { ResticEngine } from '@backupos/engine'
import type { AgentMessage, ServerMessage, BackupJobConfig } from '@backupos/agent-protocol'

const SERVER_URL = process.env['BACKUPOS_URL'] ?? 'ws://localhost:3000/ws/agent'
const TOKEN      = process.env['BACKUPOS_TOKEN'] ?? ''
const BINARY     = process.env['RESTIC_BINARY_PATH']
const VERSION    = '0.1.0'

if (!TOKEN) {
  console.error('[agent] BACKUPOS_TOKEN is required')
  process.exit(1)
}

function getIp(): string {
  const ifaces = os.networkInterfaces()
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address
    }
  }
  return '127.0.0.1'
}

// Exponential backoff state
let backoffMs = 1_000
const MAX_BACKOFF = 60_000
let ws: WebSocket | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let shuttingDown = false

// Active jobs — keyed by jobId — allow cancel
const activeJobs = new Map<string, AbortController>()

function send(msg: AgentMessage): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

function stopHeartbeat(): void {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
}

function startHeartbeat(): void {
  stopHeartbeat()
  heartbeatTimer = setInterval(() => {
    send({ type: 'ping' })

    const memTotal  = os.totalmem()
    const memFree   = os.freemem()
    const cpuCount  = os.cpus().length || 1
    const cpuLoad   = (os.loadavg()[0] ?? 0) / cpuCount * 100

    send({
      type: 'metrics',
      metrics: {
        cpuPercent:    Math.min(100, Math.round(cpuLoad * 10) / 10),
        memUsedBytes:  memTotal - memFree,
        memTotalBytes: memTotal,
        diskUsedBytes:  {},
        diskTotalBytes: {},
        uptimeSeconds:  Math.floor(process.uptime()),
      },
    })
  }, 30_000)
}

async function handleMessage(raw: WebSocket.RawData): Promise<void> {
  let msg: ServerMessage
  try { msg = JSON.parse(raw.toString()) as ServerMessage }
  catch { return }

  if (msg.type === 'welcome') {
    console.log(`[agent] Authenticated — agent ID: ${msg.agentId}, server: ${msg.serverVersion}`)
    backoffMs = 1_000

  } else if (msg.type === 'pong') {
    // heartbeat acknowledged

  } else if (msg.type === 'run_backup') {
    void runBackup(msg.jobId, msg.config)

  } else if (msg.type === 'cancel_backup') {
    const ctrl = activeJobs.get(msg.jobId)
    if (ctrl) { ctrl.abort(); console.log(`[agent] Cancelled job ${msg.jobId}`) }

  } else if (msg.type === 'verify_repo') {
    void verifyRepo(msg.repoId, msg.repoUrl, msg.repoPassword, msg.readData, msg.envVars)
  }
}

async function runBackup(jobId: string, config: BackupJobConfig): Promise<void> {
  if (activeJobs.has(jobId)) {
    console.warn(`[agent] Job ${jobId} already running — ignoring duplicate dispatch`)
    return
  }

  const ctrl = new AbortController()
  activeJobs.set(jobId, ctrl)

  send({ type: 'backup_start', jobId, config })
  console.log(`[agent] Starting backup for job ${jobId} — paths: ${config.paths.join(', ')}`)

  try {
    const engine = new ResticEngine({
      repositoryUrl: config.repoUrl,
      password:      config.repoPassword,
      envVars:       config.envVars ?? {},
      binaryPath:    BINARY,
    })

    // Idempotent — succeeds even if repo already exists
    try { await engine.init() } catch { /* already initialised */ }

    const result = await engine.backup({
      paths:   config.paths,
      exclude: config.exclude,
      tags:    config.tags,
    })

    send({
      type:       'backup_complete',
      jobId,
      snapshotId: result.snapshotId,
      stats: {
        filesNew:            result.filesNew,
        filesChanged:        result.filesChanged,
        filesUnmodified:     result.filesUnmodified,
        dataAdded:           result.dataAdded,
        totalFilesProcessed: result.filesNew + result.filesChanged + result.filesUnmodified,
        totalBytesProcessed: result.totalSize ?? 0,
        durationSeconds:     result.duration  ?? 0,
      },
    })
    console.log(`[agent] Backup complete — snapshot ${result.snapshotId}`)

  } catch (err) {
    const error  = err instanceof Error ? err.message : String(err)
    const detail = err instanceof Error && err.stack ? err.stack : ''
    send({ type: 'backup_failed', jobId, error, detail })
    console.error(`[agent] Backup failed for job ${jobId}:`, error)

  } finally {
    activeJobs.delete(jobId)
  }
}

async function verifyRepo(
  repoId: string,
  repoUrl: string,
  repoPassword: string,
  readData: boolean,
  envVars?: Record<string, string>,
): Promise<void> {
  try {
    const engine = new ResticEngine({
      repositoryUrl: repoUrl,
      password:      repoPassword,
      envVars:       envVars ?? {},
      binaryPath:    BINARY,
    })
    await engine.check(readData)
    console.log(`[agent] Repo ${repoId} check passed`)
  } catch (err) {
    console.error(`[agent] Repo ${repoId} check failed:`, err)
  }
}

function connect(): void {
  if (shuttingDown) return

  console.log(`[agent] Connecting to ${SERVER_URL} …`)
  ws = new WebSocket(SERVER_URL)

  ws.on('open', () => {
    console.log('[agent] WebSocket open — sending hello')
    const hello: AgentMessage = {
      type:         'hello',
      token:        TOKEN,
      hostname:     os.hostname(),
      ip:           getIp(),
      agentVersion: VERSION,
      platform:     process.platform === 'win32' ? 'windows' : 'linux',
      osInfo: {
        os:     process.platform,
        arch:   process.arch,
        kernel: os.release(),
      },
    }
    ws!.send(JSON.stringify(hello))
    startHeartbeat()
  })

  ws.on('message', (raw: WebSocket.RawData) => { void handleMessage(raw) })

  ws.on('close', (code: number, reason: Buffer) => {
    stopHeartbeat()
    ws = null
    if (shuttingDown) return
    console.log(`[agent] Disconnected (${code} ${reason.toString()}) — reconnecting in ${backoffMs / 1000}s`)
    setTimeout(() => { connect() }, backoffMs)
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF)
  })

  ws.on('error', (err: Error) => {
    // 'close' fires after 'error', reconnect is handled there
    console.error('[agent] WebSocket error:', err.message)
  })
}

function shutdown(): void {
  shuttingDown = true
  stopHeartbeat()
  console.log('[agent] Shutting down …')
  ws?.close(1000, 'shutdown')
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT',  shutdown)

connect()
