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
