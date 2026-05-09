import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { checkInternalAuth } from './internal-auth'
import { NextRequest } from 'next/server'

describe('checkInternalAuth', () => {
  const ORIG = process.env['BACKUPOS_INTERNAL_SECRET']
  const TEST_SECRET = 'test-secret-32bytes-aaaaaaaaaaaaa'

  beforeEach(() => {
    process.env['BACKUPOS_INTERNAL_SECRET'] = TEST_SECRET
  })

  afterEach(() => {
    if (ORIG === undefined) delete process.env['BACKUPOS_INTERNAL_SECRET']
    else process.env['BACKUPOS_INTERNAL_SECRET'] = ORIG
  })

  function makeReq(authHeader?: string): NextRequest {
    const headers = new Headers()
    if (authHeader) headers.set('authorization', authHeader)
    return new NextRequest('http://localhost/test', { headers })
  }

  it('returns 503 if BACKUPOS_INTERNAL_SECRET is not set', () => {
    delete process.env['BACKUPOS_INTERNAL_SECRET']
    const res = checkInternalAuth(makeReq(`Bearer ${TEST_SECRET}`))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(503)
  })

  it('returns 401 with no Authorization header', () => {
    const res = checkInternalAuth(makeReq())
    expect(res!.status).toBe(401)
  })

  it('returns 401 with wrong secret', () => {
    const res = checkInternalAuth(makeReq('Bearer wrong-secret'))
    expect(res!.status).toBe(401)
  })

  it('returns 401 with right length but wrong content', () => {
    // Same length as `Bearer ${TEST_SECRET}` but different content
    const wrongSameLength = 'Bearer ' + 'X'.repeat(TEST_SECRET.length)
    const res = checkInternalAuth(makeReq(wrongSameLength))
    expect(res!.status).toBe(401)
  })

  it('returns 401 if header is "Bearer " prefix only (length mismatch)', () => {
    const res = checkInternalAuth(makeReq('Bearer '))
    expect(res!.status).toBe(401)
  })

  it('returns null with correct bearer', () => {
    const res = checkInternalAuth(makeReq(`Bearer ${TEST_SECRET}`))
    expect(res).toBeNull()
  })
})
