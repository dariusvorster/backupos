import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import { getDb, agents, eq } from '@backupos/db'
import { registerAgent, unregisterAgent } from './lib/ws-state'
import type { AgentMessage, ServerMessage } from '@backupos/agent-protocol'

const dev  = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT ?? '3000', 10)

const app    = next({ dev, hostname: '0.0.0.0', port })
const handle = app.getRequestHandler()

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

          const welcome: ServerMessage = { type: 'welcome', agentId, serverVersion: '0.1.0' }
          ws.send(JSON.stringify(welcome))

        } else if (msg.type === 'ping') {
          if (agentId) {
            await db.update(agents).set({ lastSeenAt: new Date() }).where(eq(agents.id, agentId))
          }
          const pong: ServerMessage = { type: 'pong' }
          ws.send(JSON.stringify(pong))

        } else if (msg.type === 'metrics' && agentId) {
          await db.update(agents).set({ lastSeenAt: new Date() }).where(eq(agents.id, agentId))
        }
      })()
    })

    ws.on('close', () => {
      void (async () => {
        if (agentId) {
          unregisterAgent(agentId)
          await db.update(agents).set({ status: 'disconnected' }).where(eq(agents.id, agentId))
        }
      })()
    })
  })

  server.listen(port, '0.0.0.0', () => {
    console.log(`> Ready on http://0.0.0.0:${port}`)
  })
})
