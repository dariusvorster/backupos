import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { request }      from 'node:https'
import { mkdtemp, rm }  from 'node:fs/promises'
import { join }         from 'node:path'
import { tmpdir }       from 'node:os'
import { startPbsServer, type PbsServerHandle } from './server'

let handle: PbsServerHandle
let certDir: string

beforeAll(async () => {
  certDir = await mkdtemp(join(tmpdir(), 'pbs-server-test-'))
  handle = await startPbsServer({
    port: 0,
    host: '127.0.0.1',
    certPaths: {
      certPath: join(certDir, 'cert.pem'),
      keyPath:  join(certDir, 'key.pem'),
    },
    log: () => { /* silence */ },
  })
}, 30_000)

afterAll(async () => {
  await handle.stop()
  await rm(certDir, { recursive: true, force: true })
})

function get(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host:               '127.0.0.1',
        port:               handle.address.port,
        path,
        method:             'GET',
        rejectUnauthorized: false,
      },
      (res) => {
        let body = ''
        res.on('data', (chunk: string) => body += chunk)
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

describe('startPbsServer (M4b — HTTPS / HTTP-1.1 entry)', () => {
  it('serves /api2/json/version unauthenticated over HTTP/1.1', async () => {
    const r = await get('/api2/json/version')
    expect(r.status).toBe(200)
    const parsed = JSON.parse(r.body) as { data: { version: string; repoid: string } }
    expect(parsed.data.version).toBeTruthy()
    expect(parsed.data.repoid).toBe('backupos')
  })

  it('returns 404 for unknown HTTP/1.1 paths', async () => {
    const r = await get('/garbage')
    expect(r.status).toBe(404)
  })

  it('returns 404 for /api2/json/backup via plain HTTP/1.1 (no Upgrade)', async () => {
    const r = await get('/api2/json/backup?store=default&backup-type=vm&backup-id=100&backup-time=1730000000')
    expect(r.status).toBe(404)
  })

  it('exposes the cert fingerprint', () => {
    expect(handle.certFingerprint).toMatch(/^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/)
  })
})
