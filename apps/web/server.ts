import { createServer } from 'http'
import { createHash } from 'crypto'
import { startPbsServer } from '@backupos/pbs-server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parse } from 'url'
import type { IncomingMessage } from 'http'
import next from 'next'
import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import { getDb, runMigrations, agents, backupRuns, backupJobs, repositories, restoreRuns, auditLog, backupDefaults, verificationRuns, verificationTests, snapshots, eq, and, desc } from '@backupos/db'
import { ResticEngine } from '@backupos/engine'
import { parseExpression } from 'cron-parser'
import { registerAgent, unregisterAgent, resolveDetect, requestDetect, resolveTestRepo, requestTestRepo, resolveTestMount, requestTestMount, connectedAgentIds, dispatch, requestListCompose, resolveListCompose, resolveMountRepository, resolveFilesystemRestoreStarted, resolveDatabaseRestoreStarted, resolveDatabaseRestoreComplete } from './lib/ws-state'
import { ensureRepoMountedOnAgent } from './lib/repo-mount'
import { loadOrCreateInternalToken } from './lib/internal-token'
import { decryptField } from './lib/repo-crypto'
import { sendAlert } from './lib/alerts'
import { appendLog } from './lib/logger'
import { auth } from './lib/auth'
import type { AgentMessage, ServerMessage, MountConfig } from '@backupos/agent-protocol'

async function requireSession(req: IncomingMessage): Promise<{ userId: string } | null> {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers.set(key, value)
    } else if (Array.isArray(value)) {
      headers.set(key, value.join(', '))
    }
  }
  try {
    const session = await auth.api.getSession({ headers })
    if (!session?.user?.id) return null
    return { userId: session.user.id }
  } catch {
    return null
  }
}

const dev  = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT ?? '3000', 10)

const app    = next({ dev, hostname: '0.0.0.0', port, dir: __dirname })
const handle = app.getRequestHandler()

// Fail fast on missing or placeholder secrets before anything else touches the DB
if (process.env.NODE_ENV === 'production') {
  const REQUIRED = ['BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'ENCRYPTION_KEY']
  const PLACEHOLDERS = ['changeme', 'your-', 'placeholder', 'change_me', 'insecure', 'example']
  for (const key of REQUIRED) {
    const val = process.env[key]
    if (!val) {
      console.error(`[startup] FATAL: ${key} is not set`)
      process.exit(1)
    }
    if (PLACEHOLDERS.some(p => val.toLowerCase().includes(p))) {
      console.error(`[startup] FATAL: ${key} looks like a placeholder — set a real secret`)
      process.exit(1)
    }
  }
}

loadOrCreateInternalToken()
runMigrations()

// Silence the recurring "Failed to find Server Action" noise from stale
// browser tabs across deploys. The action ID changes between builds, so
// every tab open on a previous deploy posts an unknown action every minute.
// We can't fix the client; demote to debug so the journal stays useful.
// See issue #211 for context and the long-term fix (#211 V2).
process.on('unhandledRejection', (err: unknown) => {
  if (
    err instanceof Error &&
    err.message.startsWith('Failed to find Server Action')
  ) {
    // Don't log the full stack — just a debug-level note in case anyone
    // wants to count occurrences with `journalctl -u backupos | grep stale-action`.
    if (process.env['DEBUG_STALE_ACTIONS'] === '1') {
      console.debug(`[stale-action] ${err.message.slice(0, 80)}`)
    }
    return
  }
  // Re-throw — preserves default behavior for any other unhandled rejection
  console.error('[server] unhandledRejection:', err)
})

// The unhandledRejection handler above doesn't catch these errors because
// Next.js logs them via console.error directly without throwing. Override
// console.error to drop messages that match. Capture the original first so
// we can pass everything else through unchanged.
const _origConsoleError = console.error.bind(console)
console.error = (...args: unknown[]) => {
  const first = args[0]
  if (
    first instanceof Error &&
    first.message.startsWith('Failed to find Server Action')
  ) {
    if (process.env['DEBUG_STALE_ACTIONS'] === '1') {
      _origConsoleError(`[stale-action] ${first.message.slice(0, 80)}`)
    }
    return
  }
  // Some Next.js errors come in as plain strings or objects rather than
  // Error instances — also catch the formatted variant just in case.
  if (typeof first === 'string' && first.includes('Failed to find Server Action')) {
    return
  }
  _origConsoleError(...args)
}

// Next.js's handleUnrecognizedFetchAction calls console.warn(err) for stale
// Server Action requests. The previous console.error override didn't catch
// these because they're warn-level, not error-level. See #211 trail.
const _origConsoleWarn = console.warn.bind(console)
console.warn = (...args: unknown[]) => {
  const first = args[0]
  if (
    first instanceof Error &&
    first.message.startsWith('Failed to find Server Action')
  ) {
    if (process.env['DEBUG_STALE_ACTIONS'] === '1') {
      _origConsoleWarn(`[stale-action] ${first.message.slice(0, 80)}`)
    }
    return
  }
  if (typeof first === 'string' && first.includes('Failed to find Server Action')) {
    return
  }
  _origConsoleWarn(...args)
}

function getBundleHash(): string {
  try {
    const buf = readFileSync(join(__dirname, 'public', 'agent', 'bundle.js'))
    return createHash('sha256').update(buf).digest('hex')
  } catch { return '' }
}
const BUNDLE_HASH = getBundleHash()
console.log('[server] bundle hash:', BUNDLE_HASH || '(not found)')

void app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsed = parse(req.url!, true)

    // Handle agent-detect directly so it shares the same ws-state singleton as the WS handler
    const forceUpdateMatch = parsed.pathname?.match(/^\/api\/agents\/([^/]+)\/force-update$/)
    if (req.method === 'POST' && forceUpdateMatch) {
      void (async () => {
        const session = await requireSession(req)
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'unauthorized' }))
          return
        }
        const agentId = forceUpdateMatch[1]!
        console.log('[force-update] requested agentId=%s connected=%s all=%j', agentId, connectedAgentIds().includes(agentId), connectedAgentIds())
        const sent = dispatch(agentId, { type: 'force_update' })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(sent ? { ok: true } : { ok: false, error: 'Agent not connected' }))
      })()
      return
    }

    const detectMatch = parsed.pathname?.match(/^\/api\/agents\/([^/]+)\/detect$/)
    if (req.method === 'POST' && detectMatch) {
      void (async () => {
        const session = await requireSession(req)
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'unauthorized' }))
          return
        }
        const agentId = detectMatch[1]!
        console.log('[detect] request agentId=%s connected=%s', agentId, connectedAgentIds().includes(agentId), 'all:', connectedAgentIds())
        requestDetect(agentId)
          .then(resources => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(resources))
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : 'Detection failed'
            res.writeHead(503, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: message }))
          })
      })()
      return
    }

    const listComposeMatch = parsed.pathname?.match(/^\/api\/agents\/([^/]+)\/list-compose$/)
    if (req.method === 'POST' && listComposeMatch) {
      void (async () => {
        const session = await requireSession(req)
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'unauthorized' }))
          return
        }
        const agentId2 = listComposeMatch[1]!
        let body: { projectName?: string } = {}
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          body = JSON.parse(Buffer.concat(chunks).toString()) as { projectName?: string }
        } catch { /* ignore */ }
        if (!body.projectName) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'projectName required' }))
          return
        }
        requestListCompose(agentId2, body.projectName)
          .then(project => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(project))
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : 'List compose failed'
            res.writeHead(503, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: message }))
          })
      })()
      return
    }

    // Test repo connection via agent
    const testRepoMatch = parsed.pathname?.match(/^\/api\/repos\/([^/]+)\/test$/)
    if (req.method === 'POST' && testRepoMatch) {
      void (async () => {
        const session = await requireSession(req)
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'unauthorized' }))
          return
        }
        const repoId = testRepoMatch[1]!
        const db2 = getDb()
        const [repo] = await db2.select().from(repositories).where(eq(repositories.id, repoId)).limit(1)
        if (!repo) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Repository not found' })); return }
        const jobs2 = await db2.select({ agentId: backupJobs.agentId }).from(backupJobs).where(eq(backupJobs.repositoryId, repoId)).all()
        const connected = connectedAgentIds()
        // Prefer an agent already linked to this repo; fall back to any connected agent
        const agentId = jobs2.map(j => j.agentId).find(aid => aid && connected.includes(aid))
          ?? connected[0]
          ?? null
        if (!agentId) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'No connected agent. Install the BackupOS agent on a machine that can reach the NAS, then try again.' })); return }
        const repoCfg = JSON.parse(decryptField(repo.config)) as Record<string, string>
        requestTestRepo(agentId, repoCfg['repositoryUrl'] ?? '', decryptField(repo.resticPassword), repoCfg)
          .then(result => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result)) })
          .catch((err: unknown) => { const msg = err instanceof Error ? err.message : 'Test failed'; res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: msg })) })
      })()
      return
    }

    // Test mount with raw config (no repo saved yet — used from the new-repo form)
    if (req.method === 'POST' && parsed.pathname === '/api/mount/test') {
      void (async () => {
        const session = await requireSession(req)
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'unauthorized' }))
          return
        }
        let body: { mountConfig?: MountConfig } = {}
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          body = JSON.parse(Buffer.concat(chunks).toString()) as { mountConfig?: MountConfig }
        } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })); return }
        if (!body.mountConfig) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'mountConfig required' })); return }
        const agentId = connectedAgentIds()[0] ?? null
        if (!agentId) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'No connected agent' })); return }
        requestTestMount(agentId, body.mountConfig)
          .then(result => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result)) })
          .catch((err: unknown) => { const msg = err instanceof Error ? err.message : 'Mount test failed'; res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: msg })) })
      })()
      return
    }

    // Test NAS mount via agent
    const testMountMatch = parsed.pathname?.match(/^\/api\/repos\/([^/]+)\/test-mount$/)
    if (req.method === 'POST' && testMountMatch) {
      void (async () => {
        const session = await requireSession(req)
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'unauthorized' }))
          return
        }
        const repoId = testMountMatch[1]!
        const db2 = getDb()
        const [repo] = await db2.select().from(repositories).where(eq(repositories.id, repoId)).limit(1)
        if (!repo) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Repository not found' })); return }
        const cfg = JSON.parse(decryptField(repo.config)) as Record<string, string>
        if (!cfg['mountConfig']) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Repository has no mount config' })); return }
        const connected = connectedAgentIds()
        const jobs2 = await db2.select({ agentId: backupJobs.agentId }).from(backupJobs).where(eq(backupJobs.repositoryId, repoId)).all()
        const agentId = jobs2.map(j => j.agentId).find(aid => aid && connected.includes(aid)) ?? connected[0] ?? null
        if (!agentId) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'No connected agent. Connect a BackupOS agent first.' })); return }
        const mountConfig = JSON.parse(cfg['mountConfig']) as MountConfig
        requestTestMount(agentId, mountConfig)
          .then(result => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result)) })
          .catch((err: unknown) => { const msg = err instanceof Error ? err.message : 'Mount test failed'; res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: msg })) })
      })()
      return
    }

    // Internal dispatch bridge — server actions call this to reach the real connections Map
    if (req.method === 'POST' && parsed.pathname === '/internal/dispatch') {
      void (async () => {
        const auth = req.headers['x-internal-token']
        if (auth !== process.env['BACKUPOS_INTERNAL_TOKEN']) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, reason: 'unauthorized' }))
          return
        }
        let body: { agentId?: string; message?: unknown } = {}
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          body = JSON.parse(Buffer.concat(chunks).toString()) as { agentId?: string; message?: unknown }
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, reason: 'invalid_json' }))
          return
        }
        const { agentId, message } = body
        if (!agentId || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, reason: 'agentId and message required' }))
          return
        }
        const sent = dispatch(agentId, message as Parameters<typeof dispatch>[1])
        if (!sent) {
          res.writeHead(503, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, reason: 'agent_not_connected', knownIds: connectedAgentIds() }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      })()
      return
    }

    // Cancel a run by runId
    const cancelRunMatch = parsed.pathname?.match(/^\/api\/runs\/([^/]+)\/cancel$/)
    if (req.method === 'POST' && cancelRunMatch) {
      void (async () => {
        const session = await requireSession(req)
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'unauthorized' }))
          return
        }
        const runId = cancelRunMatch[1]!
        const db2   = getDb()
        const [run] = await db2.select().from(backupRuns).where(eq(backupRuns.id, runId)).limit(1)
        if (!run || run.status !== 'running') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, note: 'run not active' }))
          return
        }
        if (run.agentId) {
          const sent = dispatch(run.agentId, { type: 'cancel_backup', jobId: run.jobId!, runId: run.id })
          if (!sent) {
            await db2.update(backupRuns).set({ status: 'cancelled', completedAt: new Date(), errorMessage: 'cancel: agent unreachable' }).where(eq(backupRuns.id, runId))
          }
        } else {
          await db2.update(backupRuns).set({ status: 'cancelled', completedAt: new Date() }).where(eq(backupRuns.id, runId))
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      })()
      return
    }

    // Repository init-state — used by agent to check/set initializedAt (Fix A)
    if (req.method === 'GET' && /^\/internal\/repository\/[^/]+\/state$/.test(parsed.pathname ?? '')) {
      void (async () => {
        const agentToken = req.headers['x-agent-token'] as string | undefined
        if (!agentToken) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'missing x-agent-token' })); return }
        const db = getDb()
        const [agentRow] = await db.select().from(agents).where(eq(agents.publicKey, agentToken)).limit(1)
        if (!agentRow) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid token' })); return }
        const repoId = (parsed.pathname ?? '').split('/')[3]!
        const [repo] = await db.select({ initializedAt: repositories.initializedAt }).from(repositories).where(eq(repositories.id, repoId)).limit(1)
        if (!repo) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'repository not found' })); return }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ initializedAt: repo.initializedAt ? repo.initializedAt.getTime() : null }))
      })()
      return
    }

    if (req.method === 'POST' && /^\/internal\/repository\/[^/]+\/initialized$/.test(parsed.pathname ?? '')) {
      void (async () => {
        const agentToken = req.headers['x-agent-token'] as string | undefined
        if (!agentToken) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'missing x-agent-token' })); return }
        const db = getDb()
        const [agentRow] = await db.select().from(agents).where(eq(agents.publicKey, agentToken)).limit(1)
        if (!agentRow) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid token' })); return }
        const repoId = (parsed.pathname ?? '').split('/')[3]!
        await db.update(repositories).set({ initializedAt: new Date() }).where(eq(repositories.id, repoId))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      })()
      return
    }

    void handle(req, res, parsed)
  })

  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url ?? '/')
    if (pathname === '/ws/agent') {
      wss.handleUpgrade(req, socket as never, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    } else {
      socket.destroy()
    }
  })

  wss.on('connection', (ws: WebSocket) => {
    let agentId: string | null = null
    const db = getDb()

    ws.on('message', (raw) => {
      void (async () => {
        let msg: AgentMessage
        try { msg = JSON.parse(raw.toString()) as AgentMessage }
        catch { return }

        if (msg.type === 'hello') {
          const [agent] = await db
            .select()
            .from(agents)
            .where(eq(agents.publicKey, msg.token))
            .limit(1)

          if (!agent) { ws.close(4001, 'Unauthorized'); return }

          agentId = agent.id
          registerAgent(agentId, ws)

          const osInfo = msg.osInfo as { os?: string; arch?: string; kernel?: string } | undefined
          await db.update(agents).set({
            status:       'connected',
            lastSeenAt:   new Date(),
            ...(msg.hostname     ? { hostname:     msg.hostname }           : {}),
            ...(msg.ip           ? { ip:           msg.ip }                 : {}),
            ...(msg.platform     ? { platform:     msg.platform }           : {}),
            ...(msg.agentVersion    ? { agentVersion:    msg.agentVersion }                      : {}),
            ...(msg.protocolVersion ? { protocolVersion: msg.protocolVersion }                  : {}),
            ...(msg.resticVersion   ? { resticVersion:   msg.resticVersion }                    : {}),
            ...(msg.capabilities    ? { capabilities:    JSON.stringify(msg.capabilities) }     : {}),
            ...(osInfo?.arch     ? { arch:         osInfo.arch }            : {}),
            ...(osInfo           ? { osInfo:       JSON.stringify(osInfo) } : {}),
          }).where(eq(agents.id, agentId))

          const welcome: ServerMessage = { type: 'welcome', agentId, serverVersion: '0.1.0', bundleHash: BUNDLE_HASH || undefined }
          ws.send(JSON.stringify(welcome))

          if (msg.bundleHash && BUNDLE_HASH && msg.bundleHash !== BUNDLE_HASH) {
            console.log(`[server] Agent ${agentId} bundle mismatch — sending force_update`)
            ws.send(JSON.stringify({ type: 'force_update' } satisfies ServerMessage))
            try { appendLog({ level: 'info', component: 'agent', message: `Agent ${agentId} bundle mismatch — force update sent`, entityType: 'agent', entityId: agentId }) } catch (err) { console.error('[logger]', err) }
          }

          // Auto-detect capabilities on every connect so the UI is always up to date
          const detectReqId = crypto.randomUUID()
          ws.send(JSON.stringify({ type: 'list_resources', requestId: detectReqId }))
          requestDetect(agentId).then(async (resources) => {
            const r = resources as { vssAvailable?: boolean; hypervisorDriver?: boolean; appHooksAvailable?: boolean }
            await db.update(agents).set({
              ...(r.vssAvailable      != null ? { vssAvailable:      r.vssAvailable }      : {}),
              ...(r.hypervisorDriver  != null ? { hypervisorDriver:  r.hypervisorDriver }  : {}),
              ...(r.appHooksAvailable != null ? { appHooksAvailable: r.appHooksAvailable } : {}),
            }).where(eq(agents.id, agentId!))
          }).catch(() => { /* best-effort */ })

          // Auto-mount NFS repos this agent owns jobs for, so restic commands
          // (restore, ad-hoc list, etc) succeed without waiting for a backup run
          // to re-establish the mount. See issue #207.
          void (async () => {
            try {
              const repoRows = await db.select({ repositoryId: backupJobs.repositoryId })
                .from(backupJobs).where(eq(backupJobs.agentId, agentId)).all()
              const uniqueRepoIds = [...new Set(repoRows.map(r => r.repositoryId).filter((r): r is string => !!r))]
              for (const repoId of uniqueRepoIds) {
                try {
                  await ensureRepoMountedOnAgent(agentId, repoId)
                } catch (err) {
                  console.warn(`[server] auto-mount failed for agent=${agentId} repo=${repoId}: ${err instanceof Error ? err.message : String(err)}`)
                }
              }
              if (uniqueRepoIds.length > 0) {
                console.log(`[server] auto-mounted ${uniqueRepoIds.length} repo(s) on agent ${agentId}`)
              }
            } catch (err) {
              console.error('[server] auto-mount block failed:', err instanceof Error ? err.message : err)
            }
          })()

          await db.insert(auditLog).values({
            id: crypto.randomUUID(), action: 'agent_connected',
            resourceType: 'agent', resourceId: agentId,
            actor: agentId, createdAt: new Date(),
          })
          try { appendLog({ level: 'info', component: 'agent', message: `Agent ${msg.hostname ?? agentId} connected`, entityType: 'agent', entityId: agentId, payload: { ip: msg.ip, agentVersion: msg.agentVersion, protocolVersion: msg.protocolVersion } }) } catch (err) { console.error('[logger]', err) }

        } else if (msg.type === 'ping') {
          if (agentId) {
            await db.update(agents).set({ lastSeenAt: new Date() }).where(eq(agents.id, agentId))
          }
          const pong: ServerMessage = { type: 'pong' }
          ws.send(JSON.stringify(pong))

        } else if (msg.type === 'metrics' && agentId) {
          const m = (msg.metrics ?? {}) as {
            cpuPercent?: number; memUsedBytes?: number
            diskReadBps?: number; diskWriteBps?: number
          }
          const [cur] = await db.select({ resourceHistory: agents.resourceHistory })
            .from(agents).where(eq(agents.id, agentId)).limit(1)
          const history: Array<{ ts: number; cpuPct: number; ramBytes: number }> =
            JSON.parse(cur?.resourceHistory ?? '[]')
          history.push({ ts: Date.now(), cpuPct: m.cpuPercent ?? 0, ramBytes: m.memUsedBytes ?? 0 })
          if (history.length > 288) history.splice(0, history.length - 288)
          await db.update(agents).set({
            lastSeenAt:      new Date(),
            cpuPct:          m.cpuPercent  ?? null,
            ramBytes:        m.memUsedBytes ?? null,
            diskReadBps:     m.diskReadBps  ?? null,
            diskWriteBps:    m.diskWriteBps ?? null,
            resourceHistory: JSON.stringify(history),
          }).where(eq(agents.id, agentId))

        } else if (msg.type === 'backup_start' && agentId) {
          await db.insert(auditLog).values({
            id: crypto.randomUUID(), action: 'backup_started',
            resourceType: 'backup_job', resourceId: msg.jobId,
            actor: agentId, createdAt: new Date(),
          })

        } else if (msg.type === 'backup_progress' && agentId) {
          await db.update(backupRuns).set({
            progressPct: msg.pct,
            bytesDone:   msg.bytesProcessed,
            bytesTotal:  msg.bytesTotal,
            filesDone:   msg.filesProcessed,
            filesTotal:  msg.filesTotal,
          }).where(and(eq(backupRuns.jobId, msg.jobId), eq(backupRuns.status, 'running')))

        } else if (msg.type === 'backup_complete' && agentId) {
          const [run] = await db.select().from(backupRuns)
            .where(and(eq(backupRuns.jobId, msg.jobId), eq(backupRuns.status, 'running')))
            .orderBy(desc(backupRuns.startedAt)).limit(1)
          if (!run) return

          await db.update(backupRuns).set({
            status: 'success', completedAt: new Date(),
            log:             msg.log ?? null,
            snapshotId:      msg.snapshotId,
            snapshotIds:     msg.snapshotIds ? JSON.stringify(msg.snapshotIds) : null,
            filesNew:        msg.stats.filesNew,
            filesChanged:    msg.stats.filesChanged,
            filesUnmodified: msg.stats.filesUnmodified,
            dataAdded:       msg.stats.dataAdded,
            totalSize:       msg.stats.totalBytesProcessed,
            duration:        msg.stats.durationMs,
          }).where(eq(backupRuns.id, run.id))
          const [jobForNext] = await db.select({ schedule: backupJobs.schedule, name: backupJobs.name })
            .from(backupJobs).where(eq(backupJobs.id, msg.jobId)).limit(1)
          const jobLabel = jobForNext?.name ?? msg.jobId
          try { appendLog({ level: 'info', component: 'web', message: `Backup succeeded for job "${jobLabel}"`, entityType: 'job', entityId: msg.jobId, payload: { runId: run.id, snapshotId: msg.snapshotId, durationMs: msg.stats.durationMs, sizeBytes: msg.stats.totalBytesProcessed } }) } catch (err) { console.error('[logger]', err) }
          let nextRunAt: Date | undefined
          try { nextRunAt = parseExpression(jobForNext?.schedule ?? '', { tz: 'UTC' }).next().toDate() } catch { /* invalid cron */ }
          await db.update(backupJobs).set({ lastRunAt: new Date(), lastRunStatus: 'success', ...(nextRunAt ? { nextRunAt } : {}) })
            .where(eq(backupJobs.id, msg.jobId))

          await db.insert(auditLog).values({
            id: crypto.randomUUID(), action: 'backup_completed',
            resourceType: 'backup_run', resourceId: run.id,
            actor: agentId, detail: JSON.stringify({ snapshotId: msg.snapshotId }),
            createdAt: new Date(),
          })

          // Populate snapshots table
          if (msg.snapshotId && run.repositoryId) {
            try {
              const [snapJob] = await db.select({ sourceType: backupJobs.sourceType, sourceConfig: backupJobs.sourceConfig })
                .from(backupJobs).where(eq(backupJobs.id, msg.jobId)).limit(1)
              const [snapAgent] = await db.select({ hostname: agents.hostname })
                .from(agents).where(eq(agents.id, agentId)).limit(1)
              let paths: string | null = null
              if (snapJob?.sourceConfig) {
                try {
                  const cfg = JSON.parse(snapJob.sourceConfig) as { paths?: string[]; volumes?: string[] }
                  if (snapJob.sourceType === 'docker_volume') {
                    paths = JSON.stringify((cfg.volumes ?? []).map(v => `/var/lib/docker/volumes/${v}/_data`))
                  } else if (snapJob.sourceType !== 'compose_project') {
                    paths = JSON.stringify(cfg.paths ?? [])
                  }
                } catch { /* paths stays null */ }
              }
              await db.insert(snapshots).values({
                id:           msg.snapshotId,
                repositoryId: run.repositoryId,
                jobId:        msg.jobId,
                hostname:     snapAgent?.hostname ?? null,
                paths,
                tags:         null,
                sizeBytes:    msg.stats.totalBytesProcessed > 0 ? msg.stats.totalBytesProcessed : null,
                createdAt:    new Date(),
              }).onConflictDoNothing()
            } catch (err) {
              console.error('[server] snapshot insert failed:', err instanceof Error ? err.message : err)
            }
          }

          // Run forget/prune using the job's retention policy (falls back to global defaults)
          void (async () => {
            try {
              const [job] = await db.select().from(backupJobs)
                .where(eq(backupJobs.id, msg.jobId)).limit(1)
              if (!job?.repositoryId) return

              const jobHasRetention = job.keepLast || job.keepDaily || job.keepWeekly || job.keepMonthly || job.keepYearly
              let policy: { keepLast?: number; keepDaily?: number; keepWeekly?: number; keepMonthly?: number; keepYearly?: number; keepTags?: string[] } | null = null

              if (jobHasRetention) {
                policy = {
                  keepLast:    job.keepLast    ?? undefined,
                  keepDaily:   job.keepDaily   ?? undefined,
                  keepWeekly:  job.keepWeekly  ?? undefined,
                  keepMonthly: job.keepMonthly ?? undefined,
                  keepYearly:  job.keepYearly  ?? undefined,
                }
              } else {
                const [defaults] = await db.select().from(backupDefaults).limit(1).all()
                if (defaults && (defaults.keepLast || defaults.keepDaily || defaults.keepWeekly || defaults.keepMonthly || defaults.keepYearly)) {
                  policy = {
                    keepLast:    defaults.keepLast    ?? undefined,
                    keepDaily:   defaults.keepDaily   ?? undefined,
                    keepWeekly:  defaults.keepWeekly  ?? undefined,
                    keepMonthly: defaults.keepMonthly ?? undefined,
                    keepYearly:  defaults.keepYearly  ?? undefined,
                  }
                }
              }

              if (!policy) return

              const [repo] = await db.select().from(repositories)
                .where(eq(repositories.id, job.repositoryId)).limit(1)
              if (!repo) return

              const repoCfg = JSON.parse(decryptField(repo.config)) as Record<string, string>
              const engine = new ResticEngine({
                repositoryUrl: repoCfg['repositoryUrl'] ?? '',
                password:      decryptField(repo.resticPassword),
                envVars:       repoCfg,
                binaryPath:    process.env['RESTIC_BINARY_PATH'],
              })

              const tags = job.tags ? (JSON.parse(job.tags) as string[]) : [`job:${job.id}`]
              const forget = await engine.forget({ ...policy, keepTags: tags })

              await db.update(backupRuns).set({
                snapshotsRemoved: forget.removed,
                snapshotsKept:    forget.kept,
              }).where(eq(backupRuns.id, run.id))
            } catch (err) {
              console.error('[server] forget/prune failed for job', msg.jobId, err)
            }
          })()

        } else if (msg.type === 'backup_failed' && agentId) {
          const [run] = await db.select().from(backupRuns)
            .where(and(eq(backupRuns.jobId, msg.jobId), eq(backupRuns.status, 'running')))
            .orderBy(desc(backupRuns.startedAt)).limit(1)
          if (!run) return

          await db.update(backupRuns).set({
            status: 'failed', completedAt: new Date(),
            log:          msg.log ?? null,
            errorMessage: msg.error, errorDetail: msg.detail,
          }).where(eq(backupRuns.id, run.id))
          const [failedJob] = await db.select({ name: backupJobs.name })
            .from(backupJobs).where(eq(backupJobs.id, msg.jobId)).limit(1)
          const failedJobLabel = failedJob?.name ?? msg.jobId
          try { appendLog({ level: 'error', component: 'web', message: `Backup failed for job "${failedJobLabel}": ${msg.error}`, entityType: 'job', entityId: msg.jobId, payload: { runId: run.id, errorMessage: msg.error } }) } catch (err) { console.error('[logger]', err) }

          await db.update(backupJobs).set({ lastRunAt: new Date(), lastRunStatus: 'failed' })
            .where(eq(backupJobs.id, msg.jobId))

          await db.insert(auditLog).values({
            id: crypto.randomUUID(), action: 'backup_failed',
            resourceType: 'backup_run', resourceId: run.id,
            actor: agentId, detail: JSON.stringify({ error: msg.error }),
            createdAt: new Date(),
          })

          const [job] = await db.select({ name: backupJobs.name }).from(backupJobs)
            .where(eq(backupJobs.id, msg.jobId)).limit(1)
          await sendAlert('backup_failed', { jobId: msg.jobId, jobName: job?.name ?? 'unknown', error: msg.error })

        } else if (msg.type === 'backup_cancelled' && agentId) {
          await db.update(backupRuns).set({
            status:       'cancelled',
            completedAt:  new Date(),
            errorMessage: msg.reason === 'user_requested' ? null : `cancel: ${msg.reason}`,
          }).where(and(eq(backupRuns.id, msg.runId), eq(backupRuns.status, 'running')))
          console.log(`[server] backup_cancelled jobId=${msg.jobId} runId=${msg.runId} reason=${msg.reason}`)

        } else if (msg.type === 'backup_heartbeat' && agentId) {
          await db.update(backupRuns).set({
            lastHeartbeatAt: new Date(),
            phase:           msg.phase,
          }).where(eq(backupRuns.id, msg.runId))

        } else if (msg.type === 'resources_result') {
          console.log('[detect] resources_result requestId=%s resources=%j', msg.requestId, msg.resources)
          resolveDetect(msg.requestId, msg.resources)
          if (agentId && msg.resources) {
            const r = msg.resources as { vssAvailable?: boolean; hypervisorDriver?: boolean; appHooksAvailable?: boolean }
            await db.update(agents).set({
              ...(r.vssAvailable      != null ? { vssAvailable:      r.vssAvailable }      : {}),
              ...(r.hypervisorDriver  != null ? { hypervisorDriver:  r.hypervisorDriver }  : {}),
              ...(r.appHooksAvailable != null ? { appHooksAvailable: r.appHooksAvailable } : {}),
            }).where(eq(agents.id, agentId))
          }

        } else if (msg.type === 'test_repo_result') {
          resolveTestRepo(msg.requestId, { ok: msg.ok, error: msg.error, snapshotCount: msg.snapshotCount })

        } else if (msg.type === 'test_mount_result') {
          resolveTestMount(msg.requestId, { ok: msg.ok, error: msg.error })

        } else if (msg.type === 'mount_complete') {
          resolveMountRepository(msg.requestId)

        } else if (msg.type === 'mount_failed') {
          resolveMountRepository(msg.requestId, msg.error)

        } else if (msg.type === 'compose_project_listing') {
          resolveListCompose(msg.requestId, msg.project)

        } else if (msg.type === 'verification_progress' && agentId) {
          console.log(`[verify] ${msg.verificationRunId} — ${msg.step}`)

        } else if (msg.type === 'verification_complete' && agentId) {
          const outcome = msg.success ? 'passed' : 'failed'
          await db.update(verificationRuns).set({
            status:       outcome,
            completedAt:  new Date(),
            log:          msg.log || null,
            errorMessage: msg.errorMessage ?? null,
          }).where(eq(verificationRuns.id, msg.verificationRunId))

          const [run] = await db.select({ testId: verificationRuns.testId })
            .from(verificationRuns).where(eq(verificationRuns.id, msg.verificationRunId)).limit(1)
          if (run?.testId) {
            await db.update(verificationTests)
              .set({ lastResult: outcome })
              .where(eq(verificationTests.id, run.testId))
          }
          console.log(`[verify] ${msg.verificationRunId} — ${outcome}`)
          try { appendLog({ level: msg.success ? 'info' : 'error', component: 'web', message: `Verification ${outcome} for run ${msg.verificationRunId}`, entityType: 'job', entityId: run?.testId ?? undefined, payload: { verificationRunId: msg.verificationRunId, ...(msg.errorMessage ? { errorMessage: msg.errorMessage } : {}) } }) } catch (err) { console.error('[logger]', err) }

        } else if (msg.type === 'restore_complete' && agentId) {
          await db.update(restoreRuns).set({
            status:      msg.success ? 'success' : 'failed',
            completedAt: new Date(),
          }).where(eq(restoreRuns.id, msg.restoreId))
          try { appendLog({ level: msg.success ? 'info' : 'error', component: 'web', message: msg.success ? 'Restore succeeded' : 'Restore failed', entityType: 'restore_run', entityId: msg.restoreId }) } catch (err) { console.error('[logger]', err) }

          await db.insert(auditLog).values({
            id: crypto.randomUUID(),
            action: msg.success ? 'restore_completed' : 'restore_failed',
            resourceType: 'restore_run', resourceId: msg.restoreId,
            actor: agentId, createdAt: new Date(),
          })

        } else if (msg.type === 'filesystem_restore_cancelled' && agentId) {
          console.log(`[restore] filesystem_restore_cancelled restoreId=${msg.restoreId} agentId=${agentId} reason=${msg.reason}`)
          await db.update(restoreRuns).set({
            status:      'cancelled',
            completedAt: new Date(),
            log:         JSON.stringify({ cancelled: true, reason: msg.reason }),
          }).where(eq(restoreRuns.id, msg.restoreId))
          try { appendLog({ level: 'info', component: 'web', message: `Filesystem restore cancelled (${msg.reason})`, entityType: 'restore_run', entityId: msg.restoreId }) } catch (err) { console.error('[logger]', err) }

        } else if (msg.type === 'database_restore_started') {
          console.log(`[restore] database_restore_started restoreId=${msg.restoreId}`)
          resolveDatabaseRestoreStarted(msg.requestId)

        } else if (msg.type === 'database_restore_complete' && agentId) {
          console.log(`[restore] database_restore_complete restoreId=${msg.restoreId} success=${msg.success}`)
          resolveDatabaseRestoreComplete(msg.restoreId, {
            success:     msg.success,
            output:      msg.output,
            error:       msg.error,
            durationSec: msg.durationSec,
          })

        } else if (msg.type === 'filesystem_restore_started' && agentId) {
          console.log(`[restore] filesystem_restore_started restoreId=${msg.restoreId} agentId=${agentId}`)
          resolveFilesystemRestoreStarted(msg.requestId)

        } else if (msg.type === 'filesystem_restore_complete' && agentId) {
          await db.update(restoreRuns).set({
            status:      msg.success ? 'success' : 'failed',
            completedAt: new Date(),
            log:         JSON.stringify({
              ...(msg.filesRestored != null ? { filesRestored: msg.filesRestored } : {}),
              ...(msg.durationSec   != null ? { durationSec:   msg.durationSec   } : {}),
              ...(msg.error         != null ? { error:         msg.error         } : {}),
              ...(msg.targetPath    != null ? { targetPath:    msg.targetPath    } : {}),
              ...(msg.sourcePath    != null ? { sourcePath:    msg.sourcePath    } : {}),
            }),
          }).where(eq(restoreRuns.id, msg.restoreId))
          try { appendLog({ level: msg.success ? 'info' : 'error', component: 'web', message: msg.success ? 'Filesystem restore succeeded' : `Filesystem restore failed: ${msg.error ?? ''}`, entityType: 'restore_run', entityId: msg.restoreId }) } catch (err) { console.error('[logger]', err) }
          await db.insert(auditLog).values({
            id: crypto.randomUUID(),
            action: msg.success ? 'restore_completed' : 'restore_failed',
            resourceType: 'restore_run', resourceId: msg.restoreId,
            actor: agentId, createdAt: new Date(),
          })
        }
      })()
    })

    ws.on('close', () => {
      void (async () => {
        if (agentId) {
          unregisterAgent(agentId)
          await db.update(agents).set({ status: 'disconnected' }).where(eq(agents.id, agentId))
          // Immediately fail any runs in-flight on this agent
          await db.update(backupRuns).set({
            status: 'failed', completedAt: new Date(),
            errorMessage: 'agent disconnected mid-run',
          }).where(and(eq(backupRuns.agentId, agentId), eq(backupRuns.status, 'running')))
          await db.insert(auditLog).values({
            id: crypto.randomUUID(), action: 'agent_disconnected',
            resourceType: 'agent', resourceId: agentId,
            actor: 'system', createdAt: new Date(),
          })
          const [disconnectedAgent] = await db.select({ hostname: agents.hostname })
            .from(agents).where(eq(agents.id, agentId)).limit(1)
          const agentLabel = disconnectedAgent?.hostname ?? agentId
          try { appendLog({ level: 'info', component: 'agent', message: `Agent ${agentLabel} disconnected`, entityType: 'agent', entityId: agentId }) } catch (err) { console.error('[logger]', err) }
        }
      })()
    })
  })

  server.listen(port, '0.0.0.0', () => {
    console.log(`> Ready on http://0.0.0.0:${port}`)
    void import('./lib/scheduler').then(({ initScheduler }) => initScheduler())

    // PBS-compatible protocol listener (port 8007).
    // Boots after Next.js. Cert lives in /var/lib/backupos/pbs/ (writable by service user).
    // Version endpoint only in M3a; auth and protocol endpoints land in M3b/M4/M5.
    void (async () => {
      try {
        const pbsHandle = await startPbsServer({
          port: Number(process.env['PBS_PORT'] ?? '8007'),
          host: process.env['PBS_HOST'] ?? '0.0.0.0',
          certPaths: {
            certPath: process.env['PBS_TLS_CERT'] ?? '/var/lib/backupos/pbs/cert.pem',
            keyPath:  process.env['PBS_TLS_KEY']  ?? '/var/lib/backupos/pbs/key.pem',
          },
          log: (msg) => console.log(`[pbs] ${msg}`),
        })
        console.log(`[pbs] cert fingerprint: ${pbsHandle.certFingerprint}`)
      } catch (err) {
        // PBS listener failure must not crash the main app — log and continue.
        console.error(`[pbs] failed to start: ${(err as Error).message}`)
      }
    })()
  })
})
