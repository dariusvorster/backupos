import WebSocket from 'ws'
import * as os from 'os'
import { createHash } from 'crypto'
import { readFileSync, writeFileSync, renameSync } from 'fs'
import { spawn as spawnProcess } from 'child_process'
import { ResticEngine } from '@backupos/engine'
import type { AgentMessage, ServerMessage, BackupJobConfig } from '@backupos/agent-protocol'
import { getSystemUptimeSeconds } from './system-uptime'
import { detectCapabilities } from './capabilities'
import { resolveHostPrefix, applyHostPrefixAll } from './lib/host-prefix'
import { runMountRepository } from './handlers/mountRepository'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`[agent] ${name} is required.`)
    console.error(`[agent] If installed via systemd, ensure the unit at`)
    console.error(`[agent]   /etc/systemd/system/backupos-agent.service`)
    console.error(`[agent] contains: EnvironmentFile=/opt/backupos-agent/.env`)
    console.error(`[agent] and that the .env file has ${name}=<value>.`)
    console.error(`[agent] Run the install script in update mode to self-heal:`)
    console.error(`[agent]   sudo bash /opt/backupos-agent/install.sh update`)
    process.exit(1)
  }
  return v
}

const SERVER_URL = requireEnv('BACKUPOS_URL')
const TOKEN      = requireEnv('BACKUPOS_TOKEN')

function getHttpBase(): string {
  const u = new URL(SERVER_URL)
  const proto = u.protocol === 'wss:' ? 'https:' : 'http:'
  return `${proto}//${u.host}`
}

function computeSelfHash(): string {
  try {
    const buf = readFileSync(process.argv[1]!)
    return createHash('sha256').update(buf).digest('hex')
  } catch { return '' }
}
const SELF_HASH = computeSelfHash()

async function selfUpdate(): Promise<void> {
  const scriptPath = process.argv[1]
  if (!scriptPath) { console.error('[agent] selfUpdate: cannot determine script path'); return }
  try {
    const base = getHttpBase()
    const res = await fetch(`${base}/agent/bundle.js`, {
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`bundle download failed: ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const tmp = `${scriptPath}.tmp`
    writeFileSync(tmp, buf)
    renameSync(tmp, scriptPath)
    console.log('[agent] Bundle updated — restarting …')
    spawnProcess(process.execPath, process.argv.slice(1), {
      env:      process.env,
      detached: true,
      stdio:    'inherit',
    }).unref()
    process.exit(0)
  } catch (err) {
    console.error('[agent] selfUpdate failed:', err instanceof Error ? err.message : err)
  }
}

async function ensureRepoInitialized(engine: ResticEngine, repoId: string): Promise<void> {
  try {
    const base = getHttpBase()
    const stateRes = await fetch(`${base}/internal/repository/${repoId}/state`, {
      headers: { 'x-agent-token': TOKEN },
      signal: AbortSignal.timeout(10_000),
    })
    if (!stateRes.ok) throw new Error(`state check returned ${stateRes.status}`)
    const { initializedAt } = await stateRes.json() as { initializedAt: number | null }
    if (initializedAt !== null) return

    await engine.init()

    await fetch(`${base}/internal/repository/${repoId}/initialized`, {
      method: 'POST',
      headers: { 'x-agent-token': TOKEN },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    // Fallback: unconditional init (server unreachable or unknown repo)
    try { await engine.init() } catch { /* already initialised */ }
  }
}
const BINARY          = process.env['RESTIC_BINARY_PATH']
const HOST_PREFIX     = resolveHostPrefix()
if (HOST_PREFIX) {
  console.log(`[agent] host prefix active: ${HOST_PREFIX} (filesystem paths will be rewritten)`)
} else {
  console.log('[agent] host prefix inactive (running as host agent or opted out)')
}
const VERSION         = '0.1.0'
const PROTOCOL_VERSION = '1'

async function queryResticVersion(): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawnProcess(BINARY ?? 'restic', ['version'], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    proc.stdout?.on('data', (d: Buffer) => { out += d.toString() })
    proc.on('close', () => {
      const m = out.match(/^restic\s+(\S+)/m)
      resolve(m ? m[1]! : '')
    })
    proc.on('error', () => resolve(''))
    setTimeout(() => { proc.kill(); resolve('') }, 10_000)
  })
}

let detectedCapabilities: string[] = ['backup', 'restore']
void detectCapabilities().then(caps => {
  detectedCapabilities = ['backup', 'restore', ...caps]
  console.log('[agent] Capabilities:', detectedCapabilities.join(', '))
})

let RESTIC_VERSION = ''
void queryResticVersion().then(v => { RESTIC_VERSION = v })

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

type BackupPhase = 'starting' | 'scanning' | 'uploading' | 'finalizing' | 'quiescing' | 'resuming'
interface ActiveJob { ctrl: AbortController; runId: string; phase: string; lastResticEventAt: number; cancelled: boolean }

// Active jobs — keyed by jobId
const activeJobs = new Map<string, ActiveJob>()

// Emit a heartbeat for every in-flight backup every 5 seconds
setInterval(() => {
  for (const [jobId, job] of activeJobs) {
    send({
      type:              'backup_heartbeat',
      jobId,
      runId:             job.runId,
      phase:             (job.phase as BackupPhase) ?? 'starting',
      lastResticEventAt: job.lastResticEventAt,
    })
  }
}, 5_000)

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
        uptimeSeconds:  getSystemUptimeSeconds(),
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
    if (msg.bundleHash && SELF_HASH) {
      if (msg.bundleHash !== SELF_HASH) {
        console.log(`[agent] Bundle hash mismatch (server: ${msg.bundleHash.slice(0, 8)} local: ${SELF_HASH.slice(0, 8)}) — self-updating`)
        void selfUpdate()
      } else {
        console.log(`[agent] Bundle hash OK: ${msg.bundleHash.slice(0, 8)}`)
      }
    }

  } else if (msg.type === 'force_update') {
    console.log('[agent] Force-update requested by server — self-updating')
    void selfUpdate()

  } else if (msg.type === 'pong') {
    // heartbeat acknowledged

  } else if (msg.type === 'run_backup') {
    void runBackup(msg.jobId, msg.runId, msg.config, msg.bandwidthLimitKbps)

  } else if (msg.type === 'cancel_backup') {
    const job = activeJobs.get(msg.jobId)
    if (!job) {
      console.warn(`[agent] cancel_backup: no active backup for jobId=${msg.jobId}`)
      send({ type: 'backup_cancelled', jobId: msg.jobId, runId: msg.runId, reason: 'not_running' })
    } else {
      console.log(`[agent] cancel_backup jobId=${msg.jobId} runId=${job.runId} — aborting`)
      job.cancelled = true
      job.ctrl.abort()
      send({ type: 'backup_cancelled', jobId: msg.jobId, runId: job.runId, reason: 'user_requested' })
    }

  } else if (msg.type === 'verify_repo') {
    void verifyRepo(msg.repoId, msg.repoUrl, msg.repoPassword, msg.readData, msg.envVars)

  } else if (msg.type === 'run_compose_backup') {
    void (async () => {
      const { runComposeBackup } = await import('./handlers/composeBackup')
      await runComposeBackup(msg, send, activeJobs, BINARY, ensureRepoInitialized)
    })()

  } else if (msg.type === 'run_compose_restore') {
    void (async () => {
      const { runComposeRestore } = await import('./handlers/composeRestore')
      await runComposeRestore(msg, send, activeJobs, BINARY)
    })()

  } else if (msg.type === 'mount_repository') {
    void runMountRepository(msg, send)

  } else if (msg.type === 'run_verification') {
    void (async () => {
      const { runVerificationHandler } = await import('./handlers/runVerification')
      await runVerificationHandler(msg, send, BINARY)
    })()

  } else if (msg.type === 'list_compose_project') {
    void (async () => {
      try {
        const { handleListCompose } = await import('./handlers/listCompose')
        const project = await handleListCompose(msg.projectName)
        send({ type: 'compose_project_listing', requestId: msg.requestId, project })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        console.error('[agent] list_compose_project failed:', error)
        send({ type: 'compose_project_listing', requestId: msg.requestId, project: { name: msg.projectName, services: [] } })
      }
    })()
  }
}

async function runBackup(jobId: string, runId: string, config: BackupJobConfig, bandwidthLimitKbps?: number | null): Promise<void> {
  if (activeJobs.has(jobId)) {
    console.warn(`[agent] Job ${jobId} already running — ignoring duplicate dispatch`)
    return
  }

  const ctrl = new AbortController()
  activeJobs.set(jobId, { ctrl, runId, phase: 'starting', lastResticEventAt: Date.now(), cancelled: false })

  const paths   = applyHostPrefixAll(config.paths,   HOST_PREFIX)
  const exclude = config.exclude ? applyHostPrefixAll(config.exclude, HOST_PREFIX) : config.exclude

  send({ type: 'backup_start', jobId, config })
  console.log(`[agent] Starting backup for job ${jobId} — paths: ${paths.join(', ')}`)

  let runLog = ''

  try {
    if (!config.repoPassword) {
      throw new Error('runBackup: repoPassword is missing from dispatch payload. Server-side dispatch is broken — check that decryptField(repo.resticPassword) is being included in the WS message.')
    }

    const engine = new ResticEngine({
      repositoryUrl:      config.repoUrl,
      password:           config.repoPassword,
      envVars:            config.envVars ?? {},
      binaryPath:         BINARY,
      bandwidthLimitKbps: bandwidthLimitKbps ?? undefined,
    })

    await ensureRepoInitialized(engine, config.repoId)

    const result = await engine.backup({
      paths,
      exclude,
      tags:    config.tags,
      signal:  ctrl.signal,
      onProgress: (s) => {
        const active = activeJobs.get(jobId)
        if (active) {
          active.phase = 'uploading'
          active.lastResticEventAt = Date.now()
        }
        send({
          type:             'backup_progress',
          jobId,
          pct:              s.pct,
          filesProcessed:   s.filesDone,
          bytesProcessed:   s.bytesDone,
          filesTotal:       s.filesTotal,
          bytesTotal:       s.bytesTotal,
          secondsRemaining: s.secondsRemaining,
        })
      },
    })

    runLog = result.log

    send({
      type:       'backup_complete',
      jobId,
      snapshotId: result.snapshotId,
      log:        result.log,
      stats: {
        filesNew:            result.filesNew,
        filesChanged:        result.filesChanged,
        filesUnmodified:     result.filesUnmodified,
        dataAdded:           result.dataAdded,
        totalFilesProcessed: result.filesNew + result.filesChanged + result.filesUnmodified,
        totalBytesProcessed: result.totalSize ?? 0,
        durationMs:          result.duration  ?? 0,
      },
    })
    console.log(`[agent] Backup complete — snapshot ${result.snapshotId}`)

  } catch (err) {
    if (ctrl.signal.aborted) {
      console.log(`[agent] Backup for job ${jobId} exited due to cancel signal — skipping backup_failed`)
    } else {
      const error  = err instanceof Error ? err.message : String(err)
      const detail = err instanceof Error && err.stack ? err.stack : ''
      send({ type: 'backup_failed', jobId, error, detail, log: runLog || undefined })
      console.error(`[agent] Backup failed for job ${jobId}:`, error)
    }

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
      type:            'hello',
      token:           TOKEN,
      hostname:        os.hostname(),
      ip:              getIp(),
      agentVersion:    VERSION,
      protocolVersion: PROTOCOL_VERSION,
      resticVersion:   RESTIC_VERSION || undefined,
      capabilities:    detectedCapabilities,
      bundleHash:      SELF_HASH || undefined,
      platform:        process.platform === 'win32' ? 'windows' : 'linux',
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
