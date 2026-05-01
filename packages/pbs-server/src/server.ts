// PBS protocol listener.
//
// Architecture:
//   - HTTPS server (HTTP/1.1) on port 8007 handles:
//       GET /api2/json/version  — liveness probe (unauthenticated)
//       'upgrade' event for /api2/json/backup and /api2/json/reader
//   - On each upgrade we: authenticate, validate query params + datastore,
//     create a pbs_active_sessions row, write 101 to the socket, then hand
//     the raw socket to a per-connection http2.Server via the 'connection'
//     event injection pattern.
//   - All H2 streams currently 501-stub (M4c+ adds real endpoints).
//
// Architecture verified against tizbac/pmoxs3backuproxy (Go, GPL-3.0).
// Pattern translated to Node-equivalent APIs; no GPL code copied.
// PBS protocol per public docs. Node 17.4+ required for the connection
// injection pattern (commit 3c99a4d / PR #41185). Running on Node v22+.

import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https'
import { createServer as createH2Server }                                from 'node:http2'
import type { IncomingMessage, ServerResponse }                          from 'node:http'
import type { Socket }                                                   from 'node:net'
import type { AddressInfo }                                              from 'node:net'
import { ensureSelfSignedCert, type CertPaths }                         from './cert'
import { handleVersion }                                                 from './handlers/version'
import { validatePbsAuth, type AuthLookup }                             from './auth'
import { parseUpgradeParams }                                           from './upgrade-params'

const UPGRADE_TOKEN = 'proxmox-backup-protocol-v1'

export interface DatastoreLookup {
  (name: string): Promise<{ id: string; path: string } | null>
}

export interface SessionStore {
  /** Persist a new active session. Returns the session id. */
  create(input: {
    tokenId:     string
    datastoreId: string
    backupType:  string
    backupId:    string
    backupTime:  Date
    state:       'backup' | 'reader'
  }): Promise<string>

  /** Mark a session as finished or aborted when the connection closes. */
  finalize(sessionId: string, state: 'finished' | 'aborted'): Promise<void>
}

export interface StartPbsServerOptions {
  port?:            number
  host?:            string
  certPaths:        CertPaths
  reportedVersion?: string
  reportedRelease?: string
  log?:             (msg: string) => void
  authLookup?:      AuthLookup
  datastoreLookup?: DatastoreLookup
  sessionStore?:    SessionStore
}

export interface PbsServerHandle {
  stop(): Promise<void>
  certFingerprint: string
  address: { host: string; port: number }
}

export function startPbsServer(opts: StartPbsServerOptions): Promise<PbsServerHandle> {
  const port = opts.port ?? 8007
  const host = opts.host ?? '0.0.0.0'
  const log  = opts.log  ?? ((m: string) => console.log(`[pbs-server] ${m}`))

  const cert = ensureSelfSignedCert(opts.certPaths)

  const server = createHttpsServer({ cert: cert.cert, key: cert.key })

  // HTTP/1.1 requests — only the version probe lives here.
  // Upgrade requests fire a separate 'upgrade' event.
  server.on('request', (_req: IncomingMessage, res: ServerResponse) => {
    const path = _req.url ?? '/'
    if (_req.method === 'GET' && path.startsWith('/api2/json/version')) {
      const body = JSON.stringify(handleVersion({
        version: opts.reportedVersion ?? '4.0.0',
        release: opts.reportedRelease ?? '1',
      }))
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(body)
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })

  // Upgrade handler — validates auth + params + datastore, creates session row,
  // writes 101, hands socket to a per-connection H2 server.
  server.on('upgrade', async (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = req.url ?? '/'

    if (req.headers['upgrade'] !== UPGRADE_TOKEN) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
      socket.destroy()
      return
    }

    let kind: 'backup' | 'reader'
    if (url.startsWith('/api2/json/backup'))      kind = 'backup'
    else if (url.startsWith('/api2/json/reader')) kind = 'reader'
    else {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }

    if (!opts.authLookup) {
      log('upgrade rejected: no authLookup configured')
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n')
      socket.destroy()
      return
    }
    const authResult = await validatePbsAuth(req, opts.authLookup)
    if (!authResult.ok) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    const tokenId = authResult.identity.tokenId

    const paramsResult = parseUpgradeParams(url)
    if (!paramsResult.ok) {
      log(`upgrade rejected: bad params: ${paramsResult.reason}`)
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
      socket.destroy()
      return
    }
    const params = paramsResult.params

    if (!opts.datastoreLookup) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n')
      socket.destroy()
      return
    }
    const ds = await opts.datastoreLookup(params.store)
    if (!ds) {
      log(`upgrade rejected: unknown datastore "${params.store}"`)
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }

    if (!opts.sessionStore) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n')
      socket.destroy()
      return
    }
    let sessionId: string
    try {
      sessionId = await opts.sessionStore.create({
        tokenId,
        datastoreId: ds.id,
        backupType:  params.backupType,
        backupId:    params.backupId,
        backupTime:  params.backupTime,
        state:       kind,
      })
    } catch (e) {
      log(`upgrade failed — session create error: ${(e as Error).message}`)
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n')
      socket.destroy()
      return
    }

    log(`upgrade ${kind} session=${sessionId} store=${params.store} type=${params.backupType} id=${params.backupId}`)

    // Write 101. PBS uses RFC 7230 Upgrade (not h2c) — the client sends a
    // plain H2 connection preface immediately after our \r\n\r\n.
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      `Upgrade: ${UPGRADE_TOKEN}\r\n` +
      'Connection: Upgrade\r\n' +
      '\r\n',
    )

    // Per-connection H2 server. Not TLS — the outer HTTPS server already
    // terminated TLS; this server sees a plain bytestream.
    // Created fresh per upgrade so each session's state lives in a closure.
    const h2Server = createH2Server()

    h2Server.on('stream', (stream, headers) => {
      const streamPath   = (headers[':path']   as string | undefined) ?? '/'
      const streamMethod = (headers[':method'] as string | undefined) ?? 'GET'
      // Stub all post-upgrade endpoints until M4c+.
      stream.respond({ ':status': 501, 'content-type': 'application/json' })
      stream.end(JSON.stringify({
        error: `${streamMethod} ${streamPath.split('?')[0] ?? streamPath} not yet implemented (M4c+)`,
        sessionId,
      }))
    })

    h2Server.on('sessionError', (err) => {
      log(`H2 session error session=${sessionId}: ${err.message}`)
    })

    // Finalize the DB session row when the connection closes for any reason.
    let finalized = false
    const finalize = (state: 'finished' | 'aborted') => {
      if (finalized) return
      finalized = true
      opts.sessionStore!.finalize(sessionId, state).catch((e: Error) =>
        log(`failed to finalize session ${sessionId}: ${e.message}`)
      )
    }

    // Preface-arrival timeout. After we hand the socket to the H2 server we
    // expect the client to send the H2 connection preface (PRI * HTTP/2.0…)
    // promptly. If they never do (e.g. an HTTP/1.1-only client that sent the
    // upgrade headers but can't speak H2), the socket is owned by the H2
    // machinery (socket events are intercepted) but no 'session' event fires,
    // so the pbs_active_sessions row would stay in state='backup' forever.
    //
    // Mirrors Node's own unknownProtocolTimeout (CVE-2021-22883 mitigation),
    // which we can't use because we bypass the unknownProtocol path by
    // overriding alpnProtocol = 'h2' above.
    const PREFACE_TIMEOUT_MS = 30_000
    const prefaceTimer = setTimeout(() => {
      log(`session ${sessionId}: H2 preface not received within ${PREFACE_TIMEOUT_MS}ms — aborting`)
      finalize('aborted')
      socket.destroy()
    }, PREFACE_TIMEOUT_MS)
    // Allow Node to exit even if this timer is still pending.
    prefaceTimer.unref()

    h2Server.on('session', (session) => {
      // Preface arrived — H2 session established. Cancel the timeout.
      clearTimeout(prefaceTimer)
      session.once('close', () => finalize('aborted'))
    })
    socket.once('close', () => {
      clearTimeout(prefaceTimer)
      finalize('aborted')
    })
    socket.once('error', () => {
      clearTimeout(prefaceTimer)
      finalize('aborted')
    })

    // Unshift any pre-buffered bytes so the H2 connection preface isn't lost,
    // then inject the socket into the H2 server via the 'connection' event.
    // Requires Node 17.4+ (commit 3c99a4d) — confirmed working on Node v22+.
    if (head.length > 0) socket.unshift(head)

    // Override the socket's alpnProtocol property before injection. Node's
    // http2 connectionListener reads socket.alpnProtocol and rejects any value
    // that isn't 'h2', sending a 403 Forbidden / Missing ALPN Protocol response.
    // Upgraded TLS sockets carry the original 'http/1.1' from the TLS handshake;
    // we override to 'h2' because the socket IS now speaking H2 — the client
    // sends the H2 connection preface as its very next bytes after the 101.
    // We use Object.defineProperty rather than direct assignment because
    // alpnProtocol is a getter on the TLSSocket prototype and simple assignment
    // would silently fail in strict mode.
    //
    // Source: Node lib/internal/http2/core.js connectionListener function.
    Object.defineProperty(socket, 'alpnProtocol', {
      value:        'h2',
      writable:     true,
      configurable: true,
    })

    h2Server.emit('connection', socket)
  })

  server.on('error', (err: Error) => log(`server error: ${err.message}`))

  return new Promise<PbsServerHandle>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      const addr = server.address() as AddressInfo | null
      const boundPort = addr?.port ?? port
      log(`listening on ${host}:${boundPort}`)
      log(`cert fingerprint: ${cert.fingerprint}`)
      resolve({
        certFingerprint: cert.fingerprint,
        address: { host, port: boundPort },
        stop: () => stopServer(server),
      })
    })
  })
}

export function stopPbsServer(handle: PbsServerHandle): Promise<void> {
  return handle.stop()
}

function stopServer(server: HttpsServer): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}
