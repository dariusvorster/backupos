import { describe, it, expect } from 'vitest'
import { createHash }         from 'crypto'
import type { IncomingMessage } from 'http'
import { validatePbsAuth, type AuthLookup, type AuthLookupResult } from './auth'

function makeReq(authHeader?: string): IncomingMessage {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as unknown as IncomingMessage
}

function hashSecret(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

const SECRET = 'correctsecret123'
const HASH   = hashSecret(SECRET)

const goodRecord: AuthLookupResult = {
  tokenId:     'tok-1',
  secretHash:  HASH,
  user:        'alice',
  realm:       'pbs',
  tokenName:   'ci-agent',
  permissions: 'read',
}

const alwaysFound: AuthLookup = async () => goodRecord
const neverFound:  AuthLookup = async () => null

describe('validatePbsAuth', () => {
  it('accepts a valid token', async () => {
    const req = makeReq(`PBSAPIToken=alice@pbs!ci-agent:${SECRET}`)
    const result = await validatePbsAuth(req, alwaysFound)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.identity.user).toBe('alice')
      expect(result.identity.tokenId).toBe('tok-1')
    }
  })

  it('rejects when Authorization header is absent', async () => {
    const req = makeReq()
    const result = await validatePbsAuth(req, alwaysFound)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/missing/)
  })

  it('rejects a Bearer header (wrong scheme)', async () => {
    const req = makeReq('Bearer sometoken')
    const result = await validatePbsAuth(req, alwaysFound)
    expect(result.ok).toBe(false)
  })

  it('rejects when token is not found', async () => {
    const req = makeReq(`PBSAPIToken=alice@pbs!ci-agent:${SECRET}`)
    const result = await validatePbsAuth(req, neverFound)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/not found/)
  })

  it('rejects an incorrect secret', async () => {
    const req = makeReq('PBSAPIToken=alice@pbs!ci-agent:wrongsecret')
    const result = await validatePbsAuth(req, alwaysFound)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/invalid/)
  })

  it('rejects an expired token', async () => {
    const expired: AuthLookup = async () => ({
      ...goodRecord,
      expiresAt: new Date(Date.now() - 1000),
    })
    const req = makeReq(`PBSAPIToken=alice@pbs!ci-agent:${SECRET}`)
    const result = await validatePbsAuth(req, expired)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/expired/)
  })

  it('accepts a token whose expiresAt is in the future', async () => {
    const notYetExpired: AuthLookup = async () => ({
      ...goodRecord,
      expiresAt: new Date(Date.now() + 60_000),
    })
    const req = makeReq(`PBSAPIToken=alice@pbs!ci-agent:${SECRET}`)
    const result = await validatePbsAuth(req, notYetExpired)
    expect(result.ok).toBe(true)
  })

  it('accepts a token with no expiresAt', async () => {
    const noExpiry: AuthLookup = async () => ({
      ...goodRecord,
      expiresAt: null,
    })
    const req = makeReq(`PBSAPIToken=alice@pbs!ci-agent:${SECRET}`)
    const result = await validatePbsAuth(req, noExpiry)
    expect(result.ok).toBe(true)
  })
})
