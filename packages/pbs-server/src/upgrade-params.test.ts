import { describe, it, expect } from 'vitest'
import { parseUpgradeParams }   from './upgrade-params'

const baseUrl = '/api2/json/backup?backup-type=vm&backup-id=100&backup-time=1730000000&store=default'

describe('parseUpgradeParams', () => {
  it('parses a valid url', () => {
    const r = parseUpgradeParams(baseUrl)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.params.store).toBe('default')
      expect(r.params.backupType).toBe('vm')
      expect(r.params.backupId).toBe('100')
      expect(r.params.backupTime.getTime()).toBe(1730000000 * 1000)
      expect(r.params.ns).toBeUndefined()
    }
  })

  it('parses with ns', () => {
    const r = parseUpgradeParams(baseUrl + '&ns=root/site-a')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.params.ns).toBe('root/site-a')
  })

  it('rejects missing store', () => {
    const r = parseUpgradeParams('/api2/json/backup?backup-type=vm&backup-id=100&backup-time=1730000000')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/store/)
  })

  it('rejects invalid backup-type', () => {
    const r = parseUpgradeParams(baseUrl.replace('backup-type=vm', 'backup-type=garbage'))
    expect(r.ok).toBe(false)
  })

  it('rejects invalid store name', () => {
    const r = parseUpgradeParams(baseUrl.replace('store=default', 'store=has%20spaces'))
    expect(r.ok).toBe(false)
  })

  it('rejects malformed backup-time', () => {
    const r = parseUpgradeParams(baseUrl.replace('backup-time=1730000000', 'backup-time=abc'))
    expect(r.ok).toBe(false)
  })

  it('rejects implausibly old backup-time', () => {
    const r = parseUpgradeParams(baseUrl.replace('backup-time=1730000000', 'backup-time=100'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/range/)
  })
})
