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
import { registerAgent, unregisterAgent, resolveDetect } from './lib/ws-state'
import { sendAlert } from './lib/alerts'
import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'

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

runMigrations()

function getBundleHash(): string {
  try {
    const buf = readFileSync(join(__dirname, 'public', 'agent', 'bundle.js'))
    return createHash('sha256').update(buf).digest('hex')
  } catch { return '' }
}
const BUNDLE_HASH = getBundleHash()

void app.prepare().then(() => {
  const server = createServer((req, res) => {
    void handle(req, res, parse(req.url!, true))
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

          await db.update(agents).set({
            status:     'connected',
            lastSeenAt: new Date(),
            ...(msg.hostname ? { hostname: msg.hostname } : {}),
          }).where(eq(agents.id, agentId))

          const welcome: ServerMessage = { type: 'welcome', agentId, serverVersion: '0.1.0', bundleHash: BUNDLE_HASH || undefined }
          ws.send(JSON.stringify(welcome))

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
          await db.update(agents).set({ lastSeenAt: new Date() }).where(eq(agents.id, agentId))

        } else if (msg.type === 'backup_start' && agentId) {
          await db.insert(auditLog).values({
            id: crypto.randomUUID(), action: 'backup_started',
            resourceType: 'backup_job', resourceId: msg.jobId,
            actor: agentId, createdAt: new Date(),
          })

        } else if (msg.type === 'backup_complete' && agentId) {
          const [run] = await db.select().from(backupRuns)
            .where(and(eq(backupRuns.jobId, msg.jobId), eq(backupRuns.status, 'running')))
            .orderBy(desc(backupRuns.startedAt)).limit(1)
          if (!run) return

          await db.update(backupRuns).set({
            status: 'success', completedAt: new Date(),
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

              const repoCfg = JSON.parse(repo.config) as Record<string, string>
              const engine = new ResticEngine({
                repositoryUrl: repoCfg['repositoryUrl'] ?? '',
                password:      repo.resticPassword,
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
          resolveDetect(msg.requestId, msg.resources)

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
