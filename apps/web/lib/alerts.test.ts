import { describe, it, expect } from 'vitest'
import {
  buildMessage,
  channelReceivesEvent,
  type AlertType,
} from './alerts'

// ── buildMessage ──────────────────────────────────────────────────────────────

describe('buildMessage', () => {
  it('backup_failed', () => {
    const msg = buildMessage('backup_failed', { jobId: 'j1', jobName: 'Daily VM', error: 'disk full' })
    expect(msg).toBe('Backup job "Daily VM" failed: disk full')
  })

  it('backup_missed', () => {
    const msg = buildMessage('backup_missed', { jobId: 'j1', jobName: 'Daily VM' })
    expect(msg).toBe('Scheduled backup job "Daily VM" did not run on time')
  })

  it('backup_succeeded — with duration and size', () => {
    const msg = buildMessage('backup_succeeded', {
      jobId: 'j1', jobName: 'Daily VM', durationSec: 90, totalSizeBytes: 1024 * 1024 * 512,
    })
    expect(msg).toContain('"Daily VM" completed successfully')
    expect(msg).toContain('1m 30s')
    expect(msg).toContain('512.0 MB')
  })

  it('backup_succeeded — no duration or size', () => {
    const msg = buildMessage('backup_succeeded', {
      jobId: 'j1', jobName: 'Daily VM', durationSec: null, totalSizeBytes: null,
    })
    expect(msg).toBe('Backup job "Daily VM" completed successfully')
  })

  it('restore_succeeded — with duration', () => {
    const msg = buildMessage('restore_succeeded', { runId: 'r1', jobName: 'Daily VM', durationSec: 45 })
    expect(msg).toContain('"Daily VM" completed successfully')
    expect(msg).toContain('45s')
  })

  it('restore_succeeded — no duration', () => {
    const msg = buildMessage('restore_succeeded', { runId: 'r1', jobName: 'Daily VM', durationSec: null })
    expect(msg).toBe('Restore for "Daily VM" completed successfully')
  })

  it('restore_failed', () => {
    const msg = buildMessage('restore_failed', { runId: 'r1', jobName: 'Daily VM', error: 'timeout' })
    expect(msg).toBe('Restore for "Daily VM" failed: timeout')
  })

  it('restore_missed', () => {
    const msg = buildMessage('restore_missed', { jobId: 'j1', jobName: 'Weekly CT' })
    expect(msg).toBe('Scheduled restore for "Weekly CT" did not run on time')
  })

  it('agent_disconnected', () => {
    const msg = buildMessage('agent_disconnected', { agentId: 'a1', agentName: 'prod-01' })
    expect(msg).toBe('Agent "prod-01" (a1) has been unreachable for over 10 minutes')
  })
})

// ── channelReceivesEvent ──────────────────────────────────────────────────────

describe('channelReceivesEvent', () => {
  it('null subscribedEvents → receives all events (back-compat)', () => {
    expect(channelReceivesEvent(null, 'backup_failed')).toBe(true)
    expect(channelReceivesEvent(null, 'backup_succeeded')).toBe(true)
    expect(channelReceivesEvent(null, 'agent_disconnected')).toBe(true)
  })

  it('empty array → receives no events', () => {
    const sub = JSON.stringify([])
    const types: AlertType[] = ['backup_failed', 'backup_succeeded', 'restore_failed', 'agent_disconnected']
    for (const t of types) {
      expect(channelReceivesEvent(sub, t)).toBe(false)
    }
  })

  it('single-type array → receives only that type', () => {
    const sub = JSON.stringify(['backup_failed'])
    expect(channelReceivesEvent(sub, 'backup_failed')).toBe(true)
    expect(channelReceivesEvent(sub, 'backup_missed')).toBe(false)
    expect(channelReceivesEvent(sub, 'agent_disconnected')).toBe(false)
  })

  it('multiple types → receives exactly those types', () => {
    const sub = JSON.stringify(['backup_failed', 'restore_failed'])
    expect(channelReceivesEvent(sub, 'backup_failed')).toBe(true)
    expect(channelReceivesEvent(sub, 'restore_failed')).toBe(true)
    expect(channelReceivesEvent(sub, 'backup_succeeded')).toBe(false)
    expect(channelReceivesEvent(sub, 'agent_disconnected')).toBe(false)
  })

  it('malformed JSON → fail-safe: receives all events', () => {
    expect(channelReceivesEvent('not-valid-json', 'backup_failed')).toBe(true)
    expect(channelReceivesEvent('{broken', 'restore_succeeded')).toBe(true)
  })

  it('undefined subscribedEvents → receives all events', () => {
    expect(channelReceivesEvent(undefined, 'backup_failed')).toBe(true)
  })
})

// ── fire* helpers ─────────────────────────────────────────────────────────────
// sendAlert is in the same ESM module, so we can't intercept the internal call
// via vi.mock. Instead we fully stub getDb so sendAlert can run to completion,
// then assert on what db.insert(alerts) received.

import { vi, beforeEach } from 'vitest'

vi.mock('@backupos/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@backupos/db')>()
  return { ...actual, getDb: vi.fn() }
})

import { getDb } from '@backupos/db'
import { fireBackupSucceeded, fireRestoreSucceeded, fireRestoreFailed } from './alerts'

type InsertCall = { type: string; message: string; severity: string }

function makeDb(selectRow: unknown) {
  const insertedAlerts: InsertCall[] = []
  const insertValues = vi.fn().mockImplementation((row: InsertCall) => {
    insertedAlerts.push(row)
    return Promise.resolve()
  })

  const selectQuery = {
    from:     vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where:    vi.fn().mockReturnThis(),
    limit:    vi.fn().mockResolvedValue(selectRow === null ? [] : [selectRow]),
    all:      vi.fn().mockResolvedValue([]), // channel list in sendAlert → empty = no dispatch
  }

  return {
    db: {
      select: vi.fn().mockReturnValue(selectQuery),
      insert: vi.fn().mockReturnValue({ values: insertValues }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
    },
    insertedAlerts,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('fireBackupSucceeded', () => {
  it('happy path — inserts backup_succeeded alert with correct message', async () => {
    const { db, insertedAlerts } = makeDb({
      jobId: 'j1', jobName: 'Daily VM', duration: 90000, totalSize: 536870912,
    })
    vi.mocked(getDb).mockReturnValue(db as never)
    await fireBackupSucceeded('run-1')
    expect(insertedAlerts).toHaveLength(1)
    expect(insertedAlerts[0].type).toBe('backup_succeeded')
    expect(insertedAlerts[0].message).toContain('"Daily VM" completed successfully')
    expect(insertedAlerts[0].message).toContain('1m 30s')
    expect(insertedAlerts[0].message).toContain('512.0 MB')
  })

  it('orphaned run (null jobId) — returns silently, no alert inserted', async () => {
    const { db, insertedAlerts } = makeDb({ jobId: null, jobName: null, duration: null, totalSize: null })
    vi.mocked(getDb).mockReturnValue(db as never)
    await fireBackupSucceeded('run-orphan')
    expect(insertedAlerts).toHaveLength(0)
  })

  it('missing row — returns silently, no alert inserted', async () => {
    const { db, insertedAlerts } = makeDb(null)
    vi.mocked(getDb).mockReturnValue(db as never)
    await fireBackupSucceeded('run-missing')
    expect(insertedAlerts).toHaveLength(0)
  })
})

describe('fireRestoreSucceeded', () => {
  it('happy path — inserts restore_succeeded alert with duration', async () => {
    const startedAt   = new Date('2026-01-01T10:00:00Z')
    const completedAt = new Date('2026-01-01T10:01:30Z')
    const { db, insertedAlerts } = makeDb({ specId: 's1', specName: 'Weekly CT', startedAt, completedAt })
    vi.mocked(getDb).mockReturnValue(db as never)
    await fireRestoreSucceeded('rr-1')
    expect(insertedAlerts).toHaveLength(1)
    expect(insertedAlerts[0].type).toBe('restore_succeeded')
    expect(insertedAlerts[0].message).toContain('"Weekly CT"')
    expect(insertedAlerts[0].message).toContain('1m 30s')
  })

  it('no spec (ad-hoc) — uses fallback name', async () => {
    const { db, insertedAlerts } = makeDb({ specId: null, specName: null, startedAt: null, completedAt: null })
    vi.mocked(getDb).mockReturnValue(db as never)
    await fireRestoreSucceeded('rr-2')
    expect(insertedAlerts).toHaveLength(1)
    expect(insertedAlerts[0].message).toContain('ad-hoc restore')
  })

  it('missing row — returns silently, no alert inserted', async () => {
    const { db, insertedAlerts } = makeDb(null)
    vi.mocked(getDb).mockReturnValue(db as never)
    await fireRestoreSucceeded('rr-missing')
    expect(insertedAlerts).toHaveLength(0)
  })
})

describe('fireRestoreFailed', () => {
  it('happy path — inserts restore_failed alert with error', async () => {
    const { db, insertedAlerts } = makeDb({ specId: 's1', specName: 'Weekly CT' })
    vi.mocked(getDb).mockReturnValue(db as never)
    await fireRestoreFailed('rr-3', 'disk full')
    expect(insertedAlerts).toHaveLength(1)
    expect(insertedAlerts[0].type).toBe('restore_failed')
    expect(insertedAlerts[0].message).toContain('"Weekly CT"')
    expect(insertedAlerts[0].message).toContain('disk full')
  })

  it('missing row — uses fallback name, still fires alert', async () => {
    const { db, insertedAlerts } = makeDb(null)
    vi.mocked(getDb).mockReturnValue(db as never)
    await fireRestoreFailed('rr-4', 'timeout')
    expect(insertedAlerts).toHaveLength(1)
    expect(insertedAlerts[0].message).toContain('ad-hoc restore')
    expect(insertedAlerts[0].message).toContain('timeout')
  })
})
