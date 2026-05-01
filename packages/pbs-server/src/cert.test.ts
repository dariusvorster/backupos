import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { ensureSelfSignedCert, computeCertFingerprint, generateSelfSignedCert } from './cert'

describe('cert', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pbs-cert-test-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('generates cert and key when missing', { timeout: 30_000 }, () => {
    const paths = { certPath: join(dir, 'cert.pem'), keyPath: join(dir, 'key.pem') }
    const mat = ensureSelfSignedCert(paths)
    expect(mat.cert.length).toBeGreaterThan(0)
    expect(mat.key.length).toBeGreaterThan(0)
    expect(mat.fingerprint).toMatch(/^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/)
  })

  it('private key file is mode 0600', { timeout: 30_000 }, async () => {
    const paths = { certPath: join(dir, 'cert.pem'), keyPath: join(dir, 'key.pem') }
    ensureSelfSignedCert(paths)
    const s = await stat(paths.keyPath)
    expect(s.mode & 0o777).toBe(0o600)
  })

  it('reuses existing cert if both files exist', { timeout: 30_000 }, () => {
    const paths = { certPath: join(dir, 'cert.pem'), keyPath: join(dir, 'key.pem') }
    const first = ensureSelfSignedCert(paths)
    const second = ensureSelfSignedCert(paths)
    expect(second.fingerprint).toBe(first.fingerprint)
  })

  it('regenerates when forced', { timeout: 60_000 }, () => {
    const paths = { certPath: join(dir, 'cert.pem'), keyPath: join(dir, 'key.pem') }
    const first = ensureSelfSignedCert(paths)
    generateSelfSignedCert(paths)
    const second = ensureSelfSignedCert(paths)
    expect(second.fingerprint).not.toBe(first.fingerprint)
  })

  it('fingerprint is colon-separated uppercase hex of SHA-256', { timeout: 30_000 }, () => {
    const paths = { certPath: join(dir, 'cert.pem'), keyPath: join(dir, 'key.pem') }
    const mat = ensureSelfSignedCert(paths)
    const computedAgain = computeCertFingerprint(mat.cert)
    expect(computedAgain).toBe(mat.fingerprint)
    expect(mat.fingerprint).toMatch(/^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/)
  })
})
