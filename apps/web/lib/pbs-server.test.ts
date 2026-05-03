import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Mock server-url so tests don't hit the database
vi.mock('./server-url', () => ({
  getServerPublicUrl: vi.fn().mockResolvedValue({ url: 'http://localhost:3093', source: 'unknown' }),
}))

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURE_CERT = path.join(__dirname, '__fixtures__', 'test-cert.pem')
const EXPECTED_FINGERPRINT = 'DD:B3:C7:0D:D3:74:52:DB:CB:0D:17:5E:CD:B2:B2:87:8E:EC:8E:81:17:CD:6F:82:5F:8C:B6:B6:C8:C9:80:AB'

// Lazy import so vi.mock above is applied before the module loads
const { getPbsServerInfo } = await import('./pbs-server')

describe('getPbsServerInfo — port parsing', () => {
  let savedBind: string | undefined

  beforeEach(() => { savedBind = process.env['BACKUPOS_PBS_BIND'] })
  afterEach(() => {
    if (savedBind === undefined) delete process.env['BACKUPOS_PBS_BIND']
    else process.env['BACKUPOS_PBS_BIND'] = savedBind
  })

  it('parses port from BACKUPOS_PBS_BIND=0.0.0.0:8007', async () => {
    process.env['BACKUPOS_PBS_BIND'] = '0.0.0.0:8007'
    const info = await getPbsServerInfo({ certPath: FIXTURE_CERT })
    expect(info.port).toBe(8007)
  })

  it('parses a non-default port', async () => {
    process.env['BACKUPOS_PBS_BIND'] = '0.0.0.0:9000'
    const info = await getPbsServerInfo({ certPath: FIXTURE_CERT })
    expect(info.port).toBe(9000)
  })

  it('falls back to 8007 when env var is unset', async () => {
    delete process.env['BACKUPOS_PBS_BIND']
    const info = await getPbsServerInfo({ certPath: FIXTURE_CERT })
    expect(info.port).toBe(8007)
  })

  it('falls back to 8007 when env var has no colon', async () => {
    process.env['BACKUPOS_PBS_BIND'] = 'abc'
    const info = await getPbsServerInfo({ certPath: FIXTURE_CERT })
    expect(info.port).toBe(8007)
  })

  it('falls back to 8007 when env var port is not a number', async () => {
    process.env['BACKUPOS_PBS_BIND'] = '0.0.0.0:notaport'
    const info = await getPbsServerInfo({ certPath: FIXTURE_CERT })
    expect(info.port).toBe(8007)
  })

  it('falls back to 8007 when env var is empty string', async () => {
    process.env['BACKUPOS_PBS_BIND'] = ''
    const info = await getPbsServerInfo({ certPath: FIXTURE_CERT })
    expect(info.port).toBe(8007)
  })
})

describe('getPbsServerInfo — fingerprint', () => {
  it('reads fingerprint from fixture cert in colon-hex uppercase', async () => {
    const info = await getPbsServerInfo({ certPath: FIXTURE_CERT })
    expect(info.fingerprint).toBe(EXPECTED_FINGERPRINT)
  })

  it('throws when cert file is missing', async () => {
    await expect(
      getPbsServerInfo({ certPath: '/nonexistent/path/to/cert.pem' })
    ).rejects.toThrow()
  })
})
