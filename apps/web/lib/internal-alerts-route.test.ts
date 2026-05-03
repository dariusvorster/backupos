import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@backupos/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@backupos/db')>()
  return { ...actual, getDb: vi.fn() }
})

vi.mock('@/lib/alerts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/alerts')>()
  return {
    ...mod,
    fireBackupSucceeded: vi.fn().mockResolvedValue(undefined),
    fireBackupFailed:    vi.fn().mockResolvedValue(undefined),
  }
})

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/internal/alerts/route'
import { fireBackupSucceeded, fireBackupFailed } from '@/lib/alerts'

const SECRET = 'test-secret-abc'

function makeReq(body: unknown, authHeader?: string): NextRequest {
  return new NextRequest('http://localhost/api/internal/alerts', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader !== undefined ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.BACKUPOS_INTERNAL_SECRET = SECRET
})

describe('POST /api/internal/alerts', () => {
  it('503 when BACKUPOS_INTERNAL_SECRET not set', async () => {
    delete process.env.BACKUPOS_INTERNAL_SECRET
    const res = await POST(makeReq({ event: 'backup_succeeded', runId: 'r1' }, `Bearer ${SECRET}`))
    expect(res.status).toBe(503)
  })

  it('401 when Authorization header missing', async () => {
    const res = await POST(makeReq({ event: 'backup_succeeded', runId: 'r1' }))
    expect(res.status).toBe(401)
  })

  it('401 when Authorization header is wrong', async () => {
    const res = await POST(makeReq({ event: 'backup_succeeded', runId: 'r1' }, 'Bearer wrong'))
    expect(res.status).toBe(401)
  })

  it('dispatches backup_succeeded and returns 200', async () => {
    const res = await POST(makeReq({ event: 'backup_succeeded', runId: 'r1' }, `Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    expect(vi.mocked(fireBackupSucceeded)).toHaveBeenCalledWith('r1')
  })

  it('dispatches backup_failed with error and returns 200', async () => {
    const res = await POST(makeReq({ event: 'backup_failed', runId: 'r2', error: 'disk full' }, `Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    expect(vi.mocked(fireBackupFailed)).toHaveBeenCalledWith('r2', 'disk full')
  })

  it('backup_failed uses default error message when error field absent', async () => {
    const res = await POST(makeReq({ event: 'backup_failed', runId: 'r3' }, `Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    expect(vi.mocked(fireBackupFailed)).toHaveBeenCalledWith('r3', 'PBS backup failed')
  })

  it('400 for unknown event type', async () => {
    const res = await POST(makeReq({ event: 'restore_succeeded', runId: 'r4' }, `Bearer ${SECRET}`))
    expect(res.status).toBe(400)
    expect(vi.mocked(fireBackupSucceeded)).not.toHaveBeenCalled()
    expect(vi.mocked(fireBackupFailed)).not.toHaveBeenCalled()
  })

  it('400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/internal/alerts', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
      body:    'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
