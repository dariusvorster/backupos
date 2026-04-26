import { createServer } from 'http'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import { getDb, runMigrations, agents, backupRuns, backupJobs, repositories, restoreRuns, auditLog, backupDefaults, eq, and, desc } from '@backupos/db'
import { ResticEngine } from '@backupos/engine'
import { parseExpression } from 'cron-parser'
import { registerAgent, unregisterAgent, resolveDetect, requestDetect, resolveTestRepo, requestTestRepo, resolveTestMount, requestTestMount, connectedAgentIds, dispatch } from './lib/ws-state'
import { loadOrCreateInternalToken } from './lib/internal-token'
import { decryptField } from './lib/repo-crypto'
import { sendAlert } from './lib/alerts'
import type { AgentMessage, ServerMessage, MountConfig } from '@backupos/agent-protocol'

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
      const agentId = forceUpdateMatch[1]!
      console.log('[force-update] requested agentId=%s connected=%s all=%j', agentId, connectedAgentIds().includes(agentId), connectedAgentIds())
      const sent = dispatch(agentId, { type: 'force_update' })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(sent ? { ok: true } : { ok: false, error: 'Agent not connected' }))
      return
    }

    const detectMatch = parsed.pathname?.match(/^\/api\/agents\/([^/]+)\/detect$/)
    if (req.method === 'POST' && detectMatch) {
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
      return
    }

    // Test repo connection via agent
    const testRepoMatch = parsed.pathname?.match(/^\/api\/repos\/([^/]+)\/test$/)
    if (req.method === 'POST' && testRepoMatch) {
      const repoId = testRepoMatch[1]!
      void (async () => {
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
      const repoId = testMountMatch[1]!
      void (async () => {
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
            ...(msg.agentVersion ? { agentVersion: msg.agentVersion }       : {}),
            ...(osInfo?.arch     ? { arch:         osInfo.arch }            : {}),
            ...(osInfo           ? { osInfo:       JSON.stringify(osInfo) } : {}),
          }).where(eq(agents.id, agentId))

          const welcome: ServerMessage = { type: 'welcome', agentId, serverVersion: '0.1.0', bundleHash: BUNDLE_HASH || undefined }
          ws.send(JSON.stringify(welcome))

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

          await db.insert(auditLog).values({
            id: crypto.randomUUID(), action: 'agent_connected',
            resourceType: 'agent', resourceId: agentId,
            actor: agentId, createdAt: new Date(),
          })

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
            filesNew:        msg.stats.filesNew,
            filesChanged:    msg.stats.filesChanged,
            filesUnmodified: msg.stats.filesUnmodified,
            dataAdded:       msg.stats.dataAdded,
            totalSize:       msg.stats.totalBytesProcessed,
            duration:        msg.stats.durationSeconds,
          }).where(eq(backupRuns.id, run.id))

          const [jobForNext] = await db.select({ schedule: backupJobs.schedule })
            .from(backupJobs).where(eq(backupJobs.id, msg.jobId)).limit(1)
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

        } else if (msg.type === 'restore_complete' && agentId) {
          await db.update(restoreRuns).set({
            status:      msg.success ? 'success' : 'failed',
            completedAt: new Date(),
          }).where(eq(restoreRuns.id, msg.restoreId))

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
          await db.insert(auditLog).values({
            id: crypto.randomUUID(), action: 'agent_disconnected',
            resourceType: 'agent', resourceId: agentId,
            actor: 'system', createdAt: new Date(),
          })
        }
      })()
    })
  })

  server.listen(port, '0.0.0.0', () => {
    console.log(`> Ready on http://0.0.0.0:${port}`)
    void import('./lib/scheduler').then(({ initScheduler }) => initScheduler())
  })
})
