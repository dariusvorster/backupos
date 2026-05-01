// PBS protocol HTTP/2 listener.
//
// Source: port (8007), endpoint shape, and HTTP/2 upgrade discipline are
// from PBS public docs (https://pbs.proxmox.com/docs/backup-protocol.html
// and https://pbs.proxmox.com/docs/sysadmin.html). Clean-room.

import { createSecureServer, type Http2SecureServer, type ServerHttp2Session } from 'http2'
import type { AddressInfo } from 'net'
import { ensureSelfSignedCert, type CertPaths } from './cert'
import { handleVersion } from './handlers/version'

export interface StartPbsServerOptions {
  /** TCP port for the listener. Defaults to 8007 (PBS default). */
  port?: number
  /** Bind address. Defaults to 0.0.0.0 (all interfaces). */
  host?: string
  /** Where the cert and key live on disk. */
  certPaths: CertPaths
  /** Reported version string. Defaults to "4.0.0". */
  reportedVersion?: string
  /** Reported release string. Defaults to "1". */
  reportedRelease?: string
  /** Optional log function for boot messages. Defaults to console.log. */
  log?: (msg: string) => void
}

export interface PbsServerHandle {
  /** Stop accepting new connections and close the listener. */
  stop(): Promise<void>
  /** The advertised cert fingerprint — surface this in the UI. */
  certFingerprint: string
  /** Resolved bind address. */
  address: { host: string; port: number }
}

export function startPbsServer(opts: StartPbsServerOptions): Promise<PbsServerHandle> {
  const port = opts.port ?? 8007
  const host = opts.host ?? '0.0.0.0'
  const log  = opts.log ?? ((m: string) => console.log(`[pbs-server] ${m}`))

  const cert = ensureSelfSignedCert(opts.certPaths)

  const server = createSecureServer({
    cert: cert.cert,
    key:  cert.key,
    // HTTP/2 will negotiate via ALPN. Allow HTTP/1.1 fallback so the
    // version endpoint is reachable from curl/HTTP-1.1 clients too.
    allowHTTP1: true,
  })

  // Track open sessions so stop() can destroy them immediately rather than
  // waiting for clients to close — server.close() alone hangs until all
  // sessions drain naturally.
  const sessions = new Set<ServerHttp2Session>()
  server.on('session', (session: ServerHttp2Session) => {
    sessions.add(session)
    session.once('close', () => sessions.delete(session))
  })

  // The 'request' event fires for both HTTP/2 and HTTP/1.1 on Http2SecureServer
  // with allowHTTP1: true. Using 'stream' in addition would double-handle H2
  // requests and cause ERR_HTTP2_HEADERS_SENT.
  server.on('request', (req, res) => {
    const path = req.url ?? '/'
    if (req.method === 'GET' && path.startsWith('/api2/json/version')) {
      const body = JSON.stringify(handleVersion({
        version: opts.reportedVersion ?? '4.0.0',
        release: opts.reportedRelease ?? '1',
      }))
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(body)
      return
    }
    if (req.method === 'GET' && (path.startsWith('/api2/json/backup') || path.startsWith('/api2/json/reader'))) {
      res.writeHead(501, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'protocol upgrade endpoints are not yet implemented (M4/M5)' }))
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })

  server.on('error', (err) => log(`server error: ${err.message}`))

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
        stop: () => stopServer(server, sessions),
      })
    })
  })
}

export function stopPbsServer(handle: PbsServerHandle): Promise<void> {
  return handle.stop()
}

function stopServer(server: Http2SecureServer, sessions: Set<ServerHttp2Session>): Promise<void> {
  // Destroy all open sessions first so server.close() callback fires immediately
  // rather than waiting for clients to send GOAWAY.
  for (const session of sessions) {
    session.destroy()
  }
  return new Promise<void>((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve())
  })
}
