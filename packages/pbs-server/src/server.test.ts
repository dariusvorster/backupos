import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { connect as h2connect, constants } from 'http2'
import { startPbsServer, type PbsServerHandle } from './server'

describe('PBS HTTP/2 server', () => {
  let dir: string
  let handle: PbsServerHandle

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pbs-server-test-'))
    handle = await startPbsServer({
      port: 0, // ephemeral
      host: '127.0.0.1',
      certPaths: {
        certPath: join(dir, 'cert.pem'),
        keyPath:  join(dir, 'key.pem'),
      },
      log: () => { /* silence */ },
    })
  }, 30_000)

  afterEach(async () => {
    await handle.stop()
    await rm(dir, { recursive: true, force: true })
  })

  it('responds to GET /api2/json/version over HTTP/2', async () => {
    const url = `https://127.0.0.1:${handle.address.port}`
    const session = h2connect(url, { rejectUnauthorized: false })
    try {
      const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = session.request({
          [constants.HTTP2_HEADER_METHOD]: 'GET',
          [constants.HTTP2_HEADER_PATH]:   '/api2/json/version',
        })
        let body = ''
        let status = 0
        req.on('response', (h) => { status = Number(h[constants.HTTP2_HEADER_STATUS]) })
        req.setEncoding('utf8')
        req.on('data', (chunk: string) => { body += chunk })
        req.on('end', () => resolve({ status, body }))
        req.on('error', reject)
        req.end()
      })

      expect(res.status).toBe(200)
      const parsed = JSON.parse(res.body) as { data: { version: string; repoid: string } }
      expect(parsed.data.version).toBeTruthy()
      expect(parsed.data.repoid).toBe('backupos')
    } finally {
      session.close()
    }
  })

  it('returns 404 for unknown paths', async () => {
    const url = `https://127.0.0.1:${handle.address.port}`
    const session = h2connect(url, { rejectUnauthorized: false })
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const req = session.request({
          [constants.HTTP2_HEADER_METHOD]: 'GET',
          [constants.HTTP2_HEADER_PATH]:   '/api2/json/nonexistent',
        })
        req.on('response', (h) => resolve(Number(h[constants.HTTP2_HEADER_STATUS])))
        req.on('error', reject)
        req.end()
      })

      expect(status).toBe(404)
    } finally {
      session.close()
    }
  })

  it('returns 501 for not-yet-implemented protocol upgrade endpoints', async () => {
    const url = `https://127.0.0.1:${handle.address.port}`
    const session = h2connect(url, { rejectUnauthorized: false })
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const req = session.request({
          [constants.HTTP2_HEADER_METHOD]: 'GET',
          [constants.HTTP2_HEADER_PATH]:   '/api2/json/backup',
        })
        req.on('response', (h) => resolve(Number(h[constants.HTTP2_HEADER_STATUS])))
        req.on('error', reject)
        req.end()
      })

      expect(status).toBe(501)
    } finally {
      session.close()
    }
  })

  it('exposes the cert fingerprint', () => {
    expect(handle.certFingerprint).toMatch(/^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/)
  })
})
