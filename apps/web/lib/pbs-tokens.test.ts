import { describe, it, expect } from 'vitest'
import {
  parsePbsToken,
  formatPbsToken,
  generatePbsSecret,
  hashPbsSecret,
  verifyPbsSecret,
  extractPbsAuthHeader,
} from './pbs-tokens'

describe('parsePbsToken', () => {
  it('parses a valid token string', () => {
    const result = parsePbsToken('alice@pbs!backup-agent:supersecret')
    expect(result).toEqual({
      user:      'alice',
      realm:     'pbs',
      tokenName: 'backup-agent',
      secret:    'supersecret',
    })
  })

  it('returns null when colon is missing', () => {
    expect(parsePbsToken('alice@pbs!backup-agent')).toBeNull()
  })

  it('returns null when bang is missing', () => {
    expect(parsePbsToken('alice@pbs:secret')).toBeNull()
  })

  it('returns null when @ is missing', () => {
    expect(parsePbsToken('alicepbs!token:secret')).toBeNull()
  })

  it('returns null when user is empty', () => {
    expect(parsePbsToken('@pbs!token:secret')).toBeNull()
  })

  it('returns null when realm is empty', () => {
    expect(parsePbsToken('alice@!token:secret')).toBeNull()
  })

  it('returns null when tokenName is empty', () => {
    expect(parsePbsToken('alice@pbs!:secret')).toBeNull()
  })

  it('returns null when secret is empty', () => {
    expect(parsePbsToken('alice@pbs!token:')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parsePbsToken('')).toBeNull()
  })

  it('uses the first colon as the secret delimiter', () => {
    const result = parsePbsToken('alice@pbs!token:sec:ret')
    expect(result?.secret).toBe('sec:ret')
  })
})

describe('formatPbsToken', () => {
  it('formats parts into the canonical token string', () => {
    expect(formatPbsToken({ user: 'alice', realm: 'pbs', tokenName: 'agent', secret: 'abc' }))
      .toBe('alice@pbs!agent:abc')
  })

  it('round-trips through parse', () => {
    const parts = { user: 'bob', realm: 'realm1', tokenName: 'mytoken', secret: 'xyz' }
    expect(parsePbsToken(formatPbsToken(parts))).toEqual(parts)
  })
})

describe('generatePbsSecret', () => {
  it('returns a 64-char hex string', () => {
    expect(generatePbsSecret()).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns a different value each call', () => {
    expect(generatePbsSecret()).not.toBe(generatePbsSecret())
  })
})

describe('hashPbsSecret / verifyPbsSecret', () => {
  it('returns a 64-char hex hash', () => {
    expect(hashPbsSecret('mysecret')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic', () => {
    expect(hashPbsSecret('same')).toBe(hashPbsSecret('same'))
  })

  it('verifies correct secret against stored hash', () => {
    const hash = hashPbsSecret('correct-horse')
    expect(verifyPbsSecret('correct-horse', hash)).toBe(true)
  })

  it('rejects wrong secret', () => {
    const hash = hashPbsSecret('correct-horse')
    expect(verifyPbsSecret('wrong-horse', hash)).toBe(false)
  })
})

describe('extractPbsAuthHeader', () => {
  it('extracts the token from a well-formed header', () => {
    expect(extractPbsAuthHeader('PBSAPIToken=alice@pbs!token:secret'))
      .toBe('alice@pbs!token:secret')
  })

  it('returns null for a Bearer header', () => {
    expect(extractPbsAuthHeader('Bearer sometoken')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractPbsAuthHeader('')).toBeNull()
  })
})
